# Feature F — keybinding (FRONTEND) — INTEGRATION

Owner folder: `src/keyfloe/keybinding/`. The visual keyboard binding UI + custom
feature builder. Nothing here edits shared files; wire it up with the steps
below. Backend contract lives in
`src-tauri/src/keyfloe/keybinding/INTEGRATION.md`.

## Files

| File | Purpose |
|---|---|
| `types.ts` | TS mirror of the Rust model (hand-written; NOT from `bindings.ts`). |
| `features.ts` | Built-in feature catalog (title/blurb/icon/continuous) + custom icon choices. |
| `layout.ts` | Windows keyboard layout data + friendly key labels. |
| `api.ts` | `invoke`-based wrapper over the Rust commands + `keybinding_capture` listener. |
| `useKeybindings.ts` | Zustand store (config + meta + mutations). |
| `KeybindingPanel.tsx` | Top-level tab (exported from `index.ts`). |
| `components/KeyboardView.tsx` | Renders the interactive keyboard. |
| `components/KeyCap.tsx` | One key cap (shows tap/hold badges, glow when bound). |
| `components/AssignSheet.tsx` | Click-a-key dialog: pick tap/hold action, handles conflicts. |
| `components/CustomFeaturesManager.tsx` | Create/edit/delete custom features (cap 5). |
| `components/actionMeta.tsx` | Resolve an `ActionRef` → label/icon. |

## 1. Mount the tab (shared file — `src/App.tsx` + `src/components/Sidebar.tsx`)

This feature does NOT edit `App.tsx`, `Sidebar.tsx`, or `bindings.ts`. To surface
the panel, the shell owner (Feature A) adds a sidebar section. Example:

```tsx
// src/components/Sidebar.tsx — add to SECTIONS_CONFIG
import { KeybindingPanel } from "@/keyfloe/keybinding";
// ...
keyboard: {
  label: "Keyboard",
  icon: Keyboard,          // lucide
  component: KeybindingPanel,
},
```

`App.tsx`'s `renderSettingsContent` already renders
`SECTIONS_CONFIG[section].component`, so no App.tsx change is needed beyond the
section entry. The panel is self-contained: it calls `useKeybindings().load()`
on mount.

Public exports (from `src/keyfloe/keybinding/index.ts`):

```ts
import {
  KeybindingPanel,   // the tab component
  useKeybindings,    // zustand store
  keybindingApi,     // raw command wrappers
} from "@/keyfloe/keybinding";
```

## 2. Commands consumed (must be registered in lib.rs — see BE doc)

The FE calls these via `@tauri-apps/api/core` `invoke` (camelCase args):

- `keybinding_get_config` → `KeybindingConfig`
- `keybinding_get_meta` → `KeybindingMeta`
- `keybinding_assign({ keyId, gesture, action, force })` → `AssignResult`
- `keybinding_clear({ keyId, gesture })`
- `keybinding_reset_key({ keyId })`
- `keybinding_reset_all()`
- `keybinding_save_custom_feature({ feature })`
- `keybinding_delete_custom_feature({ id })`
- `keybinding_start_capture()` / `keybinding_stop_capture()`

Because we use raw `invoke` (not the generated `bindings.ts`), no `bindings.ts`
regeneration is required for the UI to work. If the shell owner later regenerates
`bindings.ts` after registering the commands (step 2 of the BE doc), the types
stay compatible with `types.ts`.

## 3. Events consumed / relevant

- `keybinding_capture` (payload: `string` keyId) — optional physical-key capture
  while `keybinding_start_capture` is active. The primary UX is clicking the
  on-screen keyboard, so this is optional.
- The panel does NOT consume `feature_trigger` events — those are for downstream
  features B/C/D/E. See the BE doc for that contract.

## 4. Capabilities / permissions (shared `src-tauri/capabilities/`)

The commands and events must be allowed for the main window. Feature A / shell
owner adds to the main capability set (e.g. `capabilities/default.json`):

```jsonc
{
  "permissions": [
    "core:event:allow-listen",   // usually already present
    // no extra core perms needed — custom commands are allowed by default
  ]
}
```

Custom `#[tauri::command]`s are callable without an explicit ACL entry in Tauri 2
as long as the app's invoke handler includes them; only the `core:event` listen
permission (typically already granted) is needed for `keybinding_capture` /
`feature_trigger`. No new plugin permissions are required.

## 5. Styling notes

- Uses existing Tailwind theme tokens: `logo-primary`, `mid-gray`, `text`,
  `background`, `background-ui` (from `src/styles/theme.css`).
- Reuses shared UI primitives: `@/components/ui/Dialog`, `@/components/ui/Button`,
  `@/components/ui/Input` (read-only imports; no edits).
- The bound-key glow animation is injected locally via a `<style>` tag in
  `KeyboardView.tsx` (class `keyfloe-key-glow`) so no shared CSS is edited.
- i18n: strings are currently inline English. If the shell wants them localized,
  add a `settings.keyboard.*` namespace to `src/i18n/locales/*` and swap literals
  for `t(...)` — not required to ship.

## 6. Build note

Do NOT run `bun install` / `bun run build` (parallel-run race per BUILD-PLAN).
No new npm deps were added — only `lucide-react`, `zustand`,
`@tauri-apps/api` (all already in the project). Verify with `bun run build`
during integration.

## 7. UX summary (parity with Mac KeyboardView)

- A rendered Windows keyboard; only assignable keys (Caps Lock + right-side
  modifiers + Menu) glow and are clickable.
- Click a key → `AssignSheet`: Tap/Hold toggle, a grid of built-in + custom
  features, one-click assign. Reassigning a feature bound elsewhere prompts
  "Move it here?" (backend `AssignResult::Conflict`).
- "Your features" → `CustomFeaturesManager`: name, friendly explanation, AI
  instruction, icon, output (clipboard/chat), cap of 5.
- "Reset all" restores default bindings (custom features kept).
- Copy warns that a bound key is fully repurposed (won't do its normal Windows
  job) — steering users to spare keys.
