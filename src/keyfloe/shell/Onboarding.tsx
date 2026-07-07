/**
 * KeyfloeOnboarding — first-run flow, mirroring the Mac OnboardingView
 * (app/Sources/Onboarding/). Plain, welcoming English that teaches the
 * permissions, the activation key, and Snapshot.
 *
 * Steps: Welcome → Accessibility → Screen → Voice → Keys (feature cycle)
 *        → Plans → Done.
 *
 * Self-contained + presentational. The Tauri host wires the real permission
 * checks/requests via the optional `perms` prop; without it the flow still
 * runs (buttons say "Skip for now") so it can be previewed in a browser.
 * See INTEGRATION.md for the exact commands to pass in.
 */
import React, { useEffect, useMemo, useState } from "react";
import { DisplayTitle, Eyebrow, PrimaryButton, SecondaryButton } from "./components/primitives";
import { KeyfloeKeyboard } from "./components/KeyfloeKeyboard";

/* ── Permission wiring the host provides (all optional) ───────────────── */
export interface OnboardingPermissions {
  accessibilityGranted?: boolean;
  screenGranted?: boolean;
  micGranted?: boolean;
  speechGranted?: boolean;
  requestAccessibility?: () => void;
  openAccessibilitySettings?: () => void;
  requestScreen?: () => void;
  openScreenSettings?: () => void;
  requestVoice?: () => void;
}

type Step = "welcome" | "accessibility" | "screen" | "voice" | "keys" | "plans" | "done";
const STEPS: Step[] = ["welcome", "accessibility", "screen", "voice", "keys", "plans", "done"];

const STEP_TITLE: Record<Step, string> = {
  welcome: "Welcome to Keyfloe",
  accessibility: "Let Keyfloe help out",
  screen: "Let Keyfloe see your screen",
  voice: "Talk to Keyfloe",
  keys: "Try Keyfloe",
  plans: "Pick your plan",
  done: "You're all set",
};

/* ── Feature cycle inside the "Keys" step ─────────────────────────────── */
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
    lead: "Press ",
    accent: "to chat.",
    hint: "Tap fn anywhere on your PC. A chat popup floats up next to your cursor — type a question, paste a screenshot, or start a task.",
    keys: ["fn"],
  },
  {
    eyebrow: "Feature 2 of 5",
    lead: "Hold ",
    accent: "to talk.",
    hint: "Hold fn and start talking. Keyfloe types the words wherever your cursor is, and keeps the full text on your clipboard so you can paste it anywhere.",
    keys: ["fn"],
  },
  {
    eyebrow: "Feature 3 of 5",
    lead: "Tap ",
    accent: "for the dashboard.",
    hint: "Tap the right Alt key to open the Keyfloe dashboard from anywhere — recent activity, your current task, quick actions. Tap again to close.",
    keys: ["ropt"],
  },
  {
    eyebrow: "Feature 4 of 5",
    lead: "Press to ",
    accent: "auto-answer.",
    hint: "Press the left Ctrl key and Keyfloe answers the question in front of you — typed right where your cursor is, and copied to your clipboard too.",
    keys: ["lctrl"],
  },
  {
    eyebrow: "Feature 5 of 5",
    lead: "Snapshot ",
    accent: "anything.",
    hint: "Hold the right Win key and drag a box over anything on screen — Keyfloe reads what's inside and answers it.",
    keys: ["rcmd"],
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

function PermissionStep({
  eyebrow,
  lead,
  accent,
  bullets,
  granted,
  footnote,
  dots,
}: {
  eyebrow: string;
  lead: string;
  accent: string;
  bullets: string[];
  granted?: boolean;
  footnote?: string;
  dots?: [string, boolean | undefined][];
}) {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18, height: "100%", justifyContent: "center" }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <DisplayTitle lead={lead} accent={accent} size={36} />
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
          <span className="kf-eyebrow" style={{ color: "var(--kf-green)" }}>Granted</span>
        </div>
      ) : (
        <>
          {dots ? (
            <div style={{ display: "flex", gap: 18 }}>
              {dots.map(([label, ok]) => (
                <span key={label} className="kf-eyebrow" style={{ color: ok ? "var(--kf-green)" : "var(--kf-ink-400)" }}>
                  {ok ? "✓ " : "○ "}{label}
                </span>
              ))}
            </div>
          ) : null}
          {footnote ? <Eyebrow>{footnote}</Eyebrow> : null}
        </>
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
      <KeyfloeKeyboard highlightedIds={f.keys} compact={index === 4} platform="windows" />
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
  const rows = [
    ["⌥", "Tap the right Alt key to open the dashboard from anywhere."],
    ["⌨", "Remap every key in Cursor & Keys — pick which key triggers chat, dictation, or the dashboard."],
    ["≡", "History tracks every dictation and AI answer Keyfloe pasted, ready to re-copy."],
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
            <span style={{ width: 16, textAlign: "center", flex: "none" }}>{icon}</span>
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
    </div>
  );
}

/* ── Shell ────────────────────────────────────────────────────────────── */
export function KeyfloeOnboarding({
  perms,
  onFinish,
}: {
  perms?: OnboardingPermissions;
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
      case "accessibility": return perms?.accessibilityGranted ? "Continue" : "Skip for now";
      case "screen": return perms?.screenGranted ? "Continue" : "Skip for now";
      case "voice": return perms?.micGranted && perms?.speechGranted ? "Continue" : "Skip for now";
      case "keys": return featureIdx < FEATURES.length - 1 ? "Next" : "Continue";
      case "plans": return "Start free";
      case "done": return "Open Keyfloe";
    }
  }, [step, featureIdx, perms]);

  const primaryAction = () => {
    // Fire the permission request on the relevant steps before advancing.
    if (step === "accessibility" && !perms?.accessibilityGranted) { perms?.requestAccessibility?.(); }
    if (step === "screen" && !perms?.screenGranted) { perms?.requestScreen?.(); }
    if (step === "voice" && !(perms?.micGranted && perms?.speechGranted)) { perms?.requestVoice?.(); }
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
        {step === "accessibility" && (
          <PermissionStep
            eyebrow="Permission · Input monitoring"
            lead="Let Keyfloe " accent="help out."
            granted={perms?.accessibilityGranted}
            bullets={[
              "Use your keyboard shortcuts (fn, Ctrl, Alt, Win) from any app.",
              "Save every dictation and AI answer to your clipboard so you can paste it anywhere.",
              "See which app and window you're in for sharper answers.",
            ]}
            footnote="Settings → Privacy → Keyfloe"
          />
        )}
        {step === "screen" && (
          <PermissionStep
            eyebrow="Permission · Screen"
            lead="Let Keyfloe " accent="see your screen."
            granted={perms?.screenGranted}
            bullets={[
              "Snapshot AI — box anything on screen and Keyfloe answers what's inside.",
              "Screen-aware answers — it reads what you're looking at for sharper replies.",
              "Captured only the instant you ask. Nothing is ever recorded or stored.",
            ]}
          />
        )}
        {step === "voice" && (
          <PermissionStep
            eyebrow="Permission · Voice"
            lead="Talk to " accent="Keyfloe."
            granted={perms?.micGranted && perms?.speechGranted}
            bullets={[
              "Microphone — hears you while you hold a key to talk.",
              "Speech — turns your voice into text, right on your PC.",
            ]}
            dots={[["Microphone", perms?.micGranted], ["Speech", perms?.speechGranted]]}
          />
        )}
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
