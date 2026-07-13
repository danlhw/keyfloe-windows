/**
 * Shared Keyfloe brand primitives — small presentational building blocks
 * used across the dashboard + onboarding. Mirror the Mac app's editorial
 * components (EditorialEyebrow, DisplayTitle, Primary/SecondaryButton, chips).
 *
 * Pure presentational — no Tauri / store dependency, so any agent can reuse.
 */
import React from "react";

/** Uppercase, wide-tracked Departure-Mono label — the "BILLING / KEYS" voice. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="kf-eyebrow">{children}</div>;
}

/**
 * Editorial display title: light Geist lead + Fraunces-italic accent,
 * exactly like the Mac `DisplayTitle` and the website hero.
 */
export function DisplayTitle({
  lead,
  accent,
  size = 36,
}: {
  lead: string;
  accent?: string;
  size?: number;
}) {
  return (
    <div style={{ lineHeight: 1.04 }}>
      <span className="kf-display-lead" style={{ fontSize: size }}>
        {lead}
      </span>
      {accent ? (
        <span className="kf-display" style={{ fontSize: size + 2 }}>
          {accent}
        </span>
      ) : null}
    </div>
  );
}

export function PrimaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="kf-btn kf-btn-primary" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

export function SecondaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button className="kf-btn kf-btn-secondary" onClick={onClick}>
      {label}
    </button>
  );
}

/** Inline keycap glyph (⌃, ⌘, fn …). */
export function KeyCap({ children }: { children: React.ReactNode }) {
  return <span className="kf-keycap">{children}</span>;
}

/** Status / info chip with an optional coloured leading dot. */
export function Chip({
  children,
  dot,
  title,
}: {
  children: React.ReactNode;
  dot?: string;
  title?: string;
}) {
  return (
    <span className="kf-chip" title={title}>
      {dot ? (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dot,
            display: "inline-block",
          }}
        />
      ) : null}
      {children}
    </span>
  );
}

/** A titled brand panel (hairline by default, glass when `glass`). */
export function Panel({
  children,
  glass,
  style,
}: {
  children: React.ReactNode;
  glass?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className={glass ? "kf-glass" : "kf-panel"} style={{ borderRadius: 14, ...style }}>
      {children}
    </div>
  );
}
