# Keyfloe for Windows — Product Requirements Document & Rebuild Roadmap

_Version 1.0 · 2026-07-13. This document is written to be handed to an AI coding
agent (Claude) together with the existing `keyfloe-windows` repo. It explains
what Keyfloe is, how every part works and why, the exact Windows implementation
for each piece, the open-source donors to build each feature from, the UI down
to the buttons, and the order to build it in. Read it end to end before writing
code._

---

## 0. How to use this document

**Goal:** take the current `keyfloe-windows` repo (Tauri + React + Rust, built on
the MIT **Handy** base) and turn it into a **fully functional Windows app at
feature and UI parity with the shipped macOS app**, then distribute it so a
normal Windows user can install and run it with no friction.

**The single most important fact:** the current Windows build is _not reliably
functional_ because it has only ever been **cross-compiled on a Mac**. Tauri
Windows apps must be **built and tested on real Windows** (the native code —
keyboard hook, system-audio capture, screen-capture exclusion, WebView2 — cannot
be verified from macOS). **The rebuild must happen in a real Windows environment**
(a Windows PC, a Windows VM, or Windows CI such as GitHub Actions `windows-latest`).
Everything else in this document assumes that.

**The macOS app is the design spec.** It is the shipped, working product (Swift).
When in doubt about behavior, layout, or copy, match the Mac app: source at
`../keyfloe-1/app/Sources` (feature folders listed in §4). The two apps are
**separate codebases that share one backend** (the Cloudflare Worker + Stripe +
Supabase). A Pro user is Pro on both.

**Licensing rule for every donor below:** `MIT / Apache-2.0` = may copy code into
Keyfloe (a closed-source commercial app). `GPL / AGPL / LGPL / no-license /
non-commercial` = **architecture reference only** — read, learn, re-implement,
never paste. Full donor list + licenses in `OSS-DONORS.md` (repo root); the most
relevant ones are inline per feature below.

---

## 1. What Keyfloe is (vision & one-liner)

**Keyfloe turns your keyboard into an AI command surface.** Tagline: _"Your
keyboard, supercharged. Press one key. AI handles the rest."_

You assign an ordinary spare key (on Mac it's the `Fn` key; **on Windows it's
`Right-Ctrl`** — see §5.1 for why) to an AI "skill." Then, anywhere in Windows,
in any app:

- **Tap** the key → the **chat pill** appears to ask/answer.
- **Hold** the key → **push-to-talk dictation**: speak, release, and clean text is
  typed into whatever field you were in.
- Assign other keys/skills: **Snapshot** (drag a box over the screen → AI answers
  what's in it), **Floe agent** (speak a task → it does it), **Interview mode**
  (live answers to what an interviewer says, invisible to screen-share).

The product is **desktop-only by necessity** (see §2.3). The differentiator is not
"another chatbot" — it's that AI is reachable **on any key, in any app, without
switching context**, and every AI interaction is logged in one place (the pill).

---

## 2. The core mental model — how & why it works

### 2.1 Product principles (do not violate)
1. **The chat pill is the single visual record of all AI activity.** Every AI
   action (a dictation, a voice command, an answer) mirrors its turn into the
   pill as an iMessage-style bubble, even when triggered hands-free. The pill is
   the app's "log."
2. **Press one key, AI handles the rest.** No launcher, no window-switching. The
   key gesture (tap vs hold) is the whole UX. This is why a normal global-shortcut
   library is not enough (see §5.1).
3. **Hybrid on-device + cloud.** Dictation transcription runs **on-device**
   (whisper.cpp) for privacy/latency/cost ~$0; the AI "polish," answers, agent
   reasoning, and vision run in the **cloud** via the shared Worker. This split is
   deliberate: it keeps the always-on dictation free to serve and the smart
   features centralized/updatable.
4. **Human-in-the-loop for anything risky.** The agent shows steps in the pill and
   confirms destructive actions. Reliability comes from _scope_ (APIs > web
   automation > pixel-clicking), not from a magic "do anything" agent.

### 2.2 Why it works technically (the enabling mechanisms)
- **Global key interception:** a low-level OS keyboard hook sees every keystroke
  system-wide, lets Keyfloe react to a bare key with tap-vs-hold timing, and
  suppress it so it doesn't also type. On Windows this is `SetWindowsHookEx(WH_
  KEYBOARD_LL)`. **This is the mechanism a browser/web app can never have** — a
  web page only receives keys when focused.
- **Type into any app:** after transcription, Keyfloe writes text into the
  currently-focused window of another app. On Windows: restore the previously
  focused window, then inject text via `SendInput` (Unicode) or a
  save-clipboard → paste → restore-clipboard swap.
- **See the screen:** capture the screen (or a dragged region) to a bitmap and send
  it to a vision model. On Windows: `xcap` / Windows.Graphics.Capture / BitBlt.
- **Be invisible in a screen-share (interview mode):** mark the overlay window
  with `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` so Zoom/Meet/Teams/
  OBS capture it as blank while the user still sees it.
- **Hear the other side (interview mode):** capture system audio via **WASAPI
  loopback** in addition to the mic, and transcribe the two streams separately.

### 2.3 Why NOT a web app (settle this permanently)
A browser tab is sandboxed and **cannot**: register a global hotkey (only gets
keys when focused), type into other apps, capture the screen without a per-session
prompt, hide itself from a screen-share (the tab _is_ what's shared), or run
always-on in the background. **Every feature that makes Keyfloe valuable requires
OS-level access.** A "web Keyfloe" would be a neutered chatbot, not the product. A
web app is only worth building as a _complement_ (a marketing demo, the billing/
account portal — which already exists on keyfloe.com).

---

## 3. Architecture

```
┌─────────────────────────── Keyfloe Windows app (this repo) ───────────────────────────┐
│  FRONTEND  (React 18 + Vite + TS)            BACKEND  (Rust, Tauri v2)                  │
│  - Dashboard window (settings/onboarding)    - Global keyboard hook (WH_KEYBOARD_LL)    │
│  - Pill window (chat, always-on-top)         - Dictation: cpal → VAD → whisper.cpp      │
│  - Snapshot overlay window (marquee)         - Interview: WASAPI loopback + mic + STT   │
│  - Interview overlay window (invisible)      - Snapshot: xcap capture                    │
│  - src/keyfloe/<feature>/ per feature        - Input injection: enigo (SendInput)       │
│                                              - src-tauri/src/keyfloe/<feature>/          │
│         └──────────── Tauri IPC (commands + events) ───────────┘                        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ HTTPS (auth = Supabase JWT)
                          ┌──────────────────▼───────────────────┐
                          │   Shared backend (do NOT rebuild)     │
                          │   Cloudflare Worker @ keyfloe.com/v1  │
                          │   /chat /agent /point /transcribe     │
                          │   /deepseek  + Claude routing,        │
                          │   prompt caching                      │
                          │   Auth: Supabase   Billing: Stripe    │
                          └───────────────────────────────────────┘
```

- **Frontend/backend split:** UI is web tech (React) rendered by **WebView2** (the
  Microsoft Edge runtime — see §8.3). OS-level work is Rust. They talk over Tauri
  IPC: the FE calls Rust `#[tauri::command]`s and listens to Rust-emitted events.
- **Windowing:** one hidden-until-summoned **dashboard** window, plus separate
  always-on-top **overlay** windows (pill, snapshot marquee, interview) created
  programmatically in Rust. Overlays must be **non-activating** (`WS_EX_NOACTIVATE`)
  so summoning them doesn't steal focus (which would break paste-into-the-other-app).
- **Backend is shared and already built.** Endpoints: `/v1/chat` (answers),
  `/v1/agent` (Floe), `/v1/point` (vision→coordinates for Clicky), `/v1/transcribe`
  (cloud STT fallback / polish), `/v1/deepseek` (pill brain). Auth = Supabase JWT;
  billing = Stripe. The Windows app must authenticate the same way the Mac app
  does. **Never rebuild the backend.**

---

## 4. Current state of the Windows app (honest inventory)

Built on **Handy** (MIT, cjpais/Handy) which already provides: dictation core
(`cpal` → Silero VAD → whisper.cpp / Parakeet via `transcribe-rs` → clipboard-swap
paste), global shortcuts, tray, settings, updater, i18n, `tauri-specta` typed
bindings. Branch: `rebuild-on-handy`.

Six feature areas are **scaffolded** (folders exist, code compiles) but **not
verified working on Windows** and, in several cases, not fully wired:

| Feature | FE folder | BE folder | State |
|---|---|---|---|
| Shell/brand/dashboard/onboarding/pill | `src/keyfloe/shell/` | (in `src-tauri/src/lib.rs`) | UI renders; brand applied |
| Dictation | `src/keyfloe/dictation/` | `src-tauri/src/keyfloe/dictation/` | Handy core works; AI-polish hook not called; model-download UX not surfaced |
| Interview | `src/keyfloe/interview/` | `src-tauri/src/keyfloe/interview/` | WASAPI + overlay written; unverified |
| Key remap (tap/hold) | `src/keyfloe/keybinding/` | `src-tauri/src/keyfloe/keybinding/` | `hook.rs` (WH_KEYBOARD_LL) + engine written; **key→action dispatch NOT wired to FE**; unverified |
| Floe agent | `src/keyfloe/agent/` | `src-tauri/src/keyfloe/agent/` | Parser/session/tools written; unverified |
| Snapshot AI | `src/keyfloe/snapshot/` | `src-tauri/src/keyfloe/snapshot/` | Overlay + capture written; unverified |

**Known-good:** the app compiles (production build via `tauri build --no-bundle
--runner cargo-xwin`), launches, opens a window titled "Keyfloe", and the onboarding/
dashboard UI renders (verified via a Tauri-runtime mock).

**Known-broken / unverified (the rebuild targets):**
1. **Distribution/trust:** unsigned + Mac-cross-compiled ⇒ Windows/antivirus flags
   it ("inconclusive", won't install). _Real fix: build on Windows + code-sign._
2. **Key → action dispatch:** the hook emits `feature_trigger` events but the FE
   doesn't listen and route them to each feature's start/stop. This is the "press a
   key → something happens" link. **Highest-value wiring task.**
3. **Dictation AI-polish hook** exists (`polish.rs`) but isn't called from the
   recording stop path.
4. **Whisper model download** isn't surfaced in onboarding (dictation needs a model
   present).
5. **Auth/billing** not wired (runs in free/dev mode).
6. All native paths (`#[cfg(windows)]`: WH_KEYBOARD_LL, WASAPI loopback,
   `SetWindowDisplayAffinity`, screen capture) are **written but never run on
   Windows** → expect to debug them once building on real Windows.

The Rust config landmines from the Handy base are already fixed (updater endpoints
repointed off Handy, sign command removed, Handy pink icon replaced with the
Keyfloe stepped-swoosh, window title "Handy"→"Keyfloe", English UI strings
de-Handy'd).

---

## 5. Features — spec, mechanism, Windows implementation, UI, donors

For each feature: **What / How it works / Why / Windows implementation / UI &
buttons / OSS donor / Acceptance.** Mac reference paths are under
`../keyfloe-1/app/Sources`.

### 5.1 ⭐ Custom keyboard remapping — tap/hold "give any key a skill" (THE FLAGSHIP)

**What:** the user assigns skills to spare keys and gestures. Default:
**tap Right-Ctrl → Chat pill**, **hold Right-Ctrl → Dictation**. Users can bind
other keys (Caps Lock, Right-Alt, etc.) to Snapshot / Agent / Interview or to
**custom skills** (a named instruction that runs against the screen).

**How it works / why:** the signature gesture is _tap-vs-hold on a bare key_. This
is impossible with `tauri-plugin-global-shortcut` (RegisterHotKey can't register a
lone modifier and has no tap/hold). So Keyfloe runs **its own low-level keyboard
hook** that sees every key, times press→release to classify tap (<~300 ms) vs hold,
suppresses the bound key so it doesn't also perform its normal function, and emits a
`feature_trigger` event.

**Windows implementation:**
- `SetWindowsHookEx(WH_KEYBOARD_LL, ...)` on a **dedicated thread with its own
  `GetMessageW` message pump** — NOT the WebView thread (tauri#13919: hooks on the
  UI thread silently drop keys). Already scaffolded in
  `src-tauri/src/keyfloe/keybinding/hook.rs` + `engine.rs`.
- Classify: on key-down start a timer; if released before threshold and no other key
  was pressed in between = **tap**; if held past threshold = **hold** (fire "start",
  fire "stop" on release). Chord (another key pressed during hold) disqualifies tap.
- Suppress bound keys by returning non-zero from the hook (they don't pass through).
  Only offer _spare_ keys in the picker (matches Mac; don't let users break Space).
- `Fn` is **not remappable on Windows** — laptop EC firmware intercepts it before
  the OS. Default activation key is **Right-Ctrl** (configurable: Right-Alt, Caps
  Lock, F8).
- Persist bindings to `keybinding.json`; reseed defaults if deleted.
- **Event contract (features B–E depend on it):** emit `feature_trigger` (unified)
  + `<feature>_trigger` (e.g. `dictation_trigger`) with payload
  `{feature, phase: "start"|"stop"|"trigger", gesture: "tap"|"hold", key, is_custom, custom}`.

**UI & buttons (dashboard "Cursor & Keys" tab):** a full Windows keyboard render;
click a key → assign a skill + gesture (tap/hold); "Give any key a skill" flow to
create a custom feature (name + instruction). Mac ref: `Hotkeys/` (`CustomFeatures`,
`FnTapDetector`, `ActivationKey`), `Dashboard/Tabs/KeyboardView.swift`. FE scaffold:
`src/keyfloe/keybinding/KeybindingPanel.tsx`.

**OSS donors:**
- **kbremap** (github.com/timokroeger/kbremap, **MIT/Apache**, Rust) — ⭐ copy: pure-
  Rust WH_KEYBOARD_LL, key suppression, hold-activated layers. ~90% of the machinery.
- **PowerToys Keyboard Manager** (MIT, C++) — hook edge cases (injected-event guards,
  elevation) at `KeyboardManagerEngineLibrary/`.
- Semantics reference (don't copy — GPL/LGPL): **dual-key-remap** (~600 lines of exactly
  tap=X/hold=Y), **kanata**, **kmonad** (clearest tap/hold spec).

**Acceptance:** app launches → log "WH_KEYBOARD_LL hook installed on dedicated
thread"; tap Right-Ctrl fires chat, hold >300 ms fires dictation start, release
fires stop; bound key no longer does its normal thing; unbound keys type with no
latency; chord disqualifies tap; auto-repeat doesn't double-fire; bindings persist.

### 5.2 Dictation — push-to-talk, on-device, auto-paste, AI-polished

**What:** hold the dictation key, speak, release → clean text typed into the focused
app. Text is **AI-polished** (fillers removed, punctuation, app-aware formatting) via
an always-on cloud pass.

**How / why:** transcription is **on-device** (whisper.cpp) for privacy/latency and
~$0 cost; a lightweight cloud pass (Haiku) then polishes/self-corrects. Auto-paste
must land in the _other_ app, so Keyfloe saves the foreground window before recording
and restores focus before typing.

**Windows implementation:** Handy's pipeline is already here: `cpal` capture → Silero
VAD (`vad-rs`) → whisper.cpp (`transcribe-rs`) → paste. Paste = save clipboard → set
text → `enigo` Ctrl+V → restore clipboard, with a direct-`SendInput`-Unicode fallback
(IME/layout-safe). **Windows-specific gap to build:** save/restore foreground window
(`GetForegroundWindow` before record → `SetForegroundWindow` before typing) so text
doesn't land in the Keyfloe pill; the pill must be **`WS_EX_NOACTIVATE`** so
summoning it doesn't steal focus (Handy's known bug). Wire `polish.rs` /
`post_process.rs` into the stop path (currently not called). Surface **model
download** in onboarding.

**UI & buttons:** live-caption overlay while speaking; Settings tab (mic, model,
language, vocabulary, sounds); History tab (past dictations + stats). FE:
`src/keyfloe/dictation/*`. Mac ref: `Voice/DictationPolisher.swift`, `Voice/`.

**OSS donors:** **Handy** (MIT — have it, this is the core). Reference: **OpenWhispr**
(MIT, Wispr-Flow UX), **drajb/whisper-local** (MIT — best Windows SendInput-vs-
clipboard writeup), **WhisperWriter** (spec of the 4 recording modes). Crates: `enigo`,
`transcribe-rs`/`whisper-rs`, `vad-rs`, `cpal`, `rubato`, `tauri-plugin-clipboard-manager`.

**Acceptance:** hold key → speak → release → clean, polished text appears in the
focused app (Notepad/Word/Slack), not in Keyfloe; works with the pill closed.

### 5.3 Snapshot AI — drag a box, get an answer

**What:** press the snapshot key → a dimmed full-screen marquee; drag a box over a
question/error/diagram → the answer streams into the pill.

**How / why:** a region screenshot → vision model → answer. Cheaper/faster than
full-screen and more precise for the user's intent.

**Windows implementation:** a full-screen transparent overlay window for the marquee
(FE: `src/keyfloe/snapshot/SnapshotOverlay.tsx`); capture the region via **`xcap`**
(Apache, Rust) or Windows.Graphics.Capture; POST the image to `/v1/chat` (vision) or
`/v1/point`; stream the answer into the pill. `src-tauri/src/keyfloe/snapshot/mod.rs`.

**UI & buttons:** dim overlay + drag rectangle + size readout; result bubble in the
pill with copy button. Mac ref: `Capture/`, snapshot flow.

**OSS donors:** **UI-TARS Desktop** (Apache — screenshot→action grammar/parser,
`@ui-tars/action-parser`), **Anthropic computer-use-demo** (MIT — model↔screen
coordinate scaling), **xcap** (Apache — capture).

**Acceptance:** key → marquee appears → drag → answer streams into pill; multi-monitor
+ HiDPI coordinates correct.

### 5.4 Floe voice agent — "speak a task, it does it"

**What:** hold the agent key (default candidate: Right-Alt), speak a task
("open youtube.com", "reply to the last email saying I'll be 10 min late"), release →
it runs in the background, showing live step cards in the pill.

**How / why:** speech → task → an agent loop that calls **tools**. Reliability by
scope: **APIs/MCP first** (Composio → Gmail/Slack/Calendar/Notion/Stripe), then
browser automation, then pixel-level computer-use as last resort with human
confirmation. The backend `/v1/agent` already hosts the loop; the Composio proxy is
built (dormant until `COMPOSIO_API_KEY` is set in Vercel).

**Windows implementation:** capture the spoken task (reuse dictation capture); POST to
`/v1/agent`; render streamed step events as cards; execute local tools (`open_url`,
`open_app`) natively. FE: `src/keyfloe/agent/*` (`AgentPill`, `AgentStepCard`,
`AgentReportCard`). BE: `src-tauri/src/keyfloe/agent/` (`parser.rs`, `session.rs`,
`tools.rs`). Mac ref: `Tasks/`, `Voice/AICommandSession.swift`, `Codex/`; spec in
`docs/AGENT-PLAN.md`.

**OSS donors:** **UI-TARS** (Apache — action parser), **trycua/cua** (MIT — Windows
capture/input execution ladders, `blog/inside-windows-computer-use.md`),
**Self-Operating-Computer** (MIT — OCR label→coords trick). Action layer = **Composio**
(commercial API, already chosen). Avoid Open Interpreter (AGPL).

**Acceptance:** hold agent key → "open youtube.com" → browser opens; a screen
question → answer with live step cards; risky actions ask to confirm.

### 5.5 Interview mode — live answers, invisible to screen-share

**What:** during a call/interview, Keyfloe transcribes both sides (you + the
interviewer via system audio), shows suggested answers in an overlay that is
**invisible to Zoom/Meet/Teams/OBS**, using your "About me"/résumé context.

**How / why:** dual-stream (mic = "You", loopback = "Speaker") transcription + an
answer model. The overlay must be visible to the user but excluded from screen
capture — that's the whole point.

**Windows implementation:**
- **Hear the interviewer:** WASAPI **loopback** capture (system audio) + mic, mixed/
  labeled as two streams. Already scaffolded: `src-tauri/src/keyfloe/interview/audio.rs`,
  `session.rs`. Donor: **Meetily** (MIT — real Rust WASAPI loopback + mixing).
- **Invisibility:** call `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` on the
  overlay HWND via the `windows` crate (Win10 2004+). **Do NOT rely on Tauri's
  `set_content_protected`** (tauri#14189: black-box bug); call it directly and
  re-apply after every hide/show. `interview/overlay.rs`.
- Answer overlay window (`InterviewOverlay.tsx` + `overlay.html`), context from
  "About me"/profiles/résumé (`context.rs`, `interviewContextStore.ts`).

**UI & buttons:** context panel (About me, profiles, résumé import); Start/Stop;
live dual transcript; answer bubbles. Mac ref: `Interview/`,
`Pill/InterviewTranscriptView.swift`.

**OSS donors:** **Meetily** (MIT — audio), **Ecoute** (MIT — dual-stream "You"/"Speaker"
design), **OpenCluely** / **Vysper** (Apache — stealth overlay). Crate: `wasapi`
(RustAudio, permissive, has loopback examples).

**Acceptance:** Start → both mic and system audio transcribe on separate channels
(play a video → its speech shows on the interviewer channel); screen-share test in
Zoom → the overlay is **blank** in the shared view but visible locally.

### 5.6 Clicky cursor — computer-use overlay (point/click)

**What:** the AI points/clicks on-screen via a transparent click-through overlay
that draws a synthetic cursor / highlights, parsing `[POINT/CLICK]` tags from the
model.

**How / why:** for "show me where to click" tutorials and agent actions. Needs a
click-through overlay layer over all apps.

**Windows implementation:** **two windows** — a click-through pointer layer
(`transparent + alwaysOnTop + skipTaskbar` + `set_ignore_cursor_events(true)`) and the
interactive pill (tauri#6164: ignore-cursor is all-or-nothing per window). Overlay
must re-assert `HWND_TOPMOST` on a ~10 ms timer (other topmost windows bury it).
Vision→coordinates via `/v1/point`.

**UI & buttons:** animated pointer + highlight ring; follow-along arrows. Mac ref:
`Clicky/OverlayWindow.swift`, `Pointing/`.

**OSS donors:** **PowerToys MouseUtils** (MIT — `MouseHighlighter.cpp` exact overlay
flag recipe: `WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_NOREDIRECTIONBITMAP |
WS_EX_TOOLWINDOW`), **trycua/cua** (MIT — execution ladders), **UI-TARS** (Apache —
action grammar). Crates: `xcap`, `enigo`.

**Acceptance:** overlay is click-through (clicks pass to the app beneath); pointer
lands on the right element on multi-monitor/HiDPI; stays on top.

### 5.7 Shell — window/tray, pill, dashboard, onboarding, brand

**What:** the app frame. A tray icon (always running), a summonable **dashboard**
(Home / Cursor & Keys / Interview / History / Account / Settings), first-run
**onboarding** (teaches the key gestures + permissions), and the **pill** (the
iMessage-style chat log).

**Windows implementation:** dashboard = normal WebView2 window (hidden to tray on
close). Pill/overlays = separate always-on-top, non-activating (`WS_EX_NOACTIVATE`)
windows. Onboarding must cover **Right-Ctrl activation** and Windows permissions
(mic; note: no macOS-style Accessibility/Screen-Recording prompts, but antivirus/
SmartScreen realities). Brand is done: Geist/Fraunces/Departure Mono fonts,
warm-paper `#f5f1ea` / deep-ink `#0b0b0d` palette, gold accent, liquid-glass,
stepped-swoosh logo. FE: `src/keyfloe/shell/*`. Mac ref: `Dashboard/`, `Onboarding/`,
`Pill/BubbleRow.swift`, `Notch/` (→ floating top-center panel; Windows has no notch).

**OSS donors:** **Jan** (Apache, Tauri+React+Rust — window mgmt, tray, updater,
settings architecture), **Flow Launcher** / **ueli** (MIT — summon a topmost input
window over any app). Pill chat UI: rebuild referencing the Mac app (no copied code).

**Acceptance:** tray icon present; summon dashboard from tray/hotkey; onboarding
teaches Right-Ctrl; pill shows bubbles for every AI turn; closing dashboard hides to
tray, doesn't quit.

### 5.8 Account, auth, billing (shared backend)

**What:** sign in (Supabase), Pro gating (Stripe), "Connections" (Composio: Gmail/
Slack/Calendar/Notion/Stripe) at Me → Connections.

**Windows implementation:** authenticate to the Worker with a Supabase JWT exactly as
the Mac app does; store the token securely (Windows Credential Manager via a Rust
crate, not plaintext). Pro status flows from Stripe via the Worker's self-healing
`/me`. Do not rebuild any of this server-side. Mac ref: `Keychain/`, `Net/`, account
UI; site auth already at keyfloe.com.

**Acceptance:** a Pro Mac user signs in on Windows and is Pro; free limits enforced;
Connections OAuth works once `COMPOSIO_API_KEY` is set.

---

## 6. Windows-specific technical playbook (consolidated)

The hard native bits, in one place, with the exact API and the gotcha:

| Need | Win32 / crate | Gotcha (already learned) |
|---|---|---|
| Global bare-key tap/hold | `SetWindowsHookEx(WH_KEYBOARD_LL)` (`windows-sys`) | Must run on a **dedicated thread with a `GetMessageW` pump**, not the WebView thread (tauri#13919). |
| Suppress a bound key | return non-zero from hook proc | Only offer spare keys in the picker. |
| Type into other app | `enigo` (SendInput+Unicode) / clipboard-swap | Save & restore foreground window (`GetForegroundWindow`/`SetForegroundWindow`); pill must be `WS_EX_NOACTIVATE`. |
| System-audio (interview) | **WASAPI loopback** (`wasapi` crate / `cpal`) | Loopback has quirks; Meetily proves `cpal` works. |
| Invisible to screen-share | `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` (`windows` crate) | Don't trust Tauri `set_content_protected` (tauri#14189); call raw, re-apply after hide/show. |
| Screen/region capture | `xcap` (Apache) / Windows.Graphics.Capture / BitBlt | Handle multi-monitor + HiDPI scaling in coordinates. |
| Click-through overlay | `transparent+alwaysOnTop+skipTaskbar` + `set_ignore_cursor_events` | All-or-nothing per window (tauri#6164) → **two windows**; re-assert `HWND_TOPMOST` on a timer. |
| Secure token storage | Windows Credential Manager (`keyring` crate) | Not plaintext files. |
| Render UI | **WebView2** runtime | Required; install via the WebView2 Evergreen bootstrapper in the installer (Win11 has it; many Win10 don't). |
| Whisper backend | `transcribe-cpp` (ggml) | On CI use the Vulkan feature for GPU; if it complicates the first build, CPU-only static is fine (`-DGGML_NATIVE=OFF -DGGML_OPENMP=OFF`). |

---

## 7. Build & distribution (THE thing that has to change)

This is where the current build fails. Do this properly:

### 7.1 Build environment — build ON Windows
- **Do not cross-compile from macOS for release.** It compiles but produces a build
  that AV distrusts and whose native paths can't be verified. Use one of:
  - **GitHub Actions `windows-latest`** (free) — a ready workflow exists at
    `.github/workflows/windows-build.yml` (currently unpushable without the repo
    owner granting the `workflow` OAuth scope: `gh auth refresh -h github.com -s
    workflow`, then push). It carries the Windows gotchas (long paths,
    `CARGO_TARGET_DIR=C:\t` for MAX_PATH, Vulkan SDK, VC++ redist bundling, baseline
    ONNX Runtime).
  - **A Windows PC or a Windows VM** (Parallels on the Mac) — `bun install`, then
    `bun run tauri build` produces a real NSIS/MSI installer natively. Best for
    _testing_ the native features (the hook, loopback, capture) which only a running
    Windows session can validate.
- **Build command (production, correct):** `tauri build` (or `tauri build
  --no-bundle` if bundling on a non-Windows host, which is only a stopgap). Never
  ship a plain `cargo build` binary — it compiles in **dev mode** and loads the dev
  server → "cannot open page" (this exact bug was hit and fixed by switching to
  `tauri build`).

### 7.2 Distribution — make it install like a real app
- **Code-sign the installer and the exe.** This is the single biggest lever for
  "installs as easily as competitors." Options: an OV/EV Authenticode certificate
  (~$100–400/yr) → sign with `signtool`; _or_ ship via the **Microsoft Store** (MSIX)
  which signs for you for free. Store caveat: the global keyboard hook can trip
  Store review (looks like a keylogger) — many keyboard tools ship direct-download +
  signed for this reason.
- **Installer:** Tauri's NSIS installer (built on Windows) — a clean, per-user,
  no-admin install with a WebView2 bootstrapper. (A hand-rolled makensis installer
  and a silent self-extractor were tried from the Mac; a self-extractor that spawns
  child processes is _more_ AV-suspicious — prefer Tauri's real installer built on
  Windows.)
- **Website:** `keyfloe.com/api/download/windows` already exists and redirects to the
  `windows-latest` GitHub release asset. The site's Windows CTA is gated behind the
  `WINDOWS_DOWNLOAD_ENABLED` flag (currently `false` → shows a waitlist). Flip it to
  `true` once there's a signed, working installer.
- **Updates:** Tauri updater — repoint endpoints to the Keyfloe releases and generate
  a Keyfloe signing keypair (the Handy endpoints/pubkey were removed; updater
  artifacts are currently off).

---

## 8. Roadmap / build order

Build in dependency order; verify each on real Windows before moving on.

**Phase 0 — Real Windows build pipeline (unblocks everything).**
Stand up the Windows build (CI `windows-latest` or a Windows VM). Get a signed (or
at least Store/dev-signed) installer that a normal user can install and that _opens
to the onboarding UI_. Acceptance: fresh Windows machine → download → install → app
opens, no "inconclusive"/SmartScreen dead-end.

**Phase 1 — Key engine + dispatch (the core interaction).**
Verify the WH_KEYBOARD_LL hook fires tap/hold; wire `feature_trigger` events to a FE
dispatcher that routes to each feature's start/stop/trigger. Default binds:
tap Right-Ctrl → Chat, hold Right-Ctrl → Dictation. Acceptance: §5.1.

**Phase 2 — Dictation end-to-end.**
Model-download in onboarding; foreground save/restore; wire the AI-polish hook; paste
into other apps with the pill non-activating. Acceptance: §5.2.

**Phase 3 — Auth + Pro + the pill as the AI record.**
Supabase sign-in, Stripe Pro gating, secure token storage; every AI turn mirrors into
the pill. Acceptance: §5.7–5.8.

**Phase 4 — Snapshot AI.** Marquee + capture + stream to pill. Acceptance: §5.3.

**Phase 5 — Interview mode.** WASAPI loopback dual-stream + `WDA_EXCLUDEFROMCAPTURE`
invisibility. Acceptance: §5.5.

**Phase 6 — Floe agent.** Wire `/v1/agent` + Composio; step cards; confirm risky
actions. Acceptance: §5.4.

**Phase 7 — Clicky overlay.** Two-window click-through + `/v1/point`. Acceptance: §5.6.

**Phase 8 — Polish & launch.** Full brand/UI parity pass vs Mac; auto-updater;
flip `WINDOWS_DOWNLOAD_ENABLED = true`.

---

## 9. Instructions for the AI building this

1. **Work on real Windows** (or accept that any Mac build is compile-check only and
   cannot be validated). Phase 0 first — nothing else matters until the app installs
   and opens for a normal user.
2. **The Mac app is the source of truth** for behavior/UI/copy. Diff against
   `../keyfloe-1/app/Sources` per feature. Copy = simple English, no em dashes.
3. **Do not rebuild the backend, auth, or billing** — reuse keyfloe.com/v1/* + Supabase
   + Stripe. Do not invent brand assets — the logo is the stepped-swoosh
   (`src-tauri/icons/`); verify provenance before touching visuals.
4. **Respect licenses** (§0). Copy only MIT/Apache; re-implement GPL/AGPL patterns.
5. **Build additively** — the Handy base + the six `src/keyfloe/<feature>/` folders
   are scaffolded; extend them, don't restart. Each folder has an `INTEGRATION.md`.
6. **Verify each feature against its Acceptance criteria on Windows** before calling
   it done. For native paths, drive the real behavior (press the key, share the
   screen, speak) — not just `cargo check`.
7. **Keep the pill as the single AI record** (product principle #1) and
   **human-in-the-loop for risky agent actions** (#4).

---

## 10. Appendix — donor quick reference (full list in `OSS-DONORS.md`)

**Copy (MIT/Apache):** Handy (dictation core, our base) · kbremap (keyboard hook) ·
Meetily (WASAPI loopback) · UI-TARS Desktop (screenshot→action parser) · trycua/cua
(Windows capture/input execution) · PowerToys (overlay + hook edge cases) · Jan
(Tauri app architecture) · xcap (capture) · enigo (input) · Ecoute (dual-stream
design) · OpenCluely/Vysper (stealth overlay) · Self-Operating-Computer (OCR
label→coords) · Anthropic computer-use-demo (coordinate scaling) · OpenWhispr
(dictation UX).

**Reference only (GPL/AGPL/LGPL/no-license — re-implement, never paste):** kanata,
kmonad, dual-key-remap, AutoHotkey (tap/hold semantics) · Cheating Daddy, Glass,
Interview Coder (interview UX) · Screenpipe, Overlayed, AIPointer (overlay) · VoiceTypr,
Whispering, WhisperWriter (dictation) · Witsy, Cherry Studio (feature-map/provider UX).

**Action layer:** Composio (chosen, commercial API) for Gmail/Slack/Calendar/Notion/
Stripe; browser-use later; avoid Open Interpreter (AGPL).

**Our base landmine:** the repo forked Pluely, which relicensed **MIT→GPL-3.0** on
2025-10-04 — which is why we re-based on **Handy** (MIT). Do not reintroduce
post-relicense Pluely code.

_End of PRD v1.0._
