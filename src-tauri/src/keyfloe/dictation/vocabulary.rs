//! Silently-learned personal vocabulary. Port of the Mac
//! `PersonalVocabulary.swift`.
//!
//! Builds a list of names/brands/jargon the user dictates often, then exposes
//! it two ways:
//!   * [`prompt_terms`] — a comma-separated hint for the polish pass so the
//!     model keeps the user's jargon intact,
//!   * [`whisper_prompt_hint`] — the same list framed for the whisper decode
//!     prompt (feed alongside Handy's `custom_words`; see INTEGRATION.md).
//!
//! Hybrid learning: words that DON'T look like common English are added after a
//! single use; common-looking words only after 3+ observations. Stored as JSON
//! in the app data dir, capped at 200 terms (LRU-by-score eviction).

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::AppHandle;

const STORE_FILE: &str = "personal-vocabulary.json";
const MAX_TERMS: usize = 200;
const MIN_LEN: usize = 3;
/// Whisper's prompt budget is tight (~224 tokens incl. system text).
const PROMPT_CAP: usize = 60;

/// One observed term + its observation count.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Term {
    /// Form fed to the model (preserves first-seen casing).
    pub canonical: String,
    pub count: u32,
    /// Unix millis of last observation (used for LRU eviction).
    pub last_seen: i64,
}

/// Process-wide serialization lock so concurrent dictations don't clobber the
/// JSON file. The store itself lives on disk (survives relaunch).
static LOCK: Mutex<()> = Mutex::new(());

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn store_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    crate::portable::app_data_dir(app).ok().map(|d| d.join(STORE_FILE))
}

fn load_terms(app: &AppHandle) -> Vec<Term> {
    let Some(path) = store_path(app) else {
        return Vec::new();
    };
    std::fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn persist(app: &AppHandle, terms: &[Term]) {
    if let Some(path) = store_path(app) {
        if let Ok(bytes) = serde_json::to_vec_pretty(terms) {
            let _ = std::fs::write(path, bytes);
        }
    }
}

/// Public read for the settings UI.
pub fn all(app: &AppHandle) -> Vec<Term> {
    let _g = LOCK.lock();
    let mut terms = load_terms(app);
    terms.sort_by(|a, b| b.count.cmp(&a.count).then(b.last_seen.cmp(&a.last_seen)));
    terms
}

/// Walk a fresh transcript and update term counts. Best-effort, silent.
pub fn observe(app: &AppHandle, text: &str) {
    let _g = LOCK.lock();
    let mut terms = load_terms(app);
    let mut dirty = false;

    for word in tokenise(text) {
        if !is_candidate(&word) {
            continue;
        }
        let key = word.to_lowercase();
        if let Some(t) = terms.iter_mut().find(|t| t.canonical.to_lowercase() == key) {
            t.count += 1;
            t.last_seen = now_ms();
            dirty = true;
        } else {
            // New: uncommon words become active on first sight; common-looking
            // words are tracked with count=1 and only activate at the frequency
            // threshold (see `active_terms`).
            terms.push(Term {
                canonical: word,
                count: 1,
                last_seen: now_ms(),
            });
            dirty = true;
        }
    }

    if dirty {
        evict_if_full(&mut terms);
        persist(app, &terms);
    }
}

/// Manually teach a word (from the Vocabulary UI). Stored active immediately.
pub fn add(app: &AppHandle, word: &str) -> Vec<Term> {
    let _g = LOCK.lock();
    let mut terms = load_terms(app);
    let w = word.trim();
    if w.chars().count() >= MIN_LEN
        && w.chars().all(|c| c.is_alphabetic() || c == '-' || c == '\'')
    {
        let key = w.to_lowercase();
        if let Some(t) = terms.iter_mut().find(|t| t.canonical.to_lowercase() == key) {
            t.count = t.count.max(3);
            t.last_seen = now_ms();
        } else {
            terms.push(Term {
                canonical: w.to_string(),
                count: 3,
                last_seen: now_ms(),
            });
        }
        evict_if_full(&mut terms);
        persist(app, &terms);
    }
    terms.sort_by(|a, b| b.count.cmp(&a.count).then(b.last_seen.cmp(&a.last_seen)));
    terms
}

/// Remove a term by canonical (case-insensitive).
pub fn remove(app: &AppHandle, word: &str) -> Vec<Term> {
    let _g = LOCK.lock();
    let mut terms = load_terms(app);
    let key = word.to_lowercase();
    terms.retain(|t| t.canonical.to_lowercase() != key);
    persist(app, &terms);
    terms
}

pub fn clear(app: &AppHandle) {
    let _g = LOCK.lock();
    persist(app, &[]);
}

/// Active terms — crossed the frequency threshold OR look uncommon — sorted by
/// count then recency.
fn active_terms(terms: &[Term]) -> Vec<&Term> {
    let mut active: Vec<&Term> = terms
        .iter()
        .filter(|t| is_uncommon(&t.canonical) || t.count >= 3)
        .collect();
    active.sort_by(|a, b| b.count.cmp(&a.count).then(b.last_seen.cmp(&a.last_seen)));
    active
}

/// Comma-separated active terms for the polish pass's "preserve these" hint.
/// `None` when there are no active terms.
pub fn prompt_terms(app: &AppHandle) -> Option<String> {
    let _g = LOCK.lock();
    let terms = load_terms(app);
    let active = active_terms(&terms);
    if active.is_empty() {
        return None;
    }
    Some(
        active
            .iter()
            .take(PROMPT_CAP)
            .map(|t| t.canonical.clone())
            .collect::<Vec<_>>()
            .join(", "),
    )
}

/// The whisper decode-prompt hint (feed alongside `settings.custom_words`).
///
/// Gated on the `vocabulary_prompt_enabled` dictation setting so the integrator
/// can prepend this unconditionally in `managers/transcription.rs` (P8-26) — it
/// returns an empty string (which the caller skips) when the user has turned the
/// feature off, or when there are no active learned terms.
pub fn whisper_prompt_hint(app: &AppHandle) -> String {
    if !super::settings::load(app).vocabulary_prompt_enabled {
        return String::new();
    }
    match prompt_terms(app) {
        Some(names) => format!("Vocabulary the speaker uses: {names}."),
        None => String::new(),
    }
}

// ---------------------------------------------------------------------------
// Heuristics (ports of the Swift versions)
// ---------------------------------------------------------------------------

fn tokenise(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphabetic() && c != '-' && c != '\'')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn is_candidate(word: &str) -> bool {
    word.chars().count() >= MIN_LEN
        && word.chars().all(|c| c.is_alphabetic() || c == '-' || c == '\'')
}

/// Unusual enough to add on first sighting: long, mixed-case (camelCase/brand),
/// capitalised (proper noun), or containing rare letter pairs.
fn is_uncommon(word: &str) -> bool {
    if word.chars().count() >= 8 {
        return true;
    }
    let mut chars = word.chars();
    let first = chars.next();
    let first_upper = first.map(|c| c.is_uppercase()).unwrap_or(false);
    if first_upper && word.chars().skip(1).any(|c| c.is_uppercase()) {
        return true; // mixed-case
    }
    if first_upper {
        return true; // proper noun
    }
    let lower = word.to_lowercase();
    const UNUSUAL: &[&str] = &["tz", "cz", "kx", "zk", "xc", "vh", "pf", "rk"];
    UNUSUAL.iter().any(|p| lower.contains(p))
}

fn evict_if_full(terms: &mut Vec<Term>) {
    if terms.len() <= MAX_TERMS {
        return;
    }
    // Score = count * 1000 + days-since-epoch; highest wins (keeps load-bearing
    // high-count terms even if old).
    terms.sort_by(|a, b| {
        let sa = a.count as f64 * 1000.0 + a.last_seen as f64 / 86_400_000.0;
        let sb = b.count as f64 * 1000.0 + b.last_seen as f64 / 86_400_000.0;
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });
    terms.truncate(MAX_TERMS);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uncommon_detection() {
        assert!(is_uncommon("WhisperKit")); // mixed case
        assert!(is_uncommon("Kowalczyk")); // proper noun + rare pair
        assert!(is_uncommon("serendipity")); // long
        assert!(!is_uncommon("today"));
        assert!(!is_uncommon("later"));
    }

    #[test]
    fn candidate_filtering() {
        assert!(is_candidate("brand"));
        assert!(!is_candidate("ok")); // too short
        assert!(!is_candidate("123")); // not letters
    }
}
