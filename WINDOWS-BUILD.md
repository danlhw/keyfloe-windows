# Building & testing Keyfloe on your Windows laptop

The app is built on the **Handy** (MIT) base, rebranded to Keyfloe, with six
features layered on: dictation, the Floe voice agent, interview mode, AI
snapshot, and tap/hold key remapping. This is the `rebuild-on-handy` branch.

## One-time setup on Windows
1. Install **Rust** (https://rustup.rs) — the MSVC toolchain (default on Windows).
2. Install **Bun** (https://bun.sh) — `powershell -c "irm bun.sh/install.ps1 | iex"`.
3. Install the **Visual Studio C++ Build Tools** (Desktop development with C++)
   and **WebView2** (preinstalled on Win 10/11).
4. Clone + checkout:
   ```powershell
   git clone https://github.com/danlhw/keyfloe-windows.git
   cd keyfloe-windows
   git checkout rebuild-on-handy
   bun install
   ```

## Run it (dev)
```powershell
bun run tauri dev
```
First run compiles the Rust backend (a few minutes) then launches the app.

## Build an installer (.msi / .exe)
```powershell
bun run tauri build
```
Output lands in `src-tauri/target/release/bundle/`.

## What to test (the native pieces that can only be verified on Windows)
These compile cross-platform but only *work* on Windows — this is the real
verification pass. Tick as you go:

### Key remapping (Feature F) — the foundation the others trigger from
- [ ] App launches; the tap/hold hook installs (look for
      `WH_KEYBOARD_LL hook installed` in the log).
- [ ] Cursor & Keys tab: assign **tap Right-Ctrl → Chat**, **hold Right-Ctrl → Dictation**.
- [ ] Tap Right-Ctrl fires chat; hold >300ms fires dictation; release stops it.
- [ ] A bound key no longer performs its normal Windows function (expected).
- [ ] Unbound keys type normally with no latency.

### Dictation (Feature B)
- [ ] Hold your dictation key, speak, release → clean text is pasted into the
      **focused app** (not the Keyfloe window).
- [ ] Text is AI-polished (fillers removed, app-aware formatting).

### AI Snapshot (Feature E)
- [ ] Press the snapshot key → a dim full-screen marquee appears.
- [ ] Drag a box over a question/error → the answer streams into the pill.

### Interview mode (Feature D)
- [ ] Add "About me" context, Start interview.
- [ ] The overlay captures **both** your mic and system audio (play a video —
      its speech should transcribe on the interviewer channel).
- [ ] Screen-share test: share your screen in Zoom/Meet — the interview overlay
      must be **invisible** in the shared view (SetWindowDisplayAffinity).

### Floe voice agent (Feature C)
- [ ] Hold the agent key, speak "open youtube.com" → the browser opens.
- [ ] Speak a question about the screen → an answer with live step cards.

## Known gaps to expect on this first build (not yet wired)
- **Auth/billing**: no sign-in yet, so the shared backend runs in free/dev mode.
  For dev, set `ANTHROPIC_API_KEY` in the environment to hit Anthropic directly.
- **Onboarding-complete persistence**: flows through the settings store; a
  dedicated Rust persister is a follow-up (onboarding may re-show until then).
- **Model download**: Handy's whisper model download UX isn't surfaced in the
  Keyfloe onboarding yet — dictation needs a model present.

Report back which boxes fail and I'll fix them.
