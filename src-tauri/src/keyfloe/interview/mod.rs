//! Feature D — Interview mode (Windows port).
//!
//! A translucent, always-on-top, screen-capture-INVISIBLE overlay that captures
//! both your mic and the interviewer's system audio (WASAPI loopback), streams a
//! live dual transcript, and feeds you tailored first-person answers — 1:1 with
//! the Mac app. All transcription + answers go through the shared keyfloe backend.
//!
//! Public surface = the Tauri commands below. They are NOT yet registered in
//! `lib.rs` (that's a shared file); see INTEGRATION.md for the exact
//! `collect_commands!` + `.manage()` lines to add.

pub mod audio;
pub mod backend;
pub mod context;
pub mod overlay;
pub mod session;

use context::InterviewContext;
use session::InterviewSession;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

/// Tauri-managed singleton wrapping the interview session.
#[derive(Clone)]
pub struct InterviewState(pub Arc<InterviewSession>);

impl Default for InterviewState {
    fn default() -> Self {
        Self(Arc::new(InterviewSession::default()))
    }
}

// --------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub fn interview_start(app: AppHandle, state: State<InterviewState>) -> Result<(), String> {
    overlay::set_overlay_visible(&app, true)?;
    state.0.start(&app)
}

#[tauri::command]
#[specta::specta]
pub fn interview_stop(app: AppHandle, state: State<InterviewState>) {
    state.0.stop(&app);
}

/// Toggle interview mode; returns the new running state.
#[tauri::command]
#[specta::specta]
pub fn interview_toggle(app: AppHandle, state: State<InterviewState>) -> Result<bool, String> {
    if state.0.is_running() {
        state.0.stop(&app);
        Ok(false)
    } else {
        overlay::set_overlay_visible(&app, true)?;
        state.0.start(&app)?;
        Ok(true)
    }
}

#[tauri::command]
#[specta::specta]
pub fn interview_is_running(state: State<InterviewState>) -> bool {
    state.0.is_running()
}

/// "How do I answer this?" — streams a first-person answer via events.
#[tauri::command]
#[specta::specta]
pub async fn interview_ask_answer(
    app: AppHandle,
    state: State<'_, InterviewState>,
) -> Result<(), String> {
    // Clone the Arc so we don't hold the (non-Send) State guard across .await.
    let session = state.0.clone();
    session.ask_answer(&app).await
}

#[tauri::command]
#[specta::specta]
pub fn interview_ensure_overlay(app: AppHandle) -> Result<(), String> {
    overlay::ensure_overlay(&app)
}

#[tauri::command]
#[specta::specta]
pub fn interview_set_overlay_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    overlay::set_overlay_visible(&app, visible)
}

/// Load the saved pre-interview context (About me / profiles / résumé docs).
#[tauri::command]
#[specta::specta]
pub fn interview_get_context(app: AppHandle) -> Result<InterviewContext, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(context::load(&dir))
}

/// Persist the pre-interview context.
#[tauri::command]
#[specta::specta]
pub fn interview_save_context(app: AppHandle, ctx: InterviewContext) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    context::save(&dir, &ctx)
}
