import React from "react";
import ReactDOM from "react-dom/client";
import RecordingOverlay from "./RecordingOverlay";
// Keyfloe branded live-caption-while-speaking overlay (P2-12). It listens for
// `keyfloe://dictation-caption` and shows shimmering interim text -> solid on
// final, alongside Handy's RecordingOverlay in the same recording-overlay window.
import { LiveCaptionOverlay } from "@/keyfloe/dictation";
import "@/i18n";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecordingOverlay />
    <LiveCaptionOverlay />
  </React.StrictMode>,
);
