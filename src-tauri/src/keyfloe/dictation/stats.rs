//! Dictation stats + transcript log. Ports of the Mac `WPMTracker.swift` and
//! `DictationLog.swift`, backed by JSON files in the app data dir.
//!
//!   * WPM entries — one per successful transcription (words + duration), used
//!     to compute lifetime/today WPM and total words for the Stats UI.
//!   * Dictation log — every transcript kept for 30 days as a safety net for
//!     when a paste landed in the wrong app (or nowhere).

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::AppHandle;

const WPM_FILE: &str = "wpm-entries.json";
const LOG_FILE: &str = "dictation-log.json";
const WPM_RETENTION_DAYS: i64 = 365;
const LOG_RETENTION_DAYS: i64 = 30;

static LOCK: Mutex<()> = Mutex::new(());
static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Monotonic-ish id without the `uuid` crate: millis + a per-process counter.
fn next_id() -> String {
    format!("{}-{}", now_ms(), ID_COUNTER.fetch_add(1, Ordering::Relaxed))
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WpmEntry {
    pub id: String,
    pub recorded_at: i64, // unix millis
    pub words: u32,
    pub duration_sec: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct LogEntry {
    pub id: String,
    pub recorded_at: i64, // unix millis
    pub text: String,
    pub duration_sec: f64,
    /// Best-effort app the paste went into.
    pub pasted_into: Option<String>,
}

/// Derived numbers for the Stats UI.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DictationStats {
    pub lifetime_wpm: f64,
    pub today_wpm: f64,
    pub today_words: u32,
    pub total_words: u32,
    pub total_sessions: u32,
}

fn path(app: &AppHandle, file: &str) -> Option<std::path::PathBuf> {
    crate::portable::app_data_dir(app).ok().map(|d| d.join(file))
}

fn load<T: for<'de> Deserialize<'de>>(app: &AppHandle, file: &str) -> Vec<T> {
    match path(app, file) {
        Some(p) => std::fs::read(&p)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default(),
        None => Vec::new(),
    }
}

fn save<T: Serialize>(app: &AppHandle, file: &str, items: &[T]) {
    if let Some(p) = path(app, file) {
        if let Ok(bytes) = serde_json::to_vec(items) {
            let _ = std::fs::write(p, bytes);
        }
    }
}

fn word_count(text: &str) -> u32 {
    text.split_whitespace().filter(|w| !w.is_empty()).count() as u32
}

/// Record one successful transcription: updates WPM stats AND appends the
/// transcript to the durable log. No-ops on empty text / zero duration.
pub fn record(app: &AppHandle, transcript: &str, duration_sec: f64, pasted_into: Option<String>) {
    let trimmed = transcript.trim();
    let words = word_count(trimmed);
    if words == 0 || duration_sec <= 0.2 {
        return;
    }
    let _g = LOCK.lock();

    // WPM
    let mut wpm: Vec<WpmEntry> = load(app, WPM_FILE);
    wpm.push(WpmEntry {
        id: next_id(),
        recorded_at: now_ms(),
        words,
        duration_sec,
    });
    prune(&mut wpm, |e| e.recorded_at, WPM_RETENTION_DAYS);
    save(app, WPM_FILE, &wpm);

    // Log (newest first)
    let mut log: Vec<LogEntry> = load(app, LOG_FILE);
    log.insert(
        0,
        LogEntry {
            id: next_id(),
            recorded_at: now_ms(),
            text: trimmed.to_string(),
            duration_sec,
            pasted_into,
        },
    );
    prune(&mut log, |e| e.recorded_at, LOG_RETENTION_DAYS);
    save(app, LOG_FILE, &log);
}

fn prune<T>(items: &mut Vec<T>, at: impl Fn(&T) -> i64, retention_days: i64) {
    let cutoff = now_ms() - retention_days * 86_400_000;
    items.retain(|e| at(e) >= cutoff);
}

pub fn stats(app: &AppHandle) -> DictationStats {
    let _g = LOCK.lock();
    let entries: Vec<WpmEntry> = load(app, WPM_FILE);

    let total_words: u32 = entries.iter().map(|e| e.words).sum();
    let total_minutes: f64 = entries.iter().map(|e| e.duration_sec / 60.0).sum();
    let lifetime_wpm = if total_minutes > 0.0 {
        total_words as f64 / total_minutes
    } else {
        0.0
    };

    let start_of_today = start_of_today_ms();
    let todays: Vec<&WpmEntry> = entries.iter().filter(|e| e.recorded_at >= start_of_today).collect();
    let today_words: u32 = todays.iter().map(|e| e.words).sum();
    let today_minutes: f64 = todays.iter().map(|e| e.duration_sec / 60.0).sum();
    let today_wpm = if today_minutes > 0.0 {
        today_words as f64 / today_minutes
    } else {
        0.0
    };

    DictationStats {
        lifetime_wpm,
        today_wpm,
        today_words,
        total_words,
        total_sessions: entries.len() as u32,
    }
}

fn start_of_today_ms() -> i64 {
    use chrono::{Local, TimeZone};
    let now = Local::now();
    let naive = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
    Local
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

pub fn log_entries(app: &AppHandle) -> Vec<LogEntry> {
    let _g = LOCK.lock();
    load(app, LOG_FILE)
}

pub fn delete_log_entry(app: &AppHandle, id: &str) -> Vec<LogEntry> {
    let _g = LOCK.lock();
    let mut log: Vec<LogEntry> = load(app, LOG_FILE);
    log.retain(|e| e.id != id);
    save(app, LOG_FILE, &log);
    log
}

pub fn clear_log(app: &AppHandle) {
    let _g = LOCK.lock();
    save::<LogEntry>(app, LOG_FILE, &[]);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_words() {
        assert_eq!(word_count("hello there world"), 3);
        assert_eq!(word_count("  don't  count  "), 2);
        assert_eq!(word_count(""), 0);
    }
}
