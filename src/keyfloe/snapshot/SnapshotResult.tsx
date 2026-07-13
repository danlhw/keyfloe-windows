import { useState } from "react";
import { useSnapshot } from "./useSnapshot";

/// Self-contained fallback surface for the Snapshot answer.
///
/// The pill is the intended home for this (the single visual record) — the
/// backend streams the answer straight into it via `pill://message`. Until the
/// shared pill window is mounted in a given view, drop this in to see the
/// streamed Snapshot answer. It renders as a branded liquid-glass card that
/// mirrors the pill's own AI bubble (kf-glass + kf-bubble-ai), so the two read
/// as one system. Renders nothing while idle, so it is safe to always mount.

export function SnapshotResult() {
  const { status, answer, error, quota } = useSnapshot();
  const [copied, setCopied] = useState(false);

  if (status === "idle") return null;

  const copy = () => {
    navigator.clipboard
      .writeText(answer)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {});
  };

  const showAnswer = status === "streaming" || status === "done";

  return (
    <div className="kf-root">
      <div
        className="kf-glass kf-pill"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "12px 14px",
          maxWidth: 420,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="kf-eyebrow" style={{ fontSize: 9 }}>
            Snapshot
          </span>
          {status === "done" && answer ? (
            <button
              className="kf-btn"
              onClick={copy}
              style={{
                padding: "2px 8px",
                fontSize: 11,
                background: "transparent",
                color: "var(--kf-ink-600)",
                border: "1px solid var(--kf-hairline)",
                borderRadius: 7,
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
        </div>

        {status === "capturing" && <Pulse label="Reading your screen…" />}

        {showAnswer && (
          <div
            className="kf-bubble kf-bubble-ai"
            style={{ maxWidth: "100%", whiteSpace: "pre-wrap" }}
          >
            {answer}
            {status === "streaming" && (
              <span className="kf-typing-dots" style={{ marginLeft: 6 }}>
                <span />
                <span />
                <span />
              </span>
            )}
          </div>
        )}

        {status === "error" && (
          <div style={{ color: "var(--kf-red)", fontSize: 13, lineHeight: 1.45 }}>
            {error}
            {quota && (
              <div
                className="kf-muted"
                style={{ marginTop: 6, fontSize: 12 }}
              >
                Upgrade to Pro for unlimited Snapshots.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Pulse({ label }: { label: string }) {
  return (
    <div
      className="kf-muted"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--kf-green)",
          boxShadow: "0 0 8px var(--kf-green)",
          animation: "kf-snap-pulse 1s ease-in-out infinite",
        }}
      />
      {label}
      <style>{`@keyframes kf-snap-pulse{0%,100%{opacity:.35}50%{opacity:1}}`}</style>
    </div>
  );
}
