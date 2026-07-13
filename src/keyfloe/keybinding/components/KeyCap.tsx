import React from "react";
import type { Binding, CustomFeature } from "../types";
import type { KeyDef } from "../layout";
import { ActionBadge } from "./actionMeta";

interface KeyCapProps {
  def: KeyDef;
  binding?: Binding;
  selected: boolean;
  customFeatures: CustomFeature[];
  onSelect: (keyId: string) => void;
}

const UNIT = 46; // px per width unit
const GAP = 6;

/**
 * One key cap on the interactive keyboard, branded on the kf design tokens.
 * Bound keys are gold-lit (var(--kf-gold)) with a soft travelling glow; the
 * selected key gets a solid gold ring — mirrors the Mac KeyboardView + the
 * shell KeyfloeKeyboard's gold-lit keys rather than the old cream Tailwind glow.
 */
export const KeyCap: React.FC<KeyCapProps> = ({
  def,
  binding,
  selected,
  customFeatures,
  onSelect,
}) => {
  const width = def.width * UNIT + (def.width - 1) * GAP;
  const bound = !!(binding && (binding.tap || binding.hold));
  const assignable = !!def.assignable;

  const style: React.CSSProperties = {
    width,
    height: assignable ? 58 : 46,
    padding: "5px 7px",
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    fontFamily: "var(--kf-font-sans)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    textAlign: "left",
    userSelect: "none",
    overflow: "hidden",
    transition: "border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
  };

  if (!assignable) {
    Object.assign(style, {
      background: "var(--kf-panel-fill)",
      borderColor: "var(--kf-hairline)",
      color: "var(--kf-ink-400)",
      cursor: "default",
    });
  } else if (selected) {
    Object.assign(style, {
      background: "color-mix(in srgb, var(--kf-gold) 22%, transparent)",
      borderColor: "var(--kf-gold)",
      color: "var(--kf-ink-900)",
      boxShadow: "0 0 0 2px var(--kf-gold)",
      cursor: "pointer",
    });
  } else if (bound) {
    Object.assign(style, {
      background: "color-mix(in srgb, var(--kf-gold) 12%, transparent)",
      borderColor: "color-mix(in srgb, var(--kf-gold) 65%, transparent)",
      color: "var(--kf-ink-900)",
      cursor: "pointer",
      boxShadow: "0 0 10px 1px color-mix(in srgb, var(--kf-gold) 40%, transparent)",
    });
  } else {
    Object.assign(style, {
      background: "var(--kf-panel-fill)",
      borderColor: "var(--kf-panel-border)",
      color: "var(--kf-ink-900)",
      cursor: "pointer",
    });
  }

  return (
    <button
      type="button"
      className={bound && !selected ? "keyfloe-key-glow" : undefined}
      style={style}
      disabled={!assignable}
      aria-pressed={selected}
      onClick={() => assignable && onSelect(def.id)}
      title={assignable ? "Click to assign a feature" : undefined}
    >
      <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
        {def.label}
      </span>
      {assignable && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
          {binding?.tap && (
            <ActionBadge
              action={binding.tap}
              customFeatures={customFeatures}
              gestureLabel="Tap"
            />
          )}
          {binding?.hold && (
            <ActionBadge
              action={binding.hold}
              customFeatures={customFeatures}
              gestureLabel="Hold"
            />
          )}
          {!bound && (
            <span style={{ fontSize: 9, color: "var(--kf-ink-400)" }}>
              unassigned
            </span>
          )}
        </div>
      )}
    </button>
  );
};
