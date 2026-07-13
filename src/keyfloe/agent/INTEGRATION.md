# Feature C — Voice command / "Floe" agent — INTEGRATION

Everything for Feature C lives in two owned folders and touches **no** shared
file directly. This doc lists the wiring the integrator applies to shared files
(`lib.rs`, the shortcut action map, settings, `App.tsx`, capabilities).

```
src-tauri/src/keyfloe/agent/   BE: types, parser, tools, session, commands
src/keyfloe/agent/             FE: pill UI, step cards, store, composer
```

## What it does
Hold the Floe key → speak → release → the transcript is handed to the agent,
which understands the task and either answers, opens an app/URL, guides
on-screen (type/click), or runs background research (web_search). Live step
cards stream into the pill; the final reply mirrors into the pill as the AI
record. Backed by the shared `keyfloe.com/v1/agent` route (buffered Anthropic
proxy — do NOT rebuild).

---

## 1. Rust module tree (shared `keyfloe/mod.rs` + `lib.rs`)

`src-tauri/src/keyfloe/mod.rs` does **not** exist yet and is shared by all six
features, so it was not created here (contract rule 2). The integrator (or the
first feature to land) creates it and adds each feature's line:

```rust
// src-tauri/src/keyfloe/mod.rs
pub mod agent;
// pub mod dictation;  // (other features add their own line)
// pub mod interview;
// pub mod snapshot;
// pub mod keybinding;
```

Then in `src-tauri/src/lib.rs`, alongside the other `mod` lines (~line 22):

```rust
mod keyfloe;
```

## 2. Register the two Tauri commands

In `lib.rs` `collect_commands![ … ]` (the `specta_builder`, ~line 534), add:

```rust
keyfloe::agent::run_agent_command,
keyfloe::agent::run_agent_voice_command,
```

Both are `#[specta::specta]`, so they regenerate into `src/bindings.ts` on the
next debug build. The FE currently calls them via `invoke(...)` (see
`useAgentStore.ts`), so it works even before bindings regenerate.

`run_agent_command(prompt: String) -> Result<String, String>` spawns the run and
returns a `taskId`. Progress arrives on events (see §5). No new managed state is
required — the agent reuses the already-managed `EnigoState` for type/click.

## 3. Wiring the voice trigger (the Floe key)

The agent needs a dedicated push-to-talk key whose transcript is routed to the
agent **instead of being pasted**. The recording + transcription pipeline is
Handy's (owned by Feature B); Feature C only needs the finished transcript.

**Settings** — add a binding in `settings.rs` default `bindings` map:

```rust
// id "agent" — Floe voice command. Suggested default: right Alt, hold (PTT).
bindings.insert("agent".into(), ShortcutBinding {
    current_binding: "right_alt".into(),      // pick a free hold key
    default_binding: "right_alt".into(),
    // …match the other ShortcutBinding fields…
});
```

**Route the transcript** — the cleanest hook is `actions.rs`. Handy's
`TranscribeAction::stop` computes `processed.final_text` and then pastes it. Add
an agent branch so the `agent` binding routes to Floe instead of pasting.
Two ways:

- **Option A (smallest diff):** in `TranscribeAction::stop`, where it currently
  calls `utils::paste(final_text, …)`, guard on the binding id:

  ```rust
  if binding_id == "agent" {
      let _ = crate::keyfloe::agent::run_agent_voice_command(ah_clone.clone(), final_text);
  } else {
      // existing paste path
  }
  ```

- **Option B (parallel action):** register an `AgentTranscribeAction` in
  `ACTION_MAP` that records like `TranscribeAction` but, on stop, calls
  `run_agent_voice_command(app, transcript)` instead of paste. More code, but
  keeps the dictation path untouched.

`run_agent_voice_command` emits `keyfloe://agent/voice-command` (so the closed
pill can echo "Heard: …") and then runs the command. For a **typed** command
(no mic), the FE composer calls `run_agent_command` directly.

**UPDATED — the voice trigger is now fully self-contained; `actions.rs` is NOT
touched.** The key→action dispatcher (P1-01) routes the Floe agent binding to
two functions exported from `src/keyfloe/agent`:

```ts
import { startAgentCapture, stopAgentCapture } from "@/keyfloe/agent";
// agent_trigger { phase: "start" } → startAgentCapture();   // key down (PTT)
// agent_trigger { phase: "stop"  } → stopAgentCapture();    // key up
```

`startAgentCapture` invokes the Rust `start_agent_capture` command (begins a
Handy recording under the dedicated binding id `"agent"`); `stopAgentCapture`
invokes `stop_agent_capture` (stops, transcribes on-device, then calls
`run_agent_voice_command` with the transcript). Nothing gets pasted. The pill
reacts to the emitted events, so these two functions work from any window
(including the main dashboard window where the dispatcher lives).

Human-in-the-loop: risky steps (type_text / click) emit `keyfloe://agent/confirm`;
the pill shows Allow / Cancel and calls the `respond_agent_confirmation` command.

## 4. Mount the pill UI (`App.tsx` / pill window)

Mount `<AgentPill />` wherever the pill surface lives (its own overlay window,
mirroring `src/overlay/`, or inside the dashboard). It is self-driving:

```tsx
import { AgentPill } from "@/keyfloe/agent";
// once, at app start (or the pill window's entry):
import { useAgentStore } from "@/keyfloe/agent";
useAgentStore.getState().init();   // starts listening for keyfloe://agent/* events
```

`<AgentComposer />` is an optional typed entry point for the dashboard/testing.
Recommended: a dedicated always-on-top, click-through-when-idle pill window
(same recipe as the recording overlay) so step cards show over other apps.

## 5. Events (backend → frontend)

Plain `app.emit` events (not `tauri-specta` typed events, so they don't touch
`collect_events!`/`bindings.ts`). The store subscribes to all of these.

| Event | Payload | Meaning |
|---|---|---|
| `keyfloe://agent/started` | `{ taskId, prompt, title }` | run spawned; open a fresh card |
| `keyfloe://agent/step` | `{ taskId, step }` | tool call running→done/failed (upsert by `step.id`) |
| `keyfloe://agent/result` | `{ taskId, ok, text, citedUrls, suggestedActions, report?, error? }` | final reply |
| `keyfloe://agent/voice-command` | `{ transcript }` | mic heard this (echo before the run) |

## 6. Capabilities / permissions

- **Opener** — `open_url` uses the browser. It shells out (`cmd /C start` on
  Windows) from Rust, so no ACL is required for the Rust path. The **FE**
  report/source links use `@tauri-apps/plugin-opener`, which needs its ACL in
  the pill window's capability file:

  ```json
  { "identifier": "opener:allow-open-url",
    "allow": [ { "url": "https://*" }, { "url": "http://*" } ] }
  ```

- **enigo** (`type_text`/`click`/`move_mouse`) — no manifest permission on
  Windows. On macOS it needs Accessibility (already handled by the app's
  permissions flow for dictation paste).

- **Network** — the session calls `https://www.keyfloe.com/v1/agent` and
  (dev only) `https://api.anthropic.com`. reqwest is unsandboxed, so no CSP
  entry is needed for the Rust HTTP; if any FE code ever fetches these, add
  them to the CSP `connect-src`.

## 7. Backend contract (shared — do NOT rebuild)

`POST https://www.keyfloe.com/v1/agent` — buffered pass-through of the Anthropic
Messages API (`worker/src/routes/agent.ts`). The body is the standard Messages
request (`model`, `max_tokens`, `system`, `tools`, `messages`); the worker
injects `ANTHROPIC_API_KEY` and meters quota (429 when exhausted → the session
surfaces an upgrade message). Hosted `web_search_20250305` is included in the
tool list. Auth: the Mac sends a Supabase bearer + device id. Windows has no
auth client yet, so the session sends `x-keyfloe-client: windows` only — **once
a Windows auth/JWT client exists, add `Authorization: Bearer <jwt>` in
`session.rs::call_api`** so per-user quota applies. A dev `ANTHROPIC_API_KEY`
env var bypasses the proxy and calls Anthropic directly (parity with Mac).

## 8. Build / verification notes

- Not built here (contract rule 3 — no `cargo`/`bun` to avoid racing parallel
  agents). After wiring §1–§2, run `cd src-tauri && cargo check` and
  `bun run build`.
- **Windows-only verification** (write compiles cross-platform; behaviour only
  testable on Windows/Parallels):
  - `open_app` name resolution via `cmd /C start "" <name>` (Start-menu /
    App Paths lookup) — confirm common apps (Spotify, Notepad, Slack) launch.
  - `type_text` / `click` via enigo — confirm focus typing and absolute-coord
    clicks land. If input is dropped, try dispatching enigo on the main thread
    (mirror `actions.rs`'s `run_on_main_thread` paste pattern).
- **Cross-platform smoke test now (Mac):** set `ANTHROPIC_API_KEY`, call
  `run_agent_command("search for the best mechanical keyboards")` and watch the
  step card + result events; `open_url` uses `open` on macOS so it works here.
- The tool set is Windows v1's action layer (open_url/open_app/type/click +
  hosted web_search). Screen-context capture (for "why is my render grainy")
  and pixel-accurate guidance belong to Feature E (Snapshot); when it lands,
  add a `describe_screen`/`point` tool to `tools.rs::definitions` + `dispatch`.
  Composio remote actions (Gmail/Slack/Calendar) are Phase B — mergeable into
  the same tool list later (see `../keyfloe-1/docs/AGENT-PLAN.md`).
```
