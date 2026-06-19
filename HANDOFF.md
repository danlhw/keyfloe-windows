# Keyfloe Windows — Handoff / Resume Guide

_Last updated: 2026-06-19. Read this first, then continue the 1:1 build._

The Windows app (this repo: **Tauri + React + Rust**, forked from Pluely, rebranded to
Keyfloe) is being made into a **1:1 replica of the Mac app** (Swift, repo `keyfloe-1` —
read it as the design reference; the two apps share only the backend, not code).

## How to resume (the fast path)
1. Ideally run Claude Code **on Windows** (e.g. inside Parallels) so it can build, run, and
   test the app itself. (You can also build on a Mac for compile-checks, but the native
   features can only be *verified* on Windows.)
2. Open this repo and say: **"Read HANDOFF.md and continue the Keyfloe Windows 1:1 build."**
3. Mac reference to replicate: `../keyfloe-1/app/Sources` (or clone `danlhw/keyfloe`).
4. Commands: install `npm install`; run/test `npm run tauri dev`; frontend-only check
   `npx vite build`; Rust check `cd src-tauri && cargo check`.

## ✅ Done — brand "look" pass (shipped on `main`, 6 commits)
- **Brand layer** (`src/global.css`): Geist/Fraunces/Departure Mono fonts (in `public/fonts`),
  warm-paper `#f5f1ea` / deep-ink `#0b0b0d` palette mapped onto every shadcn var (`:root` +
  `.dark`), liquid-glass cards/popovers, `.kf-app-bg` dark aurora on the dashboard,
  `.kf-display`/`.kf-eyebrow` helpers.
- **Editorial sidebar** (`src/components/Sidebar.tsx`): uppercase tracked nav, gold active.
- **Nav cleaned** (`src/hooks/useMenuItems.tsx`): removed Pluely dev tabs (System prompts /
  Responses / Dev space), relabeled to Mac tabs (Home / Conversations / Screenshot / Audio /
  Cursor & Keys / Settings); dropped Buy-Me-a-Coffee.
- **Rounded glass pill** (`src/pages/app/index.tsx`); window title fixed (`index.html`).
- **Native auto-paste primitive**: Rust `type_text` command via `enigo` (`src-tauri/src/lib.rs`,
  registered in `invoke_handler`) + `pasteText()` helper (`src/lib/paste.ts`).
- Version synced to `0.1.12` (`tauri.conf.json`).

## 🔜 To do for full 1:1 (each needs Windows to verify)
1. **Auto-paste dictation wiring** — the pill mic (`src/pages/app/components/completion/
   AutoSpeechVad.tsx`) currently `submit()`s the transcript to AI chat. Add a dictation mode
   that, after transcription, restores the previously-focused window then calls `type_text`.
   ⚠️ Needs a Windows foreground-window save/restore (`GetForegroundWindow` before record →
   `SetForegroundWindow` before typing) — add a Rust command for it; otherwise it types into
   the Keyfloe pill, not the user's app.
2. **Push-to-talk + custom keyboard** (the Mac flagship) — low-level keyboard hook
   (`SetWindowsHookEx WH_KEYBOARD_LL`) for modifier tap-vs-hold; then the 6-key Tap/Hold
   assignment UI. Mac ref: `keyfloe-1/app/Sources/Dashboard/Tabs/KeyboardView.swift`, `Hotkeys/`.
3. **Pill → iMessage bubbles** — currently a results panel. Mac ref: `Pill/BubbleRow.swift`.
4. **Interview mode** — dual-channel live transcript (mic + WASAPI loopback already in
   `src-tauri/src/speaker/`). Mac ref: `Interview/`.
5. **Clicky overlay** — `WS_EX_TRANSPARENT | WS_EX_LAYERED` click-through window + point/highlight
   tag parsing. Mac ref: `Clicky/OverlayWindow.swift`.
6. **Onboarding wizard** — none exists. Mac ref: `Onboarding/`.
7. **Dashboard tab parity** (Home / Keyboard / Clipboard / Conversations) + retire leftover dev
   pages (`/system-prompts`, `/dev-space`, `/responses` routes still exist, just unlisted).
8. **Auto-updater** — `tauri.conf.json` `updater.endpoints` + `pubkey` are empty; configure +
   a Windows code-signing cert (~$100–250/yr) so installs are clean.

## Key facts
- Mac = Swift (read-only design reference). Windows = Tauri/React/Rust (this repo). Separate
  repos by design; they share only the backend API.
- `cargo` + `node` work on the Mac for compile-checks; build/run/test the actual app needs Windows.
- Decision 2026-06-19: paused here (brand look done) to focus on the Mac app + marketing where
  users come from now; resume Windows when there's traction / a Windows machine / help.
