//! Feature C — voice command / "Floe" agent (backend).
//!
//! Hold the Floe key → speak → release → Keyfloe understands the task and
//! either answers, opens an app/URL, guides on-screen, or runs background
//! research, streaming live step cards into the pill.
//!
//! Owned entirely under `src-tauri/src/keyfloe/agent/` per BUILD-PLAN.md. The
//! only shared file this touches is the command registry + (optionally) the
//! shortcut action map — both via INTEGRATION.md, never by direct edit.
//!
//! Layout:
//!   • `types`    — wire + event payloads (mirror `AgentTask`/`AgentStep`).
//!   • `parser`   — strips <REPORT>/<NEXT_ACTIONS>/TASK_TITLE trailing blocks.
//!   • `tools`    — local action layer (open_url/open_app/type/click) + labels.
//!   • `auth`     — Supabase JWT + device-id resolution for the shared backend.
//!   • `session`  — the multi-turn Anthropic loop over keyfloe.com/v1/agent,
//!                  plus the human-in-the-loop confirmation registry.
//!   • `commands` — the `run_agent_command` / voice-capture Tauri entry points.

pub mod auth;
pub mod commands;
pub mod parser;
pub mod session;
pub mod tools;
pub mod types;

// The commands are registered by full path in lib.rs (`agent::commands::…`) so
// the specta helper items resolve; this re-export is kept for ergonomic callers.
#[allow(unused_imports)]
pub use commands::{
    respond_agent_confirmation, run_agent_command, run_agent_voice_command, start_agent_capture,
    stop_agent_capture,
};
