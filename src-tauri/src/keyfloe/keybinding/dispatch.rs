//! Turns engine `Trigger`s into Tauri events other feature agents listen on.
//!
//! # Event contract (features B/C/D/E depend on this)
//!
//! Two events are emitted per trigger:
//!
//! 1. A unified `feature_trigger` event (payload = [`FeatureTrigger`]).
//! 2. A convenience per-feature event:
//!    - built-in: `<feature>_trigger` e.g. `dictation_trigger`, `chat_trigger`,
//!      `snapshot_trigger`, `agent_trigger`, `interview_trigger`,
//!      `ai_answer_trigger`, `voice_command_trigger`, `dashboard_trigger`.
//!    - custom feature: `custom_feature_trigger`.
//!
//! `phase` is `"start"` | `"stop"` | `"trigger"`:
//! - continuous features (dictation/voice_command/agent/interview) get
//!   `start` then `stop` (push-to-talk on hold, toggle on tap).
//! - one-shot features (chat/snapshot/ai_answer/dashboard/custom) get `trigger`.

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter};

use super::engine::{Trigger, TriggerKind};
use super::model::{ActionRef, CustomFeature, KeybindingConfig};

#[derive(Serialize, Clone, Debug, Type)]
pub struct FeatureTrigger {
    /// Built-in feature rawValue (e.g. `dictation`) or the custom feature id.
    pub feature: String,
    pub is_custom: bool,
    /// `start` | `stop` | `trigger`
    pub phase: String,
    /// `tap` | `hold`
    pub gesture: String,
    /// The physical key id that produced this (e.g. `rctrl`).
    pub key: String,
    /// Present only for custom features so the listener has the instruction.
    pub custom: Option<CustomFeature>,
}

fn phase_str(kind: TriggerKind) -> &'static str {
    match kind {
        TriggerKind::Start => "start",
        TriggerKind::Stop => "stop",
        TriggerKind::OneShot => "trigger",
    }
}

pub fn dispatch(app: &AppHandle, config: &KeybindingConfig, trigger: &Trigger) {
    let (feature, is_custom, custom, specific_event) = match &trigger.action {
        ActionRef::Builtin { feature } => (
            feature.raw().to_string(),
            false,
            None,
            format!("{}_trigger", feature.raw()),
        ),
        ActionRef::Custom { id } => {
            let cf = config.custom_feature(id).cloned();
            (
                id.clone(),
                true,
                cf,
                "custom_feature_trigger".to_string(),
            )
        }
    };

    let payload = FeatureTrigger {
        feature,
        is_custom,
        phase: phase_str(trigger.kind).to_string(),
        gesture: trigger.gesture.raw().to_string(),
        key: trigger.key_id.clone(),
        custom,
    };

    // Unified channel.
    let _ = app.emit("feature_trigger", &payload);
    // Convenience per-feature channel.
    let _ = app.emit(&specific_event, &payload);

    log::debug!(
        "keybinding: dispatched {} (phase={}, gesture={}, key={})",
        specific_event,
        payload.phase,
        payload.gesture,
        payload.key
    );
}
