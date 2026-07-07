# Feature A — shell integration (brand + dashboard + onboarding + pill)

Everything here lives under `src/keyfloe/shell/` and is presentational. No
shared files were touched. To wire it up, App.tsx (and the pill window entry)
mount these components and pass in the live data/callbacks.

## 1. One-time CSS import
Add to the app entry (e.g. `src/main.tsx` or `src/App.tsx`), once:
```ts
import "./keyfloe/shell/keyfloe.css";
```
This registers the brand fonts (bundled under `shell/fonts/`), the `kf-*`
design-system classes, and the warm-paper/deep-ink theme tokens. It is fully
prefixed (`kf-`) so it never collides with Handy's Tailwind tokens.

Theme: follows the OS by default. Force with the `theme` prop on
`<KeyfloeDashboard theme="light|dark" />`, or add class `kf-light` / `kf-dark`
to any `.kf-root` element.

## 2. Routes / tabs App.tsx must mount
App.tsx currently renders `AccessibilityOnboarding` → `Onboarding` (model) →
main app with Handy's `<Sidebar>`. Replace those three surfaces with ours:

| Surface | Mount | Notes |
|---|---|---|
| First run | `<KeyfloeOnboarding perms={…} onFinish={…} />` | Replaces `AccessibilityOnboarding` + model `Onboarding`. Full 7-step flow. |
| Main window | `<KeyfloeDashboard tab onTab account slots … />` | Replaces the `<Sidebar>` + `renderSettingsContent` block. |
| Pill window | `<KeyfloePill mode messages idleLabel />` | New always-on-top transparent window (see §5). |

`KeyfloeDashboard` tabs (match the Mac app): **Home, History, Cursor & Keys,
Interview, Account, Settings**. It self-manages tab state if you omit
`tab`/`onTab`.

### Injecting feature content (agents B–F)
Each tab takes an optional `slot` so other agents drop in live UI without
touching this folder:
```tsx
<KeyfloeDashboard
  account={account}
  slots={{
    history: <DictationHistory/>,     // feature B
    keys: <KeyRemapper/>,             // feature F
    interview: <InterviewPanel/>,     // feature D
    settings: <HandySettingsPanels/>, // reuse Handy's existing settings
    account: <RealSignInForm/>,       // web auth (Supabase)
    interviewProfile: <ProfileCard/>, // feature D — Home card
  }}
/>
```
Without a slot, each tab shows a branded placeholder so the shell is
previewable today. Home's key-binder + keyboard render from `keyActions.ts`
(the shipped defaults) with no backend needed.

## 3. Onboarding permission wiring
`<KeyfloeOnboarding>` is presentational; pass a `perms` object so the buttons
reflect + request real permissions. On Windows the relevant checks already
exist in the Handy backend (`getWindowsMicrophonePermissionStatus`, etc.):
```ts
perms={{
  micGranted, speechGranted, accessibilityGranted, screenGranted,
  requestVoice: () => commands.…,           // mic + speech
  requestAccessibility: () => commands.…,   // input monitoring
  requestScreen: () => commands.…,          // screen capture (Snapshot)
}}
```
All fields are optional — omitted → the button reads "Skip for now" and just
advances. `onFinish` should persist the completed flag and reveal the main
window (equivalent to the Mac `onboarding_completed` setting).

## 4. Account / sign-in
`AccountTab` (and Home's auth chip) take an `account` object and
`onSignIn`/`onSignOut`. The real sign-in form (Supabase, shared with Mac +
site) is NOT in this folder — pass it via `slots.account`, or wire the
callbacks to your auth store. Shape:
```ts
account: { email?, plan?, unlimited?, usedToday?, dailyLimit? }
```

## 5. Pill window (new)
The pill is the single visual log of AI activity. It needs its own Tauri
window — transparent, always-on-top, no decorations, click-through when idle.
Handy already ships an overlay window (`src-tauri/src/overlay.rs`,
`src/overlay/`); the pill can either reuse/extend that or get a new
`WebviewWindow`. Assumed host responsibilities (NOT built here):

- A `pill` window loading a route that renders `<KeyfloePill>`.
- Feed messages in via a Tauri event (e.g. `pill://message`) or a shared
  store; `PillMessage[]` shape is exported from `./Pill`.
- Toggle `mode` between `"idle"` (collapsed KEYFLOE chip) and `"open"`
  (transcript) from the activation key.

`<KeyfloePill>` renders only the glass chrome + bubbles; it does not own the
window, positioning, or click-through.

## 6. New assets added (inside this folder — no external dirs touched)
- `shell/fonts/` — Geist, Fraunces (roman + italic), Departure Mono (copied
  from the Mac app Resources; the exact brand fonts).
- `shell/assets/logo-mark-black.png` / `logo-mark-white.png` — THE Keyfloe
  stepped-swoosh mark (copied from `site/public`). Do not substitute.

## 7. Dependencies
- **No new npm deps.** Uses React only. Icons are text glyphs (no icon lib)
  to stay dependency-free; swap to `lucide-react` (already in Handy) later if
  desired.
- **No new Tauri commands or settings are required by this folder.** The
  optional `perms`/`account`/`slots`/callback props are how the host supplies
  everything. Suggested (host-owned) additions when wiring:
  - reuse existing `getAppSettings` / `onboarding_completed` for first-run gate.
  - a pill window + a `pill` message event (§5).

## 8. Build note
Not built here (per the parallel-work rule — no `bun run build`). After
merging, run `bun run build` once. TS note: PNG imports rely on the
`vite/client` types already referenced in `src/vite-env.d.ts` — no extra
declaration needed.
