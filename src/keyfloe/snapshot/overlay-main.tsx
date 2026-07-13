import React from "react";
import ReactDOM from "react-dom/client";
import { SnapshotOverlay } from "./SnapshotOverlay";
// Brand tokens + fonts (var(--kf-*)) for the marquee chip / size readout.
import "../shell/keyfloe.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SnapshotOverlay />
  </React.StrictMode>,
);
