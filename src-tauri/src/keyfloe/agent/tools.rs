//! Client-side ("local") tools the Floe agent can call, plus their Anthropic
//! tool-schema definitions and human step labels.
//!
//! Windows action layer, borrowing the shape of the Mac's `LocalTools.swift`
//! and the execution patterns in trycua/cua + UI-TARS (open URL / open app /
//! type / click). Hosted `web_search` is added by the session, not here —
//! Anthropic runs it server-side.
//!
//! Native execution differs per-OS. `open_url` / `open_app` shell out with a
//! `#[cfg]` per platform; `type_text` / `click` / `move_mouse` drive the
//! shared `EnigoState`. The Windows branches compile on this Mac but can only
//! be *verified* on Windows (see INTEGRATION.md).

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// How long we wait for a queued main-thread input op to run before giving up.
const INPUT_MAIN_THREAD_TIMEOUT_SECS: u64 = 20;

/// Anthropic tool-schema dicts for every local tool. The session appends the
/// hosted `web_search` tool to this list before each run.
pub fn definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "open_url",
            "description": "Open a website in the user's default browser. Use for ANY \"open / go to / pull up [website or web app]\" request — map well-known names to their real URL yourself (\"open my Stripe dashboard\" → https://dashboard.stripe.com). For \"search for X / look up X online / google X\", open a Google results page: https://www.google.com/search?q=<query, spaces as +>. This ACTUALLY opens the browser — don't just describe the link.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "Absolute URL to open (include https://)." }
                },
                "required": ["url"]
            }
        }),
        json!({
            "name": "open_app",
            "description": "Launch or focus a desktop application by name, e.g. \"open Spotify\", \"open Notepad\", \"open Slack\". For native apps use this; for websites use open_url.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Application name as the user would say it (e.g. \"Spotify\", \"Notepad\")." }
                },
                "required": ["name"]
            }
        }),
        json!({
            "name": "type_text",
            "description": "Type a short string of text at the current cursor/focus, as if from the keyboard. Use to fill a field the user has focused, or after open_app/open_url once the target is ready. Keep it to what the user asked to enter — never type secrets or long documents.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "The exact text to type." }
                },
                "required": ["text"]
            }
        }),
        json!({
            "name": "click",
            "description": "Move the mouse to an absolute screen coordinate and click. Use only when you have concrete pixel coordinates (e.g. from a Snapshot). Prefer open_url / open_app / type_text — pixel clicking is a last resort and less reliable.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "x": { "type": "integer", "description": "Absolute X in screen pixels." },
                    "y": { "type": "integer", "description": "Absolute Y in screen pixels." },
                    "button": { "type": "string", "enum": ["left", "right", "middle"], "description": "Which button. Defaults to left." }
                },
                "required": ["x", "y"]
            }
        }),
        json!({
            "name": "move_mouse",
            "description": "Move the mouse to an absolute screen coordinate without clicking — e.g. to point at something while guiding the user step-by-step.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "x": { "type": "integer" },
                    "y": { "type": "integer" }
                },
                "required": ["x", "y"]
            }
        }),
    ]
}

/// Friendly `(title, detail)` for a tool call, shown in the pill's step cards.
/// Unknown tools fall back to a humanised name; a missing key yields a blank
/// detail, never a panic. Composio-style UPPERCASE_SLUGS are formatted as
/// "Send email" / "Gmail" like the Mac does.
pub fn step_label(tool: &str, input: &Value) -> (String, String) {
    let s = |k: &str| -> String {
        input.get(k).and_then(|v| v.as_str()).unwrap_or("").trim().to_string()
    };
    let clip = |v: String, n: usize| -> String {
        if v.chars().count() > n {
            format!("{}…", v.chars().take(n).collect::<String>())
        } else {
            v
        }
    };
    match tool {
        "open_url" => {
            let raw = s("url");
            let host = raw
                .split("://")
                .last()
                .unwrap_or(&raw)
                .split('/')
                .next()
                .unwrap_or(&raw)
                .to_string();
            ("Opening website".into(), host)
        }
        "open_app" => ("Opening app".into(), s("name")),
        "type_text" => ("Typing".into(), clip(s("text"), 40)),
        "click" => (
            "Clicking".into(),
            format!("{}, {}", int(input, "x"), int(input, "y")),
        ),
        "move_mouse" => (
            "Pointing".into(),
            format!("{}, {}", int(input, "x"), int(input, "y")),
        ),
        other => {
            // Composio-style TOOLKIT_VERB_NOUN → ("Send email", "Gmail").
            if other == other.to_uppercase() && other.contains('_') {
                let parts: Vec<&str> = other.split('_').collect();
                let toolkit = titlecase(parts[0]);
                let action = parts[1..].join(" ").to_lowercase();
                let title = if action.is_empty() {
                    toolkit.clone()
                } else {
                    titlecase(&action)
                };
                (title, toolkit)
            } else {
                (titlecase(&other.replace('_', " ")), String::new())
            }
        }
    }
}

fn int(input: &Value, k: &str) -> i64 {
    input.get(k).and_then(|v| v.as_i64()).unwrap_or(0)
}

fn titlecase(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(first) => first.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// Whether a tool call touches the user's machine in a way that should pause
/// for explicit approval (PRD principle #4 — human-in-the-loop). Synthetic
/// typing and clicking qualify; reads (open_url/open_app/move_mouse/web_search)
/// do not — the user already asked for those and they can't destroy anything.
pub fn is_risky(tool: &str, _input: &Value) -> bool {
    matches!(tool, "type_text" | "click")
}

/// Run one local tool and return a plain-string result the agent feeds back as
/// a `tool_result`. Prose (not typed errors) so the session's failure
/// heuristic can flag a step red — matches the Mac's LocalTools contract.
pub async fn dispatch(app: &AppHandle, name: &str, input: &Value) -> String {
    match name {
        "open_url" => open_url(&input.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string()),
        "open_app" => open_app(&input.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string()),
        "type_text" => type_text(app, input.get("text").and_then(|v| v.as_str()).unwrap_or("")).await,
        "click" => {
            click(
                app,
                int(input, "x") as i32,
                int(input, "y") as i32,
                input.get("button").and_then(|v| v.as_str()).unwrap_or("left"),
            )
            .await
        }
        "move_mouse" => move_mouse(app, int(input, "x") as i32, int(input, "y") as i32).await,
        _ => format!("Unknown tool '{}'.", name),
    }
}

fn open_url(url: &str) -> String {
    let url = if url.contains("://") {
        url.to_string()
    } else {
        format!("https://{}", url)
    };
    if url.trim().is_empty() {
        return "Couldn't open the website: no URL was given.".into();
    }
    let result = {
        #[cfg(target_os = "windows")]
        {
            // `cmd /C start "" <url>` — the empty "" is the window title arg so
            // a URL with spaces/& isn't mis-parsed as the title.
            std::process::Command::new("cmd")
                .args(["/C", "start", "", &url])
                .spawn()
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open").arg(&url).spawn()
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open").arg(&url).spawn()
        }
    };
    match result {
        Ok(_) => format!("Opened {} in the browser.", url),
        Err(e) => format!("Couldn't open {}: {}", url, e),
    }
}

fn open_app(name: &str) -> String {
    let name = name.trim();
    if name.is_empty() {
        return "Couldn't open the app: no name was given.".into();
    }
    let result = {
        #[cfg(target_os = "windows")]
        {
            // `start` resolves apps registered in the Start menu / App Paths by
            // name (e.g. "spotify", "notepad", "code") without a full path.
            std::process::Command::new("cmd")
                .args(["/C", "start", "", name])
                .spawn()
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open").args(["-a", name]).spawn()
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new(name).spawn()
        }
    };
    match result {
        Ok(_) => format!("Opened {}.", name),
        Err(e) => format!(
            "Couldn't open {}: {}. It may not be installed or the name may not match.",
            name, e
        ),
    }
}

/// Run an `enigo` operation on the app's MAIN thread and return its prose
/// result. Two reasons this is not a plain `state.0.lock()` inline:
///   1. Enigo's synthetic input is most reliable when driven from the main
///      thread — `actions.rs` already pastes via `run_on_main_thread` for the
///      same reason, and Windows `SendInput` can be dropped from a worker
///      thread. The agent's tool loop runs on the async pool, so we hop.
///   2. Init guard — `EnigoState` is only `.manage()`d after the user finishes
///      onboarding (`initialize_enigo`). If the agent fires before that, we
///      return a friendly note instead of failing silently.
///
/// The op is queued to the main thread; we block on a channel from the blocking
/// pool (never an async worker) so the agent's turn simply awaits the result.
async fn exec_on_main<F>(app: &AppHandle, label: &str, f: F) -> String
where
    F: FnOnce(&mut enigo::Enigo) -> String + Send + 'static,
{
    let app_main = app.clone();
    let label_owned = label.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let app_inner = app_main.clone();
        let queued = app_main.run_on_main_thread(move || {
            let out = match app_inner.try_state::<crate::input::EnigoState>() {
                None => "input backend isn't ready yet. Finish setup first.".to_string(),
                Some(state) => match state.0.lock() {
                    Ok(mut enigo) => f(&mut enigo),
                    Err(_) => "input backend is busy.".to_string(),
                },
            };
            let _ = tx.send(out);
        });
        if let Err(e) = queued {
            return format!("Couldn't {label_owned}: {e}");
        }
        match rx.recv_timeout(std::time::Duration::from_secs(INPUT_MAIN_THREAD_TIMEOUT_SECS)) {
            Ok(s) => {
                // Bare failures from the closure ("input backend isn't ready…")
                // are prefixed so the pill reads naturally and `looks_like_failure`
                // still flags the step red.
                if s.starts_with("input backend") {
                    format!("Couldn't {label_owned}: {s}")
                } else {
                    s
                }
            }
            Err(_) => format!("Couldn't {label_owned}: the input request timed out."),
        }
    })
    .await
    .unwrap_or_else(|_| format!("Couldn't {label}: the input task failed."))
}

/// Type text via the shared Enigo instance (main thread — see `exec_on_main`).
async fn type_text(app: &AppHandle, text: &str) -> String {
    if text.is_empty() {
        return "Nothing to type.".into();
    }
    let text_owned = text.to_string();
    let echo = clip_for_result(text);
    exec_on_main(app, "type the text", move |enigo| {
        use enigo::Keyboard;
        match enigo.text(&text_owned) {
            Ok(_) => format!("Typed: {}", echo),
            Err(e) => format!("Couldn't type the text: {}", e),
        }
    })
    .await
}

/// Move to and click an absolute screen coordinate (main thread).
///
/// WINDOWS VERIFY: `Coordinate::Abs` targets physical desktop pixels. On
/// multi-monitor / HiDPI (125/150/200% scaling) confirm the coordinate the
/// model supplies (usually derived from a Snapshot, which reports physical
/// pixels) lands on the intended element and does not drift on secondary
/// monitors with negative origins.
async fn click(app: &AppHandle, x: i32, y: i32, button: &str) -> String {
    let button = button.to_string();
    exec_on_main(app, "click", move |enigo| {
        use enigo::{Button, Coordinate, Direction, Mouse};
        let btn = match button.as_str() {
            "right" => Button::Right,
            "middle" => Button::Middle,
            _ => Button::Left,
        };
        if let Err(e) = enigo.move_mouse(x, y, Coordinate::Abs) {
            return format!("Couldn't move the cursor: {}", e);
        }
        match enigo.button(btn, Direction::Click) {
            Ok(_) => format!("Clicked at {}, {}.", x, y),
            Err(e) => format!("Couldn't click: {}", e),
        }
    })
    .await
}

/// Move the cursor to an absolute screen coordinate without clicking (main
/// thread). Same HiDPI/multi-monitor caveat as `click`.
async fn move_mouse(app: &AppHandle, x: i32, y: i32) -> String {
    exec_on_main(app, "move the cursor", move |enigo| {
        use enigo::{Coordinate, Mouse};
        match enigo.move_mouse(x, y, Coordinate::Abs) {
            Ok(_) => format!("Moved the cursor to {}, {}.", x, y),
            Err(e) => format!("Couldn't move the cursor: {}", e),
        }
    })
    .await
}

fn clip_for_result(text: &str) -> String {
    if text.chars().count() > 60 {
        format!("{}…", text.chars().take(60).collect::<String>())
    } else {
        text.to_string()
    }
}

/// Heuristic: did a local tool's prose result signal failure? Used to flag a
/// step card red. Mirrors `BackgroundTaskAgent.looksLikeToolFailure`.
pub fn looks_like_failure(result: &str) -> bool {
    let r = result.to_lowercase();
    ["couldn't", "could not", "failed", "not permitted", "permission", "no such", "error:", "unknown tool"]
        .iter()
        .any(|n| r.contains(n))
}
