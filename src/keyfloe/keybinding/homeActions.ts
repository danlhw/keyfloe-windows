/**
 * Windows-correct default action metadata for the Home + "Cursor & Keys" binder
 * rows (P1-04). This REPLACES the stale Mac-flavoured `src/keyfloe/shell/
 * keyActions.ts`, which taught the unbindable `fn` key and Mac defaults.
 *
 * What changed vs the old shell keyActions.ts:
 *  - Every `fn` id/name is purged. `Fn` is EC-firmware intercepted on Windows
 *    and is not remappable.
 *  - Defaults match the backend seed (model.rs `default_config`): tap Right-Ctrl
 *    -> Chat, hold Right-Ctrl -> Dictation, tap Caps -> Snapshot, hold Caps ->
 *    Floe Agent, tap Right-Alt -> Interview, hold Right-Alt -> Voice Command,
 *    tap Menu -> AI Answer, hold Menu -> Dashboard.
 *  - Adds the Floe Agent action (absent from the old KEY_ACTIONS).
 *  - Windows key labels only (Ctrl / Alt / Win / Menu / Caps Lock) — no macOS
 *    glyphs, no "Right Win"/`rcmd`.
 *
 * This is presentational METADATA only. The LIVE key/gesture for each action is
 * the user's persisted binding — read it from `useKeybindings().config` (which
 * loads `keybinding_get_config`) and fall back to `defaultKeyId`/`defaultTrigger`
 * here only until the config resolves. `keyId` values are the backend
 * `assignable_keys()` ids so a lookup in `config.bindings[keyId]` is direct.
 */
import type { Feature } from "./types";

export type ActionTrigger = "tap" | "hold";

export interface KeyActionMeta {
  /** Built-in feature id — the row's identity + how to look it up in config. */
  feature: Feature;
  title: string;
  subtitle: string;
  description: string;
  /** Emoji glyph (drop-in with the existing shell rows). */
  icon: string;
  /** lucide-react icon name (brand-preferred; resolve with the icon registry). */
  lucide: string;
  defaultTrigger: ActionTrigger;
  /** Backend assignable key id (caps | rctrl | ralt | apps | lwin | rwin | rshift). */
  defaultKeyId: string;
  /** Human Windows label for the default key. */
  defaultKeyName: string;
}

/** Friendly Windows label for a backend assignable key id. No macOS glyphs. */
export const WINDOWS_KEY_LABELS: Record<string, string> = {
  caps: "Caps Lock",
  rctrl: "Right Ctrl",
  ralt: "Right Alt",
  apps: "Menu",
  lwin: "Win",
  rwin: "Right Win",
  rshift: "Right Shift",
};

export function keyLabelForId(id: string): string {
  return WINDOWS_KEY_LABELS[id] ?? id;
}

export const WINDOWS_KEY_ACTIONS: KeyActionMeta[] = [
  {
    feature: "chat",
    title: "Chat",
    subtitle: "Chat popup by your cursor",
    description:
      "Tap Right Ctrl anywhere. A chat popup floats up next to your cursor. Type a question, paste a screenshot, or start a task.",
    icon: "💬",
    lucide: "MessageSquare",
    defaultTrigger: "tap",
    defaultKeyId: "rctrl",
    defaultKeyName: "Right Ctrl",
  },
  {
    feature: "dictation",
    title: "Dictation",
    subtitle: "Hold to talk, Keyfloe types it",
    description:
      "Hold Right Ctrl and start speaking. Keyfloe types the words wherever your cursor is and keeps the full text on your clipboard.",
    icon: "🎙",
    lucide: "Mic",
    defaultTrigger: "hold",
    defaultKeyId: "rctrl",
    defaultKeyName: "Right Ctrl",
  },
  {
    feature: "snapshot",
    title: "Snapshot AI",
    subtitle: "Box anything, get the answer",
    description:
      "Tap Caps Lock, then drag a box over anything on screen. Keyfloe reads what is inside and answers it.",
    icon: "⛶",
    lucide: "ScanLine",
    defaultTrigger: "tap",
    defaultKeyId: "caps",
    defaultKeyName: "Caps Lock",
  },
  {
    feature: "agent",
    title: "Floe Agent",
    subtitle: "Hold, speak a task, release",
    description:
      "Hold Caps Lock and speak a task. Floe runs it in the background and reports back in the pill.",
    icon: "✦",
    lucide: "Sparkles",
    defaultTrigger: "hold",
    defaultKeyId: "caps",
    defaultKeyName: "Caps Lock",
  },
  {
    feature: "interview",
    title: "Interview",
    subtitle: "Live, private answers on a call",
    description:
      "Tap Right Alt to start interview mode. Keyfloe listens live and gives you talking points as questions come up. It stays invisible to screen share.",
    icon: "🎧",
    lucide: "Radio",
    defaultTrigger: "tap",
    defaultKeyId: "ralt",
    defaultKeyName: "Right Alt",
  },
  {
    feature: "voice_command",
    title: "Voice Command",
    subtitle: "Speak, Floe answers from your screen",
    description:
      "Hold Right Alt and speak. Floe answers using what is on your screen.",
    icon: "🗣",
    lucide: "Waypoints",
    defaultTrigger: "hold",
    defaultKeyId: "ralt",
    defaultKeyName: "Right Alt",
  },
  {
    feature: "ai_answer",
    title: "AI Answer",
    subtitle: "Auto-answer what's on screen",
    description:
      "Tap the Menu key and Keyfloe reads your screen, finds the question, and answers it or fills the field.",
    icon: "✨",
    lucide: "Wand2",
    defaultTrigger: "tap",
    defaultKeyId: "apps",
    defaultKeyName: "Menu",
  },
  {
    feature: "dashboard",
    title: "Open Dashboard",
    subtitle: "Toggle the dashboard",
    description:
      "Hold the Menu key to open the Keyfloe dashboard. Home, History, Interview, Account, Settings.",
    icon: "▤",
    lucide: "AppWindow",
    defaultTrigger: "hold",
    defaultKeyId: "apps",
    defaultKeyName: "Menu",
  },
];
