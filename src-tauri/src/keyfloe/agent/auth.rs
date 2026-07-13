//! Auth + endpoint resolution for the Floe agent's calls to the shared backend.
//!
//! Keyfloe's Windows app shares ONE backend and ONE account system with the Mac
//! app (Supabase JWT auth, Stripe billing — a Pro user is Pro on both). The
//! agent must authenticate the same way so per-user quota applies at
//! `keyfloe.com/v1/agent`.
//!
//! Until the central `AuthState` (P1-05, `src-tauri/src/keyfloe/auth/`) lands,
//! this resolver reads the session from the same decoupled handoff the
//! dictation feature already uses so the whole app is consistent:
//!
//!   `<app_data_dir>/keyfloe-auth.json`  ->  { "jwt": "...", "device_id": "..." }
//!
//! Env overrides (highest priority first, dev/testing):
//!   * `ANTHROPIC_API_KEY` — talk to api.anthropic.com directly, no worker.
//!   * `KEYFLOE_JWT`       — bearer for the worker path.
//!   * `KEYFLOE_DEVICE_ID` — override the per-install quota id.
//!   * `KEYFLOE_BASE_URL`  — override the backend base (default below).
//!
//! ── INTEGRATOR (P1-05) ──────────────────────────────────────────────────
//! Once the central `AuthState` exists, replace the BODY of `resolve()` with
//! reads from it — `AuthState::get_jwt()`, `get_device_id()`, `base_url()` —
//! e.g. `let auth = app.state::<crate::keyfloe::auth::AuthState>();`. Nothing
//! else in the agent needs to change: `session.rs` only calls `resolve()`.

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

/// Shared backend base. The parity backend is `keyfloe.com/v1/*`. Matches the
/// dictation feature's default so both features hit the same host.
const DEFAULT_BASE_URL: &str = "https://keyfloe.com";
const AUTH_FILE: &str = "keyfloe-auth.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct AuthFile {
    #[serde(default)]
    jwt: Option<String>,
    #[serde(default)]
    device_id: Option<String>,
}

/// Everything one agent turn needs to reach the backend.
pub struct AgentAuth {
    /// Backend base, no trailing slash (e.g. `https://keyfloe.com`).
    pub base_url: String,
    /// Supabase bearer, when signed in. `None` = anonymous free-tier (worker
    /// meters by `device_id`).
    pub jwt: Option<String>,
    /// Stable per-install id (anonymous quota key).
    pub device_id: String,
    /// When `Some`, hit Anthropic directly with this key (dev path); the worker
    /// headers are skipped entirely.
    pub anthropic_key: Option<String>,
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

fn base_url() -> String {
    env("KEYFLOE_BASE_URL")
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn auth_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    crate::portable::app_data_dir(app).ok().map(|d| d.join(AUTH_FILE))
}

fn read_auth_file(app: &AppHandle) -> AuthFile {
    let Some(path) = auth_path(app) else {
        return AuthFile::default();
    };
    std::fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

/// A stable per-install id (worker free-tier quota key). Persisted in the same
/// handoff file so it survives relaunch AND matches the id the dictation
/// feature uses; generated once if absent. Never identifiable.
fn device_id(app: &AppHandle, file: &mut AuthFile) -> String {
    if let Some(id) = env("KEYFLOE_DEVICE_ID") {
        return id;
    }
    if let Some(id) = file.device_id.clone().filter(|s| !s.is_empty()) {
        return id;
    }
    let id = pseudo_uuid();
    file.device_id = Some(id.clone());
    if let Some(path) = auth_path(app) {
        if let Ok(bytes) = serde_json::to_vec_pretty(file) {
            let _ = std::fs::write(path, bytes);
        }
    }
    id
}

/// Dependency-free pseudo-UUID (no `uuid` crate in this project). Random enough
/// for an anonymous, non-identifying install id. Mirrors the dictation helper.
fn pseudo_uuid() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let mix = nanos ^ (pid << 64) ^ (nanos.rotate_left(37));
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (mix >> 96) as u32,
        (mix >> 80) as u16 & 0xffff,
        (mix >> 68) as u16 & 0x0fff,
        (mix >> 48) as u16 & 0xffff,
        mix as u64 & 0xffff_ffff_ffff,
    )
}

/// Resolve how to authenticate the next agent request.
pub fn resolve(app: &AppHandle) -> AgentAuth {
    // Dev direct-to-Anthropic path (parity with the Mac ClaudeClient dev escape).
    if let Some(key) = env("ANTHROPIC_API_KEY") {
        let mut file = read_auth_file(app);
        return AgentAuth {
            base_url: base_url(),
            jwt: None,
            device_id: device_id(app, &mut file),
            anthropic_key: Some(key),
        };
    }

    let mut file = read_auth_file(app);
    let jwt = env("KEYFLOE_JWT").or_else(|| file.jwt.clone());
    let did = device_id(app, &mut file);
    AgentAuth {
        base_url: base_url(),
        jwt,
        device_id: did,
        anthropic_key: None,
    }
}
