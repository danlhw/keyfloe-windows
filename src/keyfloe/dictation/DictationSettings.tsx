import { useEffect, type ReactNode } from "react";
import { Sparkles, AppWindow, GraduationCap, BookMarked } from "lucide-react";
import { useDictationStore } from "./store";
import type { DictationSettings as Settings } from "./types";
import { VocabularyManager } from "./VocabularyManager";

interface ToggleRowProps {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ icon, title, description, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-start gap-3 py-3 cursor-pointer select-none">
      <div className="mt-0.5 kf-muted">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: "var(--kf-ink-900)" }}>
          {title}
        </div>
        <div className="text-xs kf-muted">
          {description}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative shrink-0 mt-0.5 h-5 w-9 rounded-full transition-colors"
        style={{ background: checked ? "var(--kf-gold)" : "rgba(127,127,127,0.35)" }}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

/**
 * Dictation parity settings: the Wispr-style polish toggles + personal
 * vocabulary manager. Activation is keyboard-driven via Feature F's key engine
 * (hold the dictation key → speak → auto-paste), so there's no shortcut picker
 * here — this panel governs how the transcript is cleaned, not how it's triggered.
 */
export function DictationSettings() {
  const { settings, loaded, initialize, updateSetting } = useDictationStore();

  useEffect(() => {
    if (!loaded) void initialize();
  }, [loaded, initialize]);

  const set = <K extends keyof Settings>(key: K) => (v: Settings[K]) =>
    void updateSetting(key, v);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="kf-eyebrow mb-1">Smart dictation</h3>
        <div className="divide-y divide-[color:var(--kf-hairline)]">
          <ToggleRow
            icon={<Sparkles size={16} />}
            title="AI polish"
            description="Clean fillers, false starts, and spoken self-corrections; fix grammar and punctuation before pasting."
            checked={settings.smart_polish_enabled}
            onChange={set("smart_polish_enabled")}
          />
          <ToggleRow
            icon={<AppWindow size={16} />}
            title="App-aware formatting"
            description="Casual tone with a dropped trailing period in messaging apps; proper prose in email, docs, and notes."
            checked={settings.app_aware_formatting}
            onChange={set("app_aware_formatting")}
          />
          <ToggleRow
            icon={<GraduationCap size={16} />}
            title="Learn from corrections"
            description="After a paste, quietly notice words you fix and remember their spelling for next time. Never edits your text."
            checked={settings.learn_from_corrections}
            onChange={set("learn_from_corrections")}
          />
          <ToggleRow
            icon={<BookMarked size={16} />}
            title="Use my vocabulary"
            description="Feed your saved terms into the transcriber so names and jargon come out right the first time."
            checked={settings.vocabulary_prompt_enabled}
            onChange={set("vocabulary_prompt_enabled")}
          />
        </div>
      </section>

      <VocabularyManager />
    </div>
  );
}
