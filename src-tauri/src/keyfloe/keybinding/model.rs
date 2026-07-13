//! Data model for Keyfloe key remapping (Feature F).
//!
//! Ported from the Mac app's *newer* key-binding model
//! (`app/Sources/Hotkeys/KeyboardCustomization.swift`): an **inverted** map of
//! `key -> { tap, hold }` where any feature (built-in or user-created custom)
//! can occupy either the tap or the hold slot of an assignable physical key.
//!
//! This module is fully cross-platform (no native calls) so it compiles and
//! unit-tests on macOS/Linux CI; only `hook.rs` is `#[cfg(windows)]`.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;

/// Schema version for the persisted `keybindings.json`.
pub const CONFIG_VERSION: u32 = 1;

/// Tap-vs-hold thresholds, carried over verbatim from the Mac `FnTapDetector`.
/// A release strictly under `TAP_MAX_MS` with no intervening key = TAP.
/// A key still held at `HOLD_THRESHOLD_MS` = HOLD.
pub const TAP_MAX_MS: u64 = 300;
pub const HOLD_THRESHOLD_MS: u64 = 300;

/// Cap on user-created custom features (Mac `CustomFeatureStore.maxCount`).
pub const MAX_CUSTOM_FEATURES: usize = 5;

// ---------------------------------------------------------------------------
// Built-in features
// ---------------------------------------------------------------------------

/// The built-in Keyfloe features a key can trigger. `rename_all = "snake_case"`
/// makes the serialized rawValue the stable identifier that also forms the
/// per-feature event name (`<feature>_trigger`) other feature agents listen on.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash, Type)]
#[serde(rename_all = "snake_case")]
pub enum Feature {
    /// Chat popup by the cursor. Event: `chat_trigger`. One-shot.
    Chat,
    /// Push-to-talk dictation. Event: `dictation_trigger`. Continuous.
    Dictation,
    /// Snapshot AI (box a region). Event: `snapshot_trigger`. One-shot.
    Snapshot,
    /// Floe agent (hold, speak a task, release). Event: `agent_trigger`. Continuous.
    Agent,
    /// Interview mode. Event: `interview_trigger`. Continuous (start/stop).
    Interview,
    /// AI Answer — reads screen, answers/fills. Event: `ai_answer_trigger`. One-shot.
    AiAnswer,
    /// Voice command — speak, Floe answers from screen. Event: `voice_command_trigger`. Continuous.
    VoiceCommand,
    /// Open the dashboard window. Event: `dashboard_trigger`. One-shot.
    Dashboard,
}

impl Feature {
    /// snake_case rawValue used in settings and event names.
    pub fn raw(self) -> &'static str {
        match self {
            Feature::Chat => "chat",
            Feature::Dictation => "dictation",
            Feature::Snapshot => "snapshot",
            Feature::Agent => "agent",
            Feature::Interview => "interview",
            Feature::AiAnswer => "ai_answer",
            Feature::VoiceCommand => "voice_command",
            Feature::Dashboard => "dashboard",
        }
    }

    /// Continuous features run *while active*: on a hold slot they are
    /// push-to-talk (start on hold, stop on release); on a tap slot they toggle
    /// (tap on, tap off). One-shot features fire once.
    pub fn is_continuous(self) -> bool {
        matches!(
            self,
            Feature::Dictation | Feature::VoiceCommand | Feature::Agent | Feature::Interview
        )
    }
}

// ---------------------------------------------------------------------------
// Action reference (built-in OR custom, mutually exclusive per slot)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ActionRef {
    /// A built-in feature.
    Builtin { feature: Feature },
    /// A user-created custom feature, referenced by its id.
    Custom { id: String },
}

impl ActionRef {
    pub fn is_continuous(&self, config: &KeybindingConfig) -> bool {
        match self {
            ActionRef::Builtin { feature } => feature.is_continuous(),
            // Custom features are one-shot (their output is clipboard/chat).
            ActionRef::Custom { id } => {
                let _ = config.custom_feature(id);
                false
            }
        }
    }

    /// Stable id string used for toggle-state tracking and event payloads.
    pub fn identity(&self) -> String {
        match self {
            ActionRef::Builtin { feature } => format!("b:{}", feature.raw()),
            ActionRef::Custom { id } => format!("c:{id}"),
        }
    }
}

// ---------------------------------------------------------------------------
// Per-key binding
// ---------------------------------------------------------------------------

/// The tap and hold slots of a single physical key.
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq, Type)]
pub struct Binding {
    #[serde(default)]
    pub tap: Option<ActionRef>,
    #[serde(default)]
    pub hold: Option<ActionRef>,
}

impl Binding {
    pub fn is_empty(&self) -> bool {
        self.tap.is_none() && self.hold.is_none()
    }

    pub fn slot(&self, gesture: Gesture) -> &Option<ActionRef> {
        match gesture {
            Gesture::Tap => &self.tap,
            Gesture::Hold => &self.hold,
        }
    }

    pub fn slot_mut(&mut self, gesture: Gesture) -> &mut Option<ActionRef> {
        match gesture {
            Gesture::Tap => &mut self.tap,
            Gesture::Hold => &mut self.hold,
        }
    }
}

/// Which gesture a slot represents.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash, Type)]
#[serde(rename_all = "snake_case")]
pub enum Gesture {
    Tap,
    Hold,
}

impl Gesture {
    pub fn raw(self) -> &'static str {
        match self {
            Gesture::Tap => "tap",
            Gesture::Hold => "hold",
        }
    }
}

// ---------------------------------------------------------------------------
// Custom features (user-created: named instruction -> screen action)
// ---------------------------------------------------------------------------

/// Where a custom feature's result goes. Multi-select, never empty
/// (Mac `OutputMode`).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash, Type)]
#[serde(rename_all = "snake_case")]
pub enum OutputMode {
    Clipboard,
    Chat,
}

/// A user-created custom feature (Mac `CustomFeature`). `instruction` is the
/// precise AI directive (hidden from the user); `explanation` is the one
/// friendly sentence shown in lists.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
pub struct CustomFeature {
    pub id: String,
    pub name: String,
    pub instruction: String,
    #[serde(default)]
    pub explanation: String,
    pub icon: String,
    /// Always >= 1 element. Serialized as an array; deserialization tolerates a
    /// legacy single `output` field via `outputs` default + migration in store.
    pub outputs: Vec<OutputMode>,
}

// ---------------------------------------------------------------------------
// Full config (persisted to keybindings.json)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct KeybindingConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    /// keyId -> Binding. keyId is one of `assignable_keys()`.
    #[serde(default)]
    pub bindings: HashMap<String, Binding>,
    #[serde(default)]
    pub custom_features: Vec<CustomFeature>,
}

fn default_version() -> u32 {
    CONFIG_VERSION
}

impl KeybindingConfig {
    pub fn custom_feature(&self, id: &str) -> Option<&CustomFeature> {
        self.custom_features.iter().find(|f| f.id == id)
    }

    /// Look up where a feature currently lives, for the "one key per feature"
    /// invariant (Mac `locationOf`). Returns `(keyId, gesture)`.
    pub fn location_of(&self, action: &ActionRef) -> Option<(String, Gesture)> {
        for (key, binding) in &self.bindings {
            if binding.tap.as_ref() == Some(action) {
                return Some((key.clone(), Gesture::Tap));
            }
            if binding.hold.as_ref() == Some(action) {
                return Some((key.clone(), Gesture::Hold));
            }
        }
        None
    }

    /// The VK snapshot the native hook watches: every key with any binding.
    pub fn managed_key_ids(&self) -> Vec<String> {
        self.bindings
            .iter()
            .filter(|(_, b)| !b.is_empty())
            .map(|(k, _)| k.clone())
            .collect()
    }
}

impl Default for KeybindingConfig {
    fn default() -> Self {
        default_config()
    }
}

// ---------------------------------------------------------------------------
// Assignable keys (Windows) + default bindings
// ---------------------------------------------------------------------------

/// The physical keys the Windows engine can watch and repurpose. Windows has no
/// `fn` key, so Caps Lock is the primary repurpose target (matches the Mac
/// `fn` role). All are keys a user can spare.
///
/// NOTE: a key bound here is fully repurposed — the hook suppresses it, so it
/// no longer performs its original OS function. Choose spare keys.
pub fn assignable_keys() -> Vec<&'static str> {
    vec!["caps", "rctrl", "ralt", "apps", "lwin", "rwin", "rshift"]
}

/// Keys that support Tap only (holding them is still needed for OS chords).
/// Mirrors Mac `tapOnlyKeys` (the ⌘ keys). Holding Win opens Win shortcuts, so
/// the Win keys are tap-only here.
pub fn tap_only_keys() -> Vec<&'static str> {
    vec!["lwin", "rwin"]
}

pub fn supports_hold(key_id: &str) -> bool {
    !tap_only_keys().contains(&key_id)
}

/// Default seed bindings — also the single source of truth for "reset".
/// Mirrors the Mac defaults, mapped onto spare Windows keys, and covers every
/// trigger the other feature agents depend on.
pub fn default_config() -> KeybindingConfig {
    let mut bindings = HashMap::new();

    let mut set = |key: &str, tap: Option<Feature>, hold: Option<Feature>| {
        bindings.insert(
            key.to_string(),
            Binding {
                tap: tap.map(|f| ActionRef::Builtin { feature: f }),
                hold: hold.map(|f| ActionRef::Builtin { feature: f }),
            },
        );
    };

    // rctrl: tap chat, hold dictation  (the flagship example)
    set("rctrl", Some(Feature::Chat), Some(Feature::Dictation));
    // caps: tap snapshot, hold Floe agent
    set("caps", Some(Feature::Snapshot), Some(Feature::Agent));
    // ralt: tap interview, hold voice command
    set("ralt", Some(Feature::Interview), Some(Feature::VoiceCommand));
    // apps (menu): tap AI answer, hold dashboard
    set("apps", Some(Feature::AiAnswer), Some(Feature::Dashboard));

    KeybindingConfig {
        version: CONFIG_VERSION,
        bindings,
        custom_features: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_cover_named_triggers() {
        let c = default_config();
        let mut seen = std::collections::HashSet::new();
        for b in c.bindings.values() {
            for slot in [&b.tap, &b.hold] {
                if let Some(ActionRef::Builtin { feature }) = slot {
                    seen.insert(feature.raw());
                }
            }
        }
        for f in ["chat", "dictation", "snapshot", "agent", "interview"] {
            assert!(seen.contains(f), "default config missing trigger {f}");
        }
    }

    #[test]
    fn location_of_finds_slot() {
        let c = default_config();
        let (key, g) = c
            .location_of(&ActionRef::Builtin {
                feature: Feature::Chat,
            })
            .expect("chat is bound");
        assert_eq!(key, "rctrl");
        assert_eq!(g, Gesture::Tap);
    }

    #[test]
    fn continuous_classification() {
        assert!(Feature::Dictation.is_continuous());
        assert!(Feature::Interview.is_continuous());
        assert!(!Feature::Chat.is_continuous());
        assert!(!Feature::Snapshot.is_continuous());
    }
}
