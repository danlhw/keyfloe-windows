// Types mirroring the Rust structs in `src-tauri/src/keyfloe/dictation/`.
// Serde serializes with the Rust field names (snake_case), so these match the
// JSON that crosses the Tauri boundary. Kept hand-written so the FE works via
// raw `invoke` without regenerating `bindings.ts` (which this feature must not
// edit). If the commands are later added to `collect_commands![]`, the generated
// `bindings.ts` types will supersede these.

export interface DictationSettings {
  smart_polish_enabled: boolean;
  app_aware_formatting: boolean;
  learn_from_corrections: boolean;
  vocabulary_prompt_enabled: boolean;
}

export interface VocabularyTerm {
  canonical: string;
  count: number;
  last_seen: number; // unix millis
}

export interface DictationStats {
  lifetime_wpm: number;
  today_wpm: number;
  today_words: number;
  total_words: number;
  total_sessions: number;
}

export interface DictationLogEntry {
  id: string;
  recorded_at: number; // unix millis
  text: string;
  duration_sec: number;
  pasted_into: string | null;
}

// Live caption overlay event payload (`keyfloe://dictation-caption`).
export type CaptionPhase = "listening" | "polishing" | "final" | "hidden";
export interface DictationCaptionEvent {
  phase: CaptionPhase;
  text: string;
}

export const CAPTION_EVENT = "keyfloe://dictation-caption";
