//! Tauri command surface for the Floe agent (Feature C).
//!
//! `run_agent_command` is the single entry point — the frontend calls it for a
//! typed command, and the voice trigger calls it with the transcript. It
//! spawns the run on the async runtime and returns the `task_id` immediately;
//! progress arrives over the `keyfloe://agent/*` events (see `session.rs`).
//!
//! Not yet registered — add to `collect_commands!` per INTEGRATION.md.

use tauri::AppHandle;

use crate::keyfloe::agent::session;
use crate::keyfloe::agent::types::new_id;

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

/// Invoked by the voice-command trigger once a transcript is ready. Mirrors the
/// spoken text into the pill (via a `keyfloe://agent/voice-command` event so
/// the closed pill can echo what it heard) and then runs it. Kept distinct from
/// `run_agent_command` so the shortcut/transcription layer has a stable name to
/// call (see INTEGRATION.md — "Wiring the voice trigger").
#[tauri::command]
#[specta::specta]
pub fn run_agent_voice_command(app: AppHandle, transcript: String) -> Result<String, String> {
    use tauri::Emitter;
    let _ = app.emit(
        "keyfloe://agent/voice-command",
        serde_json::json!({ "transcript": transcript }),
    );
    run_agent_command(app, transcript)
}
