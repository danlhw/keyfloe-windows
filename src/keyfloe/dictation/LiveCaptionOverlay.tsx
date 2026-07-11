import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { onCaption } from "./api";
import type { CaptionPhase } from "./types";

/**
 * Live dictation caption for the overlay/pill window. Listens for the
 * `keyfloe://dictation-caption` event the backend emits during
 * `process_dictation` and renders the transcript as it's cleaned:
 *   - "polishing": grey text with a subtle shimmer while the AI pass runs,
 *   - "final": solid text for a beat, then fades,
 *   - "hidden": clears.
 *
 * Mount this in the overlay window (see INTEGRATION.md — "Overlay wiring"). It's
 * self-contained: no props, no store dependency.
 */
export function LiveCaptionOverlay() {
  const [phase, setPhase] = useState<CaptionPhase>("hidden");
  const [text, setText] = useState("");
  const hideTimer = useRef<number | null>(null);

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

  const polishing = phase === "polishing";

  return (
    <div className="fixed inset-x-0 bottom-6 flex justify-center pointer-events-none px-4">
      <div className="max-w-xl rounded-2xl bg-black/80 backdrop-blur px-4 py-2.5 shadow-lg flex items-center gap-2">
        {polishing && (
          <Sparkles size={14} className="shrink-0 animate-pulse" style={{ color: "var(--kf-gold, #d69646)" }} />
        )}
        <span
          className={`text-sm leading-snug ${polishing ? "animate-pulse" : ""}`}
          style={{ color: polishing ? "rgba(255,255,255,0.72)" : "#fff" }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
