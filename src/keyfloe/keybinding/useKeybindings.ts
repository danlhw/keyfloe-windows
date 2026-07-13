// Zustand store for the keybinding UI. Loads config + meta, exposes mutations
// that keep local state in sync with the backend.

import { create } from "zustand";
import { keybindingApi } from "./api";
import type {
  ActionRef,
  AssignResult,
  CustomFeature,
  Gesture,
  KeybindingConfig,
  KeybindingMeta,
} from "./types";

interface KeybindingStore {
  config: KeybindingConfig | null;
  meta: KeybindingMeta | null;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  assign: (
    keyId: string,
    gesture: Gesture,
    action: ActionRef,
    force?: boolean,
  ) => Promise<AssignResult>;
  clear: (keyId: string, gesture: Gesture) => Promise<void>;
  resetKey: (keyId: string) => Promise<void>;
  resetAll: () => Promise<void>;
  saveCustomFeature: (feature: CustomFeature) => Promise<void>;
  deleteCustomFeature: (id: string) => Promise<void>;
}

export const useKeybindings = create<KeybindingStore>((set, get) => ({
  config: null,
  meta: null,
  loading: true,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [config, meta] = await Promise.all([
        keybindingApi.getConfig(),
        keybindingApi.getMeta(),
      ]);
      set({ config, meta, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  refresh: async () => {
    try {
      const config = await keybindingApi.getConfig();
      set({ config });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  assign: async (keyId, gesture, action, force = false) => {
    const result = await keybindingApi.assign(keyId, gesture, action, force);
    if (result.status === "assigned") {
      await get().refresh();
    }
    return result;
  },

  clear: async (keyId, gesture) => {
    await keybindingApi.clear(keyId, gesture);
    await get().refresh();
  },

  resetKey: async (keyId) => {
    await keybindingApi.resetKey(keyId);
    await get().refresh();
  },

  resetAll: async () => {
    await keybindingApi.resetAll();
    await get().refresh();
  },

  saveCustomFeature: async (feature) => {
    await keybindingApi.saveCustomFeature(feature);
    await get().refresh();
  },

  deleteCustomFeature: async (id) => {
    await keybindingApi.deleteCustomFeature(id);
    await get().refresh();
  },
}));
