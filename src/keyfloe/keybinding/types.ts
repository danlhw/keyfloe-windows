// TypeScript mirror of the Rust keybinding model
// (src-tauri/src/keyfloe/keybinding/model.rs). Kept hand-written so the UI does
// not depend on the generated bindings.ts (which this feature must not edit).

export type Feature =
  | "chat"
  | "dictation"
  | "snapshot"
  | "agent"
  | "interview"
  | "ai_answer"
  | "voice_command"
  | "dashboard";

export type Gesture = "tap" | "hold";

export type OutputMode = "clipboard" | "chat";

// serde tag = "kind", rename_all = "snake_case"
export type ActionRef =
  | { kind: "builtin"; feature: Feature }
  | { kind: "custom"; id: string };

export interface Binding {
  tap: ActionRef | null;
  hold: ActionRef | null;
}

export interface CustomFeature {
  id: string;
  name: string;
  instruction: string;
  explanation: string;
  icon: string;
  outputs: OutputMode[];
}

export interface KeybindingConfig {
  version: number;
  bindings: Record<string, Binding>;
  custom_features: CustomFeature[];
}

export interface FeatureInfo {
  id: Feature;
  is_continuous: boolean;
}

export interface KeybindingMeta {
  assignable_keys: string[];
  tap_only_keys: string[];
  features: FeatureInfo[];
  max_custom_features: number;
  tap_max_ms: number;
  hold_threshold_ms: number;
}

export type AssignResult =
  | { status: "assigned" }
  | { status: "conflict"; key_id: string; gesture: Gesture }
  | { status: "rejected"; message: string };

export function actionsEqual(
  a: ActionRef | null,
  b: ActionRef | null,
): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "builtin" && b.kind === "builtin")
    return a.feature === b.feature;
  if (a.kind === "custom" && b.kind === "custom") return a.id === b.id;
  return false;
}

export function actionIdentity(a: ActionRef): string {
  return a.kind === "builtin" ? `b:${a.feature}` : `c:${a.id}`;
}
