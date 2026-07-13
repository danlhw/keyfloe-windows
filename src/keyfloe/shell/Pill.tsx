/**
 * KeyfloePill — the floating, liquid-glass activity log.
 *
 * Product principle (Mac: "chat is the AI record"): the pill is the SINGLE
 * visual log of every AI activity — dictation, chat answers, agent steps,
 * interview turns all mirror into it. This component is presentational
 * chrome only: it renders a transcript of `PillMessage`s and an idle chip.
 * Feature agents (B–E) feed it messages; the Tauri host owns the transparent,
 * always-on-top, click-through window (see INTEGRATION.md).
 *
 * Mirrors the Mac PillView aesthetic: iMessage bubbles inside a rounded
 * liquid-glass shell, gold idle dot, typing dots while streaming.
 */
import React, { useEffect, useRef } from "react";

export type PillRole = "user" | "ai" | "step";

export interface PillMessage {
  id: string;
  role: PillRole;
  text: string;
  /** step rows can carry a status glyph: running "·", ok "✓", fail "✕". */
  status?: "running" | "ok" | "fail";
  /** true while the AI bubble is still streaming — shows typing dots. */
  streaming?: boolean;
}

export type PillMode = "idle" | "open";

const STEP_GLYPH: Record<NonNullable<PillMessage["status"]>, string> = {
  running: "·",
  ok: "✓",
  fail: "✕",
};

function Bubble({ msg }: { msg: PillMessage }) {
  if (msg.role === "step") {
    return (
      <div className="kf-bubble-step">
        <span aria-hidden style={{ width: 12, textAlign: "center" }}>
          {STEP_GLYPH[msg.status ?? "running"]}
        </span>
        <span>{msg.text}</span>
      </div>
    );
  }
  const cls = msg.role === "user" ? "kf-bubble kf-bubble-user" : "kf-bubble kf-bubble-ai";
  return (
    <div className={cls}>
      {msg.text}
      {msg.streaming ? (
        <span className="kf-typing-dots" style={{ marginLeft: 6 }}>
          <span />
          <span />
          <span />
        </span>
      ) : null}
    </div>
  );
}

export function KeyfloePill({
  mode = "open",
  idleLabel = "KEYFLOE",
  messages = [],
  onClose,
}: {
  mode?: PillMode;
  /** Text on the collapsed chip. Mac shows "KEYFLOE" when idle. */
  idleLabel?: string;
  messages?: PillMessage[];
  onClose?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Magnet auto-scroll: keep the latest turn in view as it streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (mode === "idle") {
    return (
      <div className="kf-root">
        <div className="kf-glass kf-pill kf-pill-idle" role="status">
          <span className="kf-pill-dot" />
          <span className="kf-eyebrow" style={{ fontSize: 10 }}>
            {idleLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="kf-root">
      <div className="kf-glass kf-pill" style={{ display: "flex", flexDirection: "column", maxHeight: 440 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px 6px",
          }}
        >
          <span className="kf-eyebrow" style={{ fontSize: 9 }}>
            Keyfloe
          </span>
          {onClose ? (
            <button
              className="kf-btn"
              style={{ padding: 2, background: "transparent", color: "var(--kf-ink-400)", fontSize: 14 }}
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          ) : null}
        </div>
        <div
          ref={scrollRef}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "6px 14px 14px",
            overflowY: "auto",
          }}
        >
          {messages.length === 0 ? (
            <div className="kf-muted" style={{ fontSize: 13, padding: "8px 0" }}>
              Ask anything — your answers, dictation and tasks all show up here.
            </div>
          ) : (
            messages.map((m) => <Bubble key={m.id} msg={m} />)
          )}
        </div>
      </div>
    </div>
  );
}
