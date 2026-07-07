//! Persistent interview context — the pre-interview material that tailors
//! answers. One JSON file mirrors the Mac trio (AboutMeStore + InterviewProfile
//! + ResumeStore):
//!
//!   * `about_me`  — the always-on free-text blob (Mac AboutMeStore).
//!   * `profiles`  — optional per-interview cheat-sheets: résumé + JD + company
//!                   + notes; exactly one `active_profile_id` is injected.
//!   * `docs`      — legacy multi-doc résumé vault (Mac ResumeStore), each
//!                   toggleable.
//!
//! Stored at `<app_data>/keyfloe/interview-context.json`. Never uploaded except
//! as part of a per-turn answer prompt (same privacy posture as the Mac app).

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Default, specta::Type)]
pub struct InterviewProfile {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, rename = "resumeText")]
    pub resume_text: String,
    #[serde(default, rename = "jobDescription")]
    pub job_description: String,
    #[serde(default, rename = "companyInfo")]
    pub company_info: String,
    #[serde(default)]
    pub notes: String,
}

impl InterviewProfile {
    fn prompt_block(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        if !self.resume_text.trim().is_empty() {
            parts.push(format!("## RÉSUMÉ\n\n{}", self.resume_text.trim()));
        }
        if !self.job_description.trim().is_empty() {
            parts.push(format!("## JOB DESCRIPTION\n\n{}", self.job_description.trim()));
        }
        if !self.company_info.trim().is_empty() {
            parts.push(format!("## COMPANY\n\n{}", self.company_info.trim()));
        }
        if !self.notes.trim().is_empty() {
            parts.push(format!("## PREP NOTES\n\n{}", self.notes.trim()));
        }
        parts.join("\n\n")
    }
}

#[derive(Serialize, Deserialize, Clone, Default, specta::Type)]
pub struct ResumeDoc {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub body: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Default, specta::Type)]
pub struct InterviewContext {
    #[serde(default, rename = "aboutMe")]
    pub about_me: String,
    #[serde(default)]
    pub profiles: Vec<InterviewProfile>,
    #[serde(default, rename = "activeProfileId")]
    pub active_profile_id: Option<String>,
    #[serde(default)]
    pub docs: Vec<ResumeDoc>,
}

impl InterviewContext {
    /// Full candidate background injected into the answer system prompt, in the
    /// Mac priority order: About me → active profile → enabled résumé docs.
    pub fn background(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        if !self.about_me.trim().is_empty() {
            parts.push(self.about_me.trim().to_string());
        }
        if let Some(active) = self
            .active_profile_id
            .as_ref()
            .and_then(|id| self.profiles.iter().find(|p| &p.id == id))
        {
            let block = active.prompt_block();
            if !block.is_empty() {
                parts.push(block);
            }
        }
        let vault: Vec<String> = self
            .docs
            .iter()
            .filter(|d| d.enabled && !d.body.trim().is_empty())
            .map(|d| format!("## {}\n{}", d.label, d.body.trim()))
            .collect();
        if !vault.is_empty() {
            parts.push(vault.join("\n\n"));
        }
        parts.join("\n\n")
    }
}

fn store_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("keyfloe").join("interview-context.json")
}

pub fn load(data_dir: &Path) -> InterviewContext {
    std::fs::read_to_string(store_path(data_dir))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save(data_dir: &Path, ctx: &InterviewContext) -> Result<(), String> {
    let path = store_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(ctx).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}
