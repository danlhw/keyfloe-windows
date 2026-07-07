// Feature C — the Floe agent pill.
//
// The single visual log of agent activity (the "chat is the AI record"
// principle): while a spoken command runs, the pill shows the task title, the
// live step cards streaming in, and — when finished — the final prose, an
// optional report card, cited sources, and one-tap follow-up chips. Before a
// run officially starts it shows the "Heard: …" transcript with a spinner.
//
// Self-contained: mount it anywhere (a dedicated pill window, or inside the
// dashboard). It drives itself from `useAgentStore`. Call `store.init()` once
// at app start (see INTEGRATION.md).

import React, { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAgentStore } from "./useAgentStore";
import AgentStepCard from "./AgentStepCard";
import AgentReportCard from "./AgentReportCard";
import "./agent.css";

export const AgentPill: React.FC = () => {
  const runs = useAgentStore((s) => s.runs);
  const listening = useAgentStore((s) => s.listening);
  const heard = useAgentStore((s) => s.heardTranscript);
  const runCommand = useAgentStore((s) => s.runCommand);
  const init = useAgentStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  const run = runs[0];

  // Idle: nothing captured, nothing running. Show a calm resting chip.
  if (!run && !listening) {
    return (
      <div className="ag-pill idle">
        <span className="ag-badge">FLOE</span>
        <span className="ag-idle-hint">Hold the Floe key and speak a command</span>
      </div>
    );
  }

  // Listening / just-heard, before the run has spawned.
  if (!run && listening) {
    return (
      <div className="ag-pill listening">
        <span className="ag-spinner big" />
        <div className="ag-heard">
          <span className="ag-heard-label">Heard</span>
          <span className="ag-heard-text">{heard || "…"}</span>
        </div>
      </div>
    );
  }

  if (!run) return null;

  const working = run.phase === "running";
  const result = run.result;

  return (
    <div className={`ag-pill open ${run.phase}`}>
      <header className="ag-head">
        {working ? <span className="ag-spinner" /> : <span className={`ag-dot ${run.phase}`} />}
        <span className="ag-title">{run.title}</span>
        {working && <span className="ag-working-label">Working…</span>}
      </header>

      {run.steps.length > 0 && (
        <div className="ag-steps">
          {run.steps.map((s) => (
            <AgentStepCard key={s.id} step={s} />
          ))}
        </div>
      )}

      {result && (
        <div className="ag-result">
          {result.report ? (
            <>
              {result.text && <p className="ag-prose ag-prose-lead">{result.text}</p>}
              <AgentReportCard report={result.report} />
            </>
          ) : (
            <p className={`ag-prose ${result.ok ? "" : "err"}`}>{result.text}</p>
          )}

          {result.citedUrls.length > 0 && (
            <div className="ag-sources">
              {result.citedUrls.map((u) => (
                <button
                  key={u}
                  type="button"
                  className="ag-source"
                  onClick={() => openUrl(u).catch(() => {})}
                >
                  {hostOf(u)}
                </button>
              ))}
            </div>
          )}

          {result.suggestedActions.length > 0 && (
            <div className="ag-chips">
              {result.suggestedActions.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="ag-chip"
                  onClick={() => runCommand(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default AgentPill;
