import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { onCaption } from "./api";
import type { CaptionPhase } from "./types";

/**
 * Live dictation caption for the overlay/pill window. Listens for the
 * `keyfloe://dictation-caption` event the backend emits during
 * `process_dictation` and renders the transcript as it's cleaned:
 *   - "listening"/"polishing": greyed, gold-shimmering interim text while the
 *     on-device transcript and the AI polish pass resolve,
 *   - "final": solid text for a beat, then fades,
 *   - "hidden": clears.
 *
 * Mount this in the recording-overlay window entry (see INTEGRATION.md —
 * "Mount the live caption overlay"). It's self-contained: no props, no store
 * dependency. Styling floats over arbitrary screen content, so it commits to a
 * dark liquid-glass surface (legible on any wallpaper) using Keyfloe tokens
 * with hard fallbacks, since the overlay window may not import keyfloe.css.
 */

const STYLE_ID = "kf-caption-style";
const STYLE = `
@keyframes kf-caption-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes kf-caption-shimmer {
  0%   { background-position: 120% 0; }
  100% { background-position: -20% 0; }
}
.kf-caption-shell {
  font-family: var(--kf-font-sans, "Geist", "Segoe UI", system-ui, sans-serif);
  animation: kf-caption-in 160ms ease-out;
  background: rgba(18, 18, 20, 0.72);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 10px 30px rgba(0, 0, 0, 0.45);
}
.kf-caption-text {
  font-size: 14px;
  line-height: 1.35;
  letter-spacing: 0.005em;
}
.kf-caption-final { color: #ffffff; }
/* Interim: greyed base with a gold light sweeping across the words. */
.kf-caption-interim {
  color: rgba(255, 255, 255, 0.62);
  background-image: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0.55) 20%,
    var(--kf-gold, #d69646) 50%,
    rgba(255, 255, 255, 0.55) 80%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: kf-caption-shimmer 1.5s linear infinite;
}
`;

export function LiveCaptionOverlay() {
  const [phase, setPhase] = useState<CaptionPhase>("hidden");
  const [text, setText] = useState("");
  const hideTimer = useRef<number | null>(null);

  // Inject the keyframes/tokens once (the overlay window may not load keyfloe.css).
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = STYLE;
    document.head.appendChild(el);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onCaption((e) => {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setPhase(e.phase);
      if (e.phase !== "hidden") setText(e.text);
      if (e.phase === "final") {
        // Linger briefly so the user sees the finished text, then hide.
        hideTimer.current = window.setTimeout(() => setPhase("hidden"), 1400);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (phase === "hidden" || !text) return null;

  const interim = phase === "polishing" || phase === "listening";

  return (
    <div className="fixed inset-x-0 bottom-6 flex justify-center pointer-events-none px-4">
      <div className="kf-caption-shell max-w-xl rounded-2xl px-4 py-2.5 flex items-center gap-2">
        {interim && (
          <Sparkles
            size={14}
            className="shrink-0 animate-pulse"
            style={{ color: "var(--kf-gold, #d69646)" }}
          />
        )}
        <span className={`kf-caption-text ${interim ? "kf-caption-interim" : "kf-caption-final"}`}>
          {text}
        </span>
      </div>
    </div>
  );
}
