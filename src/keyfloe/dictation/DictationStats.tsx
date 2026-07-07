import { useEffect, type ReactNode } from "react";
import { Gauge, Type, Mic } from "lucide-react";
import { useDictationStore } from "./store";

function StatTile({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="mb-2 text-neutral-400">{icon}</div>
      <div className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {value}
      </div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}

/**
 * Dictation throughput — "your words per minute via Floe voice mode." Mirrors
 * the Mac Stats tab (WPMTracker).
 */
export function DictationStats() {
  const { stats, loaded, initialize, refreshStats } = useDictationStore();

  useEffect(() => {
    if (!loaded) void initialize();
    else void refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const wpm = stats ? Math.round(stats.lifetime_wpm) : 0;
  const today = stats ? Math.round(stats.today_wpm) : 0;

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <StatTile icon={<Gauge size={18} />} value={`${wpm}`} label="Lifetime WPM" />
        <StatTile icon={<Gauge size={18} />} value={`${today}`} label="Today's WPM" />
      </div>
      <div className="flex gap-3">
        <StatTile
          icon={<Type size={18} />}
          value={(stats?.total_words ?? 0).toLocaleString()}
          label="Total words spoken"
        />
        <StatTile
          icon={<Mic size={18} />}
          value={(stats?.total_sessions ?? 0).toLocaleString()}
          label="Dictation sessions"
        />
      </div>
    </div>
  );
}
