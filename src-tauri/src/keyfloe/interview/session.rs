//! Interview session orchestrator.
//!
//! Owns the two capture channels, segments each into utterances, transcribes
//! them through the shared backend, and streams the resulting turns + AI answers
//! to the overlay via Tauri events. This is the Rust analogue of the Mac
//! `InterviewSession` — same behaviours: sensitive system-side VAD, a
//! cross-channel mic gate so interviewer bleed isn't mislabelled "Me", 4 s
//! coalescing of split interviewer utterances, and the same first-person
//! "answer this" prompt.

use super::audio::{self, Channel, UtteranceChunker};
use super::backend::{ChatMsg, KeyfloeApi};
use super::context;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

// ---- Event payloads (event names are the FE↔BE contract; see types.ts) ----

pub const EV_TURNS: &str = "interview://turns";
pub const EV_STATE: &str = "interview://state";
pub const EV_MIC_LEVEL: &str = "interview://mic-level";
pub const EV_ANSWER_BEGIN: &str = "interview://answer-begin";
pub const EV_ANSWER_DELTA: &str = "interview://answer-delta";
pub const EV_ANSWER_END: &str = "interview://answer-end";
pub const EV_ANSWER_ERROR: &str = "interview://answer-error";

#[derive(Clone, Serialize)]
pub struct TurnDto {
    pub id: String,
    pub role: String, // "Me" | "Interviewer"
    pub text: String,
    #[serde(rename = "isLive")]
    pub is_live: bool,
    #[serde(rename = "startedAt")]
    pub started_at: f64, // epoch seconds
}

#[derive(Clone, Serialize)]
pub struct StateDto {
    pub running: bool,
    #[serde(rename = "systemAudioActive")]
    pub system_audio_active: bool,
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
struct DeltaDto {
    text: String,
}

struct Turn {
    id: String,
    role: Channel,
    text: String,
    started_at: Instant,
    epoch: f64,
}

fn now_epoch() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

/// Shared, thread-safe interview state (the Tauri-managed singleton).
///
/// The cpal streams are `!Send`, so they can NOT be stored here — they live on
/// a dedicated worker thread (like Handy's `AudioRecorder`). We only keep
/// Send+Sync control state; stopping is a flag the worker polls, after which it
/// drops the streams on its own thread.
pub struct InterviewSession {
    running: AtomicBool,
    turns: Arc<Mutex<Vec<Turn>>>,
    worker_stop: Arc<AtomicBool>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl Default for InterviewSession {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            turns: Arc::new(Mutex::new(Vec::new())),
            worker_stop: Arc::new(AtomicBool::new(false)),
            worker: Mutex::new(None),
        }
    }
}

impl InterviewSession {
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    fn emit_state(app: &AppHandle, running: bool, system_active: bool, error: Option<String>) {
        let _ = app.emit(
            EV_STATE,
            StateDto {
                running,
                system_audio_active: system_active,
                error,
            },
        );
    }

    /// Label-free chronological transcript for the answer prompt (mirrors the
    /// Mac `conversationTranscript()` — one loopback+mic mix, so don't trust
    /// speaker tags; hand the raw back-and-forth to the model).
    fn conversation_transcript(&self) -> String {
        self.turns
            .lock()
            .unwrap()
            .iter()
            .filter(|t| !t.text.is_empty())
            .map(|t| t.text.clone())
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub fn start(&self, app: &AppHandle) -> Result<(), String> {
        if self.is_running() {
            return Ok(());
        }
        self.turns.lock().unwrap().clear();
        self.worker_stop.store(false, Ordering::SeqCst);

        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app_data_dir: {e}"))?;

        // One clone for the worker thread (moved in), one kept here for the
        // post-startup state emit below.
        let state_app = app.clone();
        let app = app.clone();
        let turns = self.turns.clone();
        let stop = self.worker_stop.clone();
        let api = Arc::new(KeyfloeApi::new(data_dir));

        // The worker OWNS the (non-Send) cpal streams for their whole lifetime,
        // reports startup success back over `ready`, then runs the chunker loop
        // until `stop`, dropping the streams on this thread when it exits.
        let (ready_tx, ready_rx) = mpsc::channel::<Result<bool, String>>();
        let handle = std::thread::spawn(move || {
            let (tx, rx) = mpsc::channel::<(Channel, Vec<f32>)>();

            // Mic is required.
            let _mic = match audio::start_mic(tx.clone()) {
                Ok(h) => h,
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                    return;
                }
            };
            // System audio is best-effort → mic-only fallback with a banner.
            let _system = match audio::start_system(tx.clone()) {
                Ok(h) => Some(h),
                Err(e) => {
                    log::warn!("interview: system-audio capture unavailable, mic-only: {e}");
                    None
                }
            };
            let system_active = _system.is_some();
            drop(tx); // only the streams hold Senders now.
            let _ = ready_tx.send(Ok(system_active));

            let mut mic_chunker = UtteranceChunker::for_mic();
            let mut sys_chunker = UtteranceChunker::for_system();
            let mut last_level = Instant::now();

            loop {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                let (chan, samples) = match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(v) => v,
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                };
                match chan {
                    Channel::Interviewer => {
                        if let Some(wav) = sys_chunker.push(&samples) {
                            spawn_transcribe(&app, &api, &turns, Channel::Interviewer, wav);
                        }
                    }
                    Channel::Me => {
                        if last_level.elapsed() > Duration::from_millis(50) {
                            let _ = app.emit(EV_MIC_LEVEL, audio::peak_level(&samples));
                            last_level = Instant::now();
                        }
                        // Cross-channel gate: drop mic frames while the
                        // interviewer is speaking so their voice (via speakers)
                        // isn't transcribed and mislabelled "Me".
                        if sys_chunker.is_in_speech() {
                            continue;
                        }
                        if let Some(wav) = mic_chunker.push(&samples) {
                            spawn_transcribe(&app, &api, &turns, Channel::Me, wav);
                        }
                    }
                }
            }
            // Flush tails, then streams drop here (on this thread → capture ends).
            if let Some(wav) = sys_chunker.finalize() {
                spawn_transcribe(&app, &api, &turns, Channel::Interviewer, wav);
            }
            if let Some(wav) = mic_chunker.finalize() {
                spawn_transcribe(&app, &api, &turns, Channel::Me, wav);
            }
        });

        // Block briefly for the worker's startup result (mic open / fail).
        match ready_rx.recv() {
            Ok(Ok(system_active)) => {
                *self.worker.lock().unwrap() = Some(handle);
                self.running.store(true, Ordering::SeqCst);
                let err = if system_active {
                    None
                } else {
                    Some("Mic-only mode — the interviewer's system audio isn't being captured.".to_string())
                };
                Self::emit_state(&state_app, true, system_active, err);
                Ok(())
            }
            Ok(Err(e)) => Err(e),
            Err(_) => Err("interview capture worker failed to start".to_string()),
        }
    }

    pub fn stop(&self, app: &AppHandle) {
        if !self.is_running() {
            return;
        }
        // Signal the worker; it exits within one poll interval and drops the
        // streams on its own thread. We don't join (avoid blocking the UI).
        self.worker_stop.store(true, Ordering::SeqCst);
        let _ = self.worker.lock().unwrap().take();
        self.running.store(false, Ordering::SeqCst);
        let _ = app.emit(EV_MIC_LEVEL, 0.0f32);
        Self::emit_state(app, false, false, None);
    }

    /// "How do I answer this?" — assemble the transcript + the user's saved
    /// context and stream a first-person answer into the overlay.
    pub async fn ask_answer(&self, app: &AppHandle) -> Result<(), String> {
        let transcript = self.conversation_transcript();
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app_data_dir: {e}"))?;
        let ctx = context::load(&data_dir);
        let system = interview_system_prompt(&ctx.background());
        let user = build_interview_prompt(&transcript);

        let _ = app.emit(EV_ANSWER_BEGIN, ());
        let api = KeyfloeApi::new(data_dir);
        let app_for_delta = app.clone();
        let result = api
            .chat_stream(
                &system,
                vec![ChatMsg {
                    role: "user".into(),
                    content: user,
                }],
                |delta| {
                    let _ = app_for_delta.emit(
                        EV_ANSWER_DELTA,
                        DeltaDto {
                            text: delta.to_string(),
                        },
                    );
                },
            )
            .await;

        match result {
            Ok(_) => {
                let _ = app.emit(EV_ANSWER_END, ());
                Ok(())
            }
            Err(e) => {
                let _ = app.emit(EV_ANSWER_ERROR, DeltaDto { text: e.clone() });
                Err(e)
            }
        }
    }
}

/// Transcribe a completed utterance off-thread and append/update a turn.
fn spawn_transcribe(
    app: &AppHandle,
    api: &Arc<KeyfloeApi>,
    turns: &Arc<Mutex<Vec<Turn>>>,
    role: Channel,
    wav: Vec<u8>,
) {
    let app = app.clone();
    let api = api.clone();
    let turns = turns.clone();
    tauri::async_runtime::spawn(async move {
        let text = match api.transcribe(wav, "en").await {
            Ok(t) => t,
            Err(e) => {
                log::warn!("interview transcribe failed: {e}");
                return;
            }
        };
        let trimmed = text.trim().to_string();
        if trimmed.is_empty() || is_known_hallucination(&trimmed) {
            return;
        }
        {
            let mut list = turns.lock().unwrap();
            // Coalesce consecutive interviewer chunks landing within 4 s.
            let coalesce = matches!(role, Channel::Interviewer)
                && list
                    .last()
                    .map(|t| {
                        t.role == Channel::Interviewer
                            && t.started_at.elapsed() < Duration::from_secs(4)
                    })
                    .unwrap_or(false);
            if coalesce {
                let last = list.last_mut().unwrap();
                last.text.push(' ');
                last.text.push_str(&trimmed);
            } else {
                list.push(Turn {
                    id: format!("{:?}-{:.3}", role, now_epoch()),
                    role,
                    text: trimmed,
                    started_at: Instant::now(),
                    epoch: now_epoch(),
                });
            }
        }
        // Re-emit the full turn list (utterances are infrequent).
        let dto: Vec<TurnDto> = turns
            .lock()
            .unwrap()
            .iter()
            .filter(|t| !t.text.is_empty())
            .map(|t| TurnDto {
                id: t.id.clone(),
                role: match t.role {
                    Channel::Me => "Me".into(),
                    Channel::Interviewer => "Interviewer".into(),
                },
                text: t.text.clone(),
                is_live: false,
                started_at: t.epoch,
            })
            .collect();
        let _ = app.emit(EV_TURNS, dto);
    });
}

// --------------------------------------------------------------- prompts
// Ported verbatim-in-spirit from the Mac PillModel interview prompts so answers
// read identically across platforms.

fn build_interview_prompt(transcript: &str) -> String {
    let transcript_block = if transcript.trim().is_empty() {
        "(No live audio transcript yet — read the interviewer's question directly from context.)".to_string()
    } else {
        format!(
            "Live interview transcript (oldest first, most recent at the bottom). This is captured from a mic + system-audio mix, so it is NOT reliably split by speaker — it's the raw back-and-forth of the interview. Infer who's talking from the content.\n{transcript}"
        )
    };
    format!(
        "{transcript_block}\n\nTASK — answer the interviewer's outstanding question(s) the way I'd actually SAY it out loud: natural, confident, and TIGHT. First person, as me.\n\n1. Find the question(s) the interviewer has asked that I haven't answered yet (skip anything I've already answered — don't repeat it).\n2. Keep ALL the substance — the real points, specifics, numbers, examples and reasoning that make the answer strong. Just deliver it CONCISELY: cut rambling, repetition, hedging, throat-clearing, and tangents. Same information, fewer words — a denser, sharper version, NOT a gutted one.\n3. Sound like a sharp person talking in a real conversation, not a long essay being read aloud. No preamble, no \"great question\", no \"you could say\" — just the words I say.\n4. If several questions are open, answer each one — keep each tight so the whole thing stays natural rather than a monologue.\n\nNever say you can't find a question or that the transcript only shows my lines — just answer the outstanding question(s)."
    )
}

fn interview_system_prompt(background: &str) -> String {
    let bg = background.trim();
    let (status_line, background_block) = if bg.is_empty() {
        (
            "The user has NOT given you their background yet. DO NOT INVENT personal facts — never make up a name, school, employer, job title, or projects. For any personal detail you don't have, write a [bracket placeholder] like [your name], [your last role], [your project] so the user fills it in.",
            String::new(),
        )
    } else {
        (
            "You have the user's background below — anchor every answer in it. Use real names, numbers, outcomes from it. Only use [brackets] for facts that aren't in the background.",
            format!(
                "\n\n## YOUR BACKGROUND (use these as your actual experience)\n\nSpeak as if these are YOUR memories. The candidate is YOU. Where the background lists a job description or company info, treat that as the role you're interviewing FOR.\n\n{bg}"
            ),
        )
    };
    format!(
        "you ARE the candidate. the user is in a live interview RIGHT NOW. they tap \"How do I answer this?\" and your reply IS what they will read aloud to the interviewer, word-for-word, in first person.\n\n## THE ONE RULE\n\nYour reply IS the spoken answer. Don't coach. Don't suggest. Don't give options. Don't preamble. Just say what they should say.\n\nWRONG: \"you could say…\", \"a good answer would be…\", \"great question\", \"here are a few angles…\".\nRIGHT: you go straight into the first-person answer. \"I started at…\", \"my biggest project last year was…\".\n\n## KEEP IT TIGHT — dense, not gutted\n\nPack the SAME information into a shorter package. Keep every real point, specific, number, example and piece of reasoning — then deliver it tightly. Aim for roughly half the length of a long-winded answer with none of the value lost.\n\n## BRACKETS\n\n{status_line}\n\n- Questions that NEED personal facts you don't have → SHORT [bracket] placeholder.\n- Questions that DON'T need personal facts (behavioral, opinion, hypothetical, technical) → COMMIT to one concrete answer, no brackets, no hedging.\n\n## OTHER RULES\n\n- first person ALWAYS. \"I\", \"my\", \"we\".\n- polished but natural — clean grammar, contractions OK, no filler.\n- length matches the question; split long answers at natural pauses.\n- hostile / illegal / inappropriate → polite first-person deflection.\n- no markdown, no bullets, no code fences.{background_block}"
    )
}

fn is_known_hallucination(text: &str) -> bool {
    let lowered = text.to_lowercase();
    const EXACT: &[&str] = &["thank you", "thanks", "you", ".", ",", "🎵", "♪", "♫", "🎶"];
    const CONTAINS: &[&str] = &[
        "thanks for watching",
        "thank you for watching",
        "subscribe to my channel",
        "please subscribe",
        "see you in the next video",
        "bon appétit",
        "bon appetit",
        "ご視聴ありがとうございました",
    ];
    if EXACT.contains(&lowered.as_str()) {
        return true;
    }
    CONTAINS.iter().any(|p| lowered.contains(p))
}
