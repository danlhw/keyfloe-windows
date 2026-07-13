import { useEffect, useState } from "react";
import { useDictationStore } from "./store";
import { DictationSettings } from "./DictationSettings";
import { DictationStats } from "./DictationStats";
import { DictationHistory } from "./DictationHistory";

type Tab = "settings" | "stats" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "stats", label: "Stats" },
  { id: "history", label: "History" },
];

/**
 * The composed Dictation tab for the main dashboard — settings + stats +
 * transcript history. Drop this into the app's routing/sidebar (see
 * INTEGRATION.md — "Route wiring").
 */
export function DictationPanel() {
  const { loaded, initialize } = useDictationStore();
  const [tab, setTab] = useState<Tab>("settings");

  useEffect(() => {
    if (!loaded) void initialize();
  }, [loaded, initialize]);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--kf-ink-900)" }}>
          Dictation
        </h2>
        <p className="text-sm kf-muted">
          Hold your dictation key, speak, and clean AI-polished text is pasted
          into whatever app you're in.
        </p>
      </div>

      <div className="flex gap-1" style={{ borderBottom: "1px solid var(--kf-hairline)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-2 text-sm font-medium -mb-px transition-colors"
            style={{
              borderBottom: "2px solid",
              borderBottomColor: tab === t.id ? "var(--kf-gold)" : "transparent",
              color: tab === t.id ? "var(--kf-ink-900)" : "var(--kf-ink-600)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "settings" && <DictationSettings />}
        {tab === "stats" && <DictationStats />}
        {tab === "history" && <DictationHistory />}
      </div>
    </div>
  );
}
