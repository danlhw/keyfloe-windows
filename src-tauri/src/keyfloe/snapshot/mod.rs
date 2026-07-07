//! Feature E — AI Snapshot (Windows parity with the Mac "Snip to answer").
//!
//! Flow (mirrors ../keyfloe-1/app/Sources/Capture/SnipController.swift +
//! Voice/AICommandSession.swift `snipAnswer`):
//!   1. User presses the Snapshot key → `snapshot_begin` opens a transparent,
//!      full-screen selection overlay (the marquee, drawn by the FE window in
//!      `src/keyfloe/snapshot/`).
//!   2. User drags a box over anything on screen and releases. The FE hides the
//!      overlay, then calls `snapshot_capture_region` with the selection in
//!      *physical* (device) pixels relative to the captured monitor's top-left.
//!   3. We grab that monitor with `xcap`, crop to the marquee, JPEG-encode it,
//!      and stream a vision answer from the shared backend (`keyfloe.com/v1/chat`,
//!      Anthropic Messages shape — identical to the Mac ClaudeClient body).
//!   4. Streamed text is emitted to the FE as `keyfloe://snapshot-chunk`
//!      events (running answer) and finalized with `keyfloe://snapshot-done`,
//!      so it can render in the pill / chat log (the single visual record).
//!
//! Integration: see `src/keyfloe/snapshot/INTEGRATION.md` — commands to
//! register, the overlay window config, the `xcap`/`image`/`base64` deps, and
//! the Windows-verification checklist. This file lives entirely under the
//! feature's owned folder and touches no shared files.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// ── Backend endpoints (shared with the Mac app — do NOT rebuild) ────────────
const KEYFLOE_CHAT_URL: &str = "https://keyfloe.com/v1/chat";
const ANTHROPIC_DIRECT_URL: &str = "https://api.anthropic.com/v1/messages";

// Vision model + budget. Haiku is what the Mac snapshot path uses (fast, cheap,
// good enough to read a screen region). Keep in sync with ClaudeClient.Model.
const SNAPSHOT_MODEL: &str = "claude-haiku-4-5-20251001";
const SNAPSHOT_MAX_TOKENS: u32 = 1024;
const JPEG_QUALITY: u8 = 80;

// FE event channel names (listened to by the pill / result surface).
pub const EVT_CHUNK: &str = "keyfloe://snapshot-chunk";
pub const EVT_DONE: &str = "keyfloe://snapshot-done";
pub const EVT_ERROR: &str = "keyfloe://snapshot-error";
pub const EVT_STARTED: &str = "keyfloe://snapshot-started";

// The selection-overlay Tauri window label. The FE window at
// `src/keyfloe/snapshot/overlay.html` is created lazily with this label.
const OVERLAY_LABEL: &str = "snapshot_overlay";

// Guards against overlapping runs (a second key press while a capture is
// already streaming is a no-op, matching the Mac "toggle / idempotent" feel).
static CAPTURE_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

/// The marquee, in **physical (device) pixels** relative to the captured
/// monitor's top-left. The FE multiplies its CSS-pixel drag rect by
/// `window.devicePixelRatio` before sending, so this maps 1:1 onto the pixel
/// grid `xcap` returns.
#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct SelectionRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// Optional monitor index (into `xcap::Monitor::all()`). Defaults to the
    /// primary monitor when absent. Populated by the FE from the overlay's
    /// screen when multi-monitor selection is wired up.
    #[serde(default)]
    pub monitor: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
struct SnapshotErrorPayload {
    message: String,
    /// True when the failure is a quota / rate-limit (HTTP 402 / 429) — the FE
    /// can show an upgrade nudge instead of a generic error, matching the Mac
    /// `isQuotaError` handling.
    quota: bool,
}

// ─────────────────────────────────────────────────────────────────────────
// Tauri commands (register these in lib.rs — see INTEGRATION.md)
// ─────────────────────────────────────────────────────────────────────────

/// Open the drag-to-select overlay. Idempotent: a second call while the
/// overlay is already visible dismisses it (same toggle feel as the Mac
/// Right-⌘ snip). Called from the Snapshot shortcut action and/or the FE.
#[tauri::command]
#[specta::specta]
pub fn snapshot_begin(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        // Already open → toggle off.
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
            return Ok(());
        }
        prepare_and_show_overlay(&win)?;
        return Ok(());
    }
    let win = build_overlay_window(&app)?;
    prepare_and_show_overlay(&win)?;
    Ok(())
}

/// Dismiss the overlay without capturing (Esc / click-out). Kept separate from
/// `snapshot_begin` so the FE can hard-cancel.
#[tauri::command]
#[specta::specta]
pub fn snapshot_cancel(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.hide();
    }
    Ok(())
}

/// Capture the selected region and stream a vision answer to the pill.
///
/// The FE MUST hide the overlay (or this window) before calling so the dim
/// layer / marquee never ends up in the screenshot — same ordering as the Mac
/// `finish()` → 60 ms delay → capture.
#[tauri::command]
#[specta::specta]
pub async fn snapshot_capture_region(
    app: AppHandle,
    rect: SelectionRect,
    prompt: Option<String>,
) -> Result<(), String> {
    // Reject absurdly small selections (a click, not a drag) — mirrors the
    // Mac `width > 8, height > 8` guard.
    if rect.width < 8 || rect.height < 8 {
        return Ok(());
    }

    if CAPTURE_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        // A capture is already streaming — ignore.
        return Ok(());
    }

    // Make sure the overlay is gone before we grab pixels.
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.hide();
    }
    let _ = app.emit(EVT_STARTED, ());

    let result = run_capture(&app, rect, prompt).await;
    CAPTURE_IN_FLIGHT.store(false, Ordering::SeqCst);

    if let Err(err) = result {
        let quota = err.quota;
        let _ = app.emit(
            EVT_ERROR,
            SnapshotErrorPayload {
                message: err.message.clone(),
                quota,
            },
        );
        return Err(err.message);
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────
// Overlay window
// ─────────────────────────────────────────────────────────────────────────

/// Build the transparent, borderless, always-on-top full-screen overlay that
/// hosts the marquee UI. Mirrors the recording-overlay builder in overlay.rs
/// but sized to cover the whole primary monitor.
fn build_overlay_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    let mut builder = WebviewWindowBuilder::new(
        app,
        OVERLAY_LABEL,
        WebviewUrl::App("src/keyfloe/snapshot/overlay.html".into()),
    )
    .title("Snapshot")
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .skip_taskbar(true)
    .shadow(false)
    .transparent(true)
    // The overlay MUST receive the drag + Esc, so unlike the recording
    // overlay it is focusable and accepts the first click.
    .accept_first_mouse(true)
    .always_on_top(true)
    .visible(false);

    // Keep the webview data alongside the app's other windows (portable mode).
    if let Some(data_dir) = crate::portable::data_dir() {
        builder = builder.data_directory(data_dir.join("webview"));
    }

    builder
        .build()
        .map_err(|e| format!("failed to build snapshot overlay: {e}"))
}

/// Position the overlay over the monitor under the cursor and cover it fully,
/// then show + focus it so it can read the drag and Esc.
fn prepare_and_show_overlay(win: &tauri::WebviewWindow) -> Result<(), String> {
    // Cover the monitor the window currently reports (Tauri picks the one the
    // window's origin lands on; for a fresh window that's the primary).
    if let Ok(Some(monitor)) = win.current_monitor() {
        let pos = monitor.position();
        let size = monitor.size();
        let _ = win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
        let _ = win.set_size(tauri::PhysicalSize::new(size.width, size.height));
    }

    // Windows-specific: fullscreen the overlay so it also covers the taskbar,
    // and ensure it renders above everything. Verified on Windows only.
    #[cfg(windows)]
    {
        let _ = win.set_fullscreen(true);
    }

    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────
// Capture + vision request
// ─────────────────────────────────────────────────────────────────────────

struct RunError {
    message: String,
    quota: bool,
}

impl RunError {
    fn msg(s: impl Into<String>) -> Self {
        Self {
            message: s.into(),
            quota: false,
        }
    }
}

async fn run_capture(
    app: &AppHandle,
    rect: SelectionRect,
    prompt: Option<String>,
) -> Result<(), RunError> {
    // 1. Screenshot the target monitor and crop to the marquee (blocking —
    //    `xcap` is synchronous, so run it off the async runtime).
    let jpeg = tauri::async_runtime::spawn_blocking(move || capture_region_jpeg(&rect))
        .await
        .map_err(|e| RunError::msg(format!("capture task panicked: {e}")))?
        .map_err(RunError::msg)?;

    // 2. Stream the vision answer into the pill.
    let user_prompt = prompt
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| DEFAULT_PROMPT.to_string());

    stream_vision_answer(app, jpeg, user_prompt).await
}

const DEFAULT_PROMPT: &str = "Answer or explain what's in this screenshot. If it \
contains a question, an error, or a problem, answer/solve it directly and \
concisely. If it's an email, message, or UI, help me with it.";

// Short system prompt — the snapshot equivalent of the Mac AICommandSession
// "academic / work assistant" framing, trimmed to the essentials.
const SNAPSHOT_SYSTEM: &str = "You are Keyfloe's Snapshot assistant. The user \
dragged a box over part of their screen. Read everything in the image and \
respond directly and usefully: answer questions, solve problems or errors, or \
help with the email/UI shown. Be concise — you are shown in a small pill, not a \
document. Never ask the user to restate what's already visible; you ARE the \
answer.";

/// Capture the given monitor and crop it to `rect` (physical pixels), returning
/// JPEG bytes. `xcap` is cross-platform (Apache-2.0); it compiles on macOS for
/// `cargo check` but the real target is Windows.
fn capture_region_jpeg(rect: &SelectionRect) -> Result<Vec<u8>, String> {
    use image::{codecs::jpeg::JpegEncoder, RgbaImage};
    use xcap::Monitor;

    let monitors = Monitor::all().map_err(|e| format!("xcap monitor enumeration failed: {e}"))?;
    if monitors.is_empty() {
        return Err("no monitors found".into());
    }

    // Pick the requested monitor, else the primary, else the first.
    let monitor = match rect.monitor {
        Some(i) => monitors.get(i).or_else(|| monitors.first()),
        None => monitors
            .iter()
            .find(|m| m.is_primary().unwrap_or(false))
            .or_else(|| monitors.first()),
    }
    .ok_or_else(|| "no usable monitor".to_string())?;

    let shot: RgbaImage = monitor
        .capture_image()
        .map_err(|e| format!("screen capture failed: {e}"))?;

    let (img_w, img_h) = (shot.width(), shot.height());

    // Clamp the marquee to the captured image bounds so a slightly-oversized
    // selection (or a HiDPI rounding overshoot) can't panic the crop.
    let x0 = rect.x.max(0) as u32;
    let y0 = rect.y.max(0) as u32;
    if x0 >= img_w || y0 >= img_h {
        return Err("selection is outside the captured monitor".into());
    }
    let w = rect.width.min(img_w.saturating_sub(x0)).max(1);
    let h = rect.height.min(img_h.saturating_sub(y0)).max(1);

    // Crop (copy the sub-rectangle into a fresh buffer).
    let cropped = image::imageops::crop_imm(&shot, x0, y0, w, h).to_image();

    // JPEG-encode. Anthropic wants RGB; drop the alpha channel. RgbImage
    // implements GenericImageView, so encode it directly.
    let rgb = image::DynamicImage::ImageRgba8(cropped).to_rgb8();
    let mut out: Vec<u8> = Vec::new();
    JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
        .encode_image(&rgb)
        .map_err(|e| format!("jpeg encode failed: {e}"))?;
    Ok(out)
}

/// Build the Anthropic Messages body (vision) and stream the answer, emitting
/// `keyfloe://snapshot-chunk` per delta and `keyfloe://snapshot-done` at the
/// end. Body shape matches ClaudeClient.swift `contentBlocks` exactly: an
/// optional pixel-dimension text label, the base64 image, then the prompt.
async fn stream_vision_answer(
    app: &AppHandle,
    jpeg: Vec<u8>,
    user_prompt: String,
) -> Result<(), RunError> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use futures_util::StreamExt;
    use serde_json::json;

    let b64 = STANDARD.encode(&jpeg);

    let body = json!({
        "model": SNAPSHOT_MODEL,
        "max_tokens": SNAPSHOT_MAX_TOKENS,
        "stream": true,
        "system": [{
            "type": "text",
            "text": SNAPSHOT_SYSTEM,
            "cache_control": { "type": "ephemeral" }
        }],
        "messages": [{
            "role": "user",
            "content": [
                { "type": "image",
                  "source": { "type": "base64", "media_type": "image/jpeg", "data": b64 } },
                { "type": "text", "text": user_prompt }
            ]
        }]
    });

    let client = reqwest::Client::new();

    // Two paths, mirroring ClaudeClient:
    //   DEV  — ANTHROPIC_API_KEY in the env → straight to api.anthropic.com.
    //   SAAS — default → keyfloe.com/v1/chat (worker holds the key + quota).
    let request = if let Ok(dev_key) = std::env::var("ANTHROPIC_API_KEY") {
        client
            .post(ANTHROPIC_DIRECT_URL)
            .header("content-type", "application/json")
            .header("x-api-key", dev_key)
            .header("anthropic-version", "2023-06-01")
    } else {
        let mut req = client
            .post(KEYFLOE_CHAT_URL)
            .header("content-type", "application/json")
            .header("x-oneclick-feature", "snapshot");
        // Auth: attach the Supabase JWT when the shell/auth agent wires one up.
        // Until then the worker's free-tier (device-id) path still answers.
        if let Some(token) = auth_bearer(app) {
            req = req.header("Authorization", format!("Bearer {token}"));
        }
        if let Some(device_id) = device_id(app) {
            req = req.header("x-oneclick-device-id", device_id);
        }
        req
    };

    let resp = request
        .json(&body)
        .send()
        .await
        .map_err(|e| RunError::msg(format!("network error: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        let quota = status.as_u16() == 402 || status.as_u16() == 429;
        let text = resp.text().await.unwrap_or_default();
        return Err(RunError {
            message: if quota {
                "You've hit today's Snapshot limit. Upgrade for more.".to_string()
            } else {
                format!("backend error {}: {}", status.as_u16(), text)
            },
            quota,
        });
    }

    // Parse the SSE stream. Anthropic sends `data: {json}\n\n` frames; we
    // accumulate a line buffer across chunk boundaries (a delta can be split).
    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut running = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| RunError::msg(format!("stream error: {e}")))?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        // Drain complete lines.
        while let Some(nl) = buf.find('\n') {
            let line = buf[..nl].trim_end_matches('\r').to_string();
            buf.drain(..=nl);

            let Some(payload) = line.strip_prefix("data: ") else {
                continue;
            };
            if payload == "[DONE]" {
                let _ = app.emit(EVT_DONE, running.clone());
                return Ok(());
            }
            let Ok(obj) = serde_json::from_str::<serde_json::Value>(payload) else {
                continue;
            };
            match obj.get("type").and_then(|t| t.as_str()) {
                Some("content_block_delta") => {
                    if let Some(text) = obj
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                    {
                        if !text.is_empty() {
                            running.push_str(text);
                            let _ = app.emit(EVT_CHUNK, running.clone());
                        }
                    }
                }
                Some("message_stop") => {
                    let _ = app.emit(EVT_DONE, running.clone());
                    return Ok(());
                }
                Some("error") => {
                    let msg = obj
                        .get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("unknown streaming error")
                        .to_string();
                    return Err(RunError::msg(msg));
                }
                _ => {}
            }
        }
    }

    // Stream ended without an explicit stop marker — deliver what we have.
    let _ = app.emit(EVT_DONE, running);
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────
// Auth hooks (thin — filled in when the shell/auth agent lands)
// ─────────────────────────────────────────────────────────────────────────

/// Return the Supabase JWT for the worker path, if available. The auth agent
/// should replace this body with a real lookup (e.g. from a shared AuthState
/// managed in lib.rs). For now: env override for local testing, else None
/// (worker free-tier by device id still answers).
fn auth_bearer(_app: &AppHandle) -> Option<String> {
    std::env::var("KEYFLOE_JWT").ok().filter(|s| !s.is_empty())
}

/// Stable per-install device id used by the worker's free-tier quota. The shell
/// agent already needs one for dictation/agent; this reads the same env var as
/// a placeholder until that shared id exists.
fn device_id(_app: &AppHandle) -> Option<String> {
    std::env::var("KEYFLOE_DEVICE_ID").ok().filter(|s| !s.is_empty())
}
