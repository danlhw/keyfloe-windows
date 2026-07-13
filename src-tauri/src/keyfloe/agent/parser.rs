//! Trailing-metadata parser for the agent's final reply.
//!
//! Ports `AgentOutputParser.swift`. The model appends optional machine
//! blocks after its user-facing prose:
//!
//!   <REPORT> … </REPORT>           — comparison/options card
//!   <NEXT_ACTIONS> - a\n - b </NEXT_ACTIONS>  — up to 4 follow-up chips
//!   TASK_TITLE: Two To Five Words  — renames the task card
//!
//! `parse` strips all three from the prose and returns the cleaned text plus
//! the parsed values. Forgiving about casing / missing closing tags.

use crate::keyfloe::agent::types::{AgentReport, ReportItem};

pub struct Parsed {
    pub text: String,
    pub suggested_actions: Vec<String>,
    pub task_title: Option<String>,
    pub report: Option<AgentReport>,
}

/// ASCII-case-insensitive `find` returning the byte range of `needle` in
/// `hay`. Operates on the original bytes (not a lowercased copy) so the
/// returned indices are always valid char boundaries into `hay` — our tags
/// are ASCII, so ASCII-caseless matching is sufficient and panic-free.
fn find_ci(hay: &str, needle: &str) -> Option<(usize, usize)> {
    let h = hay.as_bytes();
    let n = needle.as_bytes();
    if n.is_empty() || h.len() < n.len() {
        return None;
    }
    for i in 0..=(h.len() - n.len()) {
        if h[i..i + n.len()]
            .iter()
            .zip(n.iter())
            .all(|(a, b)| a.eq_ignore_ascii_case(b))
        {
            return Some((i, i + n.len()));
        }
    }
    None
}

pub fn parse(raw: &str) -> Parsed {
    let mut body = raw.to_string();

    // 1. REPORT first, so its inner lines can't be read as NEXT_ACTIONS bullets.
    let mut report = None;
    if let Some((open_start, open_end)) = find_ci(&body, "<REPORT>") {
        let rest = &body[open_end..];
        let (inner, strip_end) = match find_ci(rest, "</REPORT>") {
            Some((cs, ce)) => (rest[..cs].to_string(), open_end + ce),
            None => (rest.to_string(), body.len()),
        };
        report = parse_report(&inner);
        body.replace_range(open_start..strip_end, "");
    }

    // 2. NEXT_ACTIONS bullets.
    let mut suggested_actions = Vec::new();
    if let Some((open_start, open_end)) = find_ci(&body, "<NEXT_ACTIONS>") {
        let rest = &body[open_end..];
        let (inner, strip_end) = match find_ci(rest, "</NEXT_ACTIONS>") {
            Some((cs, ce)) => (rest[..cs].to_string(), open_end + ce),
            None => match find_ci(rest, "TASK_TITLE:") {
                Some((cs, _)) => (rest[..cs].to_string(), open_end + cs),
                None => (rest.to_string(), body.len()),
            },
        };
        suggested_actions = parse_bullets(&inner);
        body.replace_range(open_start..strip_end, "");
    }

    // 3. TASK_TITLE: single line.
    let mut task_title = None;
    if let Some((start, end)) = find_ci(&body, "TASK_TITLE:") {
        let after = &body[end..];
        let line_end = after.find('\n').map(|i| end + i).unwrap_or(body.len());
        let candidate = body[end..line_end].trim().to_string();
        if !candidate.is_empty() {
            task_title = Some(candidate);
        }
        body.replace_range(start..line_end, "");
    }

    Parsed {
        text: body.trim().to_string(),
        suggested_actions,
        task_title,
        report,
    }
}

fn parse_report(inner: &str) -> Option<AgentReport> {
    let mut title = None;
    let mut pick = None;
    let mut items: Vec<ReportItem> = Vec::new();

    for raw_line in inner.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((_, e)) = starts_ci(line, "TITLE:") {
            let v = line[e..].trim();
            if !v.is_empty() {
                title = Some(v.to_string());
            }
            continue;
        }
        if let Some((_, e)) = starts_ci(line, "PICK:") {
            let v = line[e..].trim();
            if !v.is_empty() {
                pick = Some(v.to_string());
            }
            continue;
        }

        // "- name: … | detail: … | price: … | url: …"
        let mut s = line;
        for p in ["- ", "* ", "• "] {
            if let Some(stripped) = s.strip_prefix(p) {
                s = stripped;
                break;
            }
        }
        let fields = parse_fields(s);
        let name = fields
            .iter()
            .find(|(k, _)| k == "name")
            .map(|(_, v)| v.clone())
            .or_else(|| {
                if s.contains(':') {
                    None
                } else {
                    Some(s.to_string())
                }
            });
        if let Some(name) = name {
            if !name.is_empty() && items.len() < 6 {
                items.push(ReportItem {
                    name,
                    detail: field(&fields, "detail"),
                    price: field(&fields, "price"),
                    url: field(&fields, "url"),
                });
            }
        }
    }

    if items.is_empty() {
        None
    } else {
        Some(AgentReport { title, items, pick })
    }
}

fn field(fields: &[(String, String)], key: &str) -> Option<String> {
    fields
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.clone())
}

fn parse_fields(s: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for part in s.split('|') {
        if let Some(colon) = part.find(':') {
            let key = part[..colon].trim().to_lowercase();
            let value = part[colon + 1..].trim().to_string();
            if !key.is_empty() && !value.is_empty() {
                out.push((key, value));
            }
        }
    }
    out
}

fn parse_bullets(chunk: &str) -> Vec<String> {
    let mut out = Vec::new();
    for raw in chunk.lines() {
        let mut s = raw.trim();
        for p in ["- ", "* ", "• "] {
            if let Some(stripped) = s.strip_prefix(p) {
                s = stripped;
                break;
            }
        }
        let s = s.trim();
        if s.is_empty() {
            continue;
        }
        let clipped = if s.chars().count() > 60 {
            let t: String = s.chars().take(60).collect();
            format!("{}…", t)
        } else {
            s.to_string()
        };
        out.push(clipped);
        if out.len() >= 4 {
            break;
        }
    }
    out
}

/// Case-insensitive prefix check; returns the byte range of the prefix when
/// `line` starts with `prefix`.
fn starts_ci(line: &str, prefix: &str) -> Option<(usize, usize)> {
    let (l, p) = (line.as_bytes(), prefix.as_bytes());
    if l.len() >= p.len() && l[..p.len()].eq_ignore_ascii_case(p) {
        Some((0, prefix.len()))
    } else {
        None
    }
}
