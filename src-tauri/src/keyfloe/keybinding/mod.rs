//! Feature F — key remapping (tap/hold custom key bindings).
//!
//! Parity with the Mac flagship customizable keyboard: bind ANY spare key
//! (Caps Lock, right-side modifiers, Menu key) to ANY Keyfloe feature, with
//! tap-vs-hold, plus user-created custom features. See INTEGRATION.md for how
//! to wire this into `lib.rs`, the emitted `feature_trigger` event contract,
//! and Windows-verification notes.
//!
//! Layers:
//! - [`model`]   data model (features, bindings, custom features, defaults)
//! - [`engine`]  cross-platform tap/hold state machine (unit-tested)
//! - [`keys`]    VK <-> keyId mapping + L/R discrimination
//! - [`hook`]    `#[cfg(windows)]` WH_KEYBOARD_LL hook on its own thread
//! - [`store`]   JSON persistence + invariant-enforcing mutations
//! - [`dispatch`] engine triggers -> Tauri events

pub mod dispatch;
pub mod engine;
pub mod hook;
pub mod keys;
pub mod model;
pub mod store;

use std::collections::HashSet;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, RwLock};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager};

use engine::{RawKey, TapHoldEngine};
use model::{
    assignable_keys, supports_hold, tap_only_keys, ActionRef, CustomFeature, Feature, Gesture,
    KeybindingConfig, MAX_CUSTOM_FEATURES,
};

/// Tauri-managed state for the keybinding feature.
pub struct KeybindingState {
    config: RwLock<Arc<KeybindingConfig>>,
    /// Pushes new configs to the engine runtime thread.
    cfg_tx: RwLock<Option<Sender<Arc<KeybindingConfig>>>>,
}

impl KeybindingState {
    pub fn config(&self) -> Arc<KeybindingConfig> {
        self.config.read().expect("config lock").clone()
    }
}

// ---------------------------------------------------------------------------
// Init (called once from lib.rs setup — see INTEGRATION.md)
// ---------------------------------------------------------------------------

/// Load config, install state, start the engine + native hook.
pub fn init(app: &AppHandle) {
    let config = Arc::new(store::load(app));

    // Channels: hook -> engine (RawKey), commands -> engine (config updates).
    let (key_tx, key_rx) = mpsc::channel::<RawKey>();
    let (cfg_tx, cfg_rx) = mpsc::channel::<Arc<KeybindingConfig>>();

    hook::set_sender(key_tx);
    hook::set_managed(managed_set(&config));

    let state = KeybindingState {
        config: RwLock::new(config.clone()),
        cfg_tx: RwLock::new(Some(cfg_tx)),
    };
    app.manage(state);

    // Engine runtime thread (spawned on all platforms; only receives events on
    // Windows where the hook feeds it).
    let app_handle = app.clone();
    std::thread::Builder::new()
        .name("keyfloe-keyengine".into())
        .spawn(move || engine_runtime(app_handle, key_rx, cfg_rx, config))
        .expect("spawn keyengine thread");

    // Native hook (no-op off Windows).
    hook::start();

    log::info!("keybinding: initialized");
}

fn managed_set(config: &KeybindingConfig) -> HashSet<String> {
    config.managed_key_ids().into_iter().collect()
}

fn engine_runtime(
    app: AppHandle,
    key_rx: mpsc::Receiver<RawKey>,
    cfg_rx: mpsc::Receiver<Arc<KeybindingConfig>>,
    initial: Arc<KeybindingConfig>,
) {
    let mut engine = TapHoldEngine::new(initial);
    let mut current = engine_config_snapshot(&app);

    loop {
        // Apply any pending config updates first.
        while let Ok(cfg) = cfg_rx.try_recv() {
            current = cfg.clone();
            engine.set_config(cfg);
        }

        match key_rx.recv_timeout(std::time::Duration::from_millis(10)) {
            Ok(raw) => {
                for trigger in engine.process(raw) {
                    dispatch::dispatch(&app, &current, &trigger);
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        // Fire any holds that have crossed the threshold.
        for trigger in engine.tick(hook::now_ms()) {
            dispatch::dispatch(&app, &current, &trigger);
        }
    }
}

fn engine_config_snapshot(app: &AppHandle) -> Arc<KeybindingConfig> {
    app.try_state::<KeybindingState>()
        .map(|s| s.config())
        .unwrap_or_else(|| Arc::new(KeybindingConfig::default()))
}

/// Persist a mutated config and propagate it to the engine + native hook.
fn commit(app: &AppHandle, new_config: KeybindingConfig) -> Result<(), String> {
    store::save(app, &new_config)?;
    let arc = Arc::new(new_config);
    hook::set_managed(managed_set(&arc));
    if let Some(state) = app.try_state::<KeybindingState>() {
        *state.config.write().expect("config lock") = arc.clone();
        if let Some(tx) = state.cfg_tx.read().expect("tx lock").as_ref() {
            let _ = tx.send(arc);
        }
    }
    Ok(())
}

fn mutate<F: FnOnce(&mut KeybindingConfig)>(app: &AppHandle, f: F) -> Result<(), String> {
    let state = app
        .try_state::<KeybindingState>()
        .ok_or("KeybindingState not initialized")?;
    let mut cfg = (*state.config()).clone();
    f(&mut cfg);
    commit(app, cfg)
}

// ---------------------------------------------------------------------------
// Command payloads
// ---------------------------------------------------------------------------

#[derive(Serialize, Debug, Clone, Type)]
pub struct FeatureInfo {
    pub id: String,
    pub is_continuous: bool,
}

#[derive(Serialize, Debug, Clone, Type)]
pub struct KeybindingMeta {
    pub assignable_keys: Vec<String>,
    pub tap_only_keys: Vec<String>,
    pub features: Vec<FeatureInfo>,
    pub max_custom_features: u32,
    pub tap_max_ms: u64,
    pub hold_threshold_ms: u64,
}

#[derive(Serialize, Debug, Clone, Type)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum AssignResult {
    Assigned,
    Conflict { key_id: String, gesture: Gesture },
    Rejected { message: String },
}

// ---------------------------------------------------------------------------
// Tauri commands (register in lib.rs — see INTEGRATION.md)
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub fn keybinding_get_config(app: AppHandle) -> KeybindingConfig {
    app.try_state::<KeybindingState>()
        .map(|s| (*s.config()).clone())
        .unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub fn keybinding_get_meta() -> KeybindingMeta {
    let features = [
        Feature::Chat,
        Feature::Dictation,
        Feature::Snapshot,
        Feature::Agent,
        Feature::Interview,
        Feature::AiAnswer,
        Feature::VoiceCommand,
        Feature::Dashboard,
    ]
    .into_iter()
    .map(|f| FeatureInfo {
        id: f.raw().to_string(),
        is_continuous: f.is_continuous(),
    })
    .collect();

    KeybindingMeta {
        assignable_keys: assignable_keys().into_iter().map(String::from).collect(),
        tap_only_keys: tap_only_keys().into_iter().map(String::from).collect(),
        features,
        max_custom_features: MAX_CUSTOM_FEATURES as u32,
        tap_max_ms: model::TAP_MAX_MS,
        hold_threshold_ms: model::HOLD_THRESHOLD_MS,
    }
}

#[tauri::command]
#[specta::specta]
pub fn keybinding_assign(
    app: AppHandle,
    key_id: String,
    gesture: Gesture,
    action: ActionRef,
    force: bool,
) -> Result<AssignResult, String> {
    if !assignable_keys().contains(&key_id.as_str()) {
        return Ok(AssignResult::Rejected {
            message: format!("{key_id} is not an assignable key"),
        });
    }
    if gesture == Gesture::Hold && !supports_hold(&key_id) {
        return Ok(AssignResult::Rejected {
            message: format!("{key_id} supports Tap only"),
        });
    }

    let state = app
        .try_state::<KeybindingState>()
        .ok_or("KeybindingState not initialized")?;
    let mut cfg = (*state.config()).clone();

    let outcome = store::assign(&mut cfg, &key_id, gesture, action, force);
    match outcome {
        store::AssignOutcome::Assigned => {
            commit(&app, cfg)?;
            Ok(AssignResult::Assigned)
        }
        store::AssignOutcome::Conflict { key_id, gesture } => {
            Ok(AssignResult::Conflict { key_id, gesture })
        }
        store::AssignOutcome::Rejected(message) => Ok(AssignResult::Rejected { message }),
    }
}

#[tauri::command]
#[specta::specta]
pub fn keybinding_clear(app: AppHandle, key_id: String, gesture: Gesture) -> Result<(), String> {
    mutate(&app, |cfg| store::clear_slot(cfg, &key_id, gesture))
}

#[tauri::command]
#[specta::specta]
pub fn keybinding_reset_key(app: AppHandle, key_id: String) -> Result<(), String> {
    mutate(&app, |cfg| store::reset_key(cfg, &key_id))
}

#[tauri::command]
#[specta::specta]
pub fn keybinding_reset_all(app: AppHandle) -> Result<(), String> {
    mutate(&app, store::reset_all)
}

#[tauri::command]
#[specta::specta]
pub fn keybinding_save_custom_feature(
    app: AppHandle,
    feature: CustomFeature,
) -> Result<(), String> {
    let state = app
        .try_state::<KeybindingState>()
        .ok_or("KeybindingState not initialized")?;
    let mut cfg = (*state.config()).clone();
    store::upsert_custom(&mut cfg, feature)?;
    commit(&app, cfg)
}

#[tauri::command]
#[specta::specta]
pub fn keybinding_delete_custom_feature(app: AppHandle, id: String) -> Result<(), String> {
    mutate(&app, |cfg| store::delete_custom(cfg, &id))
}

// --- key capture (optional convenience; UI can also click on-screen keys) ---

#[tauri::command]
#[specta::specta]
pub fn keybinding_start_capture(app: AppHandle) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<String>();
    hook::begin_capture(tx);
    // Forward captured key ids to the frontend as `keybinding_capture` events.
    let app_handle = app.clone();
    std::thread::spawn(move || {
        while let Ok(key_id) = rx.recv() {
            let _ = app_handle.emit("keybinding_capture", key_id);
        }
    });
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn keybinding_stop_capture() -> Result<(), String> {
    hook::end_capture();
    Ok(())
}
