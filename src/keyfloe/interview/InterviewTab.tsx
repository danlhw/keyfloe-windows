// Interview dashboard body — the live Start/Stop control surface + the
// pre-interview context editor. This is what the shell's <InterviewTab slot={…}/>
// renders (the shell already wraps it in a scroll container + "Answers, live."
// header), replacing the old placeholder that mounted InterviewContextPanel
// directly and had no way to actually start a session from the dashboard.
//
// Mirrors the Mac dashboard interview surface: a session card (start/stop,
// running status, mic waveform, mic-only warning) sitting above the About-me /
// profiles / résumé editor. Session control is lifted here via
// useInterviewSession so the dashboard can drive the same Rust session the
// bound key + overlay drive — all three stay in sync through the session's
// events.

import { useEffect } from "react";
import InterviewContextPanel from "./InterviewContextPanel";
import { useInterviewSession } from "./useInterviewSession";
import "./InterviewTab.css";

const WAVE_BARS = 20;

export default function InterviewTab() {
  const { state, micLevel, start, stop, ensureOverlay, setOverlayVisible } =
    useInterviewSession();
  const running = state.running;

  // Pre-create the invisible overlay on mount so the first start is instant.
  useEffect(() => {
    ensureOverlay();
  }, [ensureOverlay]);

  const onToggle = () => {
    if (running) stop();
    else start();
  };

  return (
    <div className="kf-iv-tab">
      {/* ── Session control card ─────────────────────────────────────── */}
      <div className="kf-panel kf-ivtab-card">
        <div className="kf-ivtab-card-main">
          <div className="kf-ivtab-status">
            <span className="kf-ivtab-dot" data-on={running} />
            <div className="kf-ivtab-status-text">
              <span className="kf-ivtab-title">
                {running ? "Interview mode is live" : "Interview mode"}
              </span>
              <span className="kf-muted kf-ivtab-sub">
                {running
                  ? "Listening to you and the interviewer. Open the overlay for the live transcript and tailored answers."
                  : "A private overlay listens to the call and feeds you answers. It stays invisible to Zoom, Meet, Teams and OBS."}
              </span>
            </div>
          </div>

          <button
            className={
              running
                ? "kf-btn kf-ivtab-btn kf-ivtab-btn-stop"
                : "kf-btn kf-btn-primary kf-ivtab-btn"
            }
            onClick={onToggle}
          >
            {running ? "Stop interview" : "Start interview"}
          </button>
        </div>

        {/* Live footer: waveform + mic-only tag, only while running. */}
        {running && (
          <div className="kf-ivtab-live">
            <MicWaveform level={micLevel} />
            <span className="kf-muted kf-ivtab-live-label">
              Listening
            </span>
            <span className="kf-ivtab-spacer" />
            {!state.systemAudioActive && (
              <span className="kf-ivtab-mic-only" title="System audio is not being captured">
                mic-only
              </span>
            )}
            <button
              className="kf-ivtab-overlay-link"
              onClick={() => setOverlayVisible(true)}
            >
              Show overlay
            </button>
          </div>
        )}

        {/* Mic-only warning banner (interviewer channel not captured). */}
        {running && !state.systemAudioActive && (
          <div className="kf-ivtab-banner">
            <strong>Interviewer channel is off.</strong> System audio is not
            being captured, so the interviewer's voice can't be transcribed on
            its own channel. Check your output device, then stop and start
            again.
          </div>
        )}

        {state.error && !running && (
          <div className="kf-ivtab-banner">{state.error}</div>
        )}

        <p className="kf-muted kf-ivtab-hint">
          Press your chat key or the button above to toggle interview mode. The
          overlay is only visible to you.
        </p>
      </div>

      {/* ── Pre-interview context (About me / profiles / résumé) ─────── */}
      <InterviewContextPanel embedded />
    </div>
  );
}

function MicWaveform({ level }: { level: number }) {
  // Bars react to the live mic peak with a gentle idle wobble — matches the
  // overlay's waveform so the dashboard and overlay read identically.
  return (
    <div className="kf-ivtab-wave" aria-hidden>
      {Array.from({ length: WAVE_BARS }).map((_, i) => {
        const idle = 0.14 + 0.05 * Math.abs(Math.sin(i * 0.9));
        const h = Math.max(idle, Math.min(1, level * (0.6 + 0.5 * Math.sin(i))));
        return <span key={i} style={{ height: `${h * 100}%` }} />;
      })}
    </div>
  );
}
