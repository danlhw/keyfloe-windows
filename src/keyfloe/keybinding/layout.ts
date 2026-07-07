// Physical keyboard layout for the interactive binding UI (Windows layout).
// Mirrors the Mac KeyboardView rendered-keyboard approach: only the assignable
// keys are interactive/glowing; the rest are decorative.
//
// `id` on an assignable key MUST match a Rust `assignable_keys()` id
// (caps, rctrl, ralt, apps, lwin, rwin, rshift).

export interface KeyDef {
  /** Backend keyId when assignable; otherwise a layout-only id. */
  id: string;
  label: string;
  /** Relative width; 1 = a standard key. */
  width: number;
  assignable?: boolean;
}

export type KeyRow = KeyDef[];

const k = (id: string, label: string, width = 1): KeyDef => ({ id, label, width });
const a = (id: string, label: string, width = 1): KeyDef => ({
  id,
  label,
  width,
  assignable: true,
});

// Friendly labels for the assignable keys (used in the assign popover header).
export const KEY_LABELS: Record<string, string> = {
  caps: "Caps Lock",
  rctrl: "Right Ctrl",
  ralt: "Right Alt",
  apps: "Menu",
  lwin: "Win",
  rwin: "Right Win",
  rshift: "Right Shift",
};

export function keyLabel(id: string): string {
  return KEY_LABELS[id] ?? id;
}

export const KEYBOARD: KeyRow[] = [
  // number row
  [
    k("tilde", "`"),
    ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((n) => k(n, n)),
    k("minus", "-"),
    k("equal", "="),
    k("backspace", "⌫", 2),
  ],
  // QWERTY row
  [
    k("tab", "Tab", 1.5),
    ...["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((c) =>
      k(c.toLowerCase(), c),
    ),
    k("lbracket", "["),
    k("rbracket", "]"),
    k("backslash", "\\", 1.5),
  ],
  // home row — Caps Lock is assignable (the Windows analog of macOS fn)
  [
    a("caps", "Caps", 1.75),
    ...["A", "S", "D", "F", "G", "H", "J", "K", "L"].map((c) =>
      k(c.toLowerCase(), c),
    ),
    k("semicolon", ";"),
    k("quote", "'"),
    k("enter", "Enter", 2.25),
  ],
  // ZXCV row — Right Shift is assignable
  [
    k("lshift", "Shift", 2.25),
    ...["Z", "X", "C", "V", "B", "N", "M"].map((c) => k(c.toLowerCase(), c)),
    k("comma", ","),
    k("period", "."),
    k("slash", "/"),
    a("rshift", "Shift", 2.75),
  ],
  // bottom row — the interactive row
  [
    k("lctrl", "Ctrl", 1.25),
    a("lwin", "Win", 1.25),
    k("lalt", "Alt", 1.25),
    k("space", "", 6.25),
    a("ralt", "Alt", 1.25),
    a("rwin", "Win", 1.25),
    a("apps", "Menu", 1.25),
    a("rctrl", "Ctrl", 1.25),
  ],
];
