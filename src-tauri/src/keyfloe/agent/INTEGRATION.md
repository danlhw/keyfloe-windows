# Feature C (agent) — backend wiring

Full details in `src/keyfloe/agent/INTEGRATION.md`. Backend TL;DR:

1. Create the shared `src-tauri/src/keyfloe/mod.rs` (all features share it) with
   `pub mod agent;`, and add `mod keyfloe;` to `lib.rs`.
2. Register both commands in `lib.rs` `collect_commands![ … ]`:
   ```rust
   keyfloe::agent::run_agent_command,
   keyfloe::agent::run_agent_voice_command,
   ```
3. Add an `"agent"` push-to-talk binding in `settings.rs` defaults, and route
   its transcript in `actions.rs` to `run_agent_voice_command(app, transcript)`
   instead of `utils::paste` (see FE INTEGRATION §3, Option A/B).
4. Emits plain events `keyfloe://agent/{started,step,result,voice-command}` — no
   `collect_events!` change needed.
5. Reuses the already-managed `crate::input::EnigoState`; no new state.
6. Talks to `https://www.keyfloe.com/v1/agent` (shared backend). Dev override:
   `ANTHROPIC_API_KEY` env → direct to Anthropic. Add `Authorization: Bearer`
   in `session.rs::call_api` once a Windows auth client exists.

Not compiled here (no `cargo`, per BUILD-PLAN rule 3). Run `cargo check` after
step 1–2. Native `open_app`/`type_text`/`click` need Windows verification.
