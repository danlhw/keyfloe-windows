// Thin wrapper over the Rust keybinding commands. Uses raw `invoke` (not the
// generated bindings.ts, which this feature must not edit). Command names match
// the `#[tauri::command]` fns in src-tauri/src/keyfloe/keybinding/mod.rs.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ActionRef,
  AssignResult,
  CustomFeature,
  Gesture,
  KeybindingConfig,
  KeybindingMeta,
} from "./types";

export const keybindingApi = {
  getConfig: () => invoke<KeybindingConfig>("keybinding_get_config"),
  getMeta: () => invoke<KeybindingMeta>("keybinding_get_meta"),

  assign: (
    keyId: string,
    gesture: Gesture,
    action: ActionRef,
    force = false,
  ) =>
    invoke<AssignResult>("keybinding_assign", {
      keyId,
      gesture,
      action,
      force,
    }),

  clear: (keyId: string, gesture: Gesture) =>
    invoke<void>("keybinding_clear", { keyId, gesture }),

  resetKey: (keyId: string) =>
    invoke<void>("keybinding_reset_key", { keyId }),

  resetAll: () => invoke<void>("keybinding_reset_all"),

  saveCustomFeature: (feature: CustomFeature) =>
    invoke<void>("keybinding_save_custom_feature", { feature }),

  deleteCustomFeature: (id: string) =>
    invoke<void>("keybinding_delete_custom_feature", { id }),

  startCapture: () => invoke<void>("keybinding_start_capture"),
  stopCapture: () => invoke<void>("keybinding_stop_capture"),

  /** Subscribe to physical-key capture events (returns an unlisten fn). */
  onCapture: (cb: (keyId: string) => void): Promise<UnlistenFn> =>
    listen<string>("keybinding_capture", (e) => cb(e.payload)),
};
