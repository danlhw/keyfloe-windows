//! Keyfloe dictation parity layer (Feature B).
//!
//! Handy already owns the dictation *core*: cpal capture → Silero VAD →
//! whisper.cpp → clipboard/type paste (see `managers/transcription.rs`,
//! `actions.rs`, `clipboard.rs`, `input.rs`). This module adds the Keyfloe
//! *parity* behaviour on top of that core, 1:1 with the Mac app
//! (`keyfloe-1/app/Sources/Voice/*`):
//!
//!   * Wispr-style always-on cloud **polish** — filler/false-start removal,
//!     spoken self-corrections, grammar/punctuation, and app-aware register
//!     (casual + dropped trailing period in messaging apps) — via the shared
//!     backend `keyfloe.com/v1/chat`. See [`polish`].
//!   * A fast, network-free **local self-correction** pass that runs first and
//!     is the fallback whenever the cloud pass is unavailable. See
//!     [`post_process`].
//!   * Silently-learned **personal vocabulary** that feeds the whisper decode
//!     prompt so jargon/names transcribe correctly. See [`vocabulary`].
//!   * **Learn-from-corrections**: after paste, re-read the field and learn any
//!     words the user fixed (Windows-only, fail-safe). See [`correction_learner`].
//!   * **WPM / stats** + a durable **dictation transcript log**. See [`stats`].
//!   * Windows **foreground-focus save/restore** so paste lands in the app the
//!     user was in, not the pill. See [`focus`].
//!
//! ## Integration contract
//! This module owns ONLY `src-tauri/src/keyfloe/dictation/`. It never edits
//! shared files. The two edits the integrator must make (registering the module
//! + calling the entry points from `actions.rs`) are spelled out in
//! `INTEGRATION.md` in this folder.

pub mod auth;
pub mod commands;
pub mod correction_learner;
pub mod focus;
pub mod polish;
pub mod post_process;
pub mod settings;
pub mod stats;
pub mod vocabulary;

use log::debug;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};

pub use focus::ForegroundApp;

/// Event emitted to drive the live caption overlay. The overlay listens for
/// `keyfloe://dictation-caption` and renders `text` in the phase-appropriate
/// style (grey while polishing, solid when final).
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct DictationCaptionEvent {
    /// `listening` | `polishing` | `final` | `hidden`
    pub phase: String,
    pub text: String,
}

pub const CAPTION_EVENT: &str = "keyfloe://dictation-caption";

fn emit_caption(app: &AppHandle, phase: &str, text: &str) {
    let _ = app.emit(
        CAPTION_EVENT,
        DictationCaptionEvent {
            phase: phase.to_string(),
            text: text.to_string(),
        },
    );
}

/// The Keyfloe parity replacement for Handy's `process_transcription_output`.
///
/// Takes the RAW whisper transcript and returns the clean, paste-ready text:
///   1. local self-correction strip (always; also the offline fallback),
///   2. observe the text into personal vocabulary (silent, for next time),
///   3. cloud AI polish (if enabled) with app-aware register, guarded so a
///      model that "breaks character" can never be pasted.
///
/// Never throws — on any failure it returns the locally-cleaned text, so
/// dictation keeps working with the network or model down. `foreground` is the
/// app the user is dictating into (captured before the pill took focus); it
/// drives messaging-vs-prose register.
pub async fn process_dictation(app: &AppHandle, raw: &str, foreground: Option<&ForegroundApp>) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    // 1. Local self-correction strip (network-free, always applied).
    let local = post_process::strip_self_corrections(trimmed);

    // 2. Silent vocabulary learning for next time (best-effort, non-blocking).
    vocabulary::observe(app, &local);

    let cfg = settings::load(app);
    if !cfg.smart_polish_enabled {
        emit_caption(app, "final", &local);
        return local;
    }

    // 3. Cloud polish. `known_terms` keeps the user's jargon intact.
    emit_caption(app, "polishing", &local);
    let known_terms = vocabulary::prompt_terms(app);
    let (app_name, bundle) = match foreground {
        Some(fg) => (Some(fg.name.as_str()), fg.bundle_id.as_deref()),
        None => (None, None),
    };
    let polished = polish::polish(
        app,
        &local,
        app_name,
        bundle,
        known_terms.as_deref(),
        cfg.app_aware_formatting,
    )
    .await;

    let final_text = match polished {
        Some(p) if !polish::is_unusable(&p, &local) => p,
        _ => {
            debug!("keyfloe dictation: polish unusable/failed — using local cleanup");
            local
        }
    };
    emit_caption(app, "final", &final_text);
    final_text
}

/// Post-paste side effects, mirroring the Mac `VoiceSession` tail:
///   * record WPM/stats,
///   * append to the durable dictation log (safety net),
///   * arm the learn-from-corrections watcher on the field we pasted into.
///
/// Safe to call from any thread; each piece is independently best-effort.
pub fn on_dictation_pasted(
    app: &AppHandle,
    final_text: &str,
    duration_sec: f64,
    foreground: Option<&ForegroundApp>,
) {
    let pasted_into = foreground.map(|f| f.name.clone());
    stats::record(app, final_text, duration_sec, pasted_into.clone());

    let cfg = settings::load(app);
    if cfg.learn_from_corrections {
        correction_learner::arm(app, final_text);
    }

    // Clear the caption a beat after paste.
    emit_caption(app, "hidden", "");
}
