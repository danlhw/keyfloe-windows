import React from "react";
import ReactDOM from "react-dom/client";
import { SnapshotOverlay } from "./SnapshotOverlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SnapshotOverlay />
  </React.StrictMode>,
);
