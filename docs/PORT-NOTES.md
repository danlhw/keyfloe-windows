# Port notes — Mac → Windows

Mapping from the Mac Swift sources (`danlhw/keyfloe`) to the Electron/TS
modules here. Anything outside the three live modes (pill, dictation,
interview, clicky pointer) is deliberately out of MVP scope.

## Direct ports

| Mac (Swift) | Windows (TS) | Notes |
| --- | --- | --- |
| `Net/Endpoints.swift` | `src/shared/endpoints.ts` | Same Worker base URL, identical path layout. |
| `Claude/ClaudeClient.swift` | `src/main/chat.ts` (`ChatRouter`) | Streaming SSE parser, dev-key vs Worker routing, prompt caching all preserved. |
| `Hotkeys/FnTapDetector.swift` | `src/main/hotkey.ts` (`HotkeyMonitor`) | uiohook-napi for low-level keyboard hook; tap vs hold logic identical (300 ms thresholds). |
| `Voice/PushToTalkMonitor.swift` | merged into `hotkey.ts` | One activation key on Windows; no separate PTT chord. |
| `Voice/VoiceSession.swift` | `src/main/dictation.ts` + `src/renderer/audio/MicRecorder.ts` | Renderer captures audio; main orchestrates + pastes via PowerShell SendKeys. |
| `Voice/LocalWhisperClient.swift` | `src/main/transcribe.ts` (Worker path; local CLI TODO) | Falls back to Worker `/v1/transcribe` for MVP. |
| `Voice/WhisperClient.swift` | `src/main/transcribe.ts` | Worker call is the primary path. |
| `Interview/InterviewSession.swift` | `src/main/interview.ts` + `src/renderer/audio/SystemAudioRecorder.ts` | Mic + WASAPI loopback chunked every 4 s; cross-channel mic gate identical. |
| `Interview/SystemAudioCapture.swift` | `SystemAudioRecorder.ts` | Replaces ScreenCaptureKit with Chromium `getDisplayMedia({audio: chromeMediaSource:'desktop'})`. |
| `Pill/PillView.swift` | `src/renderer/views/Pill.tsx` | Glass surface, dot-grid overlay, interview toggle, "How do I answer?" button. |
| `Pill/PillBackground.swift` | `globals.css` `.pill-glass` + `.dot-grid` | `backdrop-filter` as the closest Windows analog to NSVisualEffectView. |
| `Pill/BubbleRow.swift` | `components/BubbleRow.tsx` | iMessage-style accent / surface bubbles. |
| `Pill/MicWaveform.swift` | `components/MicWaveform.tsx` | Same 5-bar waveform driven by RMS level. |
| `Pill/TypingDotsView.swift` | `components/TypingDots.tsx` | Same 3-dot stagger. |
| `Pill/InterviewTranscriptView.swift` | `components/InterviewTranscript.tsx` | Same role-labelled chronological list. |
| `Clicky/OverlayWindow.swift` | `src/main/windows.ts` (`createOverlay`) + `src/renderer/views/Overlay.tsx` | Per-display transparent click-through `BrowserWindow`. |
| `Clicky/CompanionManager.swift` | `src/main/pointer.ts` (`ClickyPointer`) | Inline `[POINT/CLICK]` tag parser + Computer-Use grounded race. |
| `Capture/ScreenCapture.swift` | `WindowManager.captureScreen` | `desktopCapturer` per display under the cursor. |
| `Dashboard/DashboardView.swift` | `src/renderer/views/Dashboard.tsx` | Slimmer — Home / Settings / About only. |
| `Dashboard/Tabs/PermissionsView.swift` | merged into Settings | Windows has no central TCC store. |

## Deliberately deferred (post-MVP)

| Mac feature | Why deferred |
| --- | --- |
| Floe Agent (`Tasks/BackgroundTaskAgent.swift`) | The whole agent loop + 12 skills + AppleScript + Mail/Calendar/Messages drivers. User-confirmed scope: pill / dictation / interview / clicky only. |
| Codex multi-agent runtimes (`Codex/*`) | Out of scope. |
| WhisperKit on-device (`Voice/LocalWhisperClient.swift`) | Worker path is identical end-user behavior. Local CLI path is a roadmap item to drop network latency + cost. |
| Lemon Squeezy / Supabase OTP / paywall | User has direct API key paths exposed in Settings; entitlements gating doesn't apply to the Windows port for now. |
| Tutorial / step auto-continuation | Tied to AX accessibility for click detection; UI Automation port deferred. |
| Skills system + Dashboard tabs (Tasks/Memory/Skills/Profiles/Billing/Dictations/Conversations) | Out of scope for the 3-mode MVP. |

## Windows-specific decisions

- **Activation key default = Right Ctrl.** Windows laptops have an Fn
  key but the EC firmware consumes it before the OS sees it; software
  can't reliably hook it. Configurable in Settings (Right Ctrl, Right
  Alt, CapsLock, F8).
- **System-audio loopback** via Chromium's `chromeMediaSource:'desktop'`
  constraint requires `session.setDisplayMediaRequestHandler` to grant
  `audio: 'loopback'`. Wired up in `src/main/index.ts`.
- **Paste flow** uses PowerShell's `SendKeys.SendWait("^v")` — same
  semantics as the Mac's `CGEventPost(Cmd+V)`, no native add-on needed.
- **Transparency.** Windows has no NSVisualEffectView equivalent at the
  OS level for arbitrary apps; we approximate vibrancy with
  `backdrop-filter: blur(32px) saturate(140%)` on a 78%-opaque dark
  surface. Visually within ~10% of the Mac pill.
- **Tray** lives in the system notification area. Click opens the
  dashboard; right-click for quick toggles + Quit.
