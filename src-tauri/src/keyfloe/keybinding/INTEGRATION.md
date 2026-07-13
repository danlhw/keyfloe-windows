# Feature F — keybinding (BACKEND) — INTEGRATION

Owner folder: `src-tauri/src/keyfloe/keybinding/`. Native tap/hold key-remap
engine + binding store + event dispatch. Nothing here edits shared files; wire
it up with the steps below.

## Files

| File | Platform | Purpose |
|---|---|---|
| `model.rs` | all | Data model: `Feature`, `ActionRef`, `Binding`, `Gesture`, `CustomFeature`, `KeybindingConfig`, defaults. Unit-tested. |
| `engine.rs` | all | `TapHoldEngine` — clean-room tap/hold state machine. Unit-tested. |
| `keys.rs` | all | VK ⇄ keyId map + left/right discrimination. Unit-tested. |
| `dispatch.rs` | all | Turns engine triggers into `feature_trigger` events. |
| `store.rs` | all | JSON persistence (`keybindings.json`) + invariant-enforcing mutations. Unit-tested. |
| `hook.rs` | **windows** (stub elsewhere) | `WH_KEYBOARD_LL` hook on a dedicated thread + message pump + suppression + capture. |
| `mod.rs` | all | Module root: `init()`, engine runtime thread, Tauri state + commands. |

The cross-platform files compile and `cargo test` on macOS/Linux; only the hook
body is `#[cfg(windows)]`.

## 1. Module wiring (shared files — coordinate with agents B–E)

`keyfloe/` is a shared parent shared by features B–F. It needs a `mod.rs`
(create ONCE, together):

```rust
// src-tauri/src/keyfloe/mod.rs
pub mod keybinding;
// pub mod dictation;  // feature B
// pub mod agent;      // feature C
// pub mod interview;  // feature D
// pub mod snapshot;   // feature E
```

Then in `src-tauri/src/lib.rs`, next to the other `mod` lines (~line 16):

```rust
mod keyfloe;
```

## 2. Register commands (lib.rs `collect_commands![ ... ]`, ~line 534)

Append these to the existing `collect_commands!` macro list:

```rust
crate::keyfloe::keybinding::keybinding_get_config,
crate::keyfloe::keybinding::keybinding_get_meta,
crate::keyfloe::keybinding::keybinding_assign,
crate::keyfloe::keybinding::keybinding_clear,
crate::keyfloe::keybinding::keybinding_reset_key,
crate::keyfloe::keybinding::keybinding_reset_all,
crate::keyfloe::keybinding::keybinding_save_custom_feature,
crate::keyfloe::keybinding::keybinding_delete_custom_feature,
crate::keyfloe::keybinding::keybinding_start_capture,
crate::keyfloe::keybinding::keybinding_stop_capture,
```

Signatures (all `#[tauri::command] #[specta::specta]`):

```rust
fn keybinding_get_config(app) -> KeybindingConfig
fn keybinding_get_meta() -> KeybindingMeta
fn keybinding_assign(app, key_id: String, gesture: Gesture, action: ActionRef, force: bool)
    -> Result<AssignResult, String>
fn keybinding_clear(app, key_id: String, gesture: Gesture) -> Result<(), String>
fn keybinding_reset_key(app, key_id: String) -> Result<(), String>
fn keybinding_reset_all(app) -> Result<(), String>
fn keybinding_save_custom_feature(app, feature: CustomFeature) -> Result<(), String>
fn keybinding_delete_custom_feature(app, id: String) -> Result<(), String>
fn keybinding_start_capture(app) -> Result<(), String>
fn keybinding_stop_capture() -> Result<(), String>
```

`Gesture` = `"tap" | "hold"`. `ActionRef` = `{ "kind":"builtin", "feature":"chat" }`
or `{ "kind":"custom", "id":"cf_..." }`.

## 3. Call `init()` once at startup

In the Tauri `.setup(|app| { ... })` closure in `lib.rs` (where
`shortcut::init_shortcuts(app)` and friends run), add:

```rust
crate::keyfloe::keybinding::init(&app.handle());
```

`init()` loads/creates `keybindings.json`, installs `KeybindingState`, spawns the
engine runtime thread, and installs the native hook (no-op off Windows). It is
independent of Handy's existing `shortcut::` system — the two coexist (Handy owns
combo shortcuts like `ctrl+space`; this owns bare-key tap/hold on spare keys).

## 4. Cargo deps (`src-tauri/Cargo.toml`)

Add a Windows-only target dependency (aligns with the version Tauri 2 already
pulls in, so no duplicate tree):

```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.59", features = [
  "Win32_Foundation",
  "Win32_UI_WindowsAndMessaging",
  "Win32_UI_Input_KeyboardAndMouse",
] }
```

Already-present deps this module reuses: `serde`, `serde_json`, `specta`,
`chrono`, `log`, `tauri`. No new cross-platform deps.

## 5. Settings schema

This feature does **not** touch `settings.rs`. Bindings live in their own file:

- Location: `app_config_dir()/keybindings.json`
- Shape (`KeybindingConfig`):

```jsonc
{
  "version": 1,
  "bindings": {
    "rctrl": { "tap": { "kind": "builtin", "feature": "chat" },
               "hold": { "kind": "builtin", "feature": "dictation" } },
    "caps":  { "tap": { "kind": "builtin", "feature": "snapshot" },
               "hold": { "kind": "builtin", "feature": "agent" } }
  },
  "custom_features": [
    { "id": "cf_1699999999999", "name": "Make it formal",
      "instruction": "Rewrite the selection in a formal tone.",
      "explanation": "Formal rewrite of the selection.",
      "icon": "Wand2", "outputs": ["clipboard"] }
  ]
}
```

- Assignable keyIds: `caps`, `rctrl`, `ralt`, `apps`, `lwin`, `rwin`, `rshift`.
- Tap-only keyIds (holding still needed for OS shortcuts): `lwin`, `rwin`.
- Thresholds: `TAP_MAX_MS = 300`, `HOLD_THRESHOLD_MS = 300` (matches Mac
  `FnTapDetector`).
- Custom-feature cap: 5.
- Missing/corrupt file → seeded from `default_config()` (covers chat, dictation,
  snapshot, agent, interview, ai_answer, voice_command, dashboard).

## 6. Event contract (⚠️ features B/C/D/E depend on this)

The engine dispatches Tauri events via `AppHandle::emit` (plain `listen` on the
FE — no `collect_events!` registration needed). **Two events fire per trigger:**

1. Unified: **`feature_trigger`**
2. Per-feature convenience:
   - built-in → **`<feature>_trigger`**, i.e. `chat_trigger`, `dictation_trigger`,
     `snapshot_trigger`, `agent_trigger`, `interview_trigger`, `ai_answer_trigger`,
     `voice_command_trigger`, `dashboard_trigger`.
   - custom feature → **`custom_feature_trigger`**.

Both carry the **same payload** (`FeatureTrigger`):

```jsonc
{
  "feature": "dictation",   // built-in rawValue OR custom feature id
  "is_custom": false,
  "phase": "start",         // "start" | "stop" | "trigger"
  "gesture": "hold",        // "tap" | "hold"
  "key": "rctrl",           // physical key id that fired it
  "custom": null            // full CustomFeature object when is_custom == true
}
```

Phase semantics:

- **Continuous** features (`dictation`, `voice_command`, `agent`, `interview`):
  `phase:"start"` then `phase:"stop"`.
  - On a **hold** slot → push-to-talk: start when the hold threshold is crossed,
    stop on key release.
  - On a **tap** slot → toggle: first tap `start`, next tap `stop`.
- **One-shot** features (`chat`, `snapshot`, `ai_answer`, `dashboard`, all custom
  features): single `phase:"trigger"`.

Recommended consumption for each downstream feature:

```ts
// Feature B (dictation)
listen<FeatureTrigger>("dictation_trigger", ({ payload }) => {
  if (payload.phase === "start") startDictation();
  else if (payload.phase === "stop") stopDictation();
});
// Feature C: "agent_trigger", D: "interview_trigger", E: "snapshot_trigger",
// chat: "chat_trigger" (phase "trigger").
```

## 7. Windows verification (Parallels — cannot run on this Mac)

- [ ] `windows-sys` dep added, `cargo build` on Windows succeeds.
- [ ] Hook installs: log `WH_KEYBOARD_LL hook installed on dedicated thread`.
- [ ] Hook is on **its own** thread with a live `GetMessageW` pump — NOT the
      webview thread (tauri#13919: hooks on the webview thread silently drop keys).
- [ ] Tap Right-Ctrl → `chat_trigger` (phase `trigger`). Hold Right-Ctrl >300ms →
      `dictation_trigger` start, release → stop.
- [ ] A bound key is fully suppressed (e.g. bound Right-Ctrl no longer acts as
      Ctrl in other apps — expected; document to users, keep defaults on spare keys).
- [ ] Unbound keys pass through normally; typing latency unaffected (activity
      pings are fire-and-forget on an mpsc).
- [ ] Chord test: hold a bound key + press another key → **no** tap fires
      (interruption disqualifies the tap).
- [ ] Auto-repeat while holding does not emit duplicate triggers.
- [ ] Elevated apps: an LL hook set from a normal-integrity process will NOT see
      keystrokes while a UAC-elevated / admin window is focused. Note as a known
      limitation; a manifest `uiAccess`/elevated helper is a future option.
- [ ] Reassign a feature already bound elsewhere → `AssignResult::Conflict`; UI
      re-calls with `force:true` and the old slot clears.
- [ ] `keybinding.json` persists across restarts; delete file → defaults reseed.

## 8. Known trade-offs / future work

- Full suppression of bound keys (no synthesize-on-disqualify). Matches the Mac
  model (picker only offers spare keys). Future: re-inject via `SendInput` when a
  bound modifier is used purely as part of a chord.
- Combos (modifier+letter) are intentionally left to Handy's existing
  `tauri-plugin-global-shortcut` / `handy_keys` path; this engine owns bare-key
  tap/hold. The FE models only bare-key assignment.
- Custom-feature execution (running the instruction against the screen and
  routing to clipboard/chat) is downstream: this feature only emits
  `custom_feature_trigger` with the full `CustomFeature` payload.
