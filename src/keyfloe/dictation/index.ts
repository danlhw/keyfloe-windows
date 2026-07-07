// Public surface of the dictation feature (Feature B).
export { DictationPanel } from "./DictationPanel";
export { DictationSettings } from "./DictationSettings";
export { DictationStats } from "./DictationStats";
export { DictationHistory } from "./DictationHistory";
export { VocabularyManager } from "./VocabularyManager";
export { LiveCaptionOverlay } from "./LiveCaptionOverlay";
export { useDictationStore } from "./store";
export * as dictationApi from "./api";
export type {
  DictationSettings as DictationSettingsType,
  DictationStats as DictationStatsType,
  DictationLogEntry,
  VocabularyTerm,
  DictationCaptionEvent,
  CaptionPhase,
} from "./types";
