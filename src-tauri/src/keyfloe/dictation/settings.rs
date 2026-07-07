//! Dictation-specific settings, kept in this module's OWN JSON store rather than
//! Handy's `AppSettings` — that keeps Feature B self-contained and collision-free
//! (the integration contract forbids editing `settings.rs`). If desired later,
//! these can be folded into `AppSettings`; see INTEGRATION.md.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const FILE: &str = "dictation-settings.json";

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct DictationSettings {
    /// Always-on Wispr-style cloud polish before paste.
    pub smart_polish_enabled: bool,
    /// Tailor register to the target app (casual + dropped trailing period in
    /// messaging apps). Requires foreground capture.
    pub app_aware_formatting: bool,
    /// Re-read the field after paste and learn corrected words (Windows-only,
    /// fail-safe).
    pub learn_from_corrections: bool,
    /// Feed personal vocabulary into the whisper decode prompt.
    pub vocabulary_prompt_enabled: bool,
}

impl Default for DictationSettings {
    fn default() -> Self {
        Self {
            smart_polish_enabled: true,
            app_aware_formatting: true,
            learn_from_corrections: true,
            vocabulary_prompt_enabled: true,
        }
    }
}

fn path(app: &AppHandle) -> Option<std::path::PathBuf> {
    crate::portable::app_data_dir(app).ok().map(|d| d.join(FILE))
}

pub fn load(app: &AppHandle) -> DictationSettings {
    match path(app) {
        Some(p) => std::fs::read(&p)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default(),
        None => DictationSettings::default(),
    }
}

pub fn save(app: &AppHandle, settings: &DictationSettings) {
    if let Some(p) = path(app) {
        if let Ok(bytes) = serde_json::to_vec_pretty(settings) {
            let _ = std::fs::write(p, bytes);
        }
    }
}
