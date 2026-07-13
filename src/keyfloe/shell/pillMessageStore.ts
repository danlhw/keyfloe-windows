/**
 * pillMessageStore — the single source of truth for what the pill shows.
 *
 * Product principle #1 (Mac "chat is the AI record"): the pill is the ONE
 * visual log of every AI activity. Every feature (dictation caption, chat
 * answer, snapshot answer, agent step, interview echo) streams its turn into
 * the pill by emitting a `pill://message` Tauri event; this store aggregates
 * them into an iMessage-style transcript the `KeyfloePill` renders.
 *
 * The store is a tiny framework-agnostic external store (works with
 * `useSyncExternalStore`) so it can live in the always-on pill window with no
 * provider. It also mirrors the snapshot event feed (keyfloe://snapshot-*)
 * directly into a bubble so Snapshot lands in the branded pill as the primary
 * surface (P1-08) without the snapshot feature needing to know about the pill.
 *
 * ── Event contract (backend `pill_emit_message` → `pill://message`) ─────────
 *   payload: PillMessageEvent
 *     { id, role, text, status?, streaming?, op? }
 *   op: "upsert" (default) replaces the bubble with matching id or appends it;
 *       "remove" drops it; "clear" wipes the transcript.
 *   Re-emit the same id with streaming:true to stream, then streaming:false /
 *   a final text to settle it.
 *
 *   `pill://mode`  payload: "idle" | "open"  — collapse / expand the pill.
 *   `pill://clear` payload: none             — wipe + collapse.
 */
import { useSyncExternalStore } from "react";
import type { PillMessage, PillMode } from "./Pill";

export interface PillMessageEvent {
  id: string;
  role: PillMessage["role"];
  text: string;
  status?: PillMessage["status"];
  streaming?: boolean;
  /** default "upsert" */
  op?: "upsert" | "remove" | "clear";
}

interface PillState {
  mode: PillMode;
  messages: PillMessage[];
}

let state: PillState = { mode: "idle", messages: [] };
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}
function set(next: Partial<PillState>) {
  state = { ...state, ...next };
  notify();
}

function upsert(msg: PillMessage) {
  const i = state.messages.findIndex((m) => m.id === msg.id);
  const messages = state.messages.slice();
  if (i >= 0) messages[i] = { ...messages[i], ...msg };
  else messages.push(msg);
  // Any new/updated bubble opens the pill so the user sees the activity.
  set({ messages, mode: "open" });
}

export const pillStore = {
  getState: () => state,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  setMode(mode: PillMode) {
    set({ mode });
  },
  clear() {
    set({ messages: [], mode: "idle" });
  },
  /** Append or replace a bubble. */
  upsert,
  /** Apply a raw `pill://message` payload. */
  applyEvent(e: PillMessageEvent) {
    const op = e.op ?? "upsert";
    if (op === "clear") return this.clear();
    if (op === "remove") {
      set({ messages: state.messages.filter((m) => m.id !== e.id) });
      return;
    }
    upsert({
      id: e.id,
      role: e.role,
      text: e.text,
      status: e.status,
      streaming: e.streaming,
    });
  },
};

/* ── Tauri wiring (only runs inside the pill window) ────────────────────── */
let disposed: Array<() => void> = [];
let started = false;

/**
 * Attach the Tauri listeners that feed the pill. Call once from the pill
 * window entry. No-ops (and stays previewable) outside a Tauri runtime.
 */
export async function initPillListeners(): Promise<() => void> {
  if (started) return () => {};
  started = true;
  const isTauri =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
  if (!isTauri) return () => {};

  const { listen } = await import("@tauri-apps/api/event");

  disposed.push(
    await listen<PillMessageEvent>("pill://message", (ev) =>
      pillStore.applyEvent(ev.payload),
    ),
  );
  disposed.push(
    await listen<PillMode>("pill://mode", (ev) => pillStore.setMode(ev.payload)),
  );
  disposed.push(await listen("pill://clear", () => pillStore.clear()));

  // ── Mirror the Snapshot feed into the pill (primary surface, P1-08). ──
  disposed.push(
    await listen("keyfloe://snapshot-started", () =>
      pillStore.upsert({
        id: "snapshot",
        role: "ai",
        text: "Reading your snapshot…",
        streaming: true,
      }),
    ),
  );
  disposed.push(
    await listen<string>("keyfloe://snapshot-chunk", (ev) =>
      pillStore.upsert({
        id: "snapshot",
        role: "ai",
        text: ev.payload,
        streaming: true,
      }),
    ),
  );
  disposed.push(
    await listen<string>("keyfloe://snapshot-done", (ev) =>
      pillStore.upsert({
        id: "snapshot",
        role: "ai",
        text: ev.payload,
        streaming: false,
      }),
    ),
  );
  disposed.push(
    await listen<{ message?: string; quota?: boolean }>(
      "keyfloe://snapshot-error",
      (ev) =>
        pillStore.upsert({
          id: "snapshot",
          role: "ai",
          text: ev.payload?.quota
            ? "You've hit today's limit. Upgrade to keep going."
            : ev.payload?.message ?? "Snapshot failed.",
          status: "fail",
          streaming: false,
        }),
    ),
  );

  return () => {
    disposed.forEach((u) => u());
    disposed = [];
    started = false;
  };
}

/** React binding for the pill window. */
export function usePillStore(): PillState {
  return useSyncExternalStore(pillStore.subscribe, pillStore.getState, pillStore.getState);
}
