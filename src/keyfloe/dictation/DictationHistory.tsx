import { useEffect, useState } from "react";
import { Copy, Check, Trash2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useDictationStore } from "./store";
import type { DictationLogEntry } from "./types";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function Row({ entry, onDelete }: { entry: DictationLogEntry; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await writeText(entry.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  return (
    <div className="group rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
      <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words">
        {entry.text}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
        <span>{timeAgo(entry.recorded_at)}</span>
        {entry.pasted_into && (
          <>
            <span>·</span>
            <span className="truncate max-w-[12rem]">{entry.pasted_into}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Copy"
          >
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-red-500"
            aria-label="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Transcript history — the safety net for when a paste landed in the wrong app
 * (or nowhere). Mirrors the Mac DictationLog (30-day retention, newest first).
 */
export function DictationHistory() {
  const { log, loaded, initialize, refreshLog, deleteLogEntry, clearLog } =
    useDictationStore();

  useEffect(() => {
    if (!loaded) void initialize();
    else void refreshLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Recent transcripts
        </h3>
        {log.length > 0 && (
          <button
            type="button"
            onClick={() => void clearLog()}
            className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      {log.length === 0 ? (
        <p className="text-xs text-neutral-400">
          Your dictations will appear here for 30 days.
        </p>
      ) : (
        <div className="space-y-2">
          {log.map((e) => (
            <Row key={e.id} entry={e} onDelete={() => void deleteLogEntry(e.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
