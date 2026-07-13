/**
 * Pill window entry — mounts the single AI-activity log.
 *
 * This is the render surface for product principle #1: every feature streams
 * its turn here. It renders:
 *   • <KeyfloePill/>  — the branded transcript, fed by pillMessageStore
 *                       (chat / dictation caption / snapshot / interview echo).
 *   • <AgentPill/>    — Floe's live step cards + final reply (self-driven by
 *                       useAgentStore, which starts listening on mount, P1-09).
 *
 * The Tauri host (lib.rs) owns the transparent, always-on-top, non-activating
 * (WS_EX_NOACTIVATE) window that loads pill.html → this file. See INTEGRATION.
 */
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { KeyfloePill } from "./Pill";
import { initPillListeners, usePillStore, pillStore } from "./pillMessageStore";
import { AgentPill } from "../agent";
import "./keyfloe.css";

function PillWindow() {
  const { mode, messages } = usePillStore();

  useEffect(() => {
    let dispose: (() => void) | undefined;
    initPillListeners().then((d) => (dispose = d));
    return () => dispose?.();
  }, []);

  return (
    <div className="kf-root kf-pill-window">
      {/* Floe agent surface — self-inits its own event listeners on mount. */}
      <AgentPill />
      <KeyfloePill
        mode={mode}
        messages={messages}
        onClose={() => pillStore.setMode("idle")}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PillWindow />
  </React.StrictMode>,
);
