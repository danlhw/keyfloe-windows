//! Learn-from-corrections. Port of the Mac `DictationCorrectionLearner.swift`.
//!
//! After dictation pastes text, we snapshot the focused field and, a few seconds
//! later, re-read it. If the user fixed a word, we add the corrected word to the
//! personal vocabulary so whisper spells it right next time (vocabulary feeds
//! the decode prompt).
//!
//! FAIL-SAFE BY DESIGN — this can ONLY add learned words. If the paste didn't
//! land in a readable field, focus moved, the text changed wholesale, or any
//! read fails, it does nothing. It NEVER edits/deletes the dictation or the
//! field, so it cannot regress dictation.
//!
//! The field READ is Windows-only. Reading the focused control's text requires
//! either UI Automation (`Win32_UI_Accessibility`) or `GetGUIThreadInfo` +
//! `WM_GETTEXT` (`Win32_UI_WindowsAndMessaging`) — neither Cargo feature is
//! enabled yet, so [`focused_field_text`] currently returns `None` (a safe
//! no-op) and needs a Windows pass to wire up. See INTEGRATION.md.

use std::collections::HashSet;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

/// Delay to let the Ctrl+V paste actually land before we snapshot.
const SETTLE: Duration = Duration::from_millis(1200);
/// Window after the paste settles during which we watch for an edit.
const CORRECTION_WINDOW: Duration = Duration::from_secs(6);

/// Arm a one-shot correction check for the text we just pasted. Returns
/// immediately; the watch runs on a detached thread.
pub fn arm(app: &AppHandle, pasted: &str) {
    let original = pasted.trim().to_string();
    // Need a couple of words to diff meaningfully.
    if original.split_whitespace().count() < 2 {
        return;
    }
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(SETTLE);

        // Confirm the paste went into a readable field we can watch.
        let Some(landed) = focused_field_text() else {
            return;
        };
        if !landed.contains(&original) {
            return; // paste not in the readable field → can't learn here
        }

        thread::sleep(CORRECTION_WINDOW);

        let Some(edited) = focused_field_text() else {
            return;
        };
        let edited = edited.trim();
        if edited == original || edited.is_empty() {
            return;
        }

        let learned = corrected_words(&original, edited);
        // Only small fixes (1–3 new words). A wholesale rewrite means the user
        // typed something new, not a spelling correction.
        if learned.is_empty() || learned.len() > 3 {
            return;
        }
        for word in learned {
            let _ = super::vocabulary::add(&app, &word);
            log::info!("keyfloe dictation: learned corrected word '{word}'");
        }
    });
}

/// Read the text of the currently-focused control, if readable, via Win32 UI
/// Automation. Windows-only. Runs on the detached watcher thread (see [`arm`]),
/// so it initializes COM for that thread itself.
///
/// Read-only by construction: it Queries the focused element's ValuePattern
/// (standard edit controls) and, failing that, its TextPattern document range
/// (rich-edit / document controls). It NEVER writes — so it can only ever feed
/// the vocabulary learner, never mutate the user's text (fail-safe invariant).
///
/// Requires the windows-crate feature `Win32_UI_Accessibility` (already enabled
/// in `Cargo.toml`). CANNOT be exercised on this Mac dev box — see the Windows
/// verification checklist in INTEGRATION.md.
#[cfg(windows)]
fn focused_field_text() -> Option<String> {
    use windows::core::Interface;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationTextPattern, IUIAutomationValuePattern,
        UIA_TextPatternId, UIA_ValuePatternId,
    };

    unsafe {
        // Initialize COM for THIS (detached) worker thread. If the process/thread
        // already initialized it this is a benign no-op; we deliberately do not
        // `CoUninitialize` because the thread exits right after this call.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
        // windows-rs guarantees a non-null element on `Ok`, so the `.cast()`s
        // below can't deref null (unsupported patterns return `Err`).
        let element = automation.GetFocusedElement().ok()?;

        // 1) ValuePattern — the common case (single/multi-line Edit controls,
        //    most native + Chromium/WebView2 text inputs expose it).
        if let Ok(unknown) = element.GetCurrentPattern(UIA_ValuePatternId) {
            if let Ok(vp) = unknown.cast::<IUIAutomationValuePattern>() {
                if let Ok(bstr) = vp.CurrentValue() {
                    let s = bstr.to_string();
                    if !s.trim().is_empty() {
                        return Some(s);
                    }
                }
            }
        }

        // 2) TextPattern — rich-edit / document controls (Word, code editors,
        //    some web contenteditables). `DocumentRange().GetText(-1)` returns
        //    the whole document text.
        if let Ok(unknown) = element.GetCurrentPattern(UIA_TextPatternId) {
            if let Ok(tp) = unknown.cast::<IUIAutomationTextPattern>() {
                if let Ok(range) = tp.DocumentRange() {
                    if let Ok(bstr) = range.GetText(-1) {
                        let s = bstr.to_string();
                        if !s.trim().is_empty() {
                            return Some(s);
                        }
                    }
                }
            }
        }

        None
    }
}

#[cfg(not(windows))]
fn focused_field_text() -> Option<String> {
    None
}

/// Words in `edited` but not in `original` (case-insensitive) — i.e. the user's
/// corrections. Alphabetic words >=3 chars only, so numbers/punctuation/tiny
/// words aren't "learned". Pure function → unit-testable everywhere.
fn corrected_words(original: &str, edited: &str) -> Vec<String> {
    let orig_lower: HashSet<String> = tokens(original).into_iter().map(|t| t.to_lowercase()).collect();
    tokens(edited)
        .into_iter()
        .filter(|t| {
            t.chars().count() >= 3
                && t.chars().all(|c| c.is_alphabetic())
                && !orig_lower.contains(&t.to_lowercase())
        })
        .collect()
}

fn tokens(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(|w| w.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn learns_new_word() {
        let learned = corrected_words("meeting with kow at noon", "meeting with Kowalczyk at noon");
        assert_eq!(learned, vec!["Kowalczyk".to_string()]);
    }

    #[test]
    fn ignores_wholesale_rewrite_via_count() {
        // corrected_words returns many; the caller's <=3 gate rejects it.
        let learned = corrected_words("hello there", "completely different sentence entirely now");
        assert!(learned.len() > 3);
    }

    #[test]
    fn no_change_learns_nothing() {
        assert!(corrected_words("same text here", "same text here").is_empty());
    }
}
