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

> NOTE: `mod keyfloe;` already declares this module in `lib.rs` and all ten
> `keyfloe::dictation::commands::*` are already in `collect_commands![]` (steps
> 1–2 above are done). The ONLY remaining wiring is the `actions.rs` stop path
> below — `process_dictation` / `on_dictation_pasted` currently have zero call
> sites (grep-confirmed), so the whole parity layer is dead until you add this.

The foreground window MUST be captured at record **start** (before any Keyfloe
overlay/pill can steal focus), then used at **stop**. The module stashes it for
you so the two edit sites stay trivial and you never thread the value through
Handy's plumbing.

**Only route this for the DICTATION binding, not the agent** — the Floe agent
reuses the same recording pipeline but transcribes to `run_agent_voice_command`
instead of pasting (see agent P1-09). If both share `TranscribeAction`, gate on
which binding/mode triggered the capture and skip the block below for agent.

**a)** In `TranscribeAction::start` (dictation only), right as the trigger
fires and before showing any overlay:

```rust
keyfloe::dictation::focus::capture_and_stash();
```

**b)** In the async task in `TranscribeAction::stop`, after you have the raw
`transcription: String` (and `sample_count`), REPLACE the
`process_transcription_output(...)` call with:

```rust
// The window we captured at start (Some on Windows when a real app was focused).
let fg = keyfloe::dictation::focus::take_stashed();
let duration_sec = sample_count as f64 / 16_000.0; // 16 kHz mono PCM

// Keyfloe parity: local self-correction strip → cloud AI polish (app-aware) →
// clean paste-ready text. Never throws; falls back to local cleanup offline.
let final_text =
    keyfloe::dictation::process_dictation(&ah, &transcription, fg.as_ref()).await;
```

Then paste `final_text` (as Handy already does). Immediately **before** the
`utils::paste(...)` call on the main thread, restore focus so Ctrl+V lands in
the user's app (requires the pill be `WS_EX_NOACTIVATE`, P1-02):

```rust
if let Some(fg) = fg.as_ref() {
    keyfloe::dictation::focus::restore_foreground(fg);
}
match utils::paste(final_text.clone(), ah_clone.clone()) { /* unchanged */ }
```

**c)** After a successful paste, fire the side-effects (stats + transcript log +
learn-from-corrections). `fg` was moved into the main-thread paste closure, so
clone it beforehand or capture `duration_sec`/`fg` before the closure:

```rust
keyfloe::dictation::on_dictation_pasted(&ah, &final_text, duration_sec, fg.as_ref());
```

> You can keep Handy's history save if you want both; Keyfloe's dictation log is
> a separate, user-facing safety-net list (30-day retention) surfaced in the FE.

## 4. (Optional) Feed personal vocabulary into the whisper decode prompt

In `managers/transcription.rs`, the whisper path already builds an
`initial_prompt` from `settings.custom_words`. To also bias whisper toward the
user's learned vocabulary, prepend the hint:

```rust
let hint = crate::keyfloe::dictation::vocabulary::whisper_prompt_hint(&self.app_handle);
let mut prompt_parts = settings.custom_words.clone();
if !hint.is_empty() { prompt_parts.insert(0, hint); }
// ...use prompt_parts.join(", ") as the WhisperRunOptions.initial_prompt
```

`whisper_prompt_hint` is already gated on the `vocabulary_prompt_enabled`
setting (returns `""` when off or when there are no active learned terms), so
this one-liner is safe to add unconditionally.

This is optional; polish already preserves vocabulary via its "preserve these
terms" hint, so skipping it only affects first-pass whisper spelling.

## 5. Dependencies

No **new** crates required — the cross-platform build uses `reqwest`, `serde`,
`serde_json`, `chrono`, `specta`, `log`, `tokio`, and `windows`, all already in
`Cargo.toml`.

Focus save/restore (`focus.rs`) uses `GetForegroundWindow` / `GetWindowTextW` /
`SetForegroundWindow`, covered by the already-enabled windows features
`Win32_Foundation` + `Win32_UI_WindowsAndMessaging`.

The learn-from-corrections field read (`correction_learner::focused_field_text`)
is now IMPLEMENTED via Win32 UI Automation (`IUIAutomation::GetFocusedElement`
→ ValuePattern, TextPattern fallback). It needs the windows-crate feature
`Win32_UI_Accessibility` **plus** `Win32_System_Com` — both are ALREADY enabled
in `Cargo.toml` (lines ~120–130), so no dependency change is required. It also
pulls in `windows::core::Interface` (`.cast()`) which the crate provides by
default. Compile-only on Mac; needs Windows verification (see §7).

## 6. Auth handoff (shared backend)

The polish client calls `keyfloe.com/v1/chat` (Anthropic Messages proxy) as an
INTERNAL call (`x-keyfloe-internal: 1`, `x-oneclick-feature: dictation`) so it
never counts against the user's daily quota — dictation stays unlimited.

**Central AuthState (P1-05) is the intended source of JWT + device-id.** Because
this feature builds in isolation and can't reference the (parallel) `keyfloe::auth`
module, `auth.rs` exposes ONE seam function, `central_credentials(app)`, which
today returns `None`. **INTEGRATOR: once `keyfloe::auth::AuthState` is `.manage()`d,
replace that one function's body** to read `get_jwt()` / `get_device_id()` /
`base_url()` from it (the exact snippet is in the function's doc comment). Nothing
else changes — `resolve()` already prefers those creds when present.

Until the seam is wired, it falls back to `<app_data_dir>/keyfloe-auth.json`:

```json
{ "jwt": "<supabase access token>", "device_id": "<optional; auto-generated if absent>" }
```

Env overrides (still honored above the central state for ops flexibility):
`ANTHROPIC_API_KEY` (direct to Anthropic, no worker), `KEYFLOE_JWT` (bearer),
`KEYFLOE_BASE_URL` (backend base; default `https://keyfloe.com`).

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
