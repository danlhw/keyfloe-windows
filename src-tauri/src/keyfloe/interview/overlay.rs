//! The interview overlay window.
//!
//! A translucent, always-on-top, borderless window that hosts the dual
//! transcript + answer view — and is INVISIBLE TO SCREEN SHARING so the
//! interviewer never sees it in Zoom/Meet/Teams.
//!
//! Invisibility is enforced natively via `SetWindowDisplayAffinity(hwnd,
//! WDA_EXCLUDEFROMCAPTURE)` (the Win32 equivalent of the Mac
//! `sharingType = .none`). We do NOT rely on Tauri's `set_content_protected`
//! — it's buggy on Windows (tauri#14189) and doesn't map to
//! WDA_EXCLUDEFROMCAPTURE reliably. The affinity is RE-APPLIED after every
//! show, because Windows can reset it when a window is re-shown. VERIFY ON
//! WINDOWS.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const OVERLAY_LABEL: &str = "interview_overlay";

/// Create the overlay window if it doesn't exist yet (hidden by default).
///
/// NOTE: the URL points at `src/keyfloe/interview/overlay.html`, which must be
/// registered as a Vite rollup input (see INTEGRATION.md) so it's emitted into
/// `dist/`. Until then the window will 404 in a production build.
pub fn ensure_overlay(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }
    let builder = WebviewWindowBuilder::new(
        app,
        OVERLAY_LABEL,
        WebviewUrl::App("src/keyfloe/interview/overlay.html".into()),
    )
    .title("Keyfloe Interview")
    .inner_size(380.0, 560.0)
    .min_inner_size(360.0, 440.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false);

    let window = builder.build().map_err(|e| format!("overlay build: {e}"))?;
    // Apply exclude-from-capture immediately so it's protected before it ever
    // becomes visible.
    apply_exclude_from_capture(&window);
    Ok(())
}

/// Show or hide the overlay, re-applying exclude-from-capture on every show.
pub fn set_overlay_visible(app: &AppHandle, visible: bool) -> Result<(), String> {
    ensure_overlay(app)?;
    let window = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| "overlay window missing".to_string())?;
    if visible {
        window.show().map_err(|e| e.to_string())?;
        window.set_always_on_top(true).ok();
        // Re-apply AFTER show — Windows can clear the affinity on re-show.
        apply_exclude_from_capture(&window);
    } else {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Mark the overlay's HWND as excluded from screen capture.
#[cfg(windows)]
pub fn apply_exclude_from_capture(window: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
    };
    match window.hwnd() {
        Ok(hwnd) => unsafe {
            if let Err(e) = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) {
                log::error!("interview overlay: SetWindowDisplayAffinity failed: {e}");
            } else {
                log::info!("interview overlay: WDA_EXCLUDEFROMCAPTURE applied — invisible to capture");
            }
        },
        Err(e) => log::error!("interview overlay: hwnd() failed: {e}"),
    }
}

#[cfg(not(windows))]
pub fn apply_exclude_from_capture(_window: &tauri::WebviewWindow) {
    // macOS/Linux: the Mac app uses NSWindow.sharingType = .none. On this
    // Windows port only WDA_EXCLUDEFROMCAPTURE is wired; no-op elsewhere so the
    // crate still builds for cross-platform `cargo check`.
    log::debug!("interview overlay: exclude-from-capture is a no-op on this platform");
}
