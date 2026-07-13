// Feature C — comparison / options report card.
//
// Renders the structured `<REPORT>` block the agent emits for shopping /
// options research (flights, products, "best X"). Each row is a tappable
// option that opens its source URL in the browser; the PICK line is the
// agent's recommendation. Mirrors the Mac pill's report card.

import React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AgentReport } from "./types";

export const AgentReportCard: React.FC<{ report: AgentReport }> = ({ report }) => {
  return (
    <div className="ag-report">
      {report.title && <div className="ag-report-title">{report.title}</div>}
      <div className="ag-report-items">
        {report.items.map((item, i) => {
          const clickable = !!item.url;
          return (
            <button
              key={i}
              type="button"
              className={`ag-report-item ${clickable ? "clickable" : ""}`}
              disabled={!clickable}
              onClick={() => item.url && openUrl(item.url).catch(() => {})}
            >
              <span className="ag-report-name">{item.name}</span>
              {item.detail && <span className="ag-report-detail">{item.detail}</span>}
              {item.price && <span className="ag-report-price">{item.price}</span>}
            </button>
          );
        })}
      </div>
      {report.pick && (
        <div className="ag-report-pick">
          <span className="ag-report-pick-label">Pick</span>
          {report.pick}
        </div>
      )}
    </div>
  );
};

export default AgentReportCard;
