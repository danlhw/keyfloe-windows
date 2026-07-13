//! Shell backend — the pill window (product principle #1: the single visual
//! record of all AI activity) and its message plumbing (P1-02).
//!
//! The pill is a transparent, always-on-top, skip-taskbar, NON-ACTIVATING
//! (WS_EX_NOACTIVATE) window anchored bottom-center of the primary monitor.
//! Non-activating is load-bearing: summoning the pill must never steal focus,
//! or dictation's Ctrl+V would paste into the pill instead of the user's app.
//!
//! Features stream into it two ways:
//!   • backend features `app.emit("pill://message", PillMessageEvent{..})`
//!     directly (snapshot does this), or call `pill_emit_message`.
//!   • in-window components call `pillStore.upsert(...)` (FE).
//! `pill://mode` ("idle"|"open") collapses/expands; `pill://clear` empties it.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const PILL_LABEL: &str = "pill";

/// Mirrors the FE `PillMessageEvent` (pillMessageStore.ts). Optional fields are
/// omitted when unset so the store's upsert-by-id semantics stay clean.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PillMessageEvent {
    pub id: String,
    /// "user" | "ai" | "step"
    pub role: String,
    pub text: String,
    /// "running" | "ok" | "fail"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streaming: Option<bool>,
    /// "upsert" | "remove" | "clear"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub op: Option<String>,
}

/// Create the pill window if it doesn't exist yet (hidden by default).
///
/// The URL points at `src/keyfloe/shell/pill.html`, registered as a Vite rollup
/// input (vite.config.ts) so it's emitted into `dist/`.
pub fn ensure_pill(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(PILL_LABEL).is_some() {
        return Ok(());
    }
    let builder = WebviewWindowBuilder::new(
        app,
        PILL_LABEL,
        WebviewUrl::App("src/keyfloe/shell/pill.html".into()),
    )
    .title("Keyfloe")
    .inner_size(420.0, 520.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false);

    let window = builder.build().map_err(|e| format!("pill build: {e}"))?;
    // Apply WS_EX_NOACTIVATE immediately so the first show never activates.
    apply_no_activate(&window);
    position_bottom_center(&window);
    Ok(())
}

/// Anchor the pill to the bottom-center of the primary monitor.
///
/// VERIFY ON WINDOWS: multi-monitor + 100/125/150/200% DPI. v1 targets the
/// primary monitor only.
fn position_bottom_center(window: &tauri::WebviewWindow) {
    let monitor = match window.primary_monitor() {
        Ok(Some(m)) => m,
        _ => return,
    };
    let sz = monitor.size();
    let origin = monitor.position();
    let scale = monitor.scale_factor();
    if let Ok(win_sz) = window.outer_size() {
        let x = origin.x + ((sz.width as i32 - win_sz.width as i32) / 2);
        let y = origin.y + sz.height as i32 - win_sz.height as i32 - (24.0 * scale) as i32;
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

/// Mark the pill HWND as non-activating so summoning it never steals focus.
#[cfg(windows)]
fn apply_no_activate(window: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
    };
    match window.hwnd() {
        Ok(hwnd) => unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let new = ex | (WS_EX_NOACTIVATE.0 as isize);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new);
            log::info!("pill: WS_EX_NOACTIVATE applied");
        },
        Err(e) => log::error!("pill: hwnd() failed: {e}"),
    }
}

#[cfg(not(windows))]
fn apply_no_activate(_window: &tauri::WebviewWindow) {
    // macOS/Linux: the Mac app uses a non-activating NSPanel. No-op here so the
    // crate still builds cross-platform for `cargo check`.
    log::debug!("pill: WS_EX_NOACTIVATE is a no-op on this platform");
}

/// Emit a bubble into the pill (and reveal it). Any backend feature can call
/// this instead of emitting `pill://message` itself.
#[tauri::command]
#[specta::specta]
pub fn pill_emit_message(app: AppHandle, payload: PillMessageEvent) -> Result<(), String> {
    ensure_pill(&app)?;
    if let Some(w) = app.get_webview_window(PILL_LABEL) {
        let _ = w.show();
        apply_no_activate(&w);
    }
    let _ = app.emit("pill://mode", "open");
    app.emit("pill://message", payload).map_err(|e| e.to_string())
}

/// Open the pill in "chat" mode (the default action for the `chat` feature key).
#[tauri::command]
#[specta::specta]
pub fn open_chat_pill(app: AppHandle) -> Result<(), String> {
    ensure_pill(&app)?;
    if let Some(w) = app.get_webview_window(PILL_LABEL) {
        w.show().map_err(|e| e.to_string())?;
        w.set_always_on_top(true).ok();
        apply_no_activate(&w);
    }
    app.emit("pill://mode", "open").map_err(|e| e.to_string())
}
