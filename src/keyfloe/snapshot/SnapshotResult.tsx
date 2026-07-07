import { useSnapshot } from "./useSnapshot";

/// Self-contained fallback surface for the Snapshot answer.
///
/// The pill is the intended home for this (the single visual log). Until the
/// shared pill/chat component exists in the Windows shell, embed this anywhere
/// to see the streamed Snapshot answer, or copy the `useSnapshot()` wiring into
/// the pill and delete this file. It renders nothing while idle, so it is safe
/// to always mount.

export function SnapshotResult() {
  const { status, answer, error, quota } = useSnapshot();

  if (status === "idle") return null;

  return (
    <div
      style={{
        maxWidth: 420,
        padding: "14px 16px",
        borderRadius: 14,
        background: "rgba(20,20,22,0.86)",
        color: "#f4f4f5",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        fontSize: 14,
        lineHeight: 1.5,
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
        backdropFilter: "blur(12px)",
      }}
    >
      {status === "capturing" && <Pulse label="Reading your screen…" />}

      {(status === "streaming" || status === "done") && (
        <div style={{ whiteSpace: "pre-wrap" }}>
          {answer}
          {status === "streaming" && <Caret />}
        </div>
      )}

      {status === "error" && (
        <div style={{ color: quota ? "#fca5a5" : "#fda4af" }}>
          {error}
          {quota && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              Upgrade to Pro for unlimited Snapshots.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pulse({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.85 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#a3e635",
          animation: "kf-snap-pulse 1s ease-in-out infinite",
        }}
      />
      {label}
      <style>{`@keyframes kf-snap-pulse{0%,100%{opacity:.35}50%{opacity:1}}`}</style>
    </div>
  );
}

function Caret() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 15,
        marginLeft: 2,
        transform: "translateY(2px)",
        background: "#f4f4f5",
        animation: "kf-snap-caret 1s steps(2) infinite",
      }}
    >
      <style>{`@keyframes kf-snap-caret{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </span>
  );
}
