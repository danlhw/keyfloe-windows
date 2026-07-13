/// Feature E — AI Snapshot. Public surface for the integrator.
///
/// KEY-EVENT WIRING (task P1-01, the FE dispatcher):
///   route `snapshot_trigger` (phase: "trigger" | "start") -> `beginSnapshot()`.
///   Snapshot is a single-shot open; the marquee itself is the modal step, so
///   only one call is needed (no separate stop). `cancelSnapshot()` is exposed
///   for an explicit dismiss (the overlay already handles Esc / sub-8px itself).
///
/// DASHBOARD "Snapshot" BUTTON:
///   call `beginSnapshot()` (it `invoke("snapshot_begin")`s the backend).
///
/// PILL:
///   the answer streams into the shared pill via the backend's `pill://message`
///   feed (primary surface). `<SnapshotResult/>` is the drop-in fallback card
///   for any view where the pill isn't mounted; it renders nothing while idle.

export { beginSnapshot, cancelSnapshot, useSnapshot } from "./useSnapshot";
export type { SnapshotState, SnapshotStatus } from "./useSnapshot";
export { SnapshotResult } from "./SnapshotResult";
export { SnapshotOverlay } from "./SnapshotOverlay";
