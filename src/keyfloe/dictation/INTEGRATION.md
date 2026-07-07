# Feature B — Dictation parity (frontend) · INTEGRATION

Self-contained React UI for smart dictation. Owns ONLY `src/keyfloe/dictation/`
and edits no shared file. It talks to the backend via raw `invoke`
(`@tauri-apps/api/core`), so **`bindings.ts` does not need regenerating**.

> Build note: I did **not** run `bun install` / `bun run build` (parallel-work
> rule). The folder typechecks clean on its own — verified with
> `tsc --noEmit` (strict, react-jsx) against the project's deps. Run the normal
> `bun run build` after wiring the route below.

## 1. Add the Dictation tab to the dashboard

Render the composed panel wherever the app routes settings tabs (e.g. the
sidebar in `src/App.tsx` / `src/components/Sidebar.tsx`):

```tsx
import { DictationPanel } from "@/keyfloe/dictation";
// ...add a sidebar item "Dictation" that renders <DictationPanel />
```

`DictationPanel` bundles three sub-tabs (Settings, Stats, History). You can also
mount the pieces individually:

```tsx
import { DictationSettings, DictationStats, DictationHistory } from "@/keyfloe/dictation";
```

## 2. Mount the live caption overlay

In the overlay window's entry (Handy's overlay lives under `src/overlay/`),
render the caption component. It's self-contained (no props) and listens for the
`keyfloe://dictation-caption` event the backend emits during polish:

```tsx
import { LiveCaptionOverlay } from "@/keyfloe/dictation";
// inside the overlay root:
<LiveCaptionOverlay />
```

It shows the transcript greyed + shimmering while the AI polish runs, then solid
when final, then auto-hides.

## 3. Path alias

Imports above use `@/keyfloe/dictation` (the app's existing `@/*` alias). Relative
imports work too. No new npm dependencies — uses `react`, `zustand`,
`lucide-react`, `@tauri-apps/api`, and `@tauri-apps/plugin-clipboard-manager`,
all already installed.

## 4. Settings storage

Dictation settings live in the backend's own JSON store
(`<app_data_dir>/dictation-settings.json`) via the `keyfloe_*_dictation_settings`
commands — they are **not** part of Handy's `AppSettings`, so no `settings.rs` /
`settingsStore.ts` changes are needed. Fields:

| field | default | meaning |
|---|---|---|
| `smart_polish_enabled` | `true` | always-on cloud AI polish before paste |
| `app_aware_formatting` | `true` | casual/messaging vs prose register |
| `learn_from_corrections` | `true` | learn fixed words after paste (Windows) |
| `vocabulary_prompt_enabled` | `true` | feed vocabulary into the whisper prompt |

## 5. Backend commands consumed (see BE INTEGRATION.md to register them)

`keyfloe_get_dictation_settings`, `keyfloe_set_dictation_settings`,
`keyfloe_get_vocabulary`, `keyfloe_add_vocabulary`, `keyfloe_remove_vocabulary`,
`keyfloe_clear_vocabulary`, `keyfloe_get_dictation_stats`,
`keyfloe_get_dictation_log`, `keyfloe_delete_dictation_log_entry`,
`keyfloe_clear_dictation_log`.

> Optional: once these are added to `collect_commands![]`, you may swap
> `api.ts` from raw `invoke` to the generated `commands.*` for end-to-end types.
```
