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
  EVT_RESULT,
  EVT_STARTED,
  EVT_STEP,
  EVT_VOICE,
  type AgentResultEvent,
  type AgentRun,
  type AgentStartedEvent,
  type AgentStepEvent,
  type VoiceCommandEvent,
} from "./types";

interface AgentState {
  runs: AgentRun[]; // newest first
  /** Whether the mic is capturing a spoken command right now (pill spinner). */
  listening: boolean;
  /** The live transcript echoed from the voice trigger, if any. */
  heardTranscript: string;
  /** The most recent run, or undefined. Convenience for the pill. */
  current: () => AgentRun | undefined;
  runCommand: (prompt: string) => Promise<string | undefined>;
  init: () => Promise<void>;
}

const MAX_RUNS = 25;

let unlisteners: UnlistenFn[] = [];
let initialized = false;

export const useAgentStore = create<AgentState>((set, get) => ({
  runs: [],
  listening: false,
  heardTranscript: "",

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

    unlisteners = [onStarted, onStep, onResult, onVoice];
  },
}));

/** Tear down listeners (e.g. on hot-reload). Optional. */
export function disposeAgentStore() {
  unlisteners.forEach((u) => u());
  unlisteners = [];
  initialized = false;
}
