import React, { useEffect, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useKeybindings } from "./useKeybindings";
import { KeyboardView } from "./components/KeyboardView";
import { AssignSheet } from "./components/AssignSheet";
import { CustomFeaturesManager } from "./components/CustomFeaturesManager";

/**
 * Top-level tab for Feature F — the customizable keyboard.
 *
 * Wire into the sidebar/routing per INTEGRATION.md (App.tsx is not edited by
 * this feature). Exported from `src/keyfloe/keybinding/index.ts`.
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
    return <div className="p-6 text-sm text-mid-gray">Loading keyboard…</div>;
  }
  if (error && !config) {
    return (
      <div className="p-6 text-sm text-red-400">
        Failed to load keybindings: {error}
      </div>
    );
  }
  if (!config) return null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-text">Your keyboard</h2>
          <p className="text-sm text-mid-gray max-w-lg">
            Click any glowing key to change what it does. Tap fires on a quick
            press; hold activates while you hold it down.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            className="inline-flex items-center gap-1"
            onClick={() => setShowCustom(true)}
          >
            <Sparkles size={14} /> Your features
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="inline-flex items-center gap-1"
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw size={14} /> Reset all
          </Button>
        </div>
      </div>

      <KeyboardView
        config={config}
        selectedKey={selectedKey}
        onSelectKey={setSelectedKey}
      />

      <p className="text-xs text-mid-gray">
        Bound keys are fully repurposed by Keyfloe — a key you assign no longer
        performs its normal Windows function. Caps Lock and the right-side
        modifier keys are the safest to reassign.
      </p>

      {selectedKey && (
        <AssignSheet
          keyId={selectedKey}
          onClose={() => setSelectedKey(null)}
        />
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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="rounded-xl border border-mid-gray/20 bg-background p-5 max-w-sm">
      <h3 className="text-base font-bold text-text">Reset every key?</h3>
      <p className="mt-1 text-sm text-mid-gray">
        This restores all keys to their default features. Your custom features
        are kept.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" onClick={onConfirm}>
          Reset all
        </Button>
      </div>
    </div>
  </div>
);
