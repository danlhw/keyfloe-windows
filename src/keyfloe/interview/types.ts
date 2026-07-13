// Shared FE types + the FE↔BE event/command contract for interview mode.
// Event names + command names must stay in lockstep with
// `src-tauri/src/keyfloe/interview/{session,mod}.rs`.

export type InterviewRole = "Me" | "Interviewer";

export interface InterviewTurn {
  id: string;
  role: InterviewRole;
  text: string;
  isLive: boolean;
  /** epoch seconds */
  startedAt: number;
}

export interface InterviewStateDto {
  running: boolean;
  systemAudioActive: boolean;
  error: string | null;
}

// ---- Pre-interview context (mirrors the Rust `context` module / Mac stores)

export interface InterviewProfile {
  id: string;
  name: string;
  resumeText: string;
  jobDescription: string;
  companyInfo: string;
  notes: string;
}

export interface ResumeDoc {
  id: string;
  label: string;
  body: string;
  enabled: boolean;
}

export interface InterviewContext {
  aboutMe: string;
  profiles: InterviewProfile[];
  activeProfileId: string | null;
  docs: ResumeDoc[];
}

export const EMPTY_CONTEXT: InterviewContext = {
  aboutMe: "",
  profiles: [],
  activeProfileId: null,
  docs: [],
};

// ---- Tauri event names (emitted by the Rust session) ----
export const EV = {
  turns: "interview://turns",
  state: "interview://state",
  micLevel: "interview://mic-level",
  answerBegin: "interview://answer-begin",
  answerDelta: "interview://answer-delta",
  answerEnd: "interview://answer-end",
  answerError: "interview://answer-error",
} as const;

// ---- Tauri command names (registered from lib.rs — see INTEGRATION.md) ----
export const CMD = {
  start: "interview_start",
  stop: "interview_stop",
  toggle: "interview_toggle",
  isRunning: "interview_is_running",
  askAnswer: "interview_ask_answer",
  ensureOverlay: "interview_ensure_overlay",
  setOverlayVisible: "interview_set_overlay_visible",
  getContext: "interview_get_context",
  saveContext: "interview_save_context",
} as const;
