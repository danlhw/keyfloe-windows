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

  const base =
    "relative flex flex-col justify-between rounded-md border text-left select-none transition-colors overflow-hidden";
  const state = !assignable
    ? "bg-mid-gray/5 border-mid-gray/10 text-mid-gray/60"
    : selected
      ? "bg-logo-primary/25 border-logo-primary text-text shadow-[0_0_0_2px_var(--color-logo-primary)] cursor-pointer"
      : bound
        ? "bg-logo-primary/10 border-logo-primary/70 text-text hover:bg-logo-primary/20 cursor-pointer keyfloe-key-glow"
        : "bg-mid-gray/10 border-mid-gray/30 text-text hover:border-logo-primary hover:bg-logo-primary/10 cursor-pointer";

  return (
    <button
      type="button"
      className={`${base} ${state}`}
      style={{ width, height: assignable ? 58 : 46, padding: "5px 7px" }}
      disabled={!assignable}
      aria-pressed={selected}
      onClick={() => assignable && onSelect(def.id)}
      title={assignable ? "Click to assign a feature" : undefined}
    >
      <span className="text-[11px] font-semibold leading-none">
        {def.label}
      </span>
      {assignable && (
        <div className="flex flex-col gap-0.5 w-full">
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
            <span className="text-[9px] text-mid-gray/70">unassigned</span>
          )}
        </div>
      )}
    </button>
  );
};
