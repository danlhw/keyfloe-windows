# Keyfloe Windows — build plan (rebuild-on-Handy)

Foundation: **cjpais/Handy** (MIT, Tauri 2 + React 18 + Rust), rebranded to Keyfloe.
Goal: 1:1 feature + UX parity with the Mac app (`../keyfloe-1/app/Sources`), sharing the
same backend (keyfloe.com `/v1/*` endpoints) and Stripe/Supabase accounts.

## What Handy already gives us (don't rebuild)
- Dictation core: `cpal` audio → Silero VAD (`vad-rs`) → whisper.cpp (`transcribe-rs`) → paste
  (`src-tauri/src/clipboard.rs`, `input.rs`, `transcription_coordinator.rs`).
- Global shortcuts (`src-tauri/src/shortcut/`, `rdev` + `tauri-plugin-global-shortcut`).
- LLM client (`src-tauri/src/llm_client.rs`), overlay (`overlay.rs`), tray, settings
  (`settings.rs`), typed FE↔BE bindings via `tauri-specta` (`src/bindings.ts`).
- Frontend shell: `src/App.tsx`, `components/`, `stores/`, `hooks/`, `styles/`, i18n.

## Feature ownership (each agent owns ONE, in an isolated folder)
| Feature | FE folder | BE folder | Primary donor | Mac reference |
|---|---|---|---|---|
| A. Brand + shell + dashboard/panel + onboarding | `src/keyfloe/shell/` | — | Jan (Apache) patterns | `Dashboard/`, `Onboarding/`, site brand |
| B. Dictation parity (smart polish, keyboard UX) | `src/keyfloe/dictation/` | `src-tauri/src/keyfloe/dictation/` | Handy (have it) + OpenWhispr | `Voice/DictationPolisher.swift` etc. |
| C. Voice command / Floe agent | `src/keyfloe/agent/` | `src-tauri/src/keyfloe/agent/` | UI-TARS parser, trycua/cua | `Tasks/`, `Voice/AICommandSession.swift`, `Codex/` |
| D. Interview mode | `src/keyfloe/interview/` | `src-tauri/src/keyfloe/interview/` | Meetily (WASAPI loopback), Ecoute | `Interview/`, `Pill/InterviewTranscriptView.swift` |
| E. Snapshot AI | `src/keyfloe/snapshot/` | `src-tauri/src/keyfloe/snapshot/` | UI-TARS, self-operating-computer | `Capture/`, `Pointing/`, snapshot flow |
| F. Key remapping (tap/hold custom keys) | `src/keyfloe/keybinding/` | `src-tauri/src/keyfloe/keybinding/` | kbremap (MIT), PowerToys KBM | `Hotkeys/` (CustomFeatures, FnTapDetector, ActivationKey) |

## Integration contract (agents follow this — keeps parallel work collision-free)
1. Create code ONLY inside your owned folder(s) above.
2. Do NOT edit shared files: `src/App.tsx`, `src-tauri/src/lib.rs`, `settings.rs`,
   `tauri.conf.json`, `capabilities/`, `bindings.ts`. Instead append your needs to
   `src/keyfloe/<feature>/INTEGRATION.md`: new Tauri commands to register, routes/tabs to
   add, settings fields, capabilities/permissions, npm/cargo deps.
3. Do NOT run `git`, `bun install`, or `bun run build` (parallel runs race). Leave a build note.
4. Windows-native code (WASAPI loopback, WH_KEYBOARD_LL hook, SetWindowDisplayAffinity,
   click-through overlay) can't compile on this Mac — write it, mark it `#[cfg(windows)]`,
   and note in INTEGRATION.md that it needs Windows verification.

## Backend (shared with Mac — do NOT rebuild)
`keyfloe.com/v1/chat`, `/v1/agent`, `/v1/point`, `/v1/deepseek`, `/v1/transcribe`.
Auth = Supabase; billing = Stripe (a Pro user is Pro on both platforms).

## Verification (per HANDOFF.md)
Frontend: `bun run build`. Rust (cross-platform bits): `cd src-tauri && cargo check`.
Native features: only verifiable on Windows (Parallels) — checklist per milestone.
