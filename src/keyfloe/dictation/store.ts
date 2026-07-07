// Zustand store for the dictation feature (settings, vocabulary, stats, log).
// Mirrors the app's existing store style (see src/stores/settingsStore.ts).

import { create } from "zustand";
import * as api from "./api";
import type {
  DictationLogEntry,
  DictationSettings,
  DictationStats,
  VocabularyTerm,
} from "./types";

const DEFAULT_SETTINGS: DictationSettings = {
  smart_polish_enabled: true,
  app_aware_formatting: true,
  learn_from_corrections: true,
  vocabulary_prompt_enabled: true,
};

interface DictationStore {
  settings: DictationSettings;
  vocabulary: VocabularyTerm[];
  stats: DictationStats | null;
  log: DictationLogEntry[];
  loaded: boolean;

  initialize: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshLog: () => Promise<void>;
  updateSetting: <K extends keyof DictationSettings>(
    key: K,
    value: DictationSettings[K],
  ) => Promise<void>;
  addTerm: (word: string) => Promise<void>;
  removeTerm: (word: string) => Promise<void>;
  clearVocabulary: () => Promise<void>;
  deleteLogEntry: (id: string) => Promise<void>;
  clearLog: () => Promise<void>;
}

export const useDictationStore = create<DictationStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  vocabulary: [],
  stats: null,
  log: [],
  loaded: false,

  initialize: async () => {
    try {
      const [settings, vocabulary, stats, log] = await Promise.all([
        api.getDictationSettings(),
        api.getVocabulary(),
        api.getDictationStats(),
        api.getDictationLog(),
      ]);
      set({ settings, vocabulary, stats, log, loaded: true });
    } catch (e) {
      console.error("dictation: initialize failed", e);
      set({ loaded: true });
    }
  },

  refreshStats: async () => {
    try {
      set({ stats: await api.getDictationStats() });
    } catch (e) {
      console.error("dictation: refreshStats failed", e);
    }
  },

  refreshLog: async () => {
    try {
      set({ log: await api.getDictationLog() });
    } catch (e) {
      console.error("dictation: refreshLog failed", e);
    }
  },

  updateSetting: async (key, value) => {
    const prev = get().settings;
    const next = { ...prev, [key]: value };
    set({ settings: next }); // optimistic
    try {
      await api.setDictationSettings(next);
    } catch (e) {
      console.error("dictation: updateSetting failed", e);
      set({ settings: prev }); // rollback
    }
  },

  addTerm: async (word) => {
    const w = word.trim();
    if (!w) return;
    try {
      set({ vocabulary: await api.addVocabulary(w) });
    } catch (e) {
      console.error("dictation: addTerm failed", e);
    }
  },

  removeTerm: async (word) => {
    try {
      set({ vocabulary: await api.removeVocabulary(word) });
    } catch (e) {
      console.error("dictation: removeTerm failed", e);
    }
  },

  clearVocabulary: async () => {
    try {
      await api.clearVocabulary();
      set({ vocabulary: [] });
    } catch (e) {
      console.error("dictation: clearVocabulary failed", e);
    }
  },

  deleteLogEntry: async (id) => {
    try {
      set({ log: await api.deleteDictationLogEntry(id) });
    } catch (e) {
      console.error("dictation: deleteLogEntry failed", e);
    }
  },

  clearLog: async () => {
    try {
      await api.clearDictationLog();
      set({ log: [] });
    } catch (e) {
      console.error("dictation: clearLog failed", e);
    }
  },
}));
