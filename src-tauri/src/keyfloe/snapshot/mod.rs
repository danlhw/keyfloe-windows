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
// One base URL for the whole app: keyfloe.com/v1. When the central AuthState
// (task P1-05) lands, `base_url()` should return `AuthState::base_url()` so a
// single override flows everywhere.
const KEYFLOE_BASE_URL: &str = "https://keyfloe.com/v1";
const ANTHROPIC_DIRECT_URL: &str = "https://api.anthropic.com/v1/messages";

// Vision model + budget. Haiku is what the Mac snapshot path uses (fast, cheap,
// good enough to read a screen region). Keep in sync with ClaudeClient.Model.
const SNAPSHOT_MODEL: &str = "claude-haiku-4-5-20251001";
const SNAPSHOT_MAX_TOKENS: u32 = 1024;
const JPEG_QUALITY: u8 = 80;

// FE event channel names (listened to by the SnapshotResult fallback surface).
pub const EVT_CHUNK: &str = "keyfloe://snapshot-chunk";
pub const EVT_DONE: &str = "keyfloe://snapshot-done";
pub const EVT_ERROR: &str = "keyfloe://snapshot-error";
pub const EVT_STARTED: &str = "keyfloe://snapshot-started";

// The pill is the single visual record (product principle #1). The Snapshot
// answer is streamed into it as one iMessage-style AI bubble, updated in place
// by a stable id (upsert-by-id). This is the PRIMARY answer surface; the four
// `keyfloe://snapshot-*` events above still fire for the self-contained
// `SnapshotResult` fallback until the shared pill is mounted.
//
// The pill host (src/keyfloe/shell/, task P1-02) owns a `pillMessageStore` that
// listens for this event and upserts each message by `id`. It must also REVEAL
// the pill window when a message arrives (Snapshot fires with the pill closed).
const PILL_MSG_EVENT: &str = "pill://message";

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

/// One message pushed into the shared pill. Shape mirrors the FE `PillMessage`
/// (src/keyfloe/shell/Pill.tsx): `{ id, role, text, streaming?, status? }`.
/// Snapshot only ever emits an `ai` bubble; the same `id` is reused across the
/// whole answer so the pill updates in place instead of appending N bubbles.
#[derive(Debug, Clone, Serialize)]
struct PillMessage {
    id: String,
    role: &'static str,
    text: String,
    streaming: bool,
}

/// A stable per-capture message id so every chunk updates the SAME pill bubble.
fn new_msg_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("snapshot-{ms}")
}

/// Upsert one AI bubble into the pill (best-effort — the pill may not be mounted
/// yet, in which case this is a harmless no-op and `SnapshotResult` still shows).
fn emit_pill(app: &AppHandle, id: &str, text: &str, streaming: bool) {
    let _ = app.emit(
        PILL_MSG_EVENT,
        PillMessage {
            id: id.to_string(),
            role: "ai",
            text: text.to_string(),
            streaming,
        },
    );
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

    // Read the overlay's physical origin BEFORE hiding it. The marquee rect the
    // FE sends is relative to the overlay's top-left; because the overlay is
    // fullscreen on ONE monitor, that origin tells us which monitor to grab
    // (multi-monitor support via `xcap::Monitor::from_point`). `outer_position`
    // is still valid on a hidden window.
    let overlay_origin = app
        .get_webview_window(OVERLAY_LABEL)
        .and_then(|w| w.outer_position().ok())
        .map(|p| (p.x, p.y));

    // Make sure the overlay is gone before we grab pixels.
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.hide();
    }

    // Announce the capture to both surfaces: the fallback (pulse) and the pill
    // (an empty AI bubble → typing dots while the vision model reads the image).
    let msg_id = new_msg_id();
    let _ = app.emit(EVT_STARTED, ());
    emit_pill(&app, &msg_id, "", true);

    let result = run_capture(&app, rect, prompt, overlay_origin, &msg_id).await;
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
        // Land the failure in the pill too so the single record stays complete.
        emit_pill(&app, &msg_id, &err.message, false);
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
    overlay_origin: Option<(i32, i32)>,
    msg_id: &str,
) -> Result<(), RunError> {
    // Give the compositor a beat to actually paint the overlay OUT before we
    // grab pixels, otherwise the dim wash / marquee can still be in the shot.
    // Mirrors the Mac `finish()` 60 ms defer (SnipController.swift); Windows
    // DWM occasionally needs a touch more, so 90 ms. Verify on Windows (§V-20).
    tokio::time::sleep(std::time::Duration::from_millis(90)).await;

    // 1. Screenshot the target monitor's region (blocking — `xcap` is
    //    synchronous, so run it off the async runtime).
    let jpeg = tauri::async_runtime::spawn_blocking(move || {
        capture_region_jpeg(&rect, overlay_origin)
    })
    .await
    .map_err(|e| RunError::msg(format!("capture task panicked: {e}")))?
    .map_err(RunError::msg)?;

    // 2. Stream the vision answer into the pill.
    let user_prompt = prompt
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| DEFAULT_PROMPT.to_string());

    stream_vision_answer(app, jpeg, user_prompt, msg_id).await
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

/// Screenshot exactly the marquee region and return JPEG bytes.
///
/// Monitor selection (in priority order):
///   1. an explicit `rect.monitor` index into `xcap::Monitor::all()` (if the FE
///      ever passes one),
///   2. the monitor under the overlay's own origin — `Monitor::from_point` —
///      so selecting on a SECONDARY display captures that display, not the
///      primary (the overlay is fullscreen on one monitor, so `rect` is already
///      that monitor's local coordinate space),
///   3. the primary monitor, else the first.
///
/// The rect is in **physical** pixels relative to the chosen monitor's
/// top-left (the FE multiplies its CSS drag by `devicePixelRatio`), which is
/// exactly what `capture_region` expects — so 100/125/150/200 % HiDPI maps 1:1.
///
/// `xcap` is cross-platform (Apache-2.0); this compiles on macOS for
/// `cargo check` but the real capture is only verifiable on Windows (§V-20).
fn capture_region_jpeg(
    rect: &SelectionRect,
    overlay_origin: Option<(i32, i32)>,
) -> Result<Vec<u8>, String> {
    use image::codecs::jpeg::JpegEncoder;
    use xcap::Monitor;

    let monitors = Monitor::all().map_err(|e| format!("xcap monitor enumeration failed: {e}"))?;
    if monitors.is_empty() {
        return Err("no monitors found".into());
    }

    // 1 / 2 / 3 — resolve the monitor to capture.
    let monitor = if let Some(i) = rect.monitor {
        monitors.into_iter().nth(i).ok_or_else(|| {
            format!("monitor index {i} out of range")
        })?
    } else if let Some((ox, oy)) = overlay_origin {
        // Nudge one pixel inward so the origin is unambiguously ON the monitor.
        Monitor::from_point(ox + 1, oy + 1)
            .or_else(|_| pick_primary(Monitor::all()))
            .map_err(|e| format!("could not resolve target monitor: {e}"))?
    } else {
        pick_primary(Monitor::all()).map_err(|e| format!("no usable monitor: {e}"))?
    };

    // Clamp the marquee to the monitor's physical bounds so a HiDPI rounding
    // overshoot (or a drag that ran off the edge) can't error the capture.
    let mon_w = monitor.width().unwrap_or(u32::MAX);
    let mon_h = monitor.height().unwrap_or(u32::MAX);
    let x0 = rect.x.max(0) as u32;
    let y0 = rect.y.max(0) as u32;
    if x0 >= mon_w || y0 >= mon_h {
        return Err("selection is outside the captured monitor".into());
    }
    let w = rect.width.min(mon_w.saturating_sub(x0)).max(1);
    let h = rect.height.min(mon_h.saturating_sub(y0)).max(1);

    // Grab ONLY the region (cheaper than full-screen + crop).
    let region = monitor
        .capture_region(x0, y0, w, h)
        .map_err(|e| format!("screen region capture failed: {e}"))?;

    // JPEG-encode. Anthropic wants RGB; drop the alpha channel.
    let rgb = image::DynamicImage::ImageRgba8(region).to_rgb8();
    let mut out: Vec<u8> = Vec::new();
    JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
        .encode_image(&rgb)
        .map_err(|e| format!("jpeg encode failed: {e}"))?;
    Ok(out)
}

/// Pick the primary monitor (else the first) from an `xcap` enumeration.
fn pick_primary(
    all: xcap::XCapResult<Vec<xcap::Monitor>>,
) -> xcap::XCapResult<xcap::Monitor> {
    let monitors = all?;
    let primary = monitors
        .iter()
        .position(|m| m.is_primary().unwrap_or(false))
        .unwrap_or(0);
    monitors
        .into_iter()
        .nth(primary)
        .ok_or_else(|| xcap::XCapError::new("no monitors found"))
}

/// Build the Anthropic Messages body (vision) and stream the answer, emitting
/// `keyfloe://snapshot-chunk` per delta and `keyfloe://snapshot-done` at the
/// end. Body shape matches ClaudeClient.swift `contentBlocks` exactly: an
/// optional pixel-dimension text label, the base64 image, then the prompt.
async fn stream_vision_answer(
    app: &AppHandle,
    jpeg: Vec<u8>,
    user_prompt: String,
    msg_id: &str,
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
            .post(chat_url())
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
                emit_pill(app, msg_id, &running, false);
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
                            emit_pill(app, msg_id, &running, true);
                        }
                    }
                }
                Some("message_stop") => {
                    let _ = app.emit(EVT_DONE, running.clone());
                    emit_pill(app, msg_id, &running, false);
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
    emit_pill(app, msg_id, &running, false);
    let _ = app.emit(EVT_DONE, running);
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────
// Auth hooks (thin — filled in when the shell/auth agent lands)
// ─────────────────────────────────────────────────────────────────────────

/// The `/v1/chat` endpoint, derived from the single base URL.
fn chat_url() -> String {
    format!("{KEYFLOE_BASE_URL}/chat")
}

// ── Central-auth integration point (task P1-05) ─────────────────────────────
// These three functions are the ONLY place snapshot resolves auth. Once the
// auth agent lands `crate::keyfloe::auth::AuthState` (managed in lib.rs with
// `get_jwt()` / `get_device_id()` / `base_url()`), swap the three bodies to:
//
//     let s = app.state::<crate::keyfloe::auth::AuthState>();
//     // auth_bearer:  s.get_jwt()
//     // device_id:    s.get_device_id()
//     // base:         KEYFLOE_BASE_URL -> s.base_url()
//
// Kept env-based for now so this feature compiles + runs in isolation (the
// worker's free-tier device-id path still answers without a JWT).

/// Return the Supabase JWT for the worker path, if available.
fn auth_bearer(_app: &AppHandle) -> Option<String> {
    std::env::var("KEYFLOE_JWT").ok().filter(|s| !s.is_empty())
}

/// Stable per-install device id used by the worker's free-tier quota.
fn device_id(_app: &AppHandle) -> Option<String> {
    std::env::var("KEYFLOE_DEVICE_ID")
        .ok()
        .filter(|s| !s.is_empty())
}
