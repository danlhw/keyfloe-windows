import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/// Snapshot result wiring for the pill / chat log — the single visual record.
///
/// The backend (src-tauri/src/keyfloe/snapshot/mod.rs) drives the whole flow
/// and emits four events; this hook turns them into simple React state. Drop
/// the hook into the pill component and render `answer` as the streaming
/// assistant turn (exactly how the Mac pill shows `snipAnswer`).
///
/// Events:
///   keyfloe://snapshot-started  → capture began (show a thinking pulse)
///   keyfloe://snapshot-chunk    → running answer text (replace, not append)
///   keyfloe://snapshot-done     → final answer text
///   keyfloe://snapshot-error    → { message, quota }

export type SnapshotStatus = "idle" | "capturing" | "streaming" | "done" | "error";

export interface SnapshotState {
  status: SnapshotStatus;
  /// The running/final answer text. Each chunk carries the FULL running string
  /// (not a delta), so assign it directly.
  answer: string;
  error: string | null;
  /// True when the error is a quota / rate-limit — show an upgrade nudge.
  quota: boolean;
}

const EVT_STARTED = "keyfloe://snapshot-started";
const EVT_CHUNK = "keyfloe://snapshot-chunk";
const EVT_DONE = "keyfloe://snapshot-done";
const EVT_ERROR = "keyfloe://snapshot-error";

interface SnapshotErrorPayload {
  message: string;
  quota: boolean;
}

/// Open the drag-to-select overlay. Call this from the Snapshot shortcut's FE
/// side or a "Snapshot" button in the shell. (The backend also exposes
/// `snapshot_begin` directly for the global-shortcut action path.)
export async function beginSnapshot(): Promise<void> {
  await invoke("snapshot_begin");
}

/// Cancel an open overlay (Esc / dismiss).
export async function cancelSnapshot(): Promise<void> {
  await invoke("snapshot_cancel");
}

export function useSnapshot(): SnapshotState {
  const [state, setState] = useState<SnapshotState>({
    status: "idle",
    answer: "",
    error: null,
    quota: false,
  });

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen(EVT_STARTED, () => {
      setState({ status: "capturing", answer: "", error: null, quota: false });
    }).then((u) => unlisteners.push(u));

    listen<string>(EVT_CHUNK, (e) => {
      setState((s) => ({ ...s, status: "streaming", answer: e.payload }));
    }).then((u) => unlisteners.push(u));

    listen<string>(EVT_DONE, (e) => {
      setState((s) => ({
        ...s,
        status: "done",
        answer: e.payload || s.answer,
      }));
    }).then((u) => unlisteners.push(u));

    listen<SnapshotErrorPayload>(EVT_ERROR, (e) => {
      setState((s) => ({
        ...s,
        status: "error",
        error: e.payload?.message ?? "Snapshot failed",
        quota: !!e.payload?.quota,
      }));
    }).then((u) => unlisteners.push(u));

    return () => unlisteners.forEach((u) => u());
  }, []);

  return state;
}
