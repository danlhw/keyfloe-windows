/**
 * SignIn — the branded Supabase sign-in form mounted into the Account tab.
 *
 * Email + password and Google OAuth, both routed through the auth-backend
 * commands (see useAccount.ts). On success the backend has already persisted
 * the JWT + device id via the keyring crate and fetched `/me`, so the account
 * context updates and the whole app unlocks (hotkeys are gated on sign-in).
 *
 * Pure brand primitives (kf-*), no Handy/shadcn.
 */
import React, { useState } from "react";
import { useAccount } from "./useAccount";
import { Eyebrow } from "../shell/components/primitives";

export function SignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const { signInEmail, signInGoogle, error } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || busy) return;
    setBusy(true);
    try {
      await signInEmail(email.trim(), password);
      onSignedIn?.();
    } catch {
      /* error surfaced via context */
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signInGoogle();
      onSignedIn?.();
    } catch {
      /* error surfaced via context */
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 13px",
    borderRadius: 10,
    border: "1px solid var(--kf-hairline)",
    background: "var(--kf-bone)",
    color: "var(--kf-ink-900)",
    fontSize: 14,
    fontFamily: "var(--kf-font-sans)",
    outline: "none",
  };

  return (
    <div className="kf-panel" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Eyebrow>Sign in · required for hotkeys</Eyebrow>
        <span className="kf-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Keyfloe's hotkeys (Ctrl, Alt, Caps Lock, Menu) only fire once you sign in. A Pro plan on
          Mac is Pro here too — same account, same limits.
        </span>
      </div>

      <button
        type="button"
        className="kf-btn kf-btn-secondary"
        onClick={google}
        disabled={busy}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        <span aria-hidden style={{ fontFamily: "var(--kf-font-mono)", fontWeight: 700 }}>G</span>
        Continue with Google
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, height: 1, background: "var(--kf-hairline)" }} />
        <span className="kf-eyebrow">or</span>
        <span style={{ flex: 1, height: 1, background: "var(--kf-hairline)" }} />
      </div>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={inputStyle}
        />
        {error ? (
          <span style={{ color: "var(--kf-red)", fontSize: 12.5 }}>{error}</span>
        ) : null}
        <button type="submit" className="kf-btn kf-btn-primary" disabled={busy || !email || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <span className="kf-muted" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
        No account yet? Create one free at keyfloe.com — then sign in here.
      </span>
    </div>
  );
}
