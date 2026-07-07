//! Shared-backend auth + endpoint resolution for the dictation polish client.
//!
//! Keyfloe's Windows app shares the SAME backend and accounts as the Mac app
//! (Supabase auth, Stripe billing — a Pro user is Pro on both). Feature A (the
//! shell/onboarding) owns the actual sign-in flow. To stay decoupled from it,
//! this module reads the session from a small JSON file that Feature A is
//! expected to write, plus env-var overrides for development:
//!
//!   `<app_data_dir>/keyfloe-auth.json`  ->  { "jwt": "...", "device_id": "..." }
//!
//! Env overrides (highest priority first):
//!   * `ANTHROPIC_API_KEY`  — dev: talk to api.anthropic.com directly, no worker.
//!   * `KEYFLOE_JWT`        — dev: bearer token for the worker path.
//!   * `KEYFLOE_BASE_URL`   — override the backend base (default below).
//!
//! See INTEGRATION.md ("Auth handoff") for what Feature A must provide.

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

/// Shared backend base. Per BUILD-PLAN the parity backend is `keyfloe.com/v1/*`.
/// NOTE: the Mac app currently routes `/v1/chat` through the proven Cloudflare
/// Worker because Vercel's firewall challenges non-browser requests. If the
/// same is true here, set `KEYFLOE_BASE_URL` to the Worker base. Left as
/// keyfloe.com so the integrator/Feature A picks the verified host.
const DEFAULT_BASE_URL: &str = "https://keyfloe.com";

const ANTHROPIC_DIRECT_URL: &str = "https://api.anthropic.com/v1/messages";
const AUTH_FILE: &str = "keyfloe-auth.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct AuthFile {
    #[serde(default)]
    jwt: Option<String>,
    #[serde(default)]
    device_id: Option<String>,
}

/// Resolved request target for one polish call.
pub struct Endpoint {
    pub url: String,
    /// When `Some`, hit Anthropic directly with this key (dev path); the worker
    /// headers are skipped.
    pub anthropic_key: Option<String>,
    pub jwt: Option<String>,
    pub device_id: String,
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

fn base_url() -> String {
    env("KEYFLOE_BASE_URL").unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
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

/// A stable per-install id (worker free-tier quota key). Persisted in the auth
/// file so it survives relaunch; generated once if absent. Never identifiable.
fn device_id(app: &AppHandle, file: &mut AuthFile) -> String {
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
/// for an anonymous, non-identifying install id.
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

/// Resolve where + how to send the next polish request.
pub fn resolve(app: &AppHandle) -> Endpoint {
    // Dev direct-to-Anthropic path (mirrors the Mac ClaudeClient dev escape).
    if let Some(key) = env("ANTHROPIC_API_KEY") {
        let mut file = read_auth_file(app);
        return Endpoint {
            url: ANTHROPIC_DIRECT_URL.to_string(),
            anthropic_key: Some(key),
            jwt: None,
            device_id: device_id(app, &mut file),
        };
    }

    let mut file = read_auth_file(app);
    let jwt = env("KEYFLOE_JWT").or_else(|| file.jwt.clone());
    let did = device_id(app, &mut file);
    Endpoint {
        url: format!("{}/v1/chat", base_url().trim_end_matches('/')),
        anthropic_key: None,
        jwt,
        device_id: did,
    }
}
