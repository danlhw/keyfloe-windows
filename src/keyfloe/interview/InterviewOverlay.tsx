// The interview overlay — a translucent, always-on-top, screen-capture-invisible
// panel. 1:1 with the Mac `InterviewTranscriptView` + the pill's answer view:
//   • chronological neutral transcript bubbles with magnet auto-scroll
//   • a "system audio off" permission banner
//   • a status footer: pulse dot + "Listening" + mic waveform + mic-only tag
//   • the "How do I answer this?" sparkle button and a streamed answer view
//
// Invisibility to Zoom/Meet/Teams is enforced natively in Rust
// (SetWindowDisplayAffinity → WDA_EXCLUDEFROMCAPTURE); nothing to do here.

import { useEffect, useRef, useState, type RefObject } from "react";
import { useInterviewSession } from "./useInterviewSession";
import "./InterviewOverlay.css";

const WAVE_BARS = 16;

export default function InterviewOverlay() {
  const { turns, state, micLevel, answer, stop, askAnswer } =
    useInterviewSession();
  const [showAnswer, setShowAnswer] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  // Magnet auto-scroll: stick to the bottom as turns / live text grow.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, turns[turns.length - 1]?.text]);

  // Jump to the answer the moment one starts streaming.
  useEffect(() => {
    if (answer.streaming || answer.text) {
      setShowAnswer(true);
      const el = answerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [answer.text, answer.streaming]);

  const onAsk = () => {
    setShowAnswer(true);
    askAnswer();
  };

  return (
    <div className="kf-iv-overlay" data-tauri-drag-region>
      <header className="kf-iv-header" data-tauri-drag-region>
        <div className="kf-iv-title">
          <span className="kf-iv-dot" data-on={state.running} />
          Interview
        </div>
        <div className="kf-iv-actions">
          <button
            className="kf-iv-btn kf-iv-answer"
            onClick={onAsk}
            title="How do I answer this?"
          >
            <SparkleIcon /> Answer
          </button>
          <button className="kf-iv-btn" onClick={() => stop()} title="Stop interview">
            Stop
          </button>
        </div>
      </header>

      {/* Interviewer channel off (system audio missing) banner */}
      {state.running && !state.systemAudioActive && (
        <div className="kf-iv-banner">
          <strong>Interviewer channel OFF</strong>
          <p>
            System audio isn't being captured, so the interviewer's voice can't
            be transcribed. Anything through your speakers may be picked up by
            your mic and labelled YOU instead of INTERVIEWER.
          </p>
        </div>
      )}

      {showAnswer && (answer.text || answer.streaming || answer.error) ? (
        <AnswerView
          answer={answer}
          onBack={() => setShowAnswer(false)}
          bodyRef={answerRef}
        />
      ) : (
        <div className="kf-iv-scroll" ref={scrollRef}>
          {turns.length === 0 ? (
            <EmptyState error={state.error} />
          ) : (
            <div className="kf-iv-turns">
              {turns.map((t) => (
                <div className="kf-iv-bubble" key={t.id}>
                  {t.isLive && <span className="kf-iv-live" />}
                  <span className="kf-iv-bubble-text">{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <StatusFooter
        running={state.running}
        systemActive={state.systemAudioActive}
        micLevel={micLevel}
      />
    </div>
  );
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <div className="kf-iv-empty">
      <div className="kf-iv-empty-label">LIVE TRANSCRIPT</div>
      <p>
        Speak normally — your words appear here as you talk; the interviewer's
        speech appears right after they pause. Tap <b>Answer</b> for a tailored
        reply.
      </p>
      {error && <p className="kf-iv-error">{error}</p>}
    </div>
  );
}

const AnswerView = ({
  answer,
  onBack,
  bodyRef,
}: {
  answer: { streaming: boolean; text: string; error: string | null };
  onBack: () => void;
  bodyRef: RefObject<HTMLDivElement>;
}) => (
  <div className="kf-iv-answer-view">
    <button className="kf-iv-back" onClick={onBack}>
      ← Transcript
    </button>
    <div className="kf-iv-answer-body" ref={bodyRef}>
      {answer.error ? (
        <p className="kf-iv-error">{answer.error}</p>
      ) : answer.text ? (
        // The Mac pill splits on [BREAK] into separate bubbles.
        answer.text.split("[BREAK]").map((chunk, i) => (
          <p className="kf-iv-answer-bubble" key={i}>
            {chunk.trim()}
          </p>
        ))
      ) : (
        <p className="kf-iv-thinking">Thinking…</p>
      )}
      {answer.streaming && <span className="kf-iv-caret" />}
    </div>
  </div>
);

function StatusFooter({
  running,
  systemActive,
  micLevel,
}: {
  running: boolean;
  systemActive: boolean;
  micLevel: number;
}) {
  return (
    <footer className="kf-iv-footer">
      <span className="kf-iv-pulse" data-on={running} />
      <span className="kf-iv-listening">{running ? "Listening" : "Stopped"}</span>
      <MicWaveform level={micLevel} active={running} />
      <span className="kf-iv-spacer" />
      {running && !systemActive && <span className="kf-iv-mic-only">mic-only</span>}
    </footer>
  );
}

function MicWaveform({ level, active }: { level: number; active: boolean }) {
  // 16 bars reacting to the live mic peak with a gentle idle wobble — mirrors
  // the Mac MicWaveform so both platforms read identically.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 90);
    return () => clearInterval(id);
  }, [active]);
  return (
    <div className="kf-iv-wave" style={{ opacity: active ? 1 : 0.35 }}>
      {Array.from({ length: WAVE_BARS }).map((_, i) => {
        const idle = 0.12 + 0.06 * Math.abs(Math.sin((tick + i) * 0.7));
        const h = Math.max(idle, Math.min(1, level * (0.6 + 0.5 * Math.sin(i))));
        return <span key={i} style={{ height: `${h * 100}%` }} />;
      })}
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" />
    </svg>
  );
}
