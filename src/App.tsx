import { useEffect, useState, useRef } from "react";
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
} from "./keyfloe/shell";
import { KeybindingPanel } from "./keyfloe/keybinding";
import { DictationPanel, DictationHistory } from "./keyfloe/dictation";
import { InterviewContextPanel } from "./keyfloe/interview";
import { commands } from "@/bindings";
import { useSettingsStore } from "./stores/settingsStore";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";

type OnboardingStep = "onboarding" | "done";

function App() {
  const { t, i18n } = useTranslation();
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(
    null,
  );
  const [tab, setTab] = useState<DashboardTab>("home");
  const direction = getLanguageDirection(i18n.language);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const hasCompletedPostOnboardingInit = useRef(false);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

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
    // model download), so we go through the settings store. The dedicated
    // Rust persister for this key is wired in the backend-integration phase.
    try {
      await updateSetting("onboarding_completed", true);
    } catch (e) {
      console.warn("Failed to persist onboarding_completed:", e);
    }
    setOnboardingStep("done");
  };

  // Still resolving first-run state.
  if (onboardingStep === null) return null;

  if (onboardingStep === "onboarding") {
    return (
      <div dir={direction} className="kf-root">
        <KeyfloeOnboarding onFinish={finishOnboarding} />
      </div>
    );
  }

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
        onTab={setTab}
        slots={{
          keys: <KeybindingPanel />,
          history: <DictationHistory />,
          interview: <InterviewContextPanel />,
          settings: <DictationPanel />,
        }}
      />
    </div>
  );
}

export default App;
