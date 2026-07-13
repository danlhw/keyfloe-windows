//! Tap-vs-hold state machine (cross-platform, unit-tested).
//!
//! Clean-room design (NOT copied from any GPL dual-key-remap): timestamp on
//! key-down; on key-up, if no other key was pressed in between AND the key was
//! released under `TAP_MAX_MS` -> TAP, else if held past `HOLD_THRESHOLD_MS`
//! -> HOLD. Because the native hook fully suppresses a bound (managed) key,
//! disqualification simply means "no trigger fires".
//!
//! The engine is fed by `hook.rs` on Windows but has no native dependency, so
//! it runs and is tested everywhere. The owning thread calls `process()` for
//! each event and `tick()` on a short timer so a HOLD can fire while the key is
//! still down (before any key-up arrives).

use std::collections::HashMap;
use std::sync::Arc;

use super::model::{ActionRef, Binding, Gesture, KeybindingConfig, HOLD_THRESHOLD_MS, TAP_MAX_MS};

/// A raw key event handed to the engine. `key_id == None` means "some other
/// (unmanaged) key was pressed" — an activity ping used only to disqualify a
/// pending tap (the Mac `seenKeyWhileFn` behavior).
#[derive(Debug, Clone)]
pub struct RawKey {
    pub key_id: Option<String>,
    pub is_down: bool,
    pub time_ms: u64,
}

impl RawKey {
    pub fn managed(key_id: impl Into<String>, is_down: bool, time_ms: u64) -> Self {
        Self {
            key_id: Some(key_id.into()),
            is_down,
            time_ms,
        }
    }
    pub fn activity(time_ms: u64) -> Self {
        Self {
            key_id: None,
            is_down: true,
            time_ms,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerKind {
    /// Continuous feature became active (push-to-talk begin / toggle on).
    Start,
    /// Continuous feature became inactive (push-to-talk end / toggle off).
    Stop,
    /// One-shot feature fired once.
    OneShot,
}

/// A resolved action the engine wants dispatched.
#[derive(Debug, Clone)]
pub struct Trigger {
    pub action: ActionRef,
    pub key_id: String,
    pub gesture: Gesture,
    pub kind: TriggerKind,
}

struct Pending {
    down_time: u64,
    interrupted: bool,
    /// Set once the hold threshold has been crossed (or the gesture otherwise
    /// resolved). Blocks a late tap.
    resolved: bool,
    /// If a continuous HOLD feature was started, remember it so key-up can Stop it.
    active_hold: Option<ActionRef>,
}

pub struct TapHoldEngine {
    config: Arc<KeybindingConfig>,
    pending: HashMap<String, Pending>,
    /// action identity -> (action, source key, gesture) for continuous features
    /// currently active via tap-toggle. Hold-held continuous features live in
    /// each `Pending.active_hold` instead.
    toggled: HashMap<String, (ActionRef, String, Gesture)>,
    tap_max_ms: u64,
    hold_threshold_ms: u64,
}

impl TapHoldEngine {
    pub fn new(config: Arc<KeybindingConfig>) -> Self {
        Self {
            config,
            pending: HashMap::new(),
            toggled: HashMap::new(),
            tap_max_ms: TAP_MAX_MS,
            hold_threshold_ms: HOLD_THRESHOLD_MS,
        }
    }

    pub fn set_config(&mut self, config: Arc<KeybindingConfig>) {
        self.config = config;
        // Drop pending state for keys that are no longer managed.
        self.pending
            .retain(|k, _| self.config.bindings.contains_key(k));
    }

    fn binding(&self, key_id: &str) -> Option<Binding> {
        self.config.bindings.get(key_id).cloned()
    }

    fn is_continuous(&self, action: &ActionRef) -> bool {
        action.is_continuous(&self.config)
    }

    /// Feed one event. Returns the triggers to dispatch.
    pub fn process(&mut self, ev: RawKey) -> Vec<Trigger> {
        match &ev.key_id {
            None => {
                // Activity ping: any other key press disqualifies pending taps.
                if ev.is_down {
                    for p in self.pending.values_mut() {
                        p.interrupted = true;
                    }
                }
                Vec::new()
            }
            Some(key_id) => {
                let key_id = key_id.clone();
                if ev.is_down {
                    self.on_down(key_id, ev.time_ms)
                } else {
                    self.on_up(&key_id, ev.time_ms)
                }
            }
        }
    }

    fn on_down(&mut self, key_id: String, now: u64) -> Vec<Trigger> {
        // Ignore auto-repeat (already pending).
        if self.pending.contains_key(&key_id) {
            return Vec::new();
        }
        // A fresh managed key-down interrupts any other pending key's tap.
        for (k, p) in self.pending.iter_mut() {
            if *k != key_id {
                p.interrupted = true;
            }
        }
        self.pending.insert(
            key_id,
            Pending {
                down_time: now,
                interrupted: false,
                resolved: false,
                active_hold: None,
            },
        );
        Vec::new()
    }

    fn on_up(&mut self, key_id: &str, now: u64) -> Vec<Trigger> {
        let Some(p) = self.pending.remove(key_id) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        let binding = self.binding(key_id).unwrap_or_default();

        if p.resolved {
            // HOLD already fired at threshold. If it started a continuous
            // feature, releasing stops it.
            if let Some(action) = p.active_hold {
                out.push(Trigger {
                    action,
                    key_id: key_id.to_string(),
                    gesture: Gesture::Hold,
                    kind: TriggerKind::Stop,
                });
            }
            return out;
        }

        // Not yet resolved -> candidate for TAP.
        let elapsed = now.saturating_sub(p.down_time);
        if p.interrupted || elapsed >= self.tap_max_ms {
            return out; // disqualified — chord/too slow
        }
        let Some(action) = binding.tap.clone() else {
            return out; // nothing bound to tap
        };

        if self.is_continuous(&action) {
            // Toggle on/off.
            let id = action.identity();
            if self.toggled.remove(&id).is_some() {
                out.push(Trigger {
                    action,
                    key_id: key_id.to_string(),
                    gesture: Gesture::Tap,
                    kind: TriggerKind::Stop,
                });
            } else {
                self.toggled
                    .insert(id, (action.clone(), key_id.to_string(), Gesture::Tap));
                out.push(Trigger {
                    action,
                    key_id: key_id.to_string(),
                    gesture: Gesture::Tap,
                    kind: TriggerKind::Start,
                });
            }
        } else {
            out.push(Trigger {
                action,
                key_id: key_id.to_string(),
                gesture: Gesture::Tap,
                kind: TriggerKind::OneShot,
            });
        }
        out
    }

    /// Called on a short timer. Fires HOLD for any pending key past threshold.
    pub fn tick(&mut self, now: u64) -> Vec<Trigger> {
        let mut out = Vec::new();
        // Collect keys to resolve first (avoid borrow conflict).
        let due: Vec<String> = self
            .pending
            .iter()
            .filter(|(_, p)| {
                !p.resolved
                    && !p.interrupted
                    && now.saturating_sub(p.down_time) >= self.hold_threshold_ms
            })
            .map(|(k, _)| k.clone())
            .collect();

        for key_id in due {
            let binding = self.binding(&key_id).unwrap_or_default();
            let hold = binding.hold.clone();
            if let Some(p) = self.pending.get_mut(&key_id) {
                p.resolved = true; // block any tap on release regardless
                if let Some(action) = hold {
                    if action.is_continuous(&self.config) {
                        p.active_hold = Some(action.clone());
                        out.push(Trigger {
                            action,
                            key_id: key_id.clone(),
                            gesture: Gesture::Hold,
                            kind: TriggerKind::Start,
                        });
                    } else {
                        out.push(Trigger {
                            action,
                            key_id: key_id.clone(),
                            gesture: Gesture::Hold,
                            kind: TriggerKind::OneShot,
                        });
                    }
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keyfloe::keybinding::model::{default_config, Feature};

    fn engine() -> TapHoldEngine {
        TapHoldEngine::new(Arc::new(default_config()))
    }

    #[test]
    fn quick_tap_fires_tap_oneshot() {
        // rctrl tap = chat (one-shot)
        let mut e = engine();
        assert!(e.process(RawKey::managed("rctrl", true, 0)).is_empty());
        let out = e.process(RawKey::managed("rctrl", false, 100));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].gesture, Gesture::Tap);
        assert_eq!(out[0].kind, TriggerKind::OneShot);
        assert_eq!(
            out[0].action,
            ActionRef::Builtin {
                feature: Feature::Chat
            }
        );
    }

    #[test]
    fn hold_fires_start_then_stop_for_continuous() {
        // rctrl hold = dictation (continuous)
        let mut e = engine();
        e.process(RawKey::managed("rctrl", true, 0));
        let start = e.tick(300);
        assert_eq!(start.len(), 1);
        assert_eq!(start[0].gesture, Gesture::Hold);
        assert_eq!(start[0].kind, TriggerKind::Start);
        // A second tick should not re-fire.
        assert!(e.tick(350).is_empty());
        let stop = e.process(RawKey::managed("rctrl", false, 900));
        assert_eq!(stop.len(), 1);
        assert_eq!(stop[0].kind, TriggerKind::Stop);
    }

    #[test]
    fn release_before_threshold_is_tap_not_hold() {
        let mut e = engine();
        e.process(RawKey::managed("rctrl", true, 0));
        // tick before threshold -> nothing
        assert!(e.tick(200).is_empty());
        let out = e.process(RawKey::managed("rctrl", false, 250));
        assert_eq!(out[0].kind, TriggerKind::OneShot);
        assert_eq!(out[0].gesture, Gesture::Tap);
    }

    #[test]
    fn interrupt_disqualifies_tap() {
        let mut e = engine();
        e.process(RawKey::managed("rctrl", true, 0));
        e.process(RawKey::activity(50)); // pressed another key -> chord
        let out = e.process(RawKey::managed("rctrl", false, 100));
        assert!(out.is_empty(), "chord must not fire a tap");
    }

    #[test]
    fn continuous_tap_toggles() {
        // ralt tap = interview (continuous) -> toggle
        let mut e = engine();
        e.process(RawKey::managed("ralt", true, 0));
        let on = e.process(RawKey::managed("ralt", false, 50));
        assert_eq!(on[0].kind, TriggerKind::Start);
        e.process(RawKey::managed("ralt", true, 1000));
        let off = e.process(RawKey::managed("ralt", false, 1050));
        assert_eq!(off[0].kind, TriggerKind::Stop);
    }

    #[test]
    fn auto_repeat_down_ignored() {
        let mut e = engine();
        e.process(RawKey::managed("rctrl", true, 0));
        assert!(e.process(RawKey::managed("rctrl", true, 30)).is_empty());
        // still a valid tap on release
        let out = e.process(RawKey::managed("rctrl", false, 60));
        assert_eq!(out.len(), 1);
    }
}
