// Feature C — Floe agent store.
//
// A small zustand store that owns the agent's live run state. It subscribes
// once to the `keyfloe://agent/*` events emitted by the Rust session loop and
// upserts step cards by id, so any mounted component (the pill, a Tasks tab)
// renders the same source of truth. `runCommand` is the imperative trigger —
// it calls the backend command via `invoke` (the agent's commands aren't in
// the generated `bindings.ts`, so we don't go through `@/bindings`).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  EVT_CONFIRM,
  EVT_LISTENING,
  EVT_RESULT,
  EVT_STARTED,
  EVT_STEP,
  EVT_VOICE,
  type AgentConfirmEvent,
  type AgentListeningEvent,
  type AgentResultEvent,
  type AgentRun,
  type AgentStartedEvent,
  type AgentStepEvent,
  type PendingConfirmation,
  type VoiceCommandEvent,
} from "./types";

interface AgentState {
  runs: AgentRun[]; // newest first
  /** Whether the mic is capturing a spoken command right now (pill spinner). */
  listening: boolean;
  /** The live transcript echoed from the voice trigger, if any. */
  heardTranscript: string;
  /** A risky step awaiting the user's Allow / Cancel, if any. */
  pendingConfirmation?: PendingConfirmation;
  /** The most recent run, or undefined. Convenience for the pill. */
  current: () => AgentRun | undefined;
  runCommand: (prompt: string) => Promise<string | undefined>;
  /** Answer the open confirmation prompt (Allow = true, Cancel = false). */
  respondConfirmation: (approved: boolean) => Promise<void>;
  init: () => Promise<void>;
}

const MAX_RUNS = 25;

let unlisteners: UnlistenFn[] = [];
let initialized = false;

export const useAgentStore = create<AgentState>((set, get) => ({
  runs: [],
  listening: false,
  heardTranscript: "",
  pendingConfirmation: undefined,

  current: () => get().runs[0],

  runCommand: async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return undefined;
    try {
      const taskId = await invoke<string>("run_agent_command", { prompt: trimmed });
      return taskId;
    } catch (e) {
      console.error("[agent] run_agent_command failed", e);
      return undefined;
    }
  },

  respondConfirmation: async (approved: boolean) => {
    const pending = get().pendingConfirmation;
    if (!pending) return;
    set({ pendingConfirmation: undefined });
    try {
      await invoke("respond_agent_confirmation", {
        stepId: pending.stepId,
        approved,
      });
    } catch (e) {
      console.error("[agent] respond_agent_confirmation failed", e);
    }
  },

  init: async () => {
    if (initialized) return;
    initialized = true;

    const onStarted = await listen<AgentStartedEvent>(EVT_STARTED, (e) => {
      const p = e.payload;
      set((s) => ({
        listening: false,
        heardTranscript: "",
        runs: [
          {
            taskId: p.taskId,
            title: p.title,
            prompt: p.prompt,
            phase: "running" as const,
            steps: [],
            startedAt: Date.now(),
          },
          ...s.runs.filter((r) => r.taskId !== p.taskId),
        ].slice(0, MAX_RUNS),
      }));
    });

    const onStep = await listen<AgentStepEvent>(EVT_STEP, (e) => {
      const { taskId, step } = e.payload;
      set((s) => ({
        runs: s.runs.map((r) => {
          if (r.taskId !== taskId) return r;
          const idx = r.steps.findIndex((x) => x.id === step.id);
          const steps =
            idx >= 0
              ? r.steps.map((x, i) => (i === idx ? step : x)) // upsert by id
              : [...r.steps, step];
          return { ...r, steps };
        }),
      }));
    });

    const onResult = await listen<AgentResultEvent>(EVT_RESULT, (e) => {
      const p = e.payload;
      set((s) => ({
        // A run finishing closes any confirmation prompt it owned.
        pendingConfirmation:
          s.pendingConfirmation?.taskId === p.taskId
            ? undefined
            : s.pendingConfirmation,
        runs: s.runs.map((r) =>
          r.taskId === p.taskId
            ? { ...r, phase: p.ok ? "done" : "failed", result: p }
            : r,
        ),
      }));
    });

    // The voice trigger echoes what it heard before the run officially starts,
    // so the closed pill can show "Heard: …" with a spinner.
    const onVoice = await listen<VoiceCommandEvent>(EVT_VOICE, (e) => {
      set({ listening: true, heardTranscript: e.payload.transcript });
    });

    // The mic started/stopped capturing (before any transcript). Drives the
    // pill's "Listening…" spinner the moment the Floe key goes down.
    const onListening = await listen<AgentListeningEvent>(EVT_LISTENING, (e) => {
      if (e.payload.listening) {
        set({ listening: true, heardTranscript: "" });
      } else {
        set({ listening: false });
      }
    });

    // A risky step wants approval. Surface the Allow / Cancel prompt.
    const onConfirm = await listen<AgentConfirmEvent>(EVT_CONFIRM, (e) => {
      set({ pendingConfirmation: e.payload });
    });

    unlisteners = [onStarted, onStep, onResult, onVoice, onListening, onConfirm];
  },
}));

// ── Voice-capture triggers (the Floe push-to-talk key) ──────────────────────
//
// These are the functions the central key→action dispatcher routes the Floe
// agent binding to: `agent_trigger { phase: "start" }` → `startAgentCapture()`,
// `phase: "stop"` → `stopAgentCapture()`. They only `invoke` the backend
// commands (recording lives in Rust); the pill reacts to the emitted
// `keyfloe://agent/*` events, so these work from any window.

/** Floe key down: begin capturing the spoken command. */
export async function startAgentCapture(): Promise<void> {
  try {
    await invoke("start_agent_capture");
  } catch (e) {
    console.error("[agent] start_agent_capture failed", e);
  }
}

/** Floe key up: stop capture, transcribe, and hand the transcript to the agent. */
export async function stopAgentCapture(): Promise<void> {
  try {
    await invoke("stop_agent_capture");
  } catch (e) {
    console.error("[agent] stop_agent_capture failed", e);
  }
}

/** Tear down listeners (e.g. on hot-reload). Optional. */
export function disposeAgentStore() {
  unlisteners.forEach((u) => u());
  unlisteners = [];
  initialized = false;
}
