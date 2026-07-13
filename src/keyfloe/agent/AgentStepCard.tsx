// Feature C — one live step card.
//
// Renders a single tool call the agent made: an icon (by tool), a title +
// detail, and a status glyph (spinner / check / cross). Tapping expands the
// trimmed tool result so the user can verify what actually happened — the same
// "watch it work, then inspect" affordance as the Mac pill.

import React, { useState } from "react";
import type { AgentStep } from "./types";

function ToolIcon({ tool }: { tool: string }) {
  // Grouped by action family so unfamiliar tools still get a sensible glyph.
  const kind = tool.startsWith("open_url")
    ? "web"
    : tool.startsWith("open_app")
      ? "app"
      : tool === "type_text"
        ? "type"
        : tool === "click" || tool === "move_mouse"
          ? "point"
          : tool === "web_search"
            ? "search"
            : "action";

  const paths: Record<string, React.ReactNode> = {
    web: <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM1.5 8h13M8 1.5c1.7 1.7 2.7 4 2.7 6.5S9.7 12.8 8 14.5C6.3 12.8 5.3 10.5 5.3 8S6.3 3.2 8 1.5z" />,
    app: <path d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z" />,
    type: <path d="M2 4h12M2 8h9M2 12h12" />,
    point: <path d="M4 3l8 4-3.2 1.2L7.5 12z" />,
    search: <path d="M7 2a5 5 0 103.5 8.5L14 14M7 2a5 5 0 010 10" />,
    action: <path d="M8 1.5v13M1.5 8h13" />,
  };

  return (
    <svg className="ag-step-icon" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {paths[kind]}
      </g>
    </svg>
  );
}

function StatusGlyph({ status }: { status: AgentStep["status"] }) {
  if (status === "running") return <span className="ag-spinner" aria-label="running" />;
  if (status === "done")
    return (
      <svg className="ag-status ok" viewBox="0 0 16 16" aria-label="done">
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg className="ag-status fail" viewBox="0 0 16 16" aria-label="failed">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export const AgentStepCard: React.FC<{ step: AgentStep }> = ({ step }) => {
  const [open, setOpen] = useState(false);
  const canInspect = !!step.resultSnippet && step.status !== "running";

  return (
    <div className={`ag-step ${step.status}`}>
      <button
        type="button"
        className="ag-step-row"
        disabled={!canInspect}
        onClick={() => canInspect && setOpen((v) => !v)}
      >
        <ToolIcon tool={step.toolName} />
        <span className="ag-step-text">
          <span className="ag-step-title">{step.title}</span>
          {step.detail && <span className="ag-step-detail">{step.detail}</span>}
        </span>
        <StatusGlyph status={step.status} />
      </button>
      {open && step.resultSnippet && (
        <div className="ag-step-result">{step.resultSnippet}</div>
      )}
    </div>
  );
};

export default AgentStepCard;
