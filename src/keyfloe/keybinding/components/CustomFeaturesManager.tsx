import React, { useState } from "react";
import { Trash2, Plus, Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useKeybindings } from "../useKeybindings";
import { CUSTOM_ICON_CHOICES } from "../features";
import { iconByName } from "./actionMeta";
import type { CustomFeature, OutputMode } from "../types";

interface Props {
  onClose: () => void;
}

const EMPTY: CustomFeature = {
  id: "",
  name: "",
  instruction: "",
  explanation: "",
  icon: "Sparkles",
  outputs: ["clipboard"],
};

export const CustomFeaturesManager: React.FC<Props> = ({ onClose }) => {
  const { config, meta, saveCustomFeature, deleteCustomFeature } =
    useKeybindings();
  const features = config?.custom_features ?? [];
  const cap = meta?.max_custom_features ?? 5;
  const [editing, setEditing] = useState<CustomFeature | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const atCap = features.length >= cap;

  const startNew = () => {
    setErr(null);
    setEditing({ ...EMPTY });
  };

  const toggleOutput = (mode: OutputMode) => {
    if (!editing) return;
    const has = editing.outputs.includes(mode);
    // never allow zero outputs
    const next = has
      ? editing.outputs.filter((o) => o !== mode)
      : [...editing.outputs, mode];
    if (next.length === 0) return;
    setEditing({ ...editing, outputs: next });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.instruction.trim()) {
      setErr("Name and instruction are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await saveCustomFeature(editing);
      setEditing(null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      closeLabel="Close"
      title="Your features"
      description="Create your own AI actions and bind them to any key."
      contentClassName="max-w-lg"
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-mid-gray">Name</label>
          <Input
            value={editing.name}
            placeholder="e.g. Make it formal"
            onChange={(e) =>
              setEditing({ ...editing, name: e.target.value })
            }
          />

          <label className="text-xs font-semibold text-mid-gray">
            What it does (shown to you)
          </label>
          <Input
            value={editing.explanation}
            placeholder="Rewrites the selection in a formal tone."
            onChange={(e) =>
              setEditing({ ...editing, explanation: e.target.value })
            }
          />

          <label className="text-xs font-semibold text-mid-gray">
            Instruction to the AI
          </label>
          <textarea
            className="w-full rounded-md border border-mid-gray/30 bg-transparent p-2 text-sm min-h-[72px] focus:border-logo-primary focus:outline-none"
            value={editing.instruction}
            placeholder="Rewrite the selected text in a formal, professional tone. Keep the meaning."
            onChange={(e) =>
              setEditing({ ...editing, instruction: e.target.value })
            }
          />

          <label className="text-xs font-semibold text-mid-gray">Icon</label>
          <div className="grid grid-cols-6 gap-2">
            {CUSTOM_ICON_CHOICES.map((name) => {
              const Icon = iconByName(name);
              const active = editing.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setEditing({ ...editing, icon: name })}
                  className={`flex items-center justify-center rounded-md border p-2 ${
                    active
                      ? "border-logo-primary bg-logo-primary/20"
                      : "border-mid-gray/25 hover:border-logo-primary"
                  }`}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>

          <label className="text-xs font-semibold text-mid-gray">
            Result goes to
          </label>
          <div className="flex gap-2">
            {(["clipboard", "chat"] as OutputMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => toggleOutput(mode)}
                className={`px-3 py-1 text-xs rounded-full border capitalize ${
                  editing.outputs.includes(mode)
                    ? "border-logo-primary bg-logo-primary/20 text-text"
                    : "border-mid-gray/30 text-mid-gray"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={save}
              disabled={saving}
            >
              Save feature
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {features.length === 0 && (
            <p className="text-sm text-mid-gray">
              No custom features yet. Create one, then bind it to any key.
            </p>
          )}
          {features.map((f) => {
            const Icon = iconByName(f.icon);
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-md border border-mid-gray/20 p-2"
              >
                <Icon size={18} className="text-logo-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text truncate">
                    {f.name}
                  </div>
                  <div className="text-xs text-mid-gray truncate">
                    {f.explanation || "Custom AI action"}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-mid-gray">
                  {f.outputs.join(" + ")}
                </span>
                <button
                  type="button"
                  className="text-mid-gray hover:text-text"
                  onClick={() => setEditing({ ...f })}
                  aria-label="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="text-mid-gray hover:text-red-400"
                  onClick={() => deleteCustomFeature(f.id)}
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}

          <Button
            variant="secondary"
            size="sm"
            className="mt-2 self-start inline-flex items-center gap-1"
            onClick={startNew}
            disabled={atCap}
          >
            <Plus size={14} />
            {atCap ? `Limit of ${cap} reached` : "Create a feature"}
          </Button>
        </div>
      )}
    </Dialog>
  );
};
