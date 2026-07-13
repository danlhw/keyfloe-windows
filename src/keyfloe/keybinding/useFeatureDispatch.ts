/**
 * The central key -> action dispatcher (PRD Phase 1, the highest-value wire).
 *
 * The native engine emits `feature_trigger` for every bound tap/hold. Before
 * this hook existed there were ZERO listeners, so pressing any bound key did
 * nothing. `useFeatureDispatch()` (mounted once, app-lifetime) subscribes and
 * routes each trigger to the right action:
 *
 *   chat            -> open the pill / compose               (one-shot)
 *   dictation       -> start / stop recording                (continuous)
 *   snapshot        -> snapshot_begin marquee                (one-shot)
 *   interview       -> ensure overlay + start / stop session (continuous)
 *   agent           -> start / stop agent voice capture      (continuous)
 *   voice_command   -> start / stop screen voice command     (continuous)
 *   ai_answer       -> screen answer                         (one-shot)
 *   dashboard       -> open the dashboard window             (one-shot)
 *   custom_feature  -> run the custom skill                  (one-shot)
 *
 * ## How other features plug in
 * Each feature owns its own start/stop/trigger logic. Two ways to receive it:
 *
 *  1. Register a typed handler (preferred for in-process FE state, e.g. the
 *     agent store or the interview session):
 *
 *        registerFeatureHandler("agent", {
 *          start: () => useAgentStore.getState().startVoiceCapture(),
 *          stop:  () => useAgentStore.getState().stopVoiceCapture(),
 *        });
 *
 *  2. Listen to the re-broadcast DOM CustomEvent (no import of this module):
 *
 *        window.addEventListener("keyfloe:chat", (e) => open(e.detail));
 *
 * When neither a handler nor a listener is registered for a feature, the
 * dispatcher falls back to a best-effort Tauri command (see DEFAULT_COMMANDS)
 * so the app is usable out of the box. Every path is error-swallowed: a missing
 * command or a throwing handler never breaks the key hook.
 */
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  FEATURE_DOM_EVENT,
  FEATURE_TRIGGER_EVENT,
  dispatchKey,
  featureDomEvent,
  type FeaturePhase,
  type FeatureTriggerEvent,
} from "./featureTriggerEvent";

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

export interface FeatureHandler {
  /** continuous feature became active (hold begin / tap-toggle on). */
  start?: (ev: FeatureTriggerEvent) => void | Promise<void>;
  /** continuous feature became inactive (hold release / tap-toggle off). */
  stop?: (ev: FeatureTriggerEvent) => void | Promise<void>;
  /** one-shot feature fired once. */
  trigger?: (ev: FeatureTriggerEvent) => void | Promise<void>;
}

/** feature key (`chat`, `dictation`, …, or `custom_feature`) -> handler. */
const handlers: Record<string, FeatureHandler> = {};

/**
 * Register (or merge) a handler for one feature. Returns an unregister fn.
 * Later calls merge phase-by-phase so a feature can register `start`/`stop`
 * independently. Pass `custom_feature` to handle every user-created feature.
 */
export function registerFeatureHandler(
  feature: string,
  handler: FeatureHandler,
): () => void {
  handlers[feature] = { ...handlers[feature], ...handler };
  return () => {
    const cur = handlers[feature];
    if (!cur) return;
    // Only remove the phases this registration added.
    for (const phase of Object.keys(handler) as (keyof FeatureHandler)[]) {
      if (cur[phase] === handler[phase]) delete cur[phase];
    }
    if (Object.keys(cur).length === 0) delete handlers[feature];
  };
}

/** Register several handlers at once. Returns one unregister fn for all. */
export function registerFeatureHandlers(
  map: Record<string, FeatureHandler>,
): () => void {
  const undos = Object.entries(map).map(([f, h]) =>
    registerFeatureHandler(f, h),
  );
  return () => undos.forEach((u) => u());
}

// ---------------------------------------------------------------------------
// Default (out-of-the-box) command routing
// ---------------------------------------------------------------------------

/**
 * Best-effort Tauri commands used only when no handler/listener overrides a
 * feature. `undefined` for a phase means "DOM broadcast only" (no default
 * command yet — the owning feature registers a handler). Every invoke is
 * wrapped in try/catch, so naming a command that is not yet registered is safe.
 */
async function runDefault(ev: FeatureTriggerEvent): Promise<void> {
  const key = dispatchKey(ev);
  const phase = ev.phase;
  try {
    switch (key) {
      case "chat":
        // One-shot: open the pill next to the cursor.
        await tryInvoke("open_chat_pill");
        break;

      case "snapshot":
        // One-shot: start the region marquee.
        if (phase !== "stop") await invoke("snapshot_begin");
        break;

      case "interview":
        if (phase === "start") {
          await tryInvoke("interview_ensure_overlay");
          await invoke("interview_start");
        } else if (phase === "stop") {
          await invoke("interview_stop");
        }
        break;

      case "agent":
        // Continuous: push-to-talk voice capture -> run_agent_voice_command.
        if (phase === "start") await invoke("start_agent_capture");
        else if (phase === "stop") await invoke("stop_agent_capture");
        break;

      case "voice_command":
        // Continuous: speak, answer from screen. Shares the agent capture
        // pipeline with a distinct mode flag.
        if (phase === "start")
          await tryInvoke("start_agent_capture", { mode: "voice_command" });
        else if (phase === "stop") await tryInvoke("stop_agent_capture");
        break;

      case "dictation":
        // Continuous: push-to-talk transcription. The recording pipeline is
        // owned by the dictation feature; it registers real start/stop
        // handlers. These command names are the documented fallback.
        if (phase === "start")
          await tryInvoke("keyfloe_dictation_start", { source: "keybinding" });
        else if (phase === "stop") await tryInvoke("keyfloe_dictation_stop");
        break;

      case "custom_feature":
        // Run the user-created instruction against the screen.
        await tryInvoke("run_custom_feature", { feature: ev.custom });
        break;

      // ai_answer, dashboard: DOM broadcast only until a command lands.
      default:
        break;
    }
  } catch (e) {
    console.debug("[keyfloe dispatch] default action failed:", key, phase, e);
  }
}

/** invoke that never rejects (for commands that may not be registered yet). */
async function tryInvoke(cmd: string, args?: Record<string, unknown>) {
  try {
    await invoke(cmd, args);
  } catch (e) {
    console.debug("[keyfloe dispatch] command unavailable:", cmd, e);
  }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function handlerFor(
  key: string,
  phase: FeaturePhase,
): ((ev: FeatureTriggerEvent) => void | Promise<void>) | undefined {
  const h = handlers[key];
  if (!h) return undefined;
  if (phase === "start") return h.start;
  if (phase === "stop") return h.stop;
  return h.trigger;
}

function route(ev: FeatureTriggerEvent): void {
  // Always re-broadcast so same-window components can react without importing
  // the registry (pill / agent / interview panels mounted elsewhere).
  try {
    window.dispatchEvent(new CustomEvent(FEATURE_DOM_EVENT, { detail: ev }));
    window.dispatchEvent(new CustomEvent(featureDomEvent(ev), { detail: ev }));
  } catch {
    /* non-DOM context (should not happen in a webview) */
  }

  const fn = handlerFor(dispatchKey(ev), ev.phase);
  if (fn) {
    Promise.resolve(fn(ev)).catch((e) =>
      console.debug("[keyfloe dispatch] handler threw:", ev.feature, e),
    );
    return;
  }
  void runDefault(ev);
}

// ---------------------------------------------------------------------------
// Listener lifecycle (ref-counted singleton — safe under React StrictMode)
// ---------------------------------------------------------------------------

let refCount = 0;
let unlistenPromise: Promise<UnlistenFn> | null = null;

/** Attach the `feature_trigger` listener (idempotent, ref-counted). */
export function startFeatureDispatch(): void {
  refCount += 1;
  if (refCount === 1) {
    unlistenPromise = listen<FeatureTriggerEvent>(
      FEATURE_TRIGGER_EVENT,
      (e) => route(e.payload),
    );
  }
}

/** Detach when the last consumer unmounts. */
export function stopFeatureDispatch(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && unlistenPromise) {
    const p = unlistenPromise;
    unlistenPromise = null;
    p.then((un) => un()).catch(() => {});
  }
}

/**
 * Mount once at the top of the post-onboarding App tree so key -> action
 * routing is live for the whole app lifetime regardless of the active tab.
 *
 * @param overrides optional handlers registered for this mount's lifetime.
 */
export function useFeatureDispatch(
  overrides?: Record<string, FeatureHandler>,
): void {
  useEffect(() => {
    const undoOverrides = overrides
      ? registerFeatureHandlers(overrides)
      : undefined;
    startFeatureDispatch();
    return () => {
      stopFeatureDispatch();
      undoOverrides?.();
    };
    // Handlers are registered by identity; re-running on every render is not
    // desired. Callers should pass a stable `overrides` object (or none).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
