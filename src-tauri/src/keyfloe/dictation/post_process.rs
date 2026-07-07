//! Network-free local cleanup — the first pass on every transcript and the
//! fallback whenever the cloud polish is unavailable. Port of the
//! self-correction stripping in the Mac `TranscriptPostProcessor.swift`.
//!
//! When the user says "today, no sorry, tomorrow" they meant only the second
//! clause. We detect a small set of explicit spoken-correction triggers and
//! strip from the previous sentence boundary up to and including the trigger,
//! per-sentence, so multiple corrections in one dictation all resolve.

/// Order matters — longest phrases first so "actually no" beats "actually".
const TRIGGERS: &[&str] = &[
    "scratch that",
    "wait no",
    "actually no",
    "no sorry",
    "no wait",
    "i mean",
];

/// Apply the self-correction strip across the whole transcript.
pub fn strip_self_corrections(text: &str) -> String {
    let sentences = split_into_sentences(text);
    let cleaned: Vec<String> = sentences.iter().map(|s| strip_within_sentence(s)).collect();
    cleaned
        .join(" ")
        .replace("  ", " ")
        .trim()
        .to_string()
}

/// Split on `. ! ?`, keeping the punctuation with each sentence.
fn split_into_sentences(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if ch == '.' || ch == '!' || ch == '?' {
            let t = current.trim().to_string();
            if !t.is_empty() {
                sentences.push(t);
            }
            current.clear();
        }
    }
    let t = current.trim().to_string();
    if !t.is_empty() {
        sentences.push(t);
    }
    sentences
}

fn strip_within_sentence(sentence: &str) -> String {
    let lower = sentence.to_lowercase();

    // Pick the trigger whose START is earliest; keep the remainder after its end.
    let mut best_start = usize::MAX;
    let mut best_end = 0usize;
    for trig in TRIGGERS {
        if let Some((start, end)) = word_boundary_range(&lower, trig) {
            if start < best_start {
                best_start = start;
                best_end = end;
            }
        }
    }
    if best_start == usize::MAX {
        return sentence.to_string();
    }

    // Map the lowercase byte offset to the original string. ASCII-safe, and for
    // non-ASCII we fall back to char counting so we never slice mid-codepoint.
    let char_offset = lower[..best_end].chars().count();
    let mut remainder: String = sentence.chars().skip(char_offset).collect();

    // Drop leading separators left behind by the trigger.
    while matches!(remainder.chars().next(), Some(' ') | Some(',') | Some(':') | Some('\t')) {
        remainder.remove(0);
    }

    // Re-capitalise so the corrected sentence doesn't read as a fragment.
    if let Some(first) = remainder.chars().next() {
        if first.is_lowercase() {
            let up: String = first.to_uppercase().collect();
            remainder = up + &remainder.chars().skip(1).collect::<String>();
        }
    }
    remainder
}

/// Byte range `(start, end)` of `needle` in `haystack`, only if flanked by
/// non-letters / string ends (so "iMean" inside a word doesn't match).
fn word_boundary_range(haystack: &str, needle: &str) -> Option<(usize, usize)> {
    if needle.is_empty() {
        return None;
    }
    let start = haystack.find(needle)?;
    let end = start + needle.len();

    let before_ok = start == 0
        || !haystack[..start]
            .chars()
            .next_back()
            .map(|c| c.is_alphabetic())
            .unwrap_or(false);
    let after_ok = end == haystack.len()
        || !haystack[end..]
            .chars()
            .next()
            .map(|c| c.is_alphabetic())
            .unwrap_or(false);

    (before_ok && after_ok).then_some((start, end))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_no_sorry() {
        assert_eq!(
            strip_self_corrections("Move the meeting to 7pm, no sorry 6pm"),
            "6pm"
        );
    }

    #[test]
    fn keeps_prior_sentences() {
        assert_eq!(
            strip_self_corrections("Eat at noon. Today, no sorry, tomorrow."),
            "Eat at noon. Tomorrow."
        );
    }

    #[test]
    fn no_trigger_is_unchanged() {
        assert_eq!(
            strip_self_corrections("I actually enjoyed the movie."),
            "I actually enjoyed the movie."
        );
    }

    #[test]
    fn word_boundary_does_not_false_match() {
        // "demean" contains "mean" but not the trigger "i mean".
        assert_eq!(
            strip_self_corrections("That would demean the work."),
            "That would demean the work."
        );
    }
}
