# Feature B — Dictation parity (backend) · INTEGRATION

This module adds Keyfloe's Wispr-style parity layer on top of Handy's existing
dictation core. It owns ONLY `src-tauri/src/keyfloe/dictation/` and never edits a
shared file. Below are the exact edits the integrator makes to wire it in.

> Build note: I did **not** run `cargo`/`git`/`bun` (parallel-work rule). The
> pure logic (self-correction stripping, polish guard, vocabulary heuristics,
> correction diff, WPM counting) was verified by extracting it to a standalone
> `rustc` harness — all assertions pass. The Tauri/reqwest/windows glue compiles
> against the deps already in `Cargo.toml`; run `cd src-tauri && cargo check`
> after registering the module (below).

## 1. Register the module in `lib.rs`

Add near the other `mod` declarations (a `#[path]` attr so no shared
`keyfloe/mod.rs` is needed — keeps sibling features collision-free):

```rust
#[path = "keyfloe/dictation/mod.rs"]
mod keyfloe_dictation;
```

## 2. Register the commands in `collect_commands![]` (in `lib.rs`)

Append these inside the existing `collect_commands![ ... ]` macro. They carry
`#[specta::specta]`, so this also regenerates `bindings.ts` on the next
debug build (the FE does **not** require that — it uses raw `invoke`).

```rust
keyfloe_dictation::commands::keyfloe_get_dictation_settings,
keyfloe_dictation::commands::keyfloe_set_dictation_settings,
keyfloe_dictation::commands::keyfloe_get_vocabulary,
keyfloe_dictation::commands::keyfloe_add_vocabulary,
keyfloe_dictation::commands::keyfloe_remove_vocabulary,
keyfloe_dictation::commands::keyfloe_clear_vocabulary,
keyfloe_dictation::commands::keyfloe_get_dictation_stats,
keyfloe_dictation::commands::keyfloe_get_dictation_log,
keyfloe_dictation::commands::keyfloe_delete_dictation_log_entry,
keyfloe_dictation::commands::keyfloe_clear_dictation_log,
```

The live-caption event is emitted with a plain `app.emit(CAPTION_EVENT, payload)`
(payload is `Serialize`), so it does **not** need `collect_events![]`. The FE
listens for `keyfloe://dictation-caption` via raw `listen`.

## 3. Wire the polish + side-effects into `actions.rs`

Handy's `TranscribeAction::stop` transcribes, then calls
`process_transcription_output(...)`, then pastes on the main thread. Swap the
Keyfloe parity layer in around the paste. Minimal diff:

**a)** In the async task in `TranscribeAction::stop`, after you have the raw
`transcription: String` (and `sample_count`), replace the
`process_transcription_output(...)` call with:

```rust
// Foreground app the user is dictating into (captured before we touch the
// overlay; Handy's overlay is non-activating so this is the user's window).
let fg = keyfloe_dictation::focus::capture_foreground();
let duration_sec = sample_count as f64 / 16_000.0; // 16 kHz mono PCM

// Keyfloe parity: local self-correction strip → cloud AI polish (app-aware) →
// clean paste-ready text. Never throws; falls back to local cleanup offline.
let final_text =
    keyfloe_dictation::process_dictation(&ah, &transcription, fg.as_ref()).await;
```

Then paste `final_text` (as Handy already does). Immediately **before** the
`utils::paste(...)` call on the main thread, restore focus so Ctrl+V lands in
the user's app:

```rust
if let Some(fg) = fg.as_ref() {
    keyfloe_dictation::focus::restore_foreground(fg);
}
match utils::paste(final_text.clone(), ah_clone.clone()) { /* unchanged */ }
```

**b)** After a successful paste, fire the side-effects (stats + transcript log +
learn-from-corrections):

```rust
keyfloe_dictation::on_dictation_pasted(&ah, &final_text, duration_sec, fg.as_ref());
```

> You can keep Handy's history save if you want both; Keyfloe's dictation log is
> a separate, user-facing safety-net list (30-day retention) surfaced in the FE.

## 4. (Optional) Feed personal vocabulary into the whisper decode prompt

In `managers/transcription.rs`, the whisper path already builds an
`initial_prompt` from `settings.custom_words`. To also bias whisper toward the
user's learned vocabulary (gated on the `vocabulary_prompt_enabled` setting),
prepend the hint:

```rust
let hint = crate::keyfloe_dictation::vocabulary::whisper_prompt_hint(&self.app_handle);
let mut prompt_parts = settings.custom_words.clone();
if !hint.is_empty() { prompt_parts.insert(0, hint); }
// ...use prompt_parts.join(", ") as the WhisperRunOptions.initial_prompt
```

This is optional; polish already preserves vocabulary via its "preserve these
terms" hint, so skipping it only affects first-pass whisper spelling.

## 5. Dependencies

No **new** crates required — the cross-platform build uses `reqwest`, `serde`,
`serde_json`, `chrono`, `specta`, `log`, `tokio`, and `windows`, all already in
`Cargo.toml`.

Focus save/restore (`focus.rs`) uses `GetForegroundWindow` / `GetWindowTextW` /
`SetForegroundWindow`, covered by the already-enabled windows features
`Win32_Foundation` + `Win32_UI_WindowsAndMessaging`.

For the FULL learn-from-corrections field read (`correction_learner.rs` — today a
safe no-op stub), add ONE windows feature to `Cargo.toml`'s `windows` deps:
- `Win32_UI_Accessibility` (recommended — `IUIAutomation::GetFocusedElement` +
  `CurrentValue`), or
- keep `Win32_UI_WindowsAndMessaging` and use `GetGUIThreadInfo` + `WM_GETTEXT`
  via `SendMessageTimeoutW` for standard edit controls.

Do **not** edit `Cargo.toml` from a parallel run — hand this note to whoever
batches dependency changes.

## 6. Auth handoff (shared backend)

The polish client calls `keyfloe.com/v1/chat` (Anthropic Messages proxy) as an
INTERNAL call (`x-keyfloe-internal: 1`, `x-oneclick-feature: dictation`) so it
never counts against the user's daily quota — dictation stays unlimited.

It reads the session from `<app_data_dir>/keyfloe-auth.json`:

```json
{ "jwt": "<supabase access token>", "device_id": "<optional; auto-generated if absent>" }
```

**Feature A (shell/onboarding) must write this file after sign-in.** Env
overrides for dev: `ANTHROPIC_API_KEY` (direct to Anthropic, no worker),
`KEYFLOE_JWT` (bearer), `KEYFLOE_BASE_URL` (backend base; default
`https://keyfloe.com`).

> ⚠️ Host caveat (from the Mac app): Vercel's firewall may challenge non-browser
> requests to `keyfloe.com/v1/*`. If polish returns HTTP challenges, point
> `KEYFLOE_BASE_URL` at the proven Cloudflare Worker base instead. Feature A owns
> the final host decision.

## 7. Windows verification checklist (can't be tested on the Mac dev box)

- [ ] `focus::capture_foreground()` returns the real foreground window + title.
- [ ] `focus::restore_foreground()` returns focus so Ctrl+V lands in the user's
      app, not the Keyfloe pill/overlay.
- [ ] App-aware register: dictating into Slack/WhatsApp yields casual text with a
      dropped trailing period; email/docs yield proper prose.
- [ ] `correction_learner`: after implementing `focused_field_text()`, verify it
      only ever ADDS vocabulary and never touches the pasted text.
- [ ] Polish round-trip against the real backend returns clean text < ~1.5s and
      falls back to local cleanup on airplane mode.
```
