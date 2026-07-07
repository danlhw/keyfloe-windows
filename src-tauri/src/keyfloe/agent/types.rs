//! Wire + event types for the Floe agent (Feature C).
//!
//! These mirror the Mac app's `AgentTask` / `AgentStep` (see
//! `../keyfloe-1/app/Sources/Tasks/AgentTask.swift`). They are serialised
//! straight onto Tauri events (`keyfloe://agent/*`) and consumed by the
//! frontend step-card UI, so field names are `camelCase` to read naturally
//! from JavaScript.

use serde::{Deserialize, Serialize};

/// Status of one tool call inside a run. Each tool emits a `running` snapshot
/// when it starts and a terminal `done`/`failed` snapshot (same `id`) when it
/// returns — the frontend upserts by id.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StepStatus {
    Running,
    Done,
    Failed,
}

/// One step the agent took — a single tool call, surfaced live as a card in
/// the pill and kept afterwards as the run's history trail.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStep {
    pub id: String,
    /// Human label, e.g. "Opening website".
    pub title: String,
    /// Short specifics, e.g. "dashboard.stripe.com".
    pub detail: String,
    /// Raw tool name (drives the icon + inspect panel on the frontend).
    pub tool_name: String,
    pub status: StepStatus,
    /// Trimmed tool result, shown when the user taps to inspect/verify.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_snippet: Option<String>,
}

impl AgentStep {
    pub fn running(title: impl Into<String>, detail: impl Into<String>, tool: impl Into<String>) -> Self {
        Self {
            id: new_id(),
            title: title.into(),
            detail: detail.into(),
            tool_name: tool.into(),
            status: StepStatus::Running,
            result_snippet: None,
        }
    }
}

/// One option row inside a `<REPORT>` comparison card.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportItem {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// Structured comparison/options report (flights, products, "best X").
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub items: Vec<ReportItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pick: Option<String>,
}

// ── Events emitted to the frontend ──────────────────────────────────────────

/// `keyfloe://agent/started` — a run just spawned. The pill opens a fresh
/// task card and shows the closed-pill spinner.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStartedEvent {
    pub task_id: String,
    pub prompt: String,
    pub title: String,
}

/// `keyfloe://agent/step` — a tool call started or finished. Upsert by
/// `step.id`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStepEvent {
    pub task_id: String,
    pub step: AgentStep,
}

/// `keyfloe://agent/result` — the run finished (ok or error). Carries the
/// final prose, cited URLs, follow-up chips and any report card.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResultEvent {
    pub task_id: String,
    pub ok: bool,
    pub text: String,
    pub cited_urls: Vec<String>,
    pub suggested_actions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report: Option<AgentReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Random hex id for steps/tasks without pulling in the `uuid` crate.
pub fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    // Mix in the thread-local counter so ids minted in the same nanosecond
    // (parallel tool calls) never collide.
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let c = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:x}-{:x}", nanos, c)
}
