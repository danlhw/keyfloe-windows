//! Persistence + mutation of the keybinding config.
//!
//! Self-contained: stored as `keybindings.json` in the app config dir so this
//! feature never has to edit the shared `settings.rs`. Mutations enforce the
//! Mac "one key per feature" invariant (assigning a feature clears it from
//! wherever it previously lived) and the tap/hold mutual exclusion.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use super::model::{
    default_config, supports_hold, ActionRef, CustomFeature, Gesture, KeybindingConfig,
    MAX_CUSTOM_FEATURES,
};

const FILE_NAME: &str = "keybindings.json";

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no app config dir: {e}"))?;
    Ok(dir.join(FILE_NAME))
}

/// Load the config, creating defaults on first run or on parse failure.
pub fn load(app: &AppHandle) -> KeybindingConfig {
    match config_path(app).and_then(|p| {
        std::fs::read_to_string(&p).map_err(|e| e.to_string())
    }) {
        Ok(raw) => match serde_json::from_str::<KeybindingConfig>(&raw) {
            Ok(cfg) => cfg,
            Err(e) => {
                log::warn!("keybinding: config parse failed ({e}); using defaults");
                default_config()
            }
        },
        Err(_) => {
            let cfg = default_config();
            let _ = save(app, &cfg);
            cfg
        }
    }
}

pub fn save(app: &AppHandle, cfg: &KeybindingConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

/// Result of an assign attempt. When `Conflict`, the caller (UI) should ask the
/// user "move it here?" and re-call with `force = true`.
pub enum AssignOutcome {
    Assigned,
    /// The feature already lives at (keyId, gesture).
    Conflict { key_id: String, gesture: Gesture },
    Rejected(String),
}

/// Assign `action` to `key_id`'s `gesture` slot, enforcing invariants.
pub fn assign(
    cfg: &mut KeybindingConfig,
    key_id: &str,
    gesture: Gesture,
    action: ActionRef,
    force: bool,
) -> AssignOutcome {
    if gesture == Gesture::Hold && !supports_hold(key_id) {
        return AssignOutcome::Rejected(format!("{key_id} supports Tap only"));
    }
    if let ActionRef::Custom { id } = &action {
        if cfg.custom_feature(id).is_none() {
            return AssignOutcome::Rejected(format!("unknown custom feature {id}"));
        }
    }

    // One key per feature: if it already lives elsewhere, require force.
    if let Some((existing_key, existing_gesture)) = cfg.location_of(&action) {
        let same_slot = existing_key == key_id && existing_gesture == gesture;
        if !same_slot {
            if !force {
                return AssignOutcome::Conflict {
                    key_id: existing_key,
                    gesture: existing_gesture,
                };
            }
            // Clear the old location.
            if let Some(b) = cfg.bindings.get_mut(&existing_key) {
                *b.slot_mut(existing_gesture) = None;
            }
        }
    }

    let binding = cfg.bindings.entry(key_id.to_string()).or_default();
    *binding.slot_mut(gesture) = Some(action);
    AssignOutcome::Assigned
}

pub fn clear_slot(cfg: &mut KeybindingConfig, key_id: &str, gesture: Gesture) {
    if let Some(b) = cfg.bindings.get_mut(key_id) {
        *b.slot_mut(gesture) = None;
        if b.is_empty() {
            cfg.bindings.remove(key_id);
        }
    }
}

pub fn reset_key(cfg: &mut KeybindingConfig, key_id: &str) {
    let defaults = default_config();
    match defaults.bindings.get(key_id) {
        Some(b) => {
            cfg.bindings.insert(key_id.to_string(), b.clone());
        }
        None => {
            cfg.bindings.remove(key_id);
        }
    }
}

/// Reset all bindings to defaults, preserving the user's custom features.
pub fn reset_all(cfg: &mut KeybindingConfig) {
    let defaults = default_config();
    cfg.bindings = defaults.bindings;
}

// --- custom features ---

/// Insert or update a custom feature. Enforces the cap on new inserts and that
/// at least one output mode is present.
pub fn upsert_custom(cfg: &mut KeybindingConfig, mut feature: CustomFeature) -> Result<(), String> {
    if feature.outputs.is_empty() {
        return Err("a custom feature needs at least one output".into());
    }
    if let Some(existing) = cfg.custom_features.iter_mut().find(|f| f.id == feature.id) {
        *existing = feature;
        return Ok(());
    }
    if cfg.custom_features.len() >= MAX_CUSTOM_FEATURES {
        return Err(format!(
            "you've reached the limit of {MAX_CUSTOM_FEATURES} custom features"
        ));
    }
    if feature.id.trim().is_empty() {
        feature.id = format!("cf_{}", chrono::Utc::now().timestamp_millis());
    }
    cfg.custom_features.push(feature);
    Ok(())
}

/// Delete a custom feature and clear any binding that referenced it
/// (Mac `clearCustomEverywhere`).
pub fn delete_custom(cfg: &mut KeybindingConfig, id: &str) {
    cfg.custom_features.retain(|f| f.id != id);
    let target = ActionRef::Custom { id: id.to_string() };
    for b in cfg.bindings.values_mut() {
        if b.tap.as_ref() == Some(&target) {
            b.tap = None;
        }
        if b.hold.as_ref() == Some(&target) {
            b.hold = None;
        }
    }
    cfg.bindings.retain(|_, b| !b.is_empty());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keyfloe::keybinding::model::Feature;

    #[test]
    fn assign_moves_feature_with_force() {
        let mut cfg = default_config();
        // chat is at rctrl/tap by default. Try to move it to caps/tap.
        let action = ActionRef::Builtin {
            feature: Feature::Chat,
        };
        match assign(&mut cfg, "caps", Gesture::Tap, action.clone(), false) {
            AssignOutcome::Conflict { key_id, gesture } => {
                assert_eq!(key_id, "rctrl");
                assert_eq!(gesture, Gesture::Tap);
            }
            _ => panic!("expected conflict"),
        }
        // Force it.
        assert!(matches!(
            assign(&mut cfg, "caps", Gesture::Tap, action.clone(), true),
            AssignOutcome::Assigned
        ));
        // Old slot cleared, new slot set.
        assert_eq!(cfg.location_of(&action), Some(("caps".into(), Gesture::Tap)));
    }

    #[test]
    fn tap_only_key_rejects_hold() {
        let mut cfg = default_config();
        let action = ActionRef::Builtin {
            feature: Feature::Chat,
        };
        assert!(matches!(
            assign(&mut cfg, "lwin", Gesture::Hold, action, false),
            AssignOutcome::Rejected(_)
        ));
    }

    #[test]
    fn delete_custom_clears_bindings() {
        let mut cfg = default_config();
        let cf = CustomFeature {
            id: "cf_1".into(),
            name: "Summarize".into(),
            instruction: "summarize selection".into(),
            explanation: "Summarizes what you selected.".into(),
            icon: "sparkles".into(),
            outputs: vec![crate::keyfloe::keybinding::model::OutputMode::Clipboard],
        };
        upsert_custom(&mut cfg, cf).unwrap();
        assign(
            &mut cfg,
            "lwin",
            Gesture::Tap,
            ActionRef::Custom { id: "cf_1".into() },
            true,
        );
        delete_custom(&mut cfg, "cf_1");
        assert!(cfg.custom_feature("cf_1").is_none());
        assert!(cfg
            .location_of(&ActionRef::Custom { id: "cf_1".into() })
            .is_none());
    }

    #[test]
    fn custom_cap_enforced() {
        let mut cfg = default_config();
        for i in 0..MAX_CUSTOM_FEATURES {
            upsert_custom(
                &mut cfg,
                CustomFeature {
                    id: format!("cf_{i}"),
                    name: format!("F{i}"),
                    instruction: "x".into(),
                    explanation: String::new(),
                    icon: "sparkles".into(),
                    outputs: vec![crate::keyfloe::keybinding::model::OutputMode::Chat],
                },
            )
            .unwrap();
        }
        let over = upsert_custom(
            &mut cfg,
            CustomFeature {
                id: "cf_extra".into(),
                name: "Extra".into(),
                instruction: "x".into(),
                explanation: String::new(),
                icon: "sparkles".into(),
                outputs: vec![crate::keyfloe::keybinding::model::OutputMode::Chat],
            },
        );
        assert!(over.is_err());
    }
}
