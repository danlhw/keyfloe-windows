// Feature C — Floe agent frontend types.
//
// These mirror the Rust event payloads in
// `src-tauri/src/keyfloe/agent/types.rs`. The backend emits them (camelCase)
// on the `keyfloe://agent/*` events; the store below listens and the pill UI
// renders them as live step cards.

export type StepStatus = "running" | "done" | "failed";

export interface AgentStep {
  id: string;
  title: string; // "Opening website"
  detail: string; // "dashboard.stripe.com"
  toolName: string; // raw tool name → drives the icon
  status: StepStatus;
  resultSnippet?: string; // trimmed tool result, shown on tap-to-inspect
}

export interface ReportItem {
  name: string;
  detail?: string;
  price?: string;
  url?: string;
}

export interface AgentReport {
  title?: string;
  items: ReportItem[];
  pick?: string;
}

// ── Event payloads (match the Rust `#[serde(rename_all = "camelCase")]`) ──

export interface AgentStartedEvent {
  taskId: string;
  prompt: string;
  title: string;
}

export interface AgentStepEvent {
  taskId: string;
  step: AgentStep;
}

export interface AgentResultEvent {
  taskId: string;
  ok: boolean;
  text: string;
  citedUrls: string[];
  suggestedActions: string[];
  report?: AgentReport;
  error?: string;
}

export interface VoiceCommandEvent {
  transcript: string;
}

// Tauri event names — keep in sync with `session.rs` / `commands.rs`.
export const EVT_STARTED = "keyfloe://agent/started";
export const EVT_STEP = "keyfloe://agent/step";
export const EVT_RESULT = "keyfloe://agent/result";
export const EVT_VOICE = "keyfloe://agent/voice-command";

// A run as the UI tracks it: the started metadata + its accumulating steps +
// (once finished) its result.
export type RunPhase = "listening" | "running" | "done" | "failed";

export interface AgentRun {
  taskId: string;
  title: string;
  prompt: string;
  phase: RunPhase;
  steps: AgentStep[];
  result?: AgentResultEvent;
  startedAt: number;
}
