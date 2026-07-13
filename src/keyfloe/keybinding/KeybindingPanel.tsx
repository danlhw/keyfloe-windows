import React, { useEffect, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { useKeybindings } from "./useKeybindings";
import { KeyboardView } from "./components/KeyboardView";
import { AssignSheet } from "./components/AssignSheet";
import { CustomFeaturesManager } from "./components/CustomFeaturesManager";

/**
 * Top-level tab for Feature F — the customizable keyboard.
 *
 * Branded on the kf design tokens (kf-glass / kf-eyebrow / kf-display / kf-btn)
 * and sourced ENTIRELY from the backend (`useKeybindings` -> keybinding_get_config)
 * so rows reflect the user's actual persisted bindings. Wire into the sidebar
 * per INTEGRATION.md (App.tsx is not edited by this feature).
 */
export const KeybindingPanel: React.FC = () => {
  const { config, loading, error, load, resetAll } = useKeybindings();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !config) {
    return (
      <div style={{ padding: 24, fontSize: 14, color: "var(--kf-ink-600)" }}>
        Loading keyboard…
      </div>
    );
  }
  if (error && !config) {
    return (
      <div style={{ padding: 24, fontSize: 14, color: "var(--kf-red)" }}>
        Failed to load keybindings: {error}
      </div>
    );
  }
  if (!config) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 24,
        fontFamily: "var(--kf-font-sans)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div className="kf-eyebrow">Cursor &amp; Keys</div>
          <h2
            style={{
              fontFamily: "var(--kf-font-sans)",
              fontSize: 20,
              fontWeight: 600,
              color: "var(--kf-ink-900)",
              margin: "2px 0 0",
            }}
          >
            Your keyboard
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--kf-ink-600)",
              maxWidth: 520,
              margin: "4px 0 0",
            }}
          >
            Click any glowing key to change what it does. Tap fires on a quick
            press. Hold activates while you hold it down.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            className="kf-btn kf-btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowCustom(true)}
          >
            <Sparkles size={14} /> Your features
          </button>
          <button
            className="kf-btn kf-btn-secondary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
            }}
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw size={14} /> Reset all
          </button>
        </div>
      </div>

      <KeyboardView
        config={config}
        selectedKey={selectedKey}
        onSelectKey={setSelectedKey}
      />

      <p style={{ fontSize: 12, color: "var(--kf-ink-600)" }}>
        Bound keys are fully repurposed by Keyfloe. A key you assign no longer
        performs its normal Windows function. Caps Lock and the right-side
        modifier keys are the safest to reassign.
      </p>

      {selectedKey && (
        <AssignSheet keyId={selectedKey} onClose={() => setSelectedKey(null)} />
      )}
      {showCustom && (
        <CustomFeaturesManager onClose={() => setShowCustom(false)} />
      )}

      {confirmReset && (
        <ResetConfirm
          onCancel={() => setConfirmReset(false)}
          onConfirm={async () => {
            await resetAll();
            setConfirmReset(false);
          }}
        />
      )}
    </div>
  );
};

const ResetConfirm: React.FC<{
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ onCancel, onConfirm }) => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 50,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.5)",
    }}
  >
    <div
      className="kf-glass"
      style={{ borderRadius: 14, padding: 20, maxWidth: 360 }}
    >
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--kf-ink-900)",
          margin: 0,
        }}
      >
        Reset every key?
      </h3>
      <p style={{ marginTop: 4, fontSize: 14, color: "var(--kf-ink-600)" }}>
        This restores all keys to their default features. Your custom features
        are kept.
      </p>
      <div
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <button className="kf-btn kf-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="kf-btn kf-btn-primary"
          style={{ background: "var(--kf-red)", color: "#fff" }}
          onClick={onConfirm}
        >
          Reset all
        </button>
      </div>
    </div>
  </div>
);
