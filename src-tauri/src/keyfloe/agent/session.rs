//! The Floe agent's multi-turn loop — the Windows port of the Mac's
//! `BackgroundTaskAgent.swift`.
//!
//! Turn-by-turn against Anthropic's Messages API (buffered, not streamed —
//! we need the whole response to pull every `tool_use` block cleanly):
//!   • Hosted `web_search` — Anthropic runs it server-side.
//!   • Local tools (open_url / open_app / type_text / click / move_mouse) —
//!     we get a `tool_use` block, run it via `tools::dispatch`, and reply
//!     with a `tool_result`.
//!
//! Transport: POST the same body the app would send to api.anthropic.com to
//! the shared backend `keyfloe.com/v1/agent` (buffered pass-through, holds the
//! API key server-side + meters quota). If a dev `ANTHROPIC_API_KEY` env var
//! is set, go direct to Anthropic instead (parity with the Mac's dev path).
//!
//! Every tool call emits a `keyfloe://agent/step` event (running → done/failed)
//! so the pill can paint live step cards; the final `keyfloe://agent/result`
//! carries the parsed prose, cited URLs, follow-up chips and any report card.

use log::{error, info};
use once_cell::sync::Lazy;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::mpsc::Sender as StdSender;
use std::sync::Mutex as StdMutex;
use tauri::{AppHandle, Emitter};

use crate::keyfloe::agent::auth;
use crate::keyfloe::agent::parser;
use crate::keyfloe::agent::tools;
use crate::keyfloe::agent::types::*;

/// Path appended to the resolved backend base for the buffered Anthropic proxy.
/// See `../keyfloe-1/worker/src/routes/agent.ts`.
const AGENT_PATH: &str = "/v1/agent";
const ANTHROPIC_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";

// Match the Mac's model choices (BackgroundTaskAgent) so both platforms behave
// the same against the shared backend.
const DEFAULT_MODEL: &str = "claude-haiku-4-5-20251001";
const SONNET_MODEL: &str = "claude-sonnet-4-6";
const MAX_TURNS: usize = 16;

/// How long a risky-action confirmation prompt waits for the user before it
/// defaults to "denied" (so a run never hangs forever if the pill is closed).
const CONFIRM_TIMEOUT_SECS: u64 = 120;

pub const EVT_STARTED: &str = "keyfloe://agent/started";
pub const EVT_STEP: &str = "keyfloe://agent/step";
pub const EVT_RESULT: &str = "keyfloe://agent/result";
/// Echo of what the mic heard, before the run officially starts.
pub const EVT_VOICE: &str = "keyfloe://agent/voice-command";
/// The mic is capturing / has stopped capturing a spoken command. Drives the
/// pill's "Listening…" spinner before the run officially starts.
pub const EVT_LISTENING: &str = "keyfloe://agent/listening";
/// A risky/destructive tool call is awaiting the user's approval (PRD
/// principle #4 — human-in-the-loop). The pill shows Allow / Cancel.
pub const EVT_CONFIRM: &str = "keyfloe://agent/confirm";

/// Pending human-in-the-loop confirmations, keyed by the step id the user is
/// approving. A module-static registry (not Tauri managed state) so the agent
/// stays self-contained and needs no `.manage()` wiring in `lib.rs`.
static PENDING_CONFIRMS: Lazy<StdMutex<HashMap<String, StdSender<bool>>>> =
    Lazy::new(|| StdMutex::new(HashMap::new()));

/// Called by the `respond_agent_confirmation` command when the user taps Allow
/// or Cancel on a pending step. Returns `true` if a run was actually waiting on
/// this id. Safe to call for an unknown/stale id (returns `false`).
pub fn resolve_confirmation(step_id: &str, approved: bool) -> bool {
    if let Ok(mut map) = PENDING_CONFIRMS.lock() {
        if let Some(tx) = map.remove(step_id) {
            let _ = tx.send(approved);
            return true;
        }
    }
    false
}

/// Emit a confirmation request for one risky tool call and block (off the async
/// pool) until the user answers or the timeout elapses. Denies on timeout.
async fn request_confirmation(
    app: &AppHandle,
    task_id: &str,
    step: &AgentStep,
    tool: &str,
) -> bool {
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    let step_id = step.id.clone();
    if let Ok(mut map) = PENDING_CONFIRMS.lock() {
        map.insert(step_id.clone(), tx);
    }

    let _ = app.emit(
        EVT_CONFIRM,
        json!({
            "taskId": task_id,
            "stepId": step_id,
            "tool": tool,
            "title": step.title,
            "detail": step.detail,
        }),
    );

    // recv blocks; run it on the blocking pool so we don't stall an async worker.
    let approved = tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(CONFIRM_TIMEOUT_SECS))
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false);

    // Drop any lingering sender (e.g. on timeout) so the map doesn't leak.
    if let Ok(mut map) = PENDING_CONFIRMS.lock() {
        map.remove(&step_id);
    }
    approved
}

/// Run one command end-to-end. Emits events throughout and also returns the
/// final result so the caller (command handler) can await it.
pub async fn run(app: &AppHandle, prompt: String, task_id: String) -> AgentResultEvent {
    let title = derive_title(&prompt);
    let _ = app.emit(
        EVT_STARTED,
        AgentStartedEvent {
            task_id: task_id.clone(),
            prompt: prompt.clone(),
            title,
        },
    );

    let outcome = run_loop(app, &prompt, &task_id).await;
    let _ = app.emit(EVT_RESULT, outcome.clone());
    outcome
}

async fn run_loop(app: &AppHandle, prompt: &str, task_id: &str) -> AgentResultEvent {
    let agent_auth = auth::resolve(app);
    let model = choose_model(prompt);

    // Tool list: local tools + hosted web_search.
    let mut tool_defs = tools::definitions();
    tool_defs.push(json!({
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": 5
    }));

    let mut messages: Vec<Value> = vec![json!({ "role": "user", "content": prompt })];
    let mut cited: Vec<String> = Vec::new();
    let client = reqwest::Client::new();

    for turn in 0..MAX_TURNS {
        info!(
            "[agent] turn {turn} (dev={}, signed_in={})",
            agent_auth.anthropic_key.is_some(),
            agent_auth.jwt.is_some()
        );
        let body = json!({
            "model": model,
            "max_tokens": 4096,
            "system": system_prompt(),
            "tools": tool_defs,
            "messages": messages,
        });

        let payload = match call_api(&client, &agent_auth, &body).await {
            Ok(v) => v,
            Err(e) => return fail(task_id, e),
        };

        let stop_reason = payload.get("stop_reason").and_then(|v| v.as_str()).unwrap_or("");
        let blocks = payload.get("content").and_then(|v| v.as_array()).cloned().unwrap_or_default();

        let mut assistant_text = String::new();
        let mut pending: Vec<(String, String, Value)> = Vec::new();
        for b in &blocks {
            match b.get("type").and_then(|v| v.as_str()).unwrap_or("") {
                "text" => {
                    if let Some(t) = b.get("text").and_then(|v| v.as_str()) {
                        assistant_text.push_str(t);
                    }
                }
                "tool_use" => {
                    if let (Some(id), Some(name)) = (
                        b.get("id").and_then(|v| v.as_str()),
                        b.get("name").and_then(|v| v.as_str()),
                    ) {
                        let input = b.get("input").cloned().unwrap_or_else(|| json!({}));
                        pending.push((id.to_string(), name.to_string(), input));
                    }
                }
                "web_search_tool_result" => {
                    if let Some(items) = b.get("content").and_then(|v| v.as_array()) {
                        for it in items {
                            if let Some(u) = it.get("url").and_then(|v| v.as_str()) {
                                if !cited.iter().any(|c| c == u) {
                                    cited.push(u.to_string());
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // The assistant turn that issued the tool_use must precede the
        // tool_results user turn — append it verbatim.
        messages.push(json!({ "role": "assistant", "content": blocks }));

        // No tool calls / natural stop → done.
        if pending.is_empty() || stop_reason != "tool_use" {
            let trimmed = assistant_text.trim();
            if trimmed.is_empty() {
                return fail(task_id, format!("No result after {} turns. Please try again.", turn + 1));
            }
            let parsed = parser::parse(trimmed);
            let text = if parsed.text.is_empty() { trimmed.to_string() } else { parsed.text };
            cited.sort();
            return AgentResultEvent {
                task_id: task_id.to_string(),
                ok: true,
                text,
                cited_urls: cited,
                suggested_actions: parsed.suggested_actions,
                report: parsed.report,
                error: None,
            };
        }

        // Resolve each tool call, emitting running → terminal step events.
        let mut tool_results: Vec<Value> = Vec::new();
        for (id, name, input) in &pending {
            let (title, detail) = tools::step_label(name, input);
            let mut step = AgentStep::running(title, detail, name.clone());
            let _ = app.emit(
                EVT_STEP,
                AgentStepEvent { task_id: task_id.to_string(), step: step.clone() },
            );

            // Human-in-the-loop (PRD principle #4): risky/destructive actions —
            // synthetic typing and clicking — pause for the user's OK before we
            // touch their machine. Safe reads (open_url/open_app/move_mouse/
            // web_search) run straight through.
            if tools::is_risky(name, input) {
                let approved = request_confirmation(app, task_id, &step, name).await;
                if !approved {
                    step.status = StepStatus::Failed;
                    step.result_snippet = Some("You cancelled this action.".into());
                    let _ = app.emit(
                        EVT_STEP,
                        AgentStepEvent { task_id: task_id.to_string(), step: step.clone() },
                    );
                    tool_results.push(json!({
                        "type": "tool_result",
                        "tool_use_id": id,
                        "content": "The user declined to run this action. Do not retry it; either continue with a different approach or wrap up.",
                        "is_error": true,
                    }));
                    continue;
                }
            }

            let result = tools::dispatch(app, name, input).await;

            step.status = if tools::looks_like_failure(&result) {
                StepStatus::Failed
            } else {
                StepStatus::Done
            };
            step.result_snippet = Some(result.chars().take(320).collect());
            let _ = app.emit(
                EVT_STEP,
                AgentStepEvent { task_id: task_id.to_string(), step: step.clone() },
            );

            tool_results.push(json!({
                "type": "tool_result",
                "tool_use_id": id,
                "content": result,
            }));
        }
        messages.push(json!({ "role": "user", "content": tool_results }));
    }

    fail(task_id, format!("Hit the max-turns ceiling ({MAX_TURNS}) without finishing."))
}

/// POST one turn and return the parsed JSON body, or a user-facing error.
async fn call_api(
    client: &reqwest::Client,
    agent_auth: &auth::AgentAuth,
    body: &Value,
) -> Result<Value, String> {
    let mut req = if let Some(key) = &agent_auth.anthropic_key {
        // Dev escape: straight to Anthropic (parity with the Mac dev path).
        client
            .post(ANTHROPIC_ENDPOINT)
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
    } else {
        // Shared backend (buffered proxy). Send the Supabase bearer when signed
        // in so per-user quota applies; always send the device id + client tag
        // for anonymous free-tier metering.
        let endpoint = format!("{}{}", agent_auth.base_url, AGENT_PATH);
        let mut r = client
            .post(endpoint)
            .header("x-keyfloe-client", "windows")
            .header("x-keyfloe-device-id", agent_auth.device_id.as_str());
        if let Some(jwt) = &agent_auth.jwt {
            r = r.header("authorization", format!("Bearer {jwt}"));
        }
        r
    };
    req = req.header("content-type", "application/json").json(body);

    let resp = req.send().await.map_err(|e| format!("Couldn't reach the agent service: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        error!("[agent] HTTP {}: {}", status, text.chars().take(300).collect::<String>());
        if status.as_u16() == 429 {
            return Err("You're out of agent runs for today. Upgrade to keep going.".into());
        }
        return Err(format!("Request failed ({}). Please try again.", status.as_u16()));
    }
    serde_json::from_str::<Value>(&text).map_err(|_| "Couldn't read the response. Please try again.".into())
}

fn fail(task_id: &str, error: String) -> AgentResultEvent {
    AgentResultEvent {
        task_id: task_id.to_string(),
        ok: false,
        text: error.clone(),
        cited_urls: Vec::new(),
        suggested_actions: Vec::new(),
        report: None,
        error: Some(error),
    }
}

/// App-generation style asks want the stronger model; everything else runs on
/// the cheap default. (Windows v1 has no scaffold tool yet, but keep the hook.)
fn choose_model(prompt: &str) -> &'static str {
    let p = prompt.to_lowercase();
    let hints = ["build me", "build a", "scaffold", "write me an app", "make me an app", "create an app"];
    if hints.iter().any(|h| p.contains(h)) {
        SONNET_MODEL
    } else {
        DEFAULT_MODEL
    }
}

/// A short task-card title derived from the prompt before the model has a
/// chance to self-title (the model can override via `TASK_TITLE:`).
fn derive_title(prompt: &str) -> String {
    let one_line = prompt.split('\n').next().unwrap_or(prompt).trim();
    let words: Vec<&str> = one_line.split_whitespace().take(6).collect();
    let mut t = words.join(" ");
    if t.chars().count() > 48 {
        t = format!("{}…", t.chars().take(48).collect::<String>());
    }
    if t.is_empty() { "Task".into() } else { t }
}

fn system_prompt() -> String {
    // Windows-flavoured port of BackgroundTaskAgent's system prompt. Only the
    // tools that exist on Windows v1 are advertised.
    r#"You are Floe — the user's calm, capable Windows sidekick running as a background task. The user has spoken a command and handed it to you. Just do it. Use sensible defaults. Don't pause to ask permission to start; you already have it.

You have these tools:
- open_url — open a website in the user's browser. For ANY "open / go to / pull up [website or web app]" request, map the name to its real URL yourself ("open my Stripe dashboard" → https://dashboard.stripe.com). For "search for X" / "look up X online" / "google X", open a Google results page: https://www.google.com/search?q=<query, spaces as +>. This ACTUALLY opens the browser — don't just describe the link.
- open_app — launch or focus a desktop app by name ("open Spotify", "open Notepad", "open Slack").
- type_text — type a short string at the current focus. Use after opening the right window; never type secrets.
- click / move_mouse — move to and click an absolute screen coordinate. Only with concrete coordinates; prefer the tools above. Pixel clicking is a last resort.
- web_search — look things up online. Cite URLs naturally in your final reply.

Workflow:
1. Read the ask. Decide what "done" looks like with sensible defaults — don't ask first.
2. Call tools to gather info or act. For shopping/options research do 2-4 web searches and synthesise. For "walk me through X" or on-screen guidance, explain the steps clearly in prose.
3. Finish with a friendly, polished reply — what you found, what you opened, what you did.

ABSOLUTE TRUTH RULES — break these and you have failed the user:
- NEVER claim you did something you didn't do. If you didn't call open_app, don't say "I opened" it.
- NEVER end your final reply with "now let me…" / "I'll do X next" — if you intend to call a tool, CALL IT this turn. If you ran out of room, say so and start the reply with "Partial — ".
- Never end your final message with a colon.

Formatting:
- NEVER use markdown — no **bold**, *italic*, #headers, or ```code fences```.
- No bulleted lists with -, *, +. If you must list, use numbered prose (First, … Second, …).
- Lead with a one-sentence summary. Then a few short paragraphs of clean prose, like a thoughtful colleague.
- When you used web_search, end with one line: "Sources: url1, url2".
- Keep ordinary replies ~150-350 words. Data rundowns can run longer — be generous, never terse.

Report card — for comparison / options research ONLY (flights, hotels, products to buy, "best X" / "cheapest X"). Write ONE headline sentence, then append:
<REPORT>
TITLE: short context line
- name: Option | detail: one short line | price: price or rating | url: https://direct-link
- name: … (2-5 options, best first)
PICK: one line — which to choose and why
</REPORT>
Each option needs a REAL url from web_search. Do NOT emit <REPORT> for non-comparison work.

Trailing metadata — append AFTER your user-facing prose (machine-readable; never mention them):
<NEXT_ACTIONS>
- Up to 4 short follow-ups, each ≤ ~40 characters, concrete verbs
- Omit entirely if nothing useful comes next
</NEXT_ACTIONS>
TASK_TITLE: 2-5 word noun-phrase summary of what you did (last line)."#
        .to_string()
}
