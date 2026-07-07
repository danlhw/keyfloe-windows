# Feature D — Interview mode · INTEGRATION

Everything for interview mode lives in two owned folders:

- FE — `src/keyfloe/interview/`
- BE — `src-tauri/src/keyfloe/interview/`

Nothing outside those folders was edited (per the BUILD-PLAN integration
contract). The steps below are what a maintainer must apply to the SHARED files
to wire it up. None of them were done here.

---

## What it does (1:1 with the Mac app)

A translucent, always-on-top overlay window (`interview_overlay`) that is
**invisible to screen sharing**. It captures **both** the mic (you) and
**system/loopback audio** (the interviewer, from Zoom/Meet/Teams), transcribes
each side live through the shared backend, shows a chronological dual transcript
(neutral bubbles + magnet auto-scroll + "Listening" footer + mic waveform +
"interviewer channel off" banner), and on **"How do I answer this?"** streams a
tailored, first-person answer. Pre-interview context (About me / profiles /
résumé docs) tailors the answers — same stores as Mac.

---

## 1. Rust module wiring

`src-tauri/src/keyfloe/mod.rs` does not exist yet (it's the shared parent every
feature agent contributes to). It must declare this feature's module:

```rust
// src-tauri/src/keyfloe/mod.rs
pub mod interview;   // + agent / dictation / keybinding / snapshot as siblings land
```

And `src-tauri/src/lib.rs` must declare the `keyfloe` module once:

```rust
mod keyfloe;
```

## 2. Register commands + managed state (`src-tauri/src/lib.rs`)

Add the interview state to the builder's `.manage(...)` calls (near the other
`app_handle.manage(...)` lines):

```rust
app.manage(keyfloe::interview::InterviewState::default());
```

Add all nine commands to the existing `collect_commands![ … ]` list (they are
`#[specta::specta]`, so they slot into tauri-specta cleanly and regenerate
`bindings.ts` on next build — the FE also works via raw `invoke`, so bindings
are optional):

```rust
keyfloe::interview::interview_start,
keyfloe::interview::interview_stop,
keyfloe::interview::interview_toggle,
keyfloe::interview::interview_is_running,
keyfloe::interview::interview_ask_answer,
keyfloe::interview::interview_ensure_overlay,
keyfloe::interview::interview_set_overlay_visible,
keyfloe::interview::interview_get_context,
keyfloe::interview::interview_save_context,
```

Optionally pre-create the overlay (hidden) in the `.setup(...)` closure so the
first toggle is instant:

```rust
let _ = keyfloe::interview::overlay::ensure_overlay(&app.handle());
```

## 3. Cargo dependency change (`src-tauri/Cargo.toml`)

`reqwest` needs the **multipart** feature (used by `/v1/transcribe`). Change:

```toml
reqwest = { version = "0.12", features = ["json", "stream", "multipart"] }
```

`cpal = "0.16"`, `windows = "0.61"` (with `Win32_UI_WindowsAndMessaging` +
`Win32_Foundation`, both already present), `once_cell`, `futures-util`,
`serde_json` — all already in the manifest. No new crates required.

## 4. Overlay window is a second Vite entry (`vite.config.ts`)

Add the overlay HTML to `build.rollupOptions.input` (next to `main` /
`overlay`):

```ts
input: {
  main: resolve(__dirname, "index.html"),
  overlay: resolve(__dirname, "src/overlay/index.html"),
  interviewOverlay: resolve(__dirname, "src/keyfloe/interview/overlay.html"),
},
```

Without this the `interview_overlay` window 404s in a production build (dev is
fine because Vite serves any file).

## 5. Capabilities (`src-tauri/capabilities/default.json`)

Add the overlay window label so it can `listen`/`invoke`:

```json
"windows": ["main", "recording_overlay", "interview_overlay"],
```

`core:default` (already granted) covers event listen + invoking our own
commands. Context JSON is written by Rust via `std::fs` into the app-data dir,
so no extra `fs:scope` entry is needed.

## 6. Mount the pre-interview panel (dashboard)

`InterviewContextPanel` is exported from `src/keyfloe/interview`. Mount it as a
tab/route in the dashboard (e.g. under a "Me" or "Interview" section in
`Sidebar.tsx` / `App.tsx`). It self-loads and self-persists via the context
commands — no props.

```tsx
import { InterviewContextPanel } from "@/keyfloe/interview";
// …render <InterviewContextPanel /> in the chosen tab
```

## 7. Auth token source (shared with Feature A / login)

`backend.rs::auth_token()` reads the Supabase JWT from `KEYFLOE_ACCESS_TOKEN`
(env) or `<app_data>/keyfloe/auth.json` → `{ "access_token": "…" }`. When the
shell/login feature lands its real session store, point `auth_token()` at it.
Until then, unauthenticated requests fall on the worker's free-tier quota. Dev
escape hatches (no login, no quota) mirror the Mac app: set `ANTHROPIC_API_KEY`
and/or `OPENAI_API_KEY` to hit the providers directly.

## 8. Backend base URL

`backend.rs::api_base()` defaults to the **proven** Cloudflare worker
(`https://oneclick-worker.daniel-leung101.workers.dev`) that the Mac app uses
today for `/v1/transcribe` + `/v1/chat`. The BUILD-PLAN names `keyfloe.com`;
flip the default (or set `KEYFLOE_API_BASE=https://www.keyfloe.com`) once the
Vercel firewall is confirmed not to challenge non-browser `/v1/*` requests
(see the Mac `Endpoints.swift` note). Both `/v1/transcribe` (multipart `file`,
`model=whisper-1`, `response_format=json` → `{ "text" }`) and `/v1/chat`
(Anthropic-passthrough SSE) match the Mac request shapes exactly.

---

## Windows-only code — NEEDS VERIFICATION ON WINDOWS (Parallels)

Written and gated, but cannot compile/run on this Mac:

1. **System-audio loopback** (`audio.rs::start_system`, `#[cfg(windows)]`):
   WASAPI loopback via `cpal::host_from_id(Wasapi).default_output_device()` +
   `build_input_stream` (cpal opens a render endpoint in loopback mode). Verify
   the interviewer's Zoom/Meet/Teams audio is captured on real hardware
   (speakers, AirPods/BT, USB headset). Non-Windows returns an error → the
   session runs mic-only with the banner. Tune `UtteranceChunker::for_system`
   thresholds if quiet interviewers aren't segmented.

2. **Screen-capture invisibility** (`overlay.rs`, `#[cfg(windows)]`):
   `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`, applied on create
   and **re-applied after every show** (Windows can reset it; and Tauri's
   `set_content_protected` is unreliable — tauri#14189). Verify the overlay is
   invisible when sharing in Zoom/Meet/Teams AND that re-showing keeps it
   invisible. If the `windows` crate version bundled by Tauri differs from the
   crate's `0.61`, reconstruct the HWND from `window.hwnd()?.0` to avoid a type
   mismatch.

## Build note

Per the contract I did **not** run `git`, `bun install`, or any build. Verify
after wiring:

- FE: `bun run build`
- Rust (cross-platform bits): `cd src-tauri && cargo check`
  (the module only compiles once steps 1–3 are applied; orphan modules are not
  seen by `cargo check`). The FE `.tsx/.ts` typechecked clean in isolation here.

---

## FE↔BE contract (event + command names)

Events emitted by Rust → consumed in `useInterviewSession.ts` (`EV` in
`types.ts`):
`interview://turns`, `interview://state`, `interview://mic-level`,
`interview://answer-begin|delta|end|error`.

Commands (`CMD` in `types.ts`):
`interview_start|stop|toggle|is_running|ask_answer|ensure_overlay|
set_overlay_visible|get_context|save_context`.
