/**
 * KeyfloeLogo — THE Keyfloe brand mark (the stepped-swoosh), rendered from
 * the real asset (site/public/logo-mark-*.png). NEVER substitute another
 * shape — per brand rules this exact mark is the logo.
 *
 * Picks the black-on-light / white-on-dark variant automatically, or force
 * one with `variant`. Followed by the "Keyfloe" wordmark in Geist.
 */
import React from "react";
import markBlack from "../assets/logo-mark-black.png";
import markWhite from "../assets/logo-mark-white.png";

export function KeyfloeLogo({
  height = 22,
  variant,
  wordmark = true,
}: {
  height?: number;
  variant?: "black" | "white";
  wordmark?: boolean;
}) {
  // When no variant is forced, show both stacked and let CSS pick via the
  // active theme (dark → white mark, light → black mark).
  const forced = variant === "black" ? markBlack : variant === "white" ? markWhite : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      {forced ? (
        <img src={forced} alt="Keyfloe" style={{ height, width: "auto" }} />
      ) : (
        <span style={{ height, width: height * 1.3, position: "relative", display: "inline-block" }}>
          <img
            src={markBlack}
            alt="Keyfloe"
            className="kf-logo-light"
            style={{ height, width: "auto", position: "absolute", inset: 0 }}
          />
          <img
            src={markWhite}
            alt=""
            aria-hidden
            className="kf-logo-dark"
            style={{ height, width: "auto", position: "absolute", inset: 0 }}
          />
        </span>
      )}
      {wordmark ? (
        <span style={{ fontFamily: "var(--kf-font-sans)", fontWeight: 600, fontSize: height * 0.82, letterSpacing: "-0.01em", color: "var(--kf-ink-900)" }}>
          Keyfloe
        </span>
      ) : null}
    </div>
  );
}
