# OSS donor repos for the Keyfloe Windows build

_Researched + license-verified against live GitHub, 2026-07-07. Rule of thumb:
**MIT / Apache-2.0 = we may copy code into Keyfloe (closed-source commercial).
GPL / AGPL / no-license / non-commercial = architecture reference ONLY — read, learn, re-implement, never paste.**_

## ⚠️ THE LANDMINE FIRST: our own base is GPL

This repo is a fork of **Pluely** (`iamsrikanthnani/pluely`, Tauri + React + Rust, ~2.2k★).
Pluely was **MIT until 2025-10-04, then relicensed to GPL-3.0** (commit "Update license from
MIT to GPL-3.0 across all relevant files"). Our fork is based on a post-relicense snapshot →
**shipping Keyfloe Windows closed-source on this base as-is would violate GPL-3.0.**
Upstream is dormant (last commit 2026-01-14) and no forks are ahead of it.

Options (decide before shipping, ideally before building more on top):
1. **Rebase onto Pluely's last MIT commit** (pre-2025-10-04) and re-apply our brand/feature commits.
2. **Re-base the app on an MIT donor** (Handy is the standout — see below) and port our brand layer (it's ~6 commits of CSS/React, portable in a day).
3. Ask the author for a commercial license.

---

## 1 · Dictation (push-to-talk, on-device Whisper, auto-paste)

### Safe to copy (MIT)
| Repo | Stars | Stack | Why it matters |
|---|---|---|---|
| **Handy** — https://github.com/cjpais/Handy | ~25.9k | **Tauri v2 + React + Rust (our exact stack)** | ⭐ TOP PICK. Complete pipeline: `cpal` audio → Silero VAD (`vad-rs`) → whisper.cpp/Parakeet (`transcribe-rs`) → clipboard-swap paste (save clipboard → write text → `enigo` Ctrl+V → restore) with direct-type fallback. `rdev` global shortcut. Very active (v0.9.0, Jul 2026). Their known bug: overlay steals focus and breaks paste → our overlay must be non-activating (WS_EX_NOACTIVATE). |
| **OpenWhispr** — https://github.com/OpenWhispr/openwhispr | ~4.3k | Electron + React | Product/UX reference for the full Wispr-Flow set: agent hotkey, AI actions, model-manager UI. MIT so logic portable. |
| **drajb/whisper-local** — https://github.com/drajb/whisper-local | ~6 | Python | Tiny but the best writeup of Windows text-injection: explicit **SendInput vs clipboard-paste dual strategy** + local-Ollama polish pass. Port the decision logic. |
| **Vibe** — https://github.com/thewh1teagle/vibe | ~6.7k | Tauri | Not dictation (file transcription), but MIT Tauri+whisper.cpp integration code. |

### Reference only
| Repo | License | Note |
|---|---|---|
| **VoiceTypr** — https://github.com/moinulmoin/voicetypr | AGPL-3.0 | Closest commercial-grade stack twin (Tauri+React+Rust, 62% Rust). Study structure only. |
| **Whispering** — https://github.com/epicenter-md/epicenter | app = AGPL-3.0 (toolkit pkgs MIT) | BYOK provider abstraction + transformation UX reference. |
| **WhisperWriter** — https://github.com/savbell/whisper-writer | GPL-3.0, dormant | Steal the SPEC: its four recording modes (continuous / VAD-stop / press-toggle / hold). |
| **TypeWhisper** — https://github.com/TypeWhisper/typewhisper-win | GPL-3.0 (paid commercial available) | Only Windows-native-first (C#/.NET) project; study real-app injection behavior. |

**Rust crates for the hard part (typing into the focused window):** `enigo` (MIT — SendInput with
KEYEVENTF_UNICODE + surrogate-pair handling, sidesteps IME/layout issues), `tauri-plugin-clipboard-manager`,
`transcribe-rs`/`whisper-rs`, `vad-rs`, `cpal`, `rubato`.

---

## 2 · Interview mode (system audio + live answers + invisible to screen share)

### Safe to copy (MIT / Apache)
| Repo | Stars | Stack | Why it matters |
|---|---|---|---|
| **Meetily** — https://github.com/Zackriya-Solutions/meetily | ~19.8k | **Rust + Tauri + Next.js**, MIT | ⭐ Best audio donor: real **WASAPI loopback in Rust via `cpal`** + mic stream + mixing (ducking, clipping prevention) + whisper-rs local STT. Exactly our "hear the interviewer" problem, legally copyable. |
| **Ecoute** — https://github.com/SevaSk/ecoute | ~6k | Python, MIT | The canonical dual-stream design: "You" (mic) vs "Speaker" (loopback) transcribed separately + GPT suggested answers. Port the pattern. |
| **Hyprnote/anarlog** — https://github.com/fastrepl/hyprnote | ~8.8k | Tauri + Rust, MIT | Local-first transcription pipeline + clean Tauri plugin structure. Very active. |
| **OpenCluely** — https://github.com/TechyCSR/OpenCluely | ~376 | Electron, **Apache-2.0** | One of only two permissive STEALTH repos: invisible overlay + streaming STT + answers, hides from Zoom/Meet/Teams/OBS. |
| **Vysper** — https://github.com/varun-singhh/Vysper | ~126 | Electron, **Apache-2.0** | Smaller stealth-overlay reference, borrowable. |

### Reference only
| Repo | License | Note |
|---|---|---|
| **Cheating Daddy** — https://github.com/sohzm/cheating-daddy | GPL-3.0 | ~5.4k★, active. Per-OS audio-capture playbook + "stream audio+frames to one live multimodal model (Gemini Live)" simplification. |
| **Glass (Pickle)** — https://github.com/pickle-com/glass | GPL-3.0 | ~7.6k★. Most polished proactive-answer UX; stale since Oct 2025. |
| **Interview Coder** — https://github.com/ibttf/interview-coder | **NO license** | All rights reserved — legally uncopyable. UX reference for coding interviews. |
| **Natively** — https://github.com/evinjohnn/natively-cluely-ai-assistant | custom NON-commercial | Explicitly bans competing commercial use. |
| **Amurex** | AGPL-3.0 | Worst license for us (network copyleft). |

**Windows specifics:**
- Loopback capture: `wasapi` crate (RustAudio, permissive, has loopback + per-process loopback examples) is the most direct; `cpal` works (Meetily proves it) but loopback has known quirks.
- **Invisibility:** the Win32 call is `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` (Win10 2004+). Tauri's `set_content_protected(true)` wraps it BUT has a known bug (tauri#14189: black box after hide/show). Call it ourselves via the `windows` crate on the raw HWND and re-apply after every hide/show.

---

## 3 · Clicky cursor / computer-use (overlay + screenshot → AI → point/click)

### Safe to copy (MIT / Apache)
| Repo | Stars | Stack | Why it matters |
|---|---|---|---|
| **UI-TARS Desktop** — https://github.com/bytedance/UI-TARS-desktop | ~37.8k | Electron/TS, **Apache-2.0** | ⭐ Best-documented screenshot→point pipeline: `@ui-tars/action-parser` npm package parses `click(start_box='(x,y)')` actions; `README_coordinates.md` documents coordinate normalization. Adopt the grammar/parser design for our [POINT/CLICK] tags. |
| **trycua/cua** — https://github.com/trycua/cua | ~19.4k | Python + **Rust driver**, MIT | ⭐ Best Windows-native execution layer: transparent click-through synthetic-cursor overlay, tiered capture (PrintWindow → Windows.Graphics.Capture → BitBlt), tiered input (UIA → PostMessage → SendInput). Read `blog/inside-windows-computer-use.md`. |
| **PowerToys (MouseUtils)** — https://github.com/microsoft/PowerToys | ~136k | C++, MIT | The reference overlay recipe (`MouseHighlighter.cpp`): `WS_EX_TRANSPARENT \| WS_EX_LAYERED \| WS_EX_NOREDIRECTIONBITMAP \| WS_EX_TOOLWINDOW` + a 10ms timer re-asserting HWND_TOPMOST (other topmost windows WILL bury your overlay). |
| **Anthropic computer-use demo** — https://github.com/anthropics/anthropic-quickstarts (computer-use-demo) | ~9k | Python, MIT | Canonical agent loop + model-resolution↔screen coordinate scaling math. |
| **Self-Operating Computer** — https://github.com/OthersideAI/self-operating-computer | ~10.2k | Python, MIT | The OCR/text-anchor trick: model clicks "by label", code resolves label→coords via OCR map — proven accuracy hack (pairs with our existing OCR bridge). |
| **OpenAdapt** — https://github.com/OpenAdaptAI/OpenAdapt | ~1.6k | Python, MIT | UI-element grounding sub-package + human-confirmation gating for risky actions. |
| **OS-Atlas** — https://github.com/OS-Copilot/OS-Atlas | ~1k | Apache-2.0 (code+models) | Swap-in GUI-grounding vision models if generic VLM pointing is inaccurate. |

### Reference only
- **Overlayed** — https://github.com/overlayeddev/overlayed — AGPL — production Tauri+React click-through overlay on Windows (existence proof + behavior spec).
- **Screenpipe** — https://github.com/mediar-ai/screenpipe — **no longer MIT** (source-available, commercial use requires paid license). Rust/Tauri Windows capture reading material only.
- **AIPointer** — https://github.com/gonemedia/aipointer — BUSL-1.1 — closest product analog to the pill on Windows; UX reference only.

**Build blocks:** Tauri first-party click-through = `transparent+alwaysOnTop+skipTaskbar` window + `set_ignore_cursor_events(true)`. Caveat tauri#6164: it's all-or-nothing per window → use TWO windows (click-through pointer layer + interactive pill). Crates: `xcap` (Apache, capture), `enigo` (MIT, input).

---

## 4 · Shell (pill/chat) + keyboard hooks (tap-vs-hold custom keys)

### Safe to copy (MIT / Apache)
| Repo | Stars | Stack | Why it matters |
|---|---|---|---|
| **Jan** — https://github.com/janhq/jan | ~43.4k | **Tauri + React + Rust**, Apache-2.0 | Biggest permissive Tauri+React codebase: window management, sidecar binaries (llama.cpp), updater, tray, settings architecture. Pattern mine. |
| **kbremap** — https://github.com/timokroeger/kbremap | ~46 | **Rust, MIT/Apache dual** | ⭐ The hook donor: pure-Rust WH_KEYBOARD_LL, key suppression, hold-activated virtual layers — 90% of our tap-vs-hold machinery, in our language, license-clean. Active. |
| **PowerToys Keyboard Manager** — MIT | ~136k | C++ | Battle-tested hook edge cases (injected-event guards, elevation) at `src/modules/keyboardmanager/KeyboardManagerEngineLibrary/`. NOTE: KBM has no tap-vs-hold. |
| **kmonad** — https://github.com/kmonad/kmonad | ~5k | Haskell, **MIT** | Not portable code, but the clearest SPEC of tap/hold/tap-hold-next button semantics. |
| **Flow Launcher** — https://github.com/Flow-Launcher/Flow.Launcher | ~15.1k | C#, MIT | "Summon a topmost input window over any app" done right on Windows. |
| **ueli** — https://github.com/oliverschwendener/ueli | ~4.6k | Electron, MIT | Hotkey-summoned always-on-top window in a webview app. |

### Reference only
- **kanata** — https://github.com/jtroo/kanata — **LGPL-3.0** — gold-standard tap-hold engine; LGPL = don't link into the app; okay as a separate companion process, or re-implement.
- **dual-key-remap** — https://github.com/ililim/dual-key-remap — GPL-2.0 — ~600 lines of C implementing EXACTLY our pattern (tap=X, hold=Y, no leaks, timeout). Clean-room the algorithm.
- **AutoHotkey** — GPL-2.0 — behavior expectations reference.
- **Witsy** — https://github.com/Kochava-Studios/witsy — AGPL — closest feature-map to Keyfloe on Windows (Prompt-Anywhere, selected-text commands, dictation); UX reference.
- **Cherry Studio** — AGPL — provider-switching UX reference.
- **Interception driver** — paid commercial license + abandonware kernel driver — avoid.

**Critical constraint found:** `tauri-plugin-global-shortcut` (RegisterHotKey-based) **cannot register a bare modifier key** (lone Right-Ctrl) and has no tap-vs-hold — Keyfloe's signature gesture is impossible with it. The tap/hold engine must be our own WH_KEYBOARD_LL hook on a dedicated thread with its own message pump (tauri#13919: hooks can miss keys if installed on the webview thread). Keep the plugin only for ordinary combos.

---

## Recommended donor combo (my synthesis)

- **Native dictation core:** lift from **Handy** (MIT, same stack): cpal→VAD→whisper-rs→clipboard-swap paste.
- **Interview audio:** lift **Meetily**'s Rust WASAPI loopback + mixing; dual-stream labeling per **Ecoute**; invisibility = own `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` via `windows` crate (don't trust Tauri's wrapper).
- **Clicky:** two Tauri windows (click-through layer + pill) + PowerToys flag recipe + `xcap` + `enigo`; action grammar per **UI-TARS**; execution gotchas per **cua**.
- **Custom keys:** own Rust WH_KEYBOARD_LL module, plumbing ported from **kbremap**, semantics clean-roomed from dual-key-remap/kanata.
- **Shell:** decide the Pluely GPL question first (top of this doc). If we re-base: Handy as foundation + port our brand layer + rebuild pill UI (referencing Pluely architecture, no copied code).
