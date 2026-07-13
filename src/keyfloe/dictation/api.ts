// Thin wrappers over the dictation Tauri commands + the caption event.
//
// Uses raw `invoke` from @tauri-apps/api/core so this feature needs no changes
// to the generated `bindings.ts`. Command names match the `#[tauri::command]`
// fns in `src-tauri/src/keyfloe/dictation/commands.rs`. Tauri lower-cases and
// snake_cases arg names, so pass args exactly as the Rust params are named.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  CAPTION_EVENT,
  type DictationCaptionEvent,
  type DictationLogEntry,
  type DictationSettings,
  type DictationStats,
  type VocabularyTerm,
} from "./types";

// ---- settings ----
export const getDictationSettings = () =>
  invoke<DictationSettings>("keyfloe_get_dictation_settings");

export const setDictationSettings = (settings: DictationSettings) =>
  invoke<void>("keyfloe_set_dictation_settings", { settings });

// ---- vocabulary ----
export const getVocabulary = () =>
  invoke<VocabularyTerm[]>("keyfloe_get_vocabulary");

export const addVocabulary = (word: string) =>
  invoke<VocabularyTerm[]>("keyfloe_add_vocabulary", { word });

export const removeVocabulary = (word: string) =>
  invoke<VocabularyTerm[]>("keyfloe_remove_vocabulary", { word });

export const clearVocabulary = () => invoke<void>("keyfloe_clear_vocabulary");

// ---- stats + log ----
export const getDictationStats = () =>
  invoke<DictationStats>("keyfloe_get_dictation_stats");

export const getDictationLog = () =>
  invoke<DictationLogEntry[]>("keyfloe_get_dictation_log");

export const deleteDictationLogEntry = (id: string) =>
  invoke<DictationLogEntry[]>("keyfloe_delete_dictation_log_entry", { id });

export const clearDictationLog = () =>
  invoke<void>("keyfloe_clear_dictation_log");

// ---- live caption event ----
export const onCaption = (
  cb: (e: DictationCaptionEvent) => void,
): Promise<UnlistenFn> =>
  listen<DictationCaptionEvent>(CAPTION_EVENT, (evt) => cb(evt.payload));
