import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { toast, Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import { ModelStateEvent, RecordingErrorEvent } from "./lib/types/events";
import "./App.css";
// Keyfloe brand + shell. The design system CSS must load once, here.
import "./keyfloe/shell/keyfloe.css";
import {
  KeyfloeOnboarding,
  KeyfloeDashboard,
  type DashboardTab,
  type OnboardingPermissions,
} from "./keyfloe/shell";
// The central key -> action dispatcher (P1-01). Mounting this once attaches the
// app-lifetime `feature_trigger` listener that routes every bound tap/hold to
// the right feature action (chat/dictation/snapshot/interview/agent/...).
import { KeybindingPanel, useFeatureDispatch } from "./keyfloe/keybinding";
import { DictationPanel, DictationHistory } from "./keyfloe/dictation";
// The interview-folder InterviewTab renders only the session body; the shell's
// own InterviewTab wrapper supplies the scroll container + header (name clash,
// so alias this one).
import { InterviewTab as InterviewBody } from "./keyfloe/interview";
import { AccountProvider, useAccount, SignIn, Connections } from "./keyfloe/auth";
import ModelSelector from "@/components/model-selector";
import { GeneralSettings, ModelsSettings } from "@/components/settings";
import { useModelStore } from "./stores/modelStore";
import { commands } from "@/bindings";
import { useSettingsStore } from "./stores/settingsStore";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";

type OnboardingStep = "onboarding" | "done";

/* ── Settings tab: Handy's full surface + Keyfloe AI-polish/vocab/stats ──── */
function SettingsView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <GeneralSettings />
      <ModelsSettings />
      <DictationPanel />
    </div>
  );
}

/* ── Post-onboarding dashboard (inside AccountProvider so it can read /me) ── */
function AppShell({
  tab,
  onTab,
  direction,
}: {
  tab: DashboardTab;
  onTab: (t: DashboardTab) => void;
  direction: "ltr" | "rtl";
}) {
  const { t } = useTranslation();
  const { account, signOut } = useAccount();

  // Attach the key -> action dispatcher for the whole app lifetime.
  useFeatureDispatch();

  return (
    <div dir={direction} className="kf-root h-screen select-none cursor-default">
      <Toaster
        theme="system"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "kf-toast bg-background border border-mid-gray/20 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 text-sm",
            title: "font-medium",
            description: "text-mid-gray",
          },
        }}
      />
      <KeyfloeDashboard
        tab={tab}
        onTab={onTab}
        account={account ?? undefined}
        onSignOut={() => {
          void signOut().catch(() =>
            toast.error(t("errors.recordingFailed", { error: "Sign out failed" })),
          );
        }}
        slots={{
          keys: <KeybindingPanel />,
          history: <DictationHistory />,
          interview: <InterviewBody />,
          settings: <SettingsView />,
          accountSignIn: <SignIn />,
          connections: <Connections />,
        }}
      />
    </div>
  );
}

function App() {
  const { t, i18n } = useTranslation();
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(
    null,
  );
  const [tab, setTab] = useState<DashboardTab>("home");
  const direction = getLanguageDirection(i18n.language);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const hasCompletedPostOnboardingInit = useRef(false);

  // Onboarding permission wiring (mic + Whisper model download).
  const [micGranted, setMicGranted] = useState(false);
  const modelReady = useModelStore((s) =>
    s.models.some((m) => m.is_downloaded),
  );

  const refreshMic = useCallback(async () => {
    try {
      const status = await commands.getWindowsMicrophonePermissionStatus();
      setMicGranted(status.overall_access === "allowed");
    } catch {
      // Non-Windows / unsupported: leave as-is (the flow still advances).
    }
  }, []);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

  // Poll mic permission while onboarding so the "Allow microphone" step flips
  // to "Continue" once the user grants it in Windows Settings.
  useEffect(() => {
    if (onboardingStep !== "onboarding") return;
    void refreshMic();
    const id = setInterval(refreshMic, 1500);
    return () => clearInterval(id);
  }, [onboardingStep, refreshMic]);

  // Load the model registry so onboarding's ModelSelector + modelReady work.
  useEffect(() => {
    void useModelStore.getState().loadModels();
  }, []);

  // Bring up the native input/shortcut layer once we reach the app proper.
  useEffect(() => {
    if (onboardingStep === "done" && !hasCompletedPostOnboardingInit.current) {
      hasCompletedPostOnboardingInit.current = true;
      Promise.all([
        commands.initializeEnigo(),
        commands.initializeShortcuts(),
      ]).catch((e) => {
        console.warn("Failed to initialize native layer:", e);
      });
    }
  }, [onboardingStep]);

  // Backend recording errors → user-friendly toast.
  useEffect(() => {
    const unlisten = listen<RecordingErrorEvent>("recording-error", (event) => {
      const { error_type, detail } = event.payload;
      if (error_type === "microphone_permission_denied") {
        const platformKey = `errors.micPermissionDenied.${platform()}`;
        toast.error(t("errors.micPermissionDeniedTitle"), {
          description: t(platformKey, {
            defaultValue: t("errors.micPermissionDenied.generic"),
          }),
        });
      } else if (error_type === "no_input_device") {
        toast.error(t("errors.noInputDeviceTitle"), {
          description: t("errors.noInputDevice"),
        });
      } else {
        toast.error(
          t("errors.recordingFailed", { error: detail ?? "Unknown error" }),
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  useEffect(() => {
    const unlisten = listen("paste-error", () => {
      toast.error(t("errors.pasteFailedTitle"), {
        description: t("errors.pasteFailed"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  useEffect(() => {
    const unlisten = listen<string>("transcription-error", (event) => {
      toast.error(t("errors.transcriptionFailedTitle"), {
        description: event.payload,
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  useEffect(() => {
    const unlisten = listen<ModelStateEvent>("model-state-changed", (event) => {
      if (event.payload.event_type === "loading_failed") {
        toast.error(
          t("errors.modelLoadFailed", {
            model:
              event.payload.model_name || t("errors.modelLoadFailedUnknown"),
          }),
          { description: event.payload.error },
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  const checkOnboardingStatus = async () => {
    try {
      const settingsResult = await commands.getAppSettings();
      const done =
        settingsResult.status === "ok" &&
        settingsResult.data.onboarding_completed === true;
      setOnboardingStep(done ? "done" : "onboarding");
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      setOnboardingStep("onboarding");
    }
  };

  const finishOnboarding = async () => {
    // Persist so onboarding doesn't re-show. Handy has no standalone
    // "onboarding complete" command (it flips the flag as a side-effect of
    // model download), so we go through the settings store.
    try {
      await updateSetting("onboarding_completed", true);
    } catch (e) {
      console.warn("Failed to persist onboarding_completed:", e);
    }
    setOnboardingStep("done");
  };

  const perms = useMemo<OnboardingPermissions>(
    () => ({
      micGranted,
      // Windows has no in-process mic consent dialog; the mic-privacy settings
      // page is where the user grants it, then the poll above flips micGranted.
      requestMic: () => {
        void commands.openMicrophonePrivacySettings();
      },
      openMicSettings: () => {
        void commands.openMicrophonePrivacySettings();
      },
      modelReady,
    }),
    [micGranted, modelReady],
  );

  // Still resolving first-run state.
  if (onboardingStep === null) return null;

  if (onboardingStep === "onboarding") {
    return (
      <div dir={direction} className="kf-root">
        <KeyfloeOnboarding
          onFinish={finishOnboarding}
          perms={perms}
          modelSlot={<ModelSelector />}
        />
      </div>
    );
  }

  return (
    <AccountProvider>
      <AppShell tab={tab} onTab={setTab} direction={direction} />
    </AccountProvider>
  );
}

export default App;
