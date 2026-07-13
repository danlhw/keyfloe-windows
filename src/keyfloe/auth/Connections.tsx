/**
 * Connections — Me → Connections (PRD 5.8). Composio app connections that give
 * the Floe agent real reach: Gmail, Slack, Calendar, Notion, Stripe.
 *
 * The OAuth entry points hit the existing keyfloe.com Composio proxy (already
 * built, dormant until COMPOSIO_API_KEY is set in Vercel). Each "Connect"
 * asks the backend for a hosted OAuth URL and opens it in the default browser;
 * on return the proxy stores the connection and the status refreshes.
 *
 * Backend commands this expects (Composio proxy glue — align names with the
 * agent/auth backend; see integration_notes):
 *   keyfloe_composio_status()              -> Record<provider, boolean>
 *   keyfloe_composio_connect(provider)     -> void  (opens browser to OAuth URL)
 *   keyfloe_composio_disconnect(provider)  -> void
 *
 * Until the key is set the backend returns everything disconnected; the UI
 * still renders so the flow exists and is testable.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Eyebrow } from "../shell/components/primitives";

type Provider = "gmail" | "slack" | "googlecalendar" | "notion" | "stripe";

interface Conn {
  id: Provider;
  name: string;
  blurb: string;
  glyph: string;
}

const CONNECTIONS: Conn[] = [
  { id: "gmail", name: "Gmail", blurb: "Read and send email, reply to threads.", glyph: "✉" },
  { id: "slack", name: "Slack", blurb: "Send messages and read channels.", glyph: "#" },
  { id: "googlecalendar", name: "Google Calendar", blurb: "Check availability and create events.", glyph: "◷" },
  { id: "notion", name: "Notion", blurb: "Search pages and add notes.", glyph: "◼" },
  { id: "stripe", name: "Stripe", blurb: "Look up customers and payments.", glyph: "§" },
];

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}
async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export function Connections() {
  const [status, setStatus] = useState<Partial<Record<Provider, boolean>>>({});
  const [busy, setBusy] = useState<Provider | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const s = await invokeCmd<Record<string, boolean>>("keyfloe_composio_status");
      setStatus(s ?? {});
    } catch {
      setStatus({});
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = async (id: Provider, connected: boolean) => {
    if (busy) return;
    setBusy(id);
    try {
      await invokeCmd<void>(
        connected ? "keyfloe_composio_disconnect" : "keyfloe_composio_connect",
        { provider: id },
      );
      // OAuth completes in the browser; re-check after a beat.
      setTimeout(() => void refresh(), 1200);
    } catch {
      /* no-op — dormant until COMPOSIO_API_KEY is set */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Eyebrow>Connections</Eyebrow>
        <span className="kf-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Connect the apps you use so the Floe agent can act for you — send an email, post to Slack,
          add a calendar event. You stay in control: risky actions always ask before running.
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {CONNECTIONS.map((c) => {
          const connected = !!status[c.id];
          return (
            <div
              key={c.id}
              className="kf-panel"
              style={{ padding: 14, display: "flex", alignItems: "center", gap: 14 }}
            >
              <span
                style={{
                  width: 34, height: 34, borderRadius: 9, background: "var(--kf-bone)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flex: "none",
                }}
                aria-hidden
              >
                {c.glyph}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                <div className="kf-muted" style={{ fontSize: 11.5 }}>{c.blurb}</div>
              </div>
              {connected ? (
                <span className="kf-chip" style={{ color: "var(--kf-green)" }}>Connected</span>
              ) : null}
              <button
                className={connected ? "kf-btn kf-btn-secondary" : "kf-btn kf-btn-primary"}
                style={{ fontSize: 12, padding: "7px 14px" }}
                onClick={() => toggle(c.id, connected)}
                disabled={busy === c.id}
              >
                {busy === c.id ? "…" : connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          );
        })}
      </div>

      <span className="kf-muted" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
        Connections open a secure sign-in in your browser. Keyfloe never sees your passwords.
      </span>
    </div>
  );
}
