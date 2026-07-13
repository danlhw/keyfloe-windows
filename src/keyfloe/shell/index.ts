/**
 * Keyfloe shell — brand + dashboard + onboarding + pill.
 * Import from here; App.tsx mounts these (see INTEGRATION.md).
 *
 * IMPORTANT: import the CSS once at the app entry:
 *   import "./keyfloe/shell/keyfloe.css";
 */
export { KeyfloeDashboard } from "./Dashboard";
export type { DashboardTab, DashboardSlots, DashboardAccount } from "./Dashboard";

export { KeyfloeOnboarding } from "./Onboarding";
export type { OnboardingPermissions } from "./Onboarding";

export { KeyfloePill } from "./Pill";
export type { PillMessage, PillRole, PillMode } from "./Pill";

export {
  pillStore,
  usePillStore,
  initPillListeners,
} from "./pillMessageStore";
export type { PillMessageEvent } from "./pillMessageStore";

export { KeyfloeKeyboard } from "./components/KeyfloeKeyboard";
export { KeyfloeLogo } from "./components/KeyfloeLogo";
export {
  Eyebrow,
  DisplayTitle,
  PrimaryButton,
  SecondaryButton,
  KeyCap,
  Chip,
  Panel,
} from "./components/primitives";

export {
  HomeTab,
  HistoryTab,
  KeysTab,
  InterviewTab,
  AccountTab,
  SettingsTab,
} from "./Tabs";

export { KEY_ACTIONS } from "./keyActions";
export type { KeyActionDef, Trigger, FeatureId } from "./keyActions";
export { KF } from "./tokens";
export type { KfTheme } from "./tokens";
