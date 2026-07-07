import React, { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useKeybindings } from "../useKeybindings";
import { FEATURE_ORDER } from "../features";
import { keyLabel } from "../layout";
import { resolveAction } from "./actionMeta";
import { actionsEqual, type ActionRef, type Gesture } from "../types";

interface AssignSheetProps {
  keyId: string;
  onClose: () => void;
}

interface PendingConflict {
  action: ActionRef;
  atKey: string;
  atGesture: Gesture;
}

export const AssignSheet: React.FC<AssignSheetProps> = ({ keyId, onClose }) => {
  const { config, meta, assign, clear, resetKey } = useKeybindings();
  const tapOnly = meta?.tap_only_keys.includes(keyId) ?? false;
  const [gesture, setGesture] = useState<Gesture>("tap");
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveGesture: Gesture = tapOnly ? "tap" : gesture;
  const binding = config?.bindings[keyId];
  const currentSlot = binding
    ? effectiveGesture === "tap"
      ? binding.tap
      : binding.hold
    : null;
  const customFeatures = config?.custom_features ?? [];

  const items = useMemo<ActionRef[]>(
    () => [
      ...FEATURE_ORDER.map(
        (f): ActionRef => ({ kind: "builtin", feature: f }),
      ),
      ...customFeatures.map((c): ActionRef => ({ kind: "custom", id: c.id })),
    ],
    [customFeatures],
  );

  const doAssign = async (action: ActionRef, force = false) => {
    setBusy(true);
    try {
      const res = await assign(keyId, effectiveGesture, action, force);
      if (res.status === "conflict") {
        setConflict({ action, atKey: res.key_id, atGesture: res.gesture });
      } else {
        setConflict(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      closeLabel="Close"
      title={`Assign — ${keyLabel(keyId)}`}
      description="Pick what this key does. Tap fires on a quick press; hold activates while held."
      contentClassName="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {/* Tap / Hold toggle */}
        {!tapOnly ? (
          <div className="inline-flex self-start rounded-full bg-mid-gray/15 p-0.5">
            {(["tap", "hold"] as Gesture[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGesture(g)}
                className={`px-4 py-1 text-xs font-semibold rounded-full transition-colors capitalize ${
                  effectiveGesture === g
                    ? "bg-logo-primary text-white"
                    : "text-mid-gray hover:text-text"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-mid-gray">
            This key supports <b>Tap</b> only (holding it is needed for system
            shortcuts).
          </div>
        )}

        {/* Conflict prompt */}
        {conflict && (
          <div className="rounded-md border border-logo-primary/50 bg-logo-primary/10 p-3 text-sm">
            <p>
              <b>
                {resolveAction(conflict.action, customFeatures)?.label ??
                  "That feature"}
              </b>{" "}
              is already on your <b>{keyLabel(conflict.atKey)}</b> key (
              {conflict.atGesture}). Move it here instead?
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => doAssign(conflict.action, true)}
                disabled={busy}
              >
                Move it here
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConflict(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
          {items.map((action) => {
            const resolved = resolveAction(action, customFeatures);
            if (!resolved) return null;
            const active = actionsEqual(action, currentSlot);
            const { Icon, label, blurb } = resolved;
            return (
              <button
                key={
                  action.kind === "builtin" ? action.feature : action.id
                }
                type="button"
                disabled={busy}
                onClick={() => doAssign(action)}
                className={`flex items-start gap-2 rounded-lg border p-2 text-left transition-colors ${
                  active
                    ? "border-logo-primary bg-logo-primary/20"
                    : "border-mid-gray/25 hover:border-logo-primary hover:bg-logo-primary/10"
                }`}
              >
                <Icon size={16} className="mt-0.5 shrink-0 text-logo-primary" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-text">
                    {label}
                    {resolved.continuous && (
                      <span className="ml-1 text-[9px] uppercase tracking-wide text-mid-gray">
                        {effectiveGesture === "hold"
                          ? "push-to-talk"
                          : "toggle"}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-mid-gray line-clamp-2">
                    {blurb}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Slot actions */}
        <div className="flex items-center justify-between border-t border-mid-gray/20 pt-3">
          <div className="text-xs text-mid-gray">
            {currentSlot
              ? `${effectiveGesture === "tap" ? "Tap" : "Hold"}: ${
                  resolveAction(currentSlot, customFeatures)?.label ?? "—"
                }`
              : "Nothing assigned to this gesture yet."}
          </div>
          <div className="flex gap-2">
            {currentSlot && (
              <Button
                size="sm"
                variant="danger-ghost"
                onClick={() => clear(keyId, effectiveGesture)}
              >
                Clear {effectiveGesture}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => resetKey(keyId)}
            >
              Reset key
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
