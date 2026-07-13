/**
 * The single, typed FE contract for key -> action events.
 *
 * The native keybinding engine (`src-tauri/src/keyfloe/keybinding/dispatch.rs`)
 * emits, per trigger, TWO Tauri events with the SAME payload:
 *   1. the unified  `feature_trigger`
 *   2. a per-feature convenience event: `<feature>_trigger`
 *      (e.g. `chat_trigger`, `dictation_trigger`, `snapshot_trigger`,
 *      `agent_trigger`, `interview_trigger`, `ai_answer_trigger`,
 *      `voice_command_trigger`, `dashboard_trigger`) or, for a user-created
 *      custom feature, `custom_feature_trigger`.
 *
 * `useFeatureDispatch` (this folder) listens on the unified channel and routes
 * every trigger to the right action. This file is the one place the whole
 * frontend types the contract — mirror of the Rust `FeatureTrigger` struct.
 */
import type { CustomFeature } from "./types";

/** `start`/`stop` for continuous features; `trigger` for one-shots. */
export type FeaturePhase = "start" | "stop" | "trigger";

/** Which gesture produced the trigger. */
export type FeatureGesture = "tap" | "hold";

/**
 * Unified payload for `feature_trigger` (and every `<feature>_trigger`).
 * 1:1 with `dispatch::FeatureTrigger` in the backend.
 */
export interface FeatureTriggerEvent {
  /** Built-in feature rawValue (`dictation`, `chat`, …) OR the custom feature id. */
  feature: string;
  /** true when `feature` is a custom-feature id and `custom` is populated. */
  is_custom: boolean;
  /** `start` | `stop` | `trigger`. */
  phase: FeaturePhase;
  /** `tap` | `hold`. */
  gesture: FeatureGesture;
  /** The physical key id that fired this (e.g. `rctrl`, `caps`). */
  key: string;
  /** The full custom feature (instruction/outputs) when `is_custom`, else null. */
  custom: CustomFeature | null;
}

/** The unified Tauri event channel the dispatcher subscribes to. */
export const FEATURE_TRIGGER_EVENT = "feature_trigger";

/** The routing key used for a trigger (built-in feature name, or `custom_feature`). */
export function dispatchKey(ev: FeatureTriggerEvent): string {
  return ev.is_custom ? "custom_feature" : ev.feature;
}

/**
 * DOM CustomEvent the dispatcher re-broadcasts on every trigger, so any
 * component mounted in the same webview (pill, agent, interview tab, …) can
 * react without a Tauri round-trip or importing this module's registry.
 *
 * - `keyfloe:feature-trigger` — every trigger, `event.detail` = FeatureTriggerEvent
 * - `keyfloe:<key>`           — per feature, e.g. `keyfloe:chat`, `keyfloe:agent`,
 *                               `keyfloe:custom_feature`
 */
export const FEATURE_DOM_EVENT = "keyfloe:feature-trigger";
export function featureDomEvent(ev: FeatureTriggerEvent): string {
  return `keyfloe:${dispatchKey(ev)}`;
}
