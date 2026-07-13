// Interview mode — imperative action wrappers.
//
// These are the clean start/stop/toggle entry points the key→action dispatcher
// (keybinding/useFeatureDispatch, task P1-01) routes the `interview` feature to,
// and that the dashboard's InterviewTab drives its Start/Stop button with. They
// wrap the raw Tauri commands (see types.ts CMD) so callers never invoke by
// string. Every call shows/creates the invisible overlay window as a side
// effect of the underlying command (interview_start / interview_toggle both
// call overlay::set_overlay_visible on the Rust side).
//
// Dispatcher contract: interview is a CONTINUOUS/mode feature, so route it to
// `toggleInterview()` on the `start`/`trigger` phase only (do NOT also toggle on
// the `stop` phase, or a single key press would flip the mode on then off).

import { invoke } from "@tauri-apps/api/core";
import { CMD } from "./types";

/** Pre-create the (hidden) overlay window so the first toggle has no latency. */
export function ensureInterviewOverlay(): Promise<void> {
  return invoke<void>(CMD.ensureOverlay).catch((e) => {
    console.error("interview: ensureOverlay failed", e);
  });
}

/** Start interview mode (opens the invisible overlay + dual-audio capture). */
export function startInterview(): Promise<void> {
  return invoke<void>(CMD.start).catch((e) => {
    console.error("interview: start failed", e);
  });
}

/** Stop interview mode (ends capture; the overlay stays for review). */
export function stopInterview(): Promise<void> {
  return invoke<void>(CMD.stop).catch((e) => {
    console.error("interview: stop failed", e);
  });
}

/**
 * Toggle interview mode. Returns the new running state. This is the function the
 * keybinding dispatcher calls for the bound interview/chat key.
 */
export function toggleInterview(): Promise<boolean> {
  return invoke<boolean>(CMD.toggle).catch((e) => {
    console.error("interview: toggle failed", e);
    return false;
  });
}

/** Show or hide the overlay window without stopping capture. */
export function setInterviewOverlayVisible(visible: boolean): Promise<void> {
  return invoke<void>(CMD.setOverlayVisible, { visible }).catch((e) => {
    console.error("interview: setOverlayVisible failed", e);
  });
}
