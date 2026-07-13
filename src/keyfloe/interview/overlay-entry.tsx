// Entry point for the dedicated interview overlay window (label
// "interview_overlay"). Registered as a Vite rollup input — see INTEGRATION.md.
import React from "react";
import ReactDOM from "react-dom/client";
import InterviewOverlay from "./InterviewOverlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <InterviewOverlay />
  </React.StrictMode>,
);
