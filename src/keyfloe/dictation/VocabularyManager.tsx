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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Vocabulary
          {vocabulary.length > 0 && (
            <span className="ml-1.5 text-neutral-300 dark:text-neutral-600">
              {vocabulary.length}
            </span>
          )}
        </h3>
        {vocabulary.length > 0 && (
          <button
            type="button"
            onClick={() => void clearVocabulary()}
            className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
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
          className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {vocabulary.length === 0 ? (
        <p className="text-xs text-neutral-400">
          No terms yet. Words you dictate often are learned automatically.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {vocabulary.map((t) => (
            <span
              key={t.canonical}
              className="group inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 pl-2.5 pr-1 py-1 text-xs"
              title={`Seen ${t.count}×`}
            >
              {t.canonical}
              <button
                type="button"
                onClick={() => void removeTerm(t.canonical)}
                className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-red-500"
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
