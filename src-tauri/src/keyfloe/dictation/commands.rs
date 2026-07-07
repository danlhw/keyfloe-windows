//! Tauri commands for the dictation FE (settings, vocabulary, stats, log).
//!
//! Each has `#[tauri::command] #[specta::specta]` so it can be added to the
//! `collect_commands![]` list in `lib.rs` (which regenerates `bindings.ts`).
//! See INTEGRATION.md for the exact lines to add. The FE also works via raw
//! `invoke(...)` without regenerating bindings — see `src/keyfloe/dictation/api.ts`.

use super::settings::DictationSettings;
use super::stats::{self, DictationStats, LogEntry};
use super::vocabulary::{self, Term};
use tauri::AppHandle;

// ---- settings ------------------------------------------------------------
// Note: full `super::settings::` paths so the `settings` command param below
// can't shadow the module.

#[tauri::command]
#[specta::specta]
pub fn keyfloe_get_dictation_settings(app: AppHandle) -> DictationSettings {
    super::settings::load(&app)
}

#[tauri::command]
#[specta::specta]
pub fn keyfloe_set_dictation_settings(app: AppHandle, settings: DictationSettings) {
    super::settings::save(&app, &settings);
}

// ---- vocabulary ----------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub fn keyfloe_get_vocabulary(app: AppHandle) -> Vec<Term> {
    vocabulary::all(&app)
}

#[tauri::command]
#[specta::specta]
pub fn keyfloe_add_vocabulary(app: AppHandle, word: String) -> Vec<Term> {
    vocabulary::add(&app, &word)
}

#[tauri::command]
#[specta::specta]
pub fn keyfloe_remove_vocabulary(app: AppHandle, word: String) -> Vec<Term> {
    vocabulary::remove(&app, &word)
}

#[tauri::command]
#[specta::specta]
pub fn keyfloe_clear_vocabulary(app: AppHandle) {
    vocabulary::clear(&app);
}

// ---- stats + log ---------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub fn keyfloe_get_dictation_stats(app: AppHandle) -> DictationStats {
    stats::stats(&app)
}

#[tauri::command]
#[specta::specta]
pub fn keyfloe_get_dictation_log(app: AppHandle) -> Vec<LogEntry> {
    stats::log_entries(&app)
}

#[tauri::command]
#[specta::specta]
pub fn keyfloe_delete_dictation_log_entry(app: AppHandle, id: String) -> Vec<LogEntry> {
    stats::delete_log_entry(&app, &id)
}

#[tauri::command]
#[specta::specta]
pub fn keyfloe_clear_dictation_log(app: AppHandle) {
    stats::clear_log(&app);
}
