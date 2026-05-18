# Keyfloe for Windows

Windows port of [danlhw/keyfloe](https://github.com/danlhw/keyfloe), the
native macOS AI companion. Same Cloudflare Worker backend, same Claude /
DeepSeek / Whisper routing. Built on **Electron + React + TypeScript**.

> Voice in, text out. Tap `Right-Ctrl` (configurable) to open a chat pill
> anchored to the cursor; hold `Right-Ctrl` to dictate; toggle Interview
> mode during a call to get a live role-labeled transcript + an
> "answer this" button grounded in your résumé.

## What's included

Three modes ported 1:1 from the Mac app:

1. **Pill chat** — frameless, transparent, glass-styled window anchored
   to the cursor. Multi-turn chat with per-turn screenshot attached;
   Claude streams the reply. Can emit `[POINT: x,y "label"]` or
   `[CLICK: x,y]` tags that drive the cursor overlay.
2. **Push-to-talk dictation** — hold the activation key to record;
   release transcribes via Whisper (Worker or direct OpenAI) and pastes
   into whatever app has focus.
3. **Interview mode** — parallel mic + WASAPI system-audio loopback,
   each chunked every 4 s into the Worker's `/v1/transcribe`. Role-
   labelled chronological transcript with cross-channel mic gating so
   the interviewer's voice through your speakers doesn't get mis-
   labelled "Me". "How do I answer this?" button posts the full
   transcript + résumé to Claude and drops the verbatim answer into the
   chat as an assistant bubble.

## Layout

```
keyfloe-windows/
├── src/
│   ├── main/           Electron main process (hotkey, audio routing,
│   │                   chat, pointer, interview, settings, windows)
│   ├── preload/        contextBridge-exposed IPC surface
│   ├── renderer/       React UI — dashboard, pill, overlay
│   │   ├── views/      Top-level pages (Dashboard, Pill, Overlay)
│   │   ├── components/ BubbleRow, MicWaveform, TypingDots, InterviewTranscript
│   │   ├── audio/      Web Audio capture (Mic + system loopback)
│   │   ├── entries/    Per-window React entry points
│   │   └── styles/     Tailwind + globals
│   └── shared/         Cross-process types + IPC channel names
├── build/              electron-builder assets (icon, tray.png)
├── resources/          Bundled at install time (whisper-models cache)
└── docs/               PORT-NOTES.md mapping Swift files → TS modules
```

## Stack

- **Electron 33** for the desktop shell (frameless transparent windows,
  multi-display overlays, tray)
- **React 18 + Vite 6** for the renderer
- **TypeScript 5.7**
- **Tailwind CSS 3.4** mirroring the Mac `DesignSystem.swift` palette 1:1
- **uiohook-napi** for low-level keyboard hook (matches CGEventTap on Mac)
- **Anthropic Claude** (Sonnet 4.6 / Haiku 4.5) via the shared Worker
- **Whisper** (Worker /v1/transcribe → OpenAI Whisper) for STT
- **Web Audio + AudioWorklet** for renderer-side mic + WASAPI loopback
- **electron-builder** → NSIS installer for Windows x64

## Activation key

Windows laptops have an Fn key, but the embedded controller intercepts
it before the OS sees it, so software hooks can't read it. Defaults to
**Right Ctrl** — closest analog. Switch to Right Alt, CapsLock, or F8 in
Settings.

| Mac                        | Windows                                    |
| -------------------------- | ------------------------------------------ |
| `fn` (tap / hold)          | Right Ctrl (tap / hold)                    |
| `⌃⌥` PTT chord             | (subsumed into the single activation key)  |
| ScreenCaptureKit           | Chromium `getDisplayMedia` loopback        |
| SFSpeechRecognizer         | Worker `/v1/transcribe` (Whisper)          |
| WhisperKit (ANE)           | Worker `/v1/transcribe` (cloud) — local CLI on roadmap |
| AppleScript                | n/a — out of MVP scope                     |
| Bundle `com.onefloe.oneclick` | App ID `com.onefloe.keyfloe`            |

## Develop

```pwsh
npm install
npm run dev            # main + renderer in watch mode
npm start              # launch Electron after a build
npm run package        # NSIS installer in release/
```

Set `ANTHROPIC_API_KEY` in your shell to bypass the Worker and call
Anthropic directly while developing (matches the Mac dev path).

## Status

MVP — the three modes work end-to-end. Local whisper.cpp on-device
fallback, settings persistence for interview résumé, code signing, and
auto-update are tracked in `docs/PORT-NOTES.md`.
