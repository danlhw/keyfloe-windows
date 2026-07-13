//! Foreground-focus save/restore for dictation paste.
//!
//! Keyfloe's dictation must paste into the app the user was working in, not the
//! Keyfloe pill/overlay. The Mac uses `SystemPaste` + AX; on Windows we capture
//! the foreground window (HWND) BEFORE the pill can steal focus, then restore it
//! immediately before the paste keystroke so Ctrl+V lands in the right control.
//!
//! The window TITLE is also captured to drive app-aware register (messaging vs
//! prose) — Windows has no bundle ids, so `bundle_id` is always `None` and the
//! polish layer's name-hint matching does the work.
//!
//! The native calls are `#[cfg(windows)]` and CANNOT be exercised on this Mac —
//! they need Windows verification (see INTEGRATION.md, "Windows verification").
//! On non-Windows the capture is a safe no-op returning `None`.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// The foreground app captured before the pill took focus.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ForegroundApp {
    /// Best-effort display name (Windows: the foreground window title).
    pub name: String,
    /// Always `None` on Windows (no bundle ids); kept for cross-platform parity.
    pub bundle_id: Option<String>,
    /// Raw HWND as an integer so it can cross the FFI boundary / be stored.
    pub hwnd: i64,
}

/// The foreground window captured at record START, stashed here until the
/// stop/paste path needs it. This decouples the two `actions.rs` edit sites: the
/// integrator calls [`capture_and_stash`] in `TranscribeAction::start` (before
/// any Keyfloe overlay/pill can steal focus) and [`take_stashed`] in the stop
/// task — so the integrator never has to invent storage or thread the value
/// through Handy's plumbing. `Mutex<Option<_>>` (const-constructible since Rust
/// 1.63) is enough: dictation is inherently one-at-a-time (push-to-talk).
static STASH: Mutex<Option<ForegroundApp>> = Mutex::new(None);

/// Capture the current foreground window and stash it for the stop path. Call
/// this the instant a dictation trigger fires (record start), BEFORE showing any
/// Keyfloe UI. Overwrites any previous stash (a new press supersedes an
/// abandoned one). Returns the captured app for convenience.
pub fn capture_and_stash() -> Option<ForegroundApp> {
    let fg = capture_foreground();
    if let Ok(mut slot) = STASH.lock() {
        *slot = fg.clone();
    }
    fg
}

/// Take (and clear) the foreground window stashed at record start. Call this in
/// the stop task to route the paste back to the user's app. Returns `None` if
/// nothing was stashed (e.g. off-Windows, or capture failed).
pub fn take_stashed() -> Option<ForegroundApp> {
    STASH.lock().ok().and_then(|mut slot| slot.take())
}

/// Capture the current foreground window so paste can be routed back to it.
/// Call this the instant a dictation trigger fires, before showing any Keyfloe
/// UI. Returns `None` when there's nothing to capture (or off-Windows).
#[cfg(windows)]
pub fn capture_foreground() -> Option<ForegroundApp> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buf);
        let title = if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        };
        Some(ForegroundApp {
            name: title,
            bundle_id: None,
            hwnd: hwnd.0 as usize as i64,
        })
    }
}

#[cfg(not(windows))]
pub fn capture_foreground() -> Option<ForegroundApp> {
    // Native focus capture is Windows-only; no-op elsewhere so the pipeline
    // compiles and runs (with app-aware formatting simply disabled).
    None
}

/// Restore focus to the previously-captured window right before pasting so the
/// Ctrl+V keystroke targets the user's app, not the pill. Best-effort.
#[cfg(windows)]
pub fn restore_foreground(fg: &ForegroundApp) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;

    if fg.hwnd == 0 {
        return;
    }
    unsafe {
        let hwnd = HWND(fg.hwnd as usize as *mut core::ffi::c_void);
        // SetForegroundWindow can legitimately fail under Windows' focus-stealing
        // rules; the paste path tolerates that (clipboard content is preserved).
        let _ = SetForegroundWindow(hwnd);
    }
}

#[cfg(not(windows))]
pub fn restore_foreground(_fg: &ForegroundApp) {}
