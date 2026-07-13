import React from "react";
import { KEYBOARD } from "../layout";
import { KeyCap } from "./KeyCap";
import type { KeybindingConfig } from "../types";

// Gold halo on bound keys (mirrors the Mac KeyGlow + the shell KeyfloeKeyboard
// shimmer). Scoped by class name so this feature never edits shared CSS.
const GLOW_CSS = `
@keyframes keyfloeKeyGlow {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--kf-gold) 0%, transparent); }
  50% { box-shadow: 0 0 12px 1px color-mix(in srgb, var(--kf-gold) 45%, transparent); }
}
.keyfloe-key-glow { animation: keyfloeKeyGlow 3s ease-in-out infinite; }
`;

interface KeyboardViewProps {
  config: KeybindingConfig;
  selectedKey: string | null;
  onSelectKey: (keyId: string) => void;
}

export const KeyboardView: React.FC<KeyboardViewProps> = ({
  config,
  selectedKey,
  onSelectKey,
}) => {
  return (
    <div
      className="kf-glass"
      style={{ borderRadius: 14, padding: 16, overflowX: "auto" }}
    >
      <style>{GLOW_CSS}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          minWidth: "max-content",
        }}
      >
        {KEYBOARD.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            {row.map((def) => (
              <KeyCap
                key={def.id}
                def={def}
                binding={config.bindings?.[def.id]}
                selected={selectedKey === def.id}
                customFeatures={config.custom_features ?? []}
                onSelect={onSelectKey}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
