// Resolve an ActionRef (built-in or custom) to a display label + icon.

import React from "react";
import * as Icons from "lucide-react";
import { FEATURES } from "../features";
import type { ActionRef, CustomFeature } from "../types";

export interface ResolvedAction {
  label: string;
  blurb: string;
  Icon: Icons.LucideIcon;
  continuous: boolean;
  isCustom: boolean;
}

export function resolveAction(
  action: ActionRef,
  customFeatures: CustomFeature[],
): ResolvedAction | null {
  if (action.kind === "builtin") {
    const meta = FEATURES[action.feature];
    if (!meta) return null;
    return {
      label: meta.title,
      blurb: meta.blurb,
      Icon: meta.icon,
      continuous: meta.continuous,
      isCustom: false,
    };
  }
  const cf = customFeatures.find((f) => f.id === action.id);
  if (!cf) return null;
  const Icon =
    (Icons as unknown as Record<string, Icons.LucideIcon>)[cf.icon] ??
    Icons.Sparkles;
  return {
    label: cf.name,
    blurb: cf.explanation,
    Icon,
    continuous: false,
    isCustom: true,
  };
}

export function iconByName(name: string): Icons.LucideIcon {
  return (
    (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ??
    Icons.Sparkles
  );
}

export const ActionBadge: React.FC<{
  action: ActionRef;
  customFeatures: CustomFeature[];
  gestureLabel: string;
}> = ({ action, customFeatures, gestureLabel }) => {
  const resolved = resolveAction(action, customFeatures);
  if (!resolved) return null;
  const { Icon, label } = resolved;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
      <span
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--kf-ink-400)",
          flexShrink: 0,
        }}
      >
        {gestureLabel}
      </span>
      <Icon size={11} style={{ flexShrink: 0, color: "var(--kf-gold)" }} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 10,
          color: "var(--kf-ink-900)",
        }}
      >
        {label}
      </span>
    </div>
  );
};
