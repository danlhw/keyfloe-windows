// Zustand store for the pre-interview context (About me / profiles / résumé
// docs). Mirrors the Mac AboutMeStore + InterviewProfileStore + ResumeStore.
// Persistence goes through the Rust `interview_get_context` /
// `interview_save_context` commands, which write a single JSON to
// <app_data>/keyfloe/interview-context.json — same on-disk posture as Mac.
// Saves are debounced so typing doesn't hammer the disk.

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  CMD,
  EMPTY_CONTEXT,
  type InterviewContext,
  type InterviewProfile,
  type ResumeDoc,
} from "./types";

function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

interface ContextStore {
  ctx: InterviewContext;
  loaded: boolean;
  load: () => Promise<void>;
  // About me
  setAboutMe: (text: string) => void;
  // Profiles
  addProfile: (name?: string) => string;
  updateProfile: (p: InterviewProfile) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  // Résumé docs
  addDoc: (label: string, body: string) => void;
  updateDoc: (d: ResumeDoc) => void;
  removeDoc: (id: string) => void;
  toggleDoc: (id: string) => void;
  hasBackground: () => boolean;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(ctx: InterviewContext) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    invoke(CMD.saveContext, { ctx }).catch(console.error);
  }, 500);
}

export const useInterviewContext = create<ContextStore>((set, get) => {
  const mutate = (fn: (c: InterviewContext) => InterviewContext) => {
    const next = fn(get().ctx);
    set({ ctx: next });
    persist(next);
  };

  return {
    ctx: EMPTY_CONTEXT,
    loaded: false,

    load: async () => {
      try {
        const ctx = await invoke<InterviewContext>(CMD.getContext);
        set({ ctx: { ...EMPTY_CONTEXT, ...ctx }, loaded: true });
      } catch (e) {
        console.error("interview context load failed", e);
        set({ loaded: true });
      }
    },

    setAboutMe: (text) => mutate((c) => ({ ...c, aboutMe: text })),

    addProfile: (name = "Untitled profile") => {
      const id = uid();
      mutate((c) => {
        const profile: InterviewProfile = {
          id,
          name,
          resumeText: "",
          jobDescription: "",
          companyInfo: "",
          notes: "",
        };
        return {
          ...c,
          profiles: [...c.profiles, profile],
          // First profile auto-activates (matches Mac).
          activeProfileId: c.activeProfileId ?? id,
        };
      });
      return id;
    },

    updateProfile: (p) =>
      mutate((c) => ({
        ...c,
        profiles: c.profiles.map((x) => (x.id === p.id ? p : x)),
      })),

    deleteProfile: (id) =>
      mutate((c) => {
        const profiles = c.profiles.filter((x) => x.id !== id);
        return {
          ...c,
          profiles,
          activeProfileId:
            c.activeProfileId === id
              ? (profiles[0]?.id ?? null)
              : c.activeProfileId,
        };
      }),

    setActiveProfile: (id) => mutate((c) => ({ ...c, activeProfileId: id })),

    addDoc: (label, body) =>
      mutate((c) => ({
        ...c,
        docs: [
          ...c.docs,
          { id: uid(), label: label || "Untitled", body, enabled: true },
        ],
      })),

    updateDoc: (d) =>
      mutate((c) => ({
        ...c,
        docs: c.docs.map((x) => (x.id === d.id ? d : x)),
      })),

    removeDoc: (id) =>
      mutate((c) => ({ ...c, docs: c.docs.filter((x) => x.id !== id) })),

    toggleDoc: (id) =>
      mutate((c) => ({
        ...c,
        docs: c.docs.map((x) =>
          x.id === id ? { ...x, enabled: !x.enabled } : x,
        ),
      })),

    hasBackground: () => {
      const c = get().ctx;
      return (
        c.aboutMe.trim().length > 0 ||
        c.activeProfileId != null ||
        c.docs.some((d) => d.enabled && d.body.trim().length > 0)
      );
    },
  };
});
