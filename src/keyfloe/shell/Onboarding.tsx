/**
 * KeyfloeOnboarding — first-run flow, Windows edition, mirroring the Mac
 * OnboardingView (app/Sources/Onboarding/). Plain, welcoming English that
 * teaches the Right-Ctrl activation key and gets dictation actually usable.
 *
 * Windows differs from Mac (PRD 5.7): there is NO macOS-style Accessibility or
 * Screen-Recording permission prompt, so those steps are gone. What Windows
 * DOES need before dictation works is a microphone permission and a downloaded
 * Whisper model — dictation is inert without a model — so those are first-class
 * steps here.
 *
 * Steps: Welcome → Voice (mic) → Model (download) → Keys (feature cycle) →
 *        Plans → Done.
 *
 * Presentational. The Tauri host wires the real mic check/request via the
 * optional `perms` prop and mounts Handy's ModelSelector/DownloadProgress via
 * the `modelSlot` prop. Without them the flow still runs (buttons say "Skip for
 * now") so it previews in a browser. See INTEGRATION.md.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Keyboard, History as HistoryIcon, Command } from "lucide-react";
import { DisplayTitle, Eyebrow, PrimaryButton, SecondaryButton } from "./components/primitives";
import { KeyfloeKeyboard } from "./components/KeyfloeKeyboard";

/* ── Permission wiring the host provides (all optional) ───────────────── */
export interface OnboardingPermissions {
  micGranted?: boolean;
  /** Prompt for the Windows microphone permission. */
  requestMic?: () => void;
  /** Open Windows Settings → Privacy → Microphone (fallback if denied). */
  openMicSettings?: () => void;
  /** True once at least one Whisper model is downloaded. */
  modelReady?: boolean;
}

type Step = "welcome" | "voice" | "model" | "keys" | "plans" | "done";
const STEPS: Step[] = ["welcome", "voice", "model", "keys", "plans", "done"];

const STEP_TITLE: Record<Step, string> = {
  welcome: "Welcome to Keyfloe",
  voice: "Let Keyfloe hear you",
  model: "Download the voice model",
  keys: "Try Keyfloe",
  plans: "Pick your plan",
  done: "You're all set",
};

/* ── Feature cycle inside the "Keys" step (Windows defaults, PRD 5.1) ──── */
interface Feature {
  eyebrow: string;
  lead: string;
  accent: string;
  hint: string;
  keys: string[];
}
const FEATURES: Feature[] = [
  {
    eyebrow: "Feature 1 of 5",
    lead: "Tap Right Ctrl ",
    accent: "to chat.",
    hint: "Tap the Right Ctrl key anywhere on your PC. A chat popup floats up next to your cursor — type a question, paste a screenshot, or start a task.",
    keys: ["rctrl"],
  },
  {
    eyebrow: "Feature 2 of 5",
    lead: "Hold Right Ctrl ",
    accent: "to talk.",
    hint: "Hold Right Ctrl and start talking. Keyfloe types the words wherever your cursor is, and keeps the full text on your clipboard so you can paste it anywhere.",
    keys: ["rctrl"],
  },
  {
    eyebrow: "Feature 3 of 5",
    lead: "Tap Caps Lock ",
    accent: "to snapshot.",
    hint: "Tap Caps Lock and drag a box over anything on screen — an error, a chart, a question. Keyfloe reads what's inside and answers it.",
    keys: ["caps"],
  },
  {
    eyebrow: "Feature 4 of 5",
    lead: "Hold Caps Lock ",
    accent: "for the agent.",
    hint: "Hold Caps Lock, say a task like \"open youtube.com\", and release. Floe runs it in the background and shows each step in the pill.",
    keys: ["caps"],
  },
  {
    eyebrow: "Feature 5 of 5",
    lead: "Tap Right Alt ",
    accent: "for interviews.",
    hint: "On a call, tap Right Alt to turn on interview mode. Keyfloe listens to both sides and drafts a tailored answer in real time — invisible to screen-share.",
    keys: ["ralt"],
  },
];

/* ── Step layouts ─────────────────────────────────────────────────────── */
function WelcomeStep() {
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 22, justifyContent: "center", height: "100%" }}>
      <div>
        <span className="kf-display-lead" style={{ fontSize: 52 }}>Your keyboard,{"\n"}</span>
        <div>
          <span className="kf-display" style={{ fontSize: 56 }}>supercharged.</span>
        </div>
      </div>
      <p className="kf-muted" style={{ maxWidth: 540, fontSize: 15, lineHeight: 1.5 }}>
        Speak instead of typing. Get answers typed right at your cursor. Give any key its own
        AI skill — in every app you already use.
      </p>
      <Eyebrow>v0.1.0 · Windows 10/11</Eyebrow>
    </div>
  );
}

function VoiceStep({ granted, onOpenSettings }: { granted?: boolean; onOpenSettings?: () => void }) {
  const bullets = [
    "Microphone — Keyfloe hears you only while you hold a key to talk.",
    "Nothing is recorded or stored. Audio is turned into text and then dropped.",
    "Transcription runs on your PC, so your voice never leaves the machine.",
  ];
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18, height: "100%", justifyContent: "center" }}>
      <Eyebrow>Permission · Microphone</Eyebrow>
      <DisplayTitle lead="Let Keyfloe " accent="hear you." size={36} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bullets.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--kf-ink-400)", marginTop: 8, flex: "none" }} />
            <span style={{ fontSize: 14, lineHeight: 1.45 }} className="kf-muted">{b}</span>
          </div>
        ))}
      </div>
      {granted ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--kf-green)" }}>
          <span>✓</span>
          <span className="kf-eyebrow" style={{ color: "var(--kf-green)" }}>Microphone granted</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Eyebrow>Windows will ask once — choose Allow</Eyebrow>
          {onOpenSettings ? (
            <button className="kf-btn kf-btn-secondary" style={{ fontSize: 11, padding: "6px 12px" }} onClick={onOpenSettings}>
              Open Windows settings
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ModelStep({ ready, slot }: { ready?: boolean; slot?: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 620, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, height: "100%", justifyContent: "center" }}>
      <Eyebrow>On-device · Dictation</Eyebrow>
      <DisplayTitle lead="Download the " accent="voice model." size={34} />
      <p className="kf-muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        Dictation transcribes your voice right on your PC, so it's private and fast. Pick a model to
        download once — a smaller one is quick and light, a larger one is more accurate. You can
        change it later in Settings.
      </p>
      <div className="kf-panel" style={{ padding: slot ? 14 : 22 }}>
        {slot ?? (
          <span className="kf-muted" style={{ fontSize: 13 }}>
            The model picker mounts here. Until a model is downloaded, dictation stays inactive.
          </span>
        )}
      </div>
      {ready ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--kf-green)" }}>
          <span>✓</span>
          <span className="kf-eyebrow" style={{ color: "var(--kf-green)" }}>Model ready — dictation is live</span>
        </div>
      ) : (
        <Eyebrow>You can skip and download later in Settings</Eyebrow>
      )}
    </div>
  );
}

function KeysStep({ index, onIndex }: { index: number; onIndex: (i: number) => void }) {
  const f = FEATURES[index];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, height: "100%", justifyContent: "center" }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <Eyebrow>{f.eyebrow}</Eyebrow>
        <DisplayTitle lead={f.lead} accent={f.accent} size={34} />
        <p className="kf-muted" style={{ maxWidth: 560, fontSize: 13, lineHeight: 1.5 }}>{f.hint}</p>
      </div>
      <KeyfloeKeyboard highlightedIds={f.keys} platform="windows" />
      <Eyebrow>Default binding — remappable in Cursor &amp; Keys</Eyebrow>
      <div style={{ display: "flex", gap: 6 }}>
        {FEATURES.map((_, i) => (
          <button
            key={i}
            onClick={() => onIndex(i)}
            aria-label={`Feature ${i + 1}`}
            style={{
              width: 7, height: 7, borderRadius: "50%", border: "none", cursor: "pointer",
              background: i === index ? "var(--kf-ink-900)" : "rgba(127,127,127,0.3)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PlansStep() {
  const [yearly, setYearly] = useState(false);
  const plans = [
    { name: "Free", weekly: 0, billed: "Free forever", line: "5 tasks / day", popular: false },
    { name: "Pro", weekly: yearly ? 2.48 : 3.74, billed: yearly ? "Billed $129 / year" : "Billed $14.99 / month", line: "Unlimited tasks", popular: true },
    { name: "Hobby", weekly: yearly ? 1.71 : 2.49, billed: yearly ? "Billed $89 / year" : "Billed $9.99 / month", line: "25 tasks / day", popular: false },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, height: "100%", justifyContent: "center" }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <Eyebrow>Plans</Eyebrow>
        <DisplayTitle lead="Pick your " accent="plan." size={34} />
        <p className="kf-muted" style={{ maxWidth: 480, fontSize: 13 }}>
          Every feature on every plan — only the daily task count differs. Start free, upgrade any time.
        </p>
      </div>
      <div style={{ display: "flex", background: "rgba(127,127,127,0.08)", borderRadius: 999, padding: 3 }}>
        {[["Monthly", false], ["Yearly · save ~25%", true]].map(([label, y]) => (
          <button
            key={String(label)}
            onClick={() => setYearly(y as boolean)}
            className="kf-eyebrow"
            style={{
              border: "none", cursor: "pointer", padding: "7px 14px", borderRadius: 999,
              background: yearly === y ? "rgba(127,127,127,0.12)" : "transparent",
              color: yearly === y ? "var(--kf-ink-900)" : "var(--kf-ink-400)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", maxWidth: 700 }}>
        {plans.map((p) => (
          <div
            key={p.name}
            className="kf-panel"
            style={{
              flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 6,
              borderColor: p.popular ? "rgba(214,150,70,0.5)" : undefined,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="kf-display" style={{ fontSize: 20 }}>{p.name}</span>
              {p.popular ? <Eyebrow>Most chosen</Eyebrow> : null}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
              <span className="kf-display-lead" style={{ fontSize: 28 }}>${p.weekly.toFixed(2)}</span>
              <span className="kf-faint" style={{ fontSize: 11 }}>/week</span>
            </div>
            <Eyebrow>{p.billed}</Eyebrow>
            <span className="kf-muted" style={{ fontSize: 12.5 }}>{p.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DoneStep() {
  const rows: [React.ReactNode, string][] = [
    [<Command size={15} key="c" />, "Tap Right Ctrl to chat, hold it to talk. Every answer shows up in the pill."],
    [<Keyboard size={15} key="k" />, "Remap every key in Cursor & Keys — pick which key triggers chat, dictation, snapshot or the agent."],
    [<HistoryIcon size={15} key="h" />, "History keeps every dictation and AI answer Keyfloe pasted, ready to re-copy."],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, paddingTop: 8, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(127,127,127,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>✓</div>
        <DisplayTitle lead="You're all " accent="set." size={38} />
      </div>
      <div className="kf-panel" style={{ maxWidth: 560, width: "100%", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <Eyebrow>Get around</Eyebrow>
        {rows.map(([icon, text]) => (
          <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ width: 18, display: "flex", justifyContent: "center", color: "var(--kf-ink-600)", flex: "none", marginTop: 1 }}>{icon}</span>
            <span style={{ fontSize: 13, lineHeight: 1.4 }}>{text}</span>
          </div>
        ))}
      </div>
      <div className="kf-panel" style={{ maxWidth: 560, width: "100%", padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <Eyebrow>Sign in · required for hotkeys</Eyebrow>
        <span className="kf-muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
          Sign in to sync your stats, history and key bindings. Keyfloe's hotkeys only fire once
          you've signed in.
        </span>
      </div>
      <div className="kf-panel" style={{ maxWidth: 560, width: "100%", padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <Eyebrow>One heads-up</Eyebrow>
        <span className="kf-muted" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
          Because Keyfloe is a new app, Windows SmartScreen or your antivirus may warn you the first
          time. That's expected for new software. Choose "More info" then "Run anyway" — Keyfloe is
          safe and signed.
        </span>
      </div>
    </div>
  );
}

/* ── Shell ────────────────────────────────────────────────────────────── */
export function KeyfloeOnboarding({
  perms,
  modelSlot,
  onFinish,
}: {
  perms?: OnboardingPermissions;
  /** Handy's <ModelSelector/> + <DownloadProgressDisplay/> for the model step. */
  modelSlot?: React.ReactNode;
  onFinish?: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [featureIdx, setFeatureIdx] = useState(0);
  const step = STEPS[stepIdx];

  useEffect(() => {
    if (step !== "keys") setFeatureIdx(0);
  }, [step]);

  const showBack = stepIdx > 0 && step !== "done";

  const back = () => {
    if (step === "keys" && featureIdx > 0) setFeatureIdx((i) => i - 1);
    else setStepIdx((i) => Math.max(0, i - 1));
  };
  const next = () => {
    if (step === "keys" && featureIdx < FEATURES.length - 1) setFeatureIdx((i) => i + 1);
    else setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  };

  const primaryLabel = useMemo(() => {
    switch (step) {
      case "welcome": return "Get started";
      case "voice": return perms?.micGranted ? "Continue" : "Allow microphone";
      case "model": return perms?.modelReady ? "Continue" : "Skip for now";
      case "keys": return featureIdx < FEATURES.length - 1 ? "Next" : "Continue";
      case "plans": return "Start free";
      case "done": return "Open Keyfloe";
    }
  }, [step, featureIdx, perms]);

  const primaryAction = () => {
    // Fire the mic request on the voice step before advancing.
    if (step === "voice" && !perms?.micGranted) {
      perms?.requestMic?.();
    }
    if (step === "done") { onFinish?.(); return; }
    next();
  };

  return (
    <div className="kf-root kf-app-bg" style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* header: title + step counter + progress */}
      <div style={{ padding: "28px 40px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Eyebrow>{STEP_TITLE[step]}</Eyebrow>
          <span className="kf-eyebrow">{String(stepIdx + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}</span>
        </div>
        <div className="kf-progress">
          {STEPS.map((_, i) => <span key={i} className={i <= stepIdx ? "kf-on" : ""} />)}
        </div>
      </div>

      {/* content */}
      <div style={{ flex: 1, padding: "0 40px", overflow: "hidden" }}>
        {step === "welcome" && <WelcomeStep />}
        {step === "voice" && (
          <VoiceStep granted={perms?.micGranted} onOpenSettings={perms?.openMicSettings} />
        )}
        {step === "model" && <ModelStep ready={perms?.modelReady} slot={modelSlot} />}
        {step === "keys" && <KeysStep index={featureIdx} onIndex={setFeatureIdx} />}
        {step === "plans" && <PlansStep />}
        {step === "done" && <DoneStep />}
      </div>

      {/* footer */}
      <div style={{ display: "flex", alignItems: "center", padding: "16px 40px 26px" }}>
        {showBack ? <SecondaryButton label="Back" onClick={back} /> : <span />}
        <span style={{ flex: 1 }} />
        <PrimaryButton label={primaryLabel!} onClick={primaryAction} />
      </div>
    </div>
  );
}
