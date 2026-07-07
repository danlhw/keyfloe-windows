/**
 * Key-action model — TS mirror of the Mac `KeyfloeAction` / `KeyfloeKeySlot`
 * (app/Sources/Hotkeys/ActivationKey.swift). Used by the Home + Cursor & Keys
 * tabs to render the binder rows and light the matching key on the keyboard.
 *
 * The default slots are the shipped Mac defaults, with Windows-friendly slot
 * names. Feature F (keybinding) owns the real persistence/backend — this file
 * is only the presentational model + defaults. See INTEGRATION.md.
 */
export type Trigger = "tap" | "hold";

export interface KeyActionDef {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string; // simple glyph (no icon dep)
  defaultTrigger: Trigger;
  /** keyboard id lit on the KeyfloeKeyboard for this action's default key. */
  defaultKeyId: string;
  /** human label for the default key. */
  defaultKeyName: string;
}

export const KEY_ACTIONS: KeyActionDef[] = [
  {
    id: "chat",
    title: "Chat / Interview",
    subtitle: "Chat popup + live interview mode",
    description:
      "Tap your chat key anywhere. A chat popup floats up next to your cursor — type a question, paste a screenshot, or start a task. Turn on interview mode to have Keyfloe listen live and answer in real time.",
    icon: "💬",
    defaultTrigger: "tap",
    defaultKeyId: "fn",
    defaultKeyName: "fn",
  },
  {
    id: "dictate",
    title: "Dictation",
    subtitle: "Hold-to-talk transcription",
    description:
      "Hold the chat key and start speaking. Keyfloe types the words wherever your cursor is, and keeps the full text on your clipboard.",
    icon: "🎙",
    defaultTrigger: "hold",
    defaultKeyId: "fn",
    defaultKeyName: "fn",
  },
  {
    id: "openDashboard",
    title: "Open Dashboard",
    subtitle: "Toggle the dashboard",
    description:
      "A single tap toggles the Keyfloe dashboard — Home, History, Interview, Account, Settings. Tap again to close.",
    icon: "▤",
    defaultTrigger: "tap",
    defaultKeyId: "ropt",
    defaultKeyName: "Right Alt",
  },
  {
    id: "aiResponse",
    title: "AI Response",
    subtitle: "Auto-answer what's on screen",
    description:
      "Tap fires the AI Response popup — Keyfloe reads your screen, finds the question, and answers it. Hold (Stealth) skips the popup and pastes the answer silently where your cursor is.",
    icon: "✦",
    defaultTrigger: "tap",
    defaultKeyId: "lctrl",
    defaultKeyName: "Left Ctrl",
  },
  {
    id: "snapshot",
    title: "Snapshot AI",
    subtitle: "Box anything, get the answer",
    description:
      "Hold the right Win key and drag a box over anything on screen — Keyfloe reads what's inside and answers it.",
    icon: "⛶",
    defaultTrigger: "hold",
    defaultKeyId: "rcmd",
    defaultKeyName: "Right Win",
  },
];
