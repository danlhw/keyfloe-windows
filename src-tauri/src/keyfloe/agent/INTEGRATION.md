# Feature C (agent) — backend wiring

Full details in `src/keyfloe/agent/INTEGRATION.md`. Backend TL;DR:

1. Create the shared `src-tauri/src/keyfloe/mod.rs` (all features share it) with
   `pub mod agent;`, and add `mod keyfloe;` to `lib.rs`.
2. Register ALL FIVE commands in `lib.rs` `collect_commands![ … ]`:
   ```rust
   keyfloe::agent::run_agent_command,
   keyfloe::agent::run_agent_voice_command,
   keyfloe::agent::start_agent_capture,       // Floe key down  (PTT)
   keyfloe::agent::stop_agent_capture,        // Floe key up    (transcribe → run)
   keyfloe::agent::respond_agent_confirmation,// Allow / Cancel a risky step
   ```
3. **Voice trigger is now self-contained — do NOT touch `actions.rs`.** The
   FE key→action dispatcher (P1-01) routes the Floe binding to
   `startAgentCapture()` / `stopAgentCapture()` (exported from
   `src/keyfloe/agent`), which invoke `start_agent_capture` / `stop_agent_capture`.
   Those reuse Handy's `AudioRecordingManager` + `TranscriptionManager` under a
   dedicated binding id `"agent"` and call `run_agent_voice_command` internally.
   The keybinding engine must NOT also start a Handy recording for `"agent"`.
4. Emits plain events `keyfloe://agent/{started,step,result,voice-command,
   listening,confirm}` — no `collect_events!` change needed.
5. Reuses the already-managed `crate::input::EnigoState` (type/click now run on
   the main thread, guarded when Enigo isn't initialised yet); no new state.
   Confirmations use a module-static registry (no `.manage()` needed).
6. Talks to `<base>/v1/agent` (shared backend), base resolved by
   `agent::auth::resolve()` — `Authorization: Bearer <jwt>` + `x-keyfloe-device-id`
   are sent when signed in. Dev override: `ANTHROPIC_API_KEY` env → direct to
   Anthropic. **P1-05:** once the central `AuthState` lands, reimplement the body
   of `agent::auth::resolve()` to read from it (that is the ONLY change needed).

Not compiled here (no `cargo`, per BUILD-PLAN rule 3). Run `cargo check` after
step 1–2. Native `open_app`/`type_text`/`click` need Windows verification.
