// Feature F — key remapping (tap/hold custom key bindings).
// Public surface for the shell/app to mount. See INTEGRATION.md.

export { KeybindingPanel } from "./KeybindingPanel";
export { useKeybindings } from "./useKeybindings";
export { keybindingApi } from "./api";
export * from "./types";

// The central key -> action dispatcher (mount once in App). See P1-01.
export {
  useFeatureDispatch,
  startFeatureDispatch,
  stopFeatureDispatch,
  registerFeatureHandler,
  registerFeatureHandlers,
  type FeatureHandler,
} from "./useFeatureDispatch";
export {
  FEATURE_TRIGGER_EVENT,
  FEATURE_DOM_EVENT,
  dispatchKey,
  featureDomEvent,
  type FeatureTriggerEvent,
  type FeaturePhase,
  type FeatureGesture,
} from "./featureTriggerEvent";

// Windows-correct default action metadata for the Home / Cursor & Keys binder
// rows (replaces the stale Mac-flavoured shell keyActions.ts). See P1-04.
export {
  WINDOWS_KEY_ACTIONS,
  keyLabelForId,
  type KeyActionMeta,
  type ActionTrigger,
} from "./homeActions";
