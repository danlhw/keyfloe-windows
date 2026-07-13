/**
 * KeyfloeKeyboard — React port of the Mac `MacKeyboardView`
 * (app/Sources/Onboarding/OnboardingView.swift) and the website's
 * interactive-keyboard.tsx. A floating, edge-faded keyboard where any set of
 * keys can be "lit" (gold glow + travelling shimmer).
 *
 * Windows note: the key ids match the Mac keyboard ids so the same
 * `highlightedIds` sets (fn / lopt / lcmd / ropt / rcmd / lctrl …) work
 * unchanged. On Windows the `⌘` caps read as ⊞ Win / Alt — the labels are
 * overridable via the `platform` prop.
 */
import React from "react";

type KeyRender = "letter" | "number" | "modifier" | "fn" | "partial" | "empty";

interface KeyDef {
  id: string;
  render: KeyRender;
  label?: string;
  sub?: string;
  width?: number;
}

const NUMBERS: KeyDef[] = [
  { id: "2", render: "number", label: "2", sub: "@" },
  { id: "3", render: "number", label: "3", sub: "#" },
  { id: "4", render: "number", label: "4", sub: "$" },
  { id: "5", render: "number", label: "5", sub: "%" },
  { id: "6", render: "number", label: "6", sub: "^" },
  { id: "7", render: "number", label: "7", sub: "&" },
  { id: "8", render: "number", label: "8", sub: "*" },
];
const QWERTY: KeyDef[] = "QWERTYUIO".split("").map((c) => ({ id: `k${c}`, render: "letter", label: c }));
const HOME: KeyDef[] = [
  { id: "caps", render: "partial", sub: "⇪", width: 0.6 },
  ..."ASDFGHJKL".split("").map((c) => ({ id: `k${c}`, render: "letter" as KeyRender, label: c })),
  { id: "semi", render: "partial", label: ";", width: 0.6 },
];
const ZX: KeyDef[] = [
  { id: "shift", render: "partial", sub: "⇧", width: 0.6 },
  { id: "backtick", render: "number", label: "`", sub: "~" },
  ..."ZXCVBNM".split("").map((c) => ({ id: `k${c}`, render: "letter" as KeyRender, label: c })),
  { id: "comma", render: "number", label: ",", sub: "<" },
  { id: "period", render: "number", label: ".", sub: ">" },
  { id: "slash", render: "partial", label: "/", sub: "?", width: 0.6 },
];

function bottomRow(win: boolean): KeyDef[] {
  if (win) {
    // Real Windows bottom row. Ids match the native hook (keys.rs): lctrl /
    // lwin / lalt / ralt / apps / rctrl. No `fn` — it is EC-firmware
    // intercepted on Windows and can never be bound. Right-Ctrl is the default
    // Keyfloe activation key, so it must be present and lightable.
    return [
      { id: "lctrl", render: "modifier", label: "ctrl", width: 1.3 },
      { id: "lwin", render: "modifier", label: "win", sub: "⊞", width: 1.3 },
      { id: "lalt", render: "modifier", label: "alt", width: 1.3 },
      { id: "space", render: "empty", width: 5.0 },
      { id: "ralt", render: "modifier", label: "alt", width: 1.3 },
      { id: "apps", render: "modifier", label: "menu", sub: "▤", width: 1.3 },
      { id: "rctrl", render: "modifier", label: "ctrl", width: 1.3 },
    ];
  }
  return [
    { id: "fn", render: "fn", label: "fn" },
    { id: "lctrl", render: "modifier", label: "control", sub: "⌃", width: 1.3 },
    { id: "lopt", render: "modifier", label: "option", sub: "⌥", width: 1.3 },
    { id: "lcmd", render: "modifier", label: "command", sub: "⌘", width: 1.6 },
    { id: "space", render: "empty", width: 5.4 },
    { id: "rcmd", render: "modifier", label: "command", sub: "⌘", width: 1.6 },
    { id: "ropt", render: "modifier", label: "option", sub: "⌥", width: 1.3 },
  ];
}

function KeyCapButton({
  def,
  unit,
  selected,
  onTap,
}: {
  def: KeyDef;
  unit: number;
  selected: boolean;
  onTap?: (id: string) => void;
}) {
  if (def.render === "empty") {
    return <div className="kf-key" style={{ width: (def.width ?? 1) * unit, background: "transparent", border: "none", cursor: "default" }} />;
  }
  const cls = ["kf-key"];
  if (def.render === "modifier") cls.push("kf-key-modifier");
  if (def.render === "fn") cls.push("kf-key-fn");
  if (selected) cls.push("kf-key-selected");

  let inner: React.ReactNode;
  switch (def.render) {
    case "letter":
      inner = <span className="kf-key-label">{def.label}</span>;
      break;
    case "number":
    case "partial":
      inner = (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
          {def.sub ? <span className="kf-key-sub">{def.sub}</span> : null}
          {def.label ? <span className="kf-key-label">{def.label}</span> : null}
        </div>
      );
      break;
    case "modifier":
      inner = (
        <>
          {def.sub ? <span className="kf-key-sub">{def.sub}</span> : null}
          <span className="kf-key-label">{def.label}</span>
        </>
      );
      break;
    case "fn":
      inner = <span className="kf-key-sub">{def.label}</span>;
      break;
  }

  return (
    <button
      type="button"
      className={cls.join(" ")}
      style={{ width: (def.width ?? 1) * unit }}
      title={def.label ?? def.id}
      onClick={() => onTap?.(def.id)}
    >
      {inner}
    </button>
  );
}

export function KeyfloeKeyboard({
  highlightedIds,
  onKeyTap,
  compact = false,
  unit = 32,
  platform,
}: {
  highlightedIds: Set<string> | string[];
  onKeyTap?: (id: string) => void;
  compact?: boolean;
  unit?: number;
  /** "windows" swaps ⌘ caps for ⊞ Win / Alt. Auto-detected if omitted. */
  platform?: "windows" | "mac";
}) {
  const lit = highlightedIds instanceof Set ? highlightedIds : new Set(highlightedIds);
  const win =
    platform === "windows" ||
    (platform === undefined && typeof navigator !== "undefined" && /win/i.test(navigator.platform));
  const rows = compact
    ? [ZX, bottomRow(win)]
    : [NUMBERS, QWERTY, HOME, ZX, bottomRow(win)];

  return (
    <div
      className={`kf-kbd${compact ? " kf-kbd-compact" : ""}`}
      style={{ ["--kf-key-unit" as any]: `${unit}px` }}
    >
      {rows.map((row, i) => (
        <div className="kf-kbd-row" key={i}>
          {row.map((def) => (
            <KeyCapButton
              key={def.id}
              def={def}
              unit={unit}
              selected={lit.has(def.id)}
              onTap={onKeyTap}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
