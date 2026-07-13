import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useDictationStore } from "./store";

/**
 * Personal vocabulary editor. Terms are also learned silently as you dictate;
 * this panel lets the user add jargon/names up front or prune the list.
 */
export function VocabularyManager() {
  const { vocabulary, addTerm, removeTerm, clearVocabulary } = useDictationStore();
  const [draft, setDraft] = useState("");

  const submit = async () => {
    const w = draft.trim();
    if (!w) return;
    await addTerm(w);
    setDraft("");
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h3 className="kf-eyebrow">
          Vocabulary
          {vocabulary.length > 0 && (
            <span className="ml-1.5 kf-faint">{vocabulary.length}</span>
          )}
        </h3>
        {vocabulary.length > 0 && (
          <button
            type="button"
            onClick={() => void clearVocabulary()}
            className="text-xs kf-faint transition-colors hover:opacity-70"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="Add a name, brand, or term…"
          className="flex-1 rounded-md bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[color:var(--kf-gold)]"
          style={{ border: "1px solid var(--kf-hairline)", color: "var(--kf-ink-900)" }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!draft.trim()}
          className="kf-btn kf-btn-primary inline-flex items-center gap-1 disabled:opacity-40"
          style={{ padding: "6px 12px" }}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {vocabulary.length === 0 ? (
        <p className="text-xs kf-faint">
          No terms yet. Words you dictate often are learned automatically.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {vocabulary.map((t) => (
            <span
              key={t.canonical}
              className="kf-chip group inline-flex items-center gap-1 pl-2.5 pr-1 py-1"
              title={`Seen ${t.count}×`}
            >
              {t.canonical}
              <button
                type="button"
                onClick={() => void removeTerm(t.canonical)}
                className="rounded-full p-0.5 hover:bg-black/10"
                style={{ color: "var(--kf-ink-400)" }}
                aria-label={`Remove ${t.canonical}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
