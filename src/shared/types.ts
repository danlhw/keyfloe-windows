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

// Appearance — tri-state, matching Mac's AppearanceController:
//   system → follow OS prefers-color-scheme
//   light  → force light
//   dark   → force dark
export type Appearance = 'system' | 'light' | 'dark';

// Stealth — tri-state, matching Mac's StealthMode:
//   auto       → invisible to screen recordings when pill is open
//   always-on  → always invisible
//   always-off → always visible (default macOS behavior)
export type StealthMode = 'auto' | 'always-on' | 'always-off';

export interface AppSettings {
  activationKey: ActivationKey;
  stealthMode: StealthMode;
  appearance: Appearance;
  proReasoning: boolean;
  whisperModel: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo';
  workerUrl: string;
  // BYOK kept in the shape (so dev/power-user override still works via
  // the electron-store file) but the Settings UI no longer surfaces
  // these fields — Keyfloe is SaaS, all traffic goes through the Worker.
  anthropicApiKey: string | null;
  deepseekApiKey: string | null;
  openaiApiKey: string | null;
  interviewResume: string | null;
  // Onboarding state — true after first launch is acknowledged.
  onboardingComplete: boolean;
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
