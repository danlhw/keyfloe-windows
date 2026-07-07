# Feature E — AI Snapshot · Integration

Everything for this feature lives in two owned folders and touches **no** shared
files. To wire it into the app, apply the steps below (all in shared files the
integrator owns).

- FE: `src/keyfloe/snapshot/` — marquee overlay window + result-in-pill wiring
- BE: `src-tauri/src/keyfloe/snapshot/mod.rs` — region capture + vision stream

---

## 1. Rust module registration

`src-tauri/src/keyfloe/` has no `mod.rs` yet (shared across features). Create it
(or append) with:

```rust
// src-tauri/src/keyfloe/mod.rs
pub mod snapshot;
```

And in `src-tauri/src/lib.rs`, add alongside the other `mod` lines:

```rust
mod keyfloe;
```

## 2. Cargo dependencies

Add to `src-tauri/Cargo.toml` `[dependencies]` (all cross-platform; `reqwest`
with `stream` and `futures-util` are already present):

```toml
xcap   = "0.9"        # Apache-2.0 — screen/region capture (Win/Mac/Linux)
                      # (Monitor::all()/capture_image()/is_primary() all return Result)
image  = "0.25"       # crop + JPEG encode
base64 = "0.22"       # image → base64 for the vision payload
```

> `xcap` is cross-platform so `cargo check` succeeds on macOS, but the real
> capture path is only meaningfully verifiable on Windows (see §7).

## 3. Register the Tauri commands

In `src-tauri/src/lib.rs`, add the three commands to **both** the
`tauri_specta` builder (`collect_commands!`) and the runtime
`invoke_handler`/`generate_handler!` (follow whatever pattern the existing
commands use — this repo uses `tauri_specta`, so add to its `collect_commands!`
macro and the generated handler will include them):

```rust
keyfloe::snapshot::snapshot_begin,
keyfloe::snapshot::snapshot_cancel,
keyfloe::snapshot::snapshot_capture_region,
```

They are annotated with `#[tauri::command]` + `#[specta::specta]`, so
`bindings.ts` will regenerate typed wrappers. The FE currently calls them by
name via `invoke(...)`, so this works even before `bindings.ts` is regenerated.

## 4. Frontend overlay window entry (Vite)

The overlay is its own webview page. Add it as a Vite input in `vite.config.ts`
next to `overlay`:

```ts
input: {
  main: resolve(__dirname, "index.html"),
  overlay: resolve(__dirname, "src/overlay/index.html"),
  snapshot_overlay: resolve(__dirname, "src/keyfloe/snapshot/overlay.html"),
},
```

No `tauri.conf.json` change is needed — the overlay window is created at runtime
by `snapshot_begin` via `WebviewWindowBuilder` (label `snapshot_overlay`, URL
`src/keyfloe/snapshot/overlay.html`), mirroring how `overlay.rs` builds the
recording overlay.

## 5. Capabilities

The overlay window needs the default core permissions (event listen, window
hide, invoke). Add its label to `src-tauri/capabilities/default.json`:

```json
"windows": ["main", "recording_overlay", "snapshot_overlay"],
```

`core:default` already covers `invoke`, `core:event:allow-listen`, and window
show/hide used by the overlay + result hook. No new permission identifiers.

## 6. Bind the Snapshot key

Route a `snapshot` shortcut binding to `snapshot_begin`. Two options:

**A. ACTION_MAP entry (matches the existing pattern in `actions.rs`).** Add a
small action and register it:

```rust
struct SnapshotAction;
impl ShortcutAction for SnapshotAction {
    fn start(&self, app: &AppHandle, _id: &str, _s: &str) {
        let _ = crate::keyfloe::snapshot::snapshot_begin(app.clone());
    }
    fn stop(&self, _app: &AppHandle, _id: &str, _s: &str) {}
}
// in ACTION_MAP:
map.insert("snapshot".to_string(), Arc::new(SnapshotAction) as Arc<dyn ShortcutAction>);
```

Then add a default binding for id `"snapshot"` to the settings key map (a single
press — `start` on key-down is enough; the overlay itself is the modal step).

**B. FE button / menu.** Call `beginSnapshot()` from
`src/keyfloe/snapshot/useSnapshot.ts` anywhere in the shell (e.g. a "Snapshot"
button), which `invoke("snapshot_begin")`.

## 7. Result in the pill

The pill is the single visual log; the answer should render there. Wire it with
the hook (no shared-file edits needed beyond mounting it):

```tsx
import { useSnapshot } from "@/keyfloe/snapshot/useSnapshot";
// inside the pill component:
const snap = useSnapshot(); // { status, answer, error, quota }
// render snap.answer as the streaming assistant turn.
```

Until the shared pill exists, `SnapshotResult.tsx` is a drop-in self-contained
surface that renders the streamed answer (mount it anywhere; it renders nothing
while idle).

### Backend → FE events (already emitted by `mod.rs`)

| Event                          | Payload                       | Meaning                    |
| ------------------------------ | ----------------------------- | -------------------------- |
| `keyfloe://snapshot-started`   | `()`                          | capture began (pulse)      |
| `keyfloe://snapshot-chunk`     | `string` (full running text)  | streaming answer           |
| `keyfloe://snapshot-done`      | `string` (final text)         | finished                   |
| `keyfloe://snapshot-error`     | `{ message, quota }`          | failed (quota = 402/429)   |

## 8. Backend endpoint + auth

Uses the shared backend, no rebuild:

- Default (SaaS): `POST https://keyfloe.com/v1/chat` — Anthropic Messages body,
  streaming SSE, header `x-oneclick-feature: snapshot`. Body shape is identical
  to the Mac `ClaudeClient` vision request (image block + text prompt + cached
  system prompt).
- Dev: set `ANTHROPIC_API_KEY` in the env → goes straight to
  `api.anthropic.com` (bypasses the worker, for local testing).

**Auth is stubbed.** `auth_bearer()` / `device_id()` in `mod.rs` currently read
`KEYFLOE_JWT` / `KEYFLOE_DEVICE_ID` env vars as placeholders. When the
shell/auth agent lands a shared Supabase JWT + device-id (needed by dictation +
agent too), replace those two functions to read from that shared state. Until
then the worker's free-tier (device-id) path still answers.

---

## Windows-verification checklist (can't be tested on this Mac)

Written and `#[cfg(windows)]`-flagged where Windows-specific; verify on Parallels:

1. **Overlay covers everything.** `snapshot_begin` opens a transparent
   full-screen window; on Windows it calls `set_fullscreen(true)` so it also
   covers the taskbar. Confirm it renders above all apps and is click-through
   only where intended (the whole surface is interactive during selection).
2. **Marquee gesture.** Drag draws the dashed box with the dim wash punched out;
   Esc cancels; a sub-8px drag cancels.
3. **Screenshot excludes the overlay.** The FE hides the window *before*
   `snapshot_capture_region`; confirm the dim/marquee never appear in the crop.
4. **HiDPI / scaling.** The FE sends physical pixels (`cssRect * devicePixelRatio`).
   Verify the crop matches the drawn box at 100%, 125%, 150%, 200% display
   scaling. If off, the `devicePixelRatio` multiply in `SnapshotOverlay.finish`
   or the monitor pick in `capture_region_jpeg` is the place to adjust.
5. **Multi-monitor.** v1 captures the primary monitor (or the overlay's current
   monitor). Selecting on a secondary monitor may need the FE to pass
   `rect.monitor` (index into `xcap::Monitor::all()`). Verify + wire if needed.
6. **Answer streams into the pill** via the four events above.
7. **Quota path.** A 402/429 from the worker surfaces `snapshot-error` with
   `quota: true` → upgrade nudge.

## Build note

Per BUILD-PLAN.md I did not run `git`, `bun install`, or `bun run build`
(parallel runs race). After the steps above: `bun install` (new npm deps? none —
only Cargo), `cd src-tauri && cargo check`, then `bun run build`.
