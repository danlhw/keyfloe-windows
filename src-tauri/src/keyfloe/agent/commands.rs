//! Tauri command surface for the Floe agent (Feature C).
//!
//! Entry points:
//!   • `run_agent_command`         — typed command (dashboard composer / chips).
//!   • `run_agent_voice_command`   — spoken transcript → run (echoes what it heard).
//!   • `start_agent_capture`       — the Floe key was pressed: start recording.
//!   • `stop_agent_capture`        — key released: transcribe + route to the agent.
//!   • `respond_agent_confirmation`— the user tapped Allow / Cancel on a risky step.
//!
//! Each spawns work on the async runtime and returns immediately; progress
//! arrives over the `keyfloe://agent/*` events (see `session.rs`).
//!
//! Registered in `lib.rs` `collect_commands!` per INTEGRATION.md.

use std::sync::Arc;

use log::{error, info};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::audio_toolkit::VadPolicy;
use crate::keyfloe::agent::session;
use crate::keyfloe::agent::types::new_id;
use crate::managers::audio::AudioRecordingManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::get_settings;

/// Recording-manager binding id the agent's push-to-talk capture uses. Distinct
/// from any dictation binding so agent audio never routes through the Handy
/// paste path — the integrator must NOT also wire an `actions.rs` recording for
/// this id (see INTEGRATION notes / V-18).
const AGENT_BINDING: &str = "agent";

/// Spawn a Floe agent run from a prompt (typed or spoken). Returns the
/// `task_id` so the caller can correlate the `keyfloe://agent/*` events.
#[tauri::command]
#[specta::specta]
pub fn run_agent_command(app: AppHandle, prompt: String) -> Result<String, String> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("Empty command.".into());
    }
    let task_id = new_id();
    let task_id_ret = task_id.clone();
    tauri::async_runtime::spawn(async move {
        session::run(&app, prompt, task_id).await;
    });
    Ok(task_id_ret)
}

/// Invoked once a spoken transcript is ready. Mirrors the spoken text into the
/// pill (via `keyfloe://agent/voice-command` so the closed pill can echo what
/// it heard) and then runs it. Kept distinct from `run_agent_command` so the
/// capture layer has a stable name to call.
#[tauri::command]
#[specta::specta]
pub fn run_agent_voice_command(app: AppHandle, transcript: String) -> Result<String, String> {
    let _ = app.emit(session::EVT_VOICE, json!({ "transcript": transcript }));
    run_agent_command(app, transcript)
}

/// The user tapped Allow (`approved = true`) or Cancel (`false`) on a risky
/// step the agent asked to confirm. Unblocks the waiting run.
#[tauri::command]
#[specta::specta]
pub fn respond_agent_confirmation(step_id: String, approved: bool) {
    let handled = session::resolve_confirmation(&step_id, approved);
    if !handled {
        // Stale/unknown id (e.g. the run already timed out). Harmless.
        info!("[agent] confirmation for unknown step {step_id} ignored");
    }
}

/// Floe key pressed (push-to-talk down): start capturing the spoken command.
/// Reuses Handy's recording pipeline under a dedicated binding id so the audio
/// is transcribed and handed to the agent instead of being pasted.
#[tauri::command]
#[specta::specta]
pub fn start_agent_capture(app: AppHandle) -> Result<(), String> {
    let tm = app.state::<Arc<TranscriptionManager>>();
    let rm = app.state::<Arc<AudioRecordingManager>>();

    // Warm the ASR model + VAD while the user is still speaking.
    tm.initiate_model_load();
    let rm_pre = Arc::clone(&rm);
    std::thread::spawn(move || {
        if let Err(e) = rm_pre.preload_vad() {
            error!("[agent] VAD preload failed: {e}");
        }
    });

    let settings = get_settings(&app);
    let vad_policy = if settings.vad_enabled {
        VadPolicy::Offline
    } else {
        VadPolicy::Disabled
    };

    rm.try_start_recording(AGENT_BINDING, vad_policy)
        .map_err(|e| format!("Couldn't start listening: {e}"))?;

    let _ = app.emit(session::EVT_LISTENING, json!({ "listening": true }));
    Ok(())
}

/// Floe key released (push-to-talk up): stop capture, transcribe on-device, and
/// route the transcript to the agent. Returns immediately; the heavy work runs
/// on the async runtime and surfaces via events.
#[tauri::command]
#[specta::specta]
pub fn stop_agent_capture(app: AppHandle) -> Result<(), String> {
    let rm = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
    let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());
    let cancel_generation = rm.cancel_generation();

    tauri::async_runtime::spawn(async move {
        let clear_listening = || {
            let _ = app.emit(session::EVT_LISTENING, json!({ "listening": false }));
        };

        let Some(samples) = rm.stop_recording(AGENT_BINDING, cancel_generation) else {
            info!("[agent] no samples from capture stop");
            clear_listening();
            return;
        };
        if samples.is_empty() {
            info!("[agent] empty capture — nothing heard");
            clear_listening();
            return;
        }

        let transcript = match tm.transcribe(samples) {
            Ok(t) => t.trim().to_string(),
            Err(e) => {
                error!("[agent] transcription failed: {e}");
                clear_listening();
                return;
            }
        };

        if transcript.is_empty() {
            info!("[agent] transcript empty after trim");
            clear_listening();
            return;
        }

        // Hand the spoken command to the agent (emits voice-command → run).
        if let Err(e) = run_agent_voice_command(app.clone(), transcript) {
            error!("[agent] failed to route voice command: {e}");
            clear_listening();
        }
    });

    Ok(())
}
