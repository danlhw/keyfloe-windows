import React from "react";
import { KEYBOARD } from "../layout";
import { KeyCap } from "./KeyCap";
import type { KeybindingConfig } from "../types";

// Cream halo on bound keys (mirrors the Mac KeyGlow). Scoped by class name so
// this feature never edits shared CSS.
const GLOW_CSS = `
@keyframes keyfloeKeyGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 220, 150, 0.0); }
  50% { box-shadow: 0 0 10px 1px rgba(255, 220, 150, 0.45); }
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
    <div className="rounded-xl bg-mid-gray/5 p-4 overflow-x-auto">
      <style>{GLOW_CSS}</style>
      <div className="flex flex-col gap-1.5 min-w-max">
        {KEYBOARD.map((row, i) => (
          <div key={i} className="flex gap-1.5">
            {row.map((def) => (
              <KeyCap
                key={def.id}
                def={def}
                binding={config.bindings[def.id]}
                selected={selectedKey === def.id}
                customFeatures={config.custom_features}
                onSelect={onSelectKey}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
