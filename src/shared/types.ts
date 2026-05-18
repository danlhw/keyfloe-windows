// Types shared between main and renderer processes. Imported from both
// sides via the @shared/* path alias. Do not import Electron, Node, or
// DOM-only types here — anything that crosses the contextBridge has to
// be structured-cloneable.

export type Role = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  isStreaming?: boolean;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export type VoiceUIState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'transcribing' }
  | { kind: 'error'; message: string };

export type InterviewRole = 'Me' | 'Interviewer';

export interface InterviewTurn {
  id: string;
  role: InterviewRole;
  text: string;
  startedAt: number;
  isLive: boolean;
}

export interface InterviewState {
  isRunning: boolean;
  turns: InterviewTurn[];
  micLevel: number;
  systemAudioActive: boolean;
  startedAt: number | null;
  lastError: string | null;
}

// The activation key — Right-Ctrl by default. Stored in electron-store
// under 'activationKey' so the user's Settings choice survives restart.
export type ActivationKey = 'RightCtrl' | 'RightAlt' | 'CapsLock' | 'F8';

export interface AppSettings {
  activationKey: ActivationKey;
  stealthMode: boolean;
  proReasoning: boolean;
  whisperModel: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo';
  workerUrl: string;
  anthropicApiKey: string | null;
  deepseekApiKey: string | null;
  openaiApiKey: string | null;
}

// Clicky pointer state — drives the transparent overlay window.
export interface PointerTarget {
  // Screen coordinates of the element Claude wants the cursor to point at.
  x: number;
  y: number;
  // The bubble text shown next to the cursor when pointing.
  message: string;
  // 'point' = land + hold, 'click' = land then synthesize a click.
  mode: 'point' | 'click';
}

export interface PointerState {
  mode: 'hidden' | 'following' | 'navigating' | 'pointing';
  target: PointerTarget | null;
  cursor: { x: number; y: number };
}
