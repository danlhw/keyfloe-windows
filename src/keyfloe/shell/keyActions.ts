/**
 * Key-action model — TS mirror of the Windows backend keybinding defaults
 * (src-tauri/src/keyfloe/keybinding/model.rs `default_config`). Used by the
 * Home + Cursor & Keys tabs to render the binder rows and light the matching
 * key on the KeyfloeKeyboard.
 *
 * Windows reality (PRD 5.1): there is NO `fn` key (laptop EC firmware
 * intercepts it before the OS), so it can never be a default. The default
 * activation key is Right-Ctrl. Key ids here are the REAL Windows key ids the
 * native hook reports (`rctrl` / `caps` / `ralt` / `apps` …, see keys.rs) so
 * they match both the backend bindings and the KeyfloeKeyboard render.
 *
 * `feature` is the backend `Feature` rawValue (chat / dictation / snapshot /
 * agent / interview / voice_command / ai_answer / dashboard) so the keybinding
 * module can source the LIVE persisted key for each action (P2-14) and this
 * file stays only the presentational metadata + shipped defaults.
 *
 * These defaults are 1:1 with model.rs `default_config()`:
 *   rctrl → tap Chat / hold Dictation
 *   caps  → tap Snapshot / hold Floe agent
 *   ralt  → tap Interview / hold Voice command
 *   apps  → tap AI answer / hold Dashboard
 */
export type Trigger = "tap" | "hold";

/** Backend `Feature` rawValue (model.rs). */
export type FeatureId =
  | "chat"
  | "dictation"
  | "snapshot"
  | "agent"
  | "interview"
  | "voice_command"
  | "ai_answer"
  | "dashboard";

export interface KeyActionDef {
  id: string;
  /** Backend feature rawValue — the join key for live bindings (P2-14). */
  feature: FeatureId;
  title: string;
  subtitle: string;
  description: string;
  icon: string; // simple glyph (no icon dep)
  defaultTrigger: Trigger;
  /** KeyfloeKeyboard id lit for this action's default key (Windows key id). */
  defaultKeyId: string;
  /** Human label for the default key (Windows labels only). */
  defaultKeyName: string;
}

export const KEY_ACTIONS: KeyActionDef[] = [
  {
    id: "chat",
    feature: "chat",
    title: "Chat",
    subtitle: "Chat popup by your cursor",
    description:
      "Tap Right Ctrl anywhere on your PC. A chat popup floats up next to your cursor — type a question, paste a screenshot, or start a task. Every answer also shows up in the pill.",
    icon: "💬",
    defaultTrigger: "tap",
    defaultKeyId: "rctrl",
    defaultKeyName: "Right Ctrl",
  },
  {
    id: "dictate",
    feature: "dictation",
    title: "Dictation",
    subtitle: "Hold to talk, and it types",
    description:
      "Hold Right Ctrl and start talking. Keyfloe types the words wherever your cursor is and keeps the full text on your clipboard, so you can paste it anywhere.",
    icon: "🎙",
    defaultTrigger: "hold",
    defaultKeyId: "rctrl",
    defaultKeyName: "Right Ctrl",
  },
  {
    id: "snapshot",
    feature: "snapshot",
    title: "Snapshot AI",
    subtitle: "Box anything, get the answer",
    description:
      "Tap Caps Lock and drag a box over anything on screen — an error, a chart, a question. Keyfloe reads what's inside the box and answers it in the pill.",
    icon: "⛶",
    defaultTrigger: "tap",
    defaultKeyId: "caps",
    defaultKeyName: "Caps Lock",
  },
  {
    id: "agent",
    feature: "agent",
    title: "Floe agent",
    subtitle: "Speak a task, it does it",
    description:
      "Hold Caps Lock, say a task like \"open youtube.com\" or \"reply to the last email that I'll be ten minutes late\", and release. Floe runs it in the background and shows each step in the pill.",
    icon: "✦",
    defaultTrigger: "hold",
    defaultKeyId: "caps",
    defaultKeyName: "Caps Lock",
  },
  {
    id: "interview",
    feature: "interview",
    title: "Interview mode",
    subtitle: "Live answers on a call",
    description:
      "Tap Right Alt during a call to turn on interview mode. Keyfloe listens to both sides, transcribes what's said, and drafts a tailored answer in real time — invisible to screen-share.",
    icon: "◉",
    defaultTrigger: "tap",
    defaultKeyId: "ralt",
    defaultKeyName: "Right Alt",
  },
  {
    id: "voiceCommand",
    feature: "voice_command",
    title: "Voice command",
    subtitle: "Ask about your screen out loud",
    description:
      "Hold Right Alt and speak. Floe answers using what's on your screen right now — \"summarize this page\", \"what does this error mean\" — with the answer in the pill.",
    icon: "🗣",
    defaultTrigger: "hold",
    defaultKeyId: "ralt",
    defaultKeyName: "Right Alt",
  },
  {
    id: "aiResponse",
    feature: "ai_answer",
    title: "AI answer",
    subtitle: "Answer what's on screen",
    description:
      "Tap the Menu key and Keyfloe reads your screen, finds the question in front of you, and answers it — typed right where your cursor is and copied to your clipboard.",
    icon: "✧",
    defaultTrigger: "tap",
    defaultKeyId: "apps",
    defaultKeyName: "Menu",
  },
  {
    id: "openDashboard",
    feature: "dashboard",
    title: "Open dashboard",
    subtitle: "Jump to the dashboard",
    description:
      "Hold the Menu key to open the Keyfloe dashboard from anywhere — Home, History, Cursor & Keys, Interview, Account, Settings.",
    icon: "▤",
    defaultTrigger: "hold",
    defaultKeyId: "apps",
    defaultKeyName: "Menu",
  },
];
