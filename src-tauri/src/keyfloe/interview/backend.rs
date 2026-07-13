//! Shared-backend client for interview mode.
//!
//! Talks to the SAME endpoints the Mac app uses so a Pro user is Pro on both
//! platforms and every request is quota-metered server-side:
//!   * `POST {BASE}/v1/transcribe` — multipart WAV → `{ "text": "…" }`
//!     (interviewer + you utterance transcription).
//!   * `POST {BASE}/v1/chat`       — Anthropic-passthrough SSE stream
//!     (the "How do I answer this?" turn).
//!
//! Auth mirrors the Mac client (`WhisperClient` / `ClaudeClient`):
//!   - `x-oneclick-device-id: <stable per-install id>`
//!   - `Authorization: Bearer <supabase jwt>` when signed in
//!   - `x-oneclick-feature: interview` on chat turns (Pro-gate hint)
//!   - dev escape hatches: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` hit the
//!     providers directly (no worker, no quota) for local testing, exactly
//!     like the Mac app's dev path.
//!
//! AUTH SOURCE — central AuthState (task P1-05). Credentials (base URL + Supabase
//! JWT + device id) are resolved once per session in `resolve_creds()`. That
//! function currently falls back to env + the legacy on-disk stores so interview
//! mode works standalone, but it is the SINGLE integration seam: when the shared
//! `keyfloe::auth` module lands, replace the three marked lines in
//! `resolve_creds()` with `auth::base_url(app)` / `auth::get_jwt(app)` /
//! `auth::get_device_id(app)` (see INTEGRATION.md + the integrator notes). No
//! other call site reads auth, so that one swap moves the whole feature onto
//! central auth (Windows Credential Manager via the keyring crate).

use once_cell::sync::Lazy;
use std::path::Path;
use std::sync::Mutex;
use tauri::AppHandle;

/// Backend base URL. Ships pointed at keyfloe.com/v1 (the shared production
/// backend). Override at runtime with `KEYFLOE_API_BASE` (e.g. to hit a preview
/// deployment). Paths are appended as `{base}/v1/...`.
pub fn api_base() -> String {
    std::env::var("KEYFLOE_API_BASE")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "https://keyfloe.com".to_string())
}

/// Resolved per-session credentials for the shared backend.
#[derive(Clone)]
pub struct AuthCreds {
    pub base: String,
    /// Supabase JWT for the signed-in user, if any.
    pub jwt: Option<String>,
    /// Stable per-install id (worker/quota key).
    pub device_id: String,
}

/// Resolve base URL + JWT + device id for backend calls.
///
/// INTEGRATION(P1-05 central AuthState): replace the three resolution lines
/// below with the shared accessors once `crate::keyfloe::auth` is registered:
/// ```ignore
/// base:      crate::keyfloe::auth::base_url(app),
/// jwt:       crate::keyfloe::auth::get_jwt(app),
/// device_id: crate::keyfloe::auth::get_device_id(app),
/// ```
/// Until then this reads env + the legacy files so the feature runs standalone.
pub fn resolve_creds(_app: &AppHandle, data_dir: &Path) -> AuthCreds {
    AuthCreds {
        base: api_base(),
        jwt: legacy_auth_token(data_dir),
        device_id: device_id(data_dir),
    }
}

fn env_opt(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

/// Stable per-install id (worker free-tier quota key). Persisted next to the
/// interview context JSON so it survives relaunch; random, never identifiable.
static DEVICE_ID: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

pub fn device_id(data_dir: &std::path::Path) -> String {
    if let Some(id) = DEVICE_ID.lock().unwrap().clone() {
        return id;
    }
    let path = data_dir.join("keyfloe").join("device-id.txt");
    let id = std::fs::read_to_string(&path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            let fresh = gen_id();
            let _ = std::fs::create_dir_all(path.parent().unwrap());
            let _ = std::fs::write(&path, &fresh);
            fresh
        });
    *DEVICE_ID.lock().unwrap() = Some(id.clone());
    id
}

/// UUID-ish id without pulling in the `uuid`/`rand` crates. Time + address
/// entropy is plenty for a non-security install identifier.
fn gen_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let stack = &nanos as *const _ as usize;
    format!("{:016x}-{:08x}", nanos as u64, stack as u32)
}

/// Legacy Supabase-JWT fallback (env or `<app_data>/keyfloe/auth.json`). Only
/// used until central AuthState is wired into `resolve_creds()`.
fn legacy_auth_token(data_dir: &std::path::Path) -> Option<String> {
    if let Some(t) = env_opt("KEYFLOE_ACCESS_TOKEN") {
        return Some(t);
    }
    // `<app_data>/keyfloe/auth.json` → { "access_token": "…" }
    let path = data_dir.join("keyfloe").join("auth.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    v.get("access_token")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

/// One chat message in the Anthropic-shaped `/v1/chat` body.
#[derive(serde::Serialize)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,
}

pub struct KeyfloeApi {
    client: reqwest::Client,
    creds: AuthCreds,
}

impl KeyfloeApi {
    /// Resolve credentials (base URL + JWT + device id) once, up front. `app` is
    /// the seam central AuthState reads from; `data_dir` feeds the legacy
    /// fallback until then.
    pub fn new(app: &AppHandle, data_dir: std::path::PathBuf) -> Self {
        Self {
            client: reqwest::Client::new(),
            creds: resolve_creds(app, &data_dir),
        }
    }

    /// Transcribe a 16 kHz mono WAV. Mirrors the Mac `WhisperClient` contract:
    /// multipart `file`, `model=whisper-1`, `response_format=json`.
    pub async fn transcribe(&self, wav: Vec<u8>, language_hint: &str) -> Result<String, String> {
        let part = reqwest::multipart::Part::bytes(wav)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| e.to_string())?;
        let mut form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("model", "whisper-1")
            .text("response_format", "json");
        if !language_hint.is_empty() {
            form = form.text("language", language_hint.to_string());
        }

        // Dev path: direct OpenAI when OPENAI_API_KEY is set.
        let (url, mut req) = if let Some(key) = env_opt("OPENAI_API_KEY") {
            let url = "https://api.openai.com/v1/audio/transcriptions".to_string();
            let req = self.client.post(&url).bearer_auth(key);
            (url, req)
        } else {
            let url = format!("{}/v1/transcribe", self.creds.base);
            let mut req = self
                .client
                .post(&url)
                .header("x-oneclick-device-id", self.creds.device_id.clone());
            if let Some(tok) = &self.creds.jwt {
                req = req.bearer_auth(tok);
            }
            if let Some(bypass) = env_opt("KEYFLOE_DEV_BYPASS") {
                req = req.header("x-oneclick-dev-bypass", bypass);
            }
            (url, req)
        };

        req = req.multipart(form);
        let resp = req.send().await.map_err(|e| format!("transcribe {url}: {e}"))?;
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(format!("transcribe HTTP {status}: {body}"));
        }
        let v: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("transcribe decode: {e}"))?;
        Ok(v.get("text")
            .and_then(|t| t.as_str())
            .unwrap_or_default()
            .trim()
            .to_string())
    }

    /// Stream an interview answer. Calls `on_delta` with each new text chunk as
    /// the Anthropic SSE stream arrives; resolves with the full text.
    pub async fn chat_stream<F>(
        &self,
        system: &str,
        messages: Vec<ChatMsg>,
        mut on_delta: F,
    ) -> Result<String, String>
    where
        F: FnMut(&str),
    {
        use futures_util::StreamExt;

        let body = serde_json::json!({
            "model": "claude-haiku-4-5",
            "max_tokens": 1024,
            "stream": true,
            "messages": messages,
            "system": [{
                "type": "text",
                "text": system,
                "cache_control": { "type": "ephemeral" }
            }]
        });

        // Dev path: direct Anthropic when ANTHROPIC_API_KEY is set.
        let req = if let Some(key) = env_opt("ANTHROPIC_API_KEY") {
            self.client
                .post("https://api.anthropic.com/v1/messages")
                .header("content-type", "application/json")
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
        } else {
            let mut r = self
                .client
                .post(format!("{}/v1/chat", self.creds.base))
                .header("content-type", "application/json")
                .header("x-oneclick-device-id", self.creds.device_id.clone())
                .header("x-oneclick-feature", "interview");
            if let Some(tok) = &self.creds.jwt {
                r = r.bearer_auth(tok);
            }
            if let Some(bypass) = env_opt("KEYFLOE_DEV_BYPASS") {
                r = r.header("x-oneclick-dev-bypass", bypass);
            }
            r
        };

        let resp = req.json(&body).send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        if !status.is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("chat HTTP {status}: {err}"));
        }

        // Parse SSE `data: {…}` lines out of the byte stream. Anthropic emits
        // `content_block_delta` events whose `delta.text` is the token chunk.
        let mut stream = resp.bytes_stream();
        let mut buf = String::new();
        let mut full = String::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            buf.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(nl) = buf.find('\n') {
                let line = buf[..nl].trim().to_string();
                buf.drain(..=nl);
                let Some(payload) = line.strip_prefix("data: ") else {
                    continue;
                };
                if payload == "[DONE]" {
                    return Ok(full);
                }
                let Ok(obj) = serde_json::from_str::<serde_json::Value>(payload) else {
                    continue;
                };
                if obj.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                    if let Some(text) = obj
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                    {
                        full.push_str(text);
                        on_delta(text);
                    }
                }
            }
        }
        Ok(full)
    }
}
