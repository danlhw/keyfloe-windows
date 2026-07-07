import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/// Snapshot marquee overlay — the Windows parity of the Mac SnipSelectionView
/// (../keyfloe-1/app/Sources/Capture/SnipController.swift). Full-screen,
/// transparent, dimmed. The user drags a box over anything on screen; on
/// release we hide this window, convert the CSS-pixel rect to physical device
/// pixels, and hand it to the `snapshot_capture_region` backend command, which
/// captures + streams the answer into the pill.
///
/// Gesture mirrors the website "drag a box" and the Mac snip:
///   • mousedown  → anchor
///   • mousemove  → live marquee, dim wash punched out around the selection
///   • mouseup    → capture (if the box is big enough) else cancel
///   • Esc        → cancel

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_DRAG = 8; // px — below this a drag is treated as a stray click.

export function SnapshotOverlay() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const dragging = useRef(false);

  const cancel = useCallback(() => {
    // Ask the backend to hide the overlay window (keeps the show/hide owner in
    // one place); best-effort hide locally too.
    invoke("snapshot_cancel").catch(() => {});
    getCurrentWindow()
      .hide()
      .catch(() => {});
  }, []);

  const finish = useCallback(async (sel: Rect, prompt?: string) => {
    // Hide BEFORE capturing so the dim + marquee never land in the screenshot
    // (same ordering as the Mac finish() → hide → capture).
    try {
      await getCurrentWindow().hide();
    } catch {
      /* ignore */
    }

    const dpr = window.devicePixelRatio || 1;
    try {
      await invoke("snapshot_capture_region", {
        rect: {
          x: Math.round(sel.x * dpr),
          y: Math.round(sel.y * dpr),
          width: Math.round(sel.w * dpr),
          height: Math.round(sel.h * dpr),
          monitor: null,
        },
        prompt: prompt ?? null,
      });
    } catch (e) {
      // The backend also emits keyfloe://snapshot-error; log for dev.
      console.error("snapshot_capture_region failed", e);
    }
    // Reset local state so the next open starts clean.
    setStart(null);
    setRect(null);
  }, []);

  // Global key + mouse handlers so the whole surface is draggable.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // left button only
    dragging.current = true;
    setStart({ x: e.clientX, y: e.clientY });
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging.current || !start) return;
      const x = Math.min(start.x, e.clientX);
      const y = Math.min(start.y, e.clientY);
      const w = Math.abs(e.clientX - start.x);
      const h = Math.abs(e.clientY - start.y);
      setRect({ x, y, w, h });
    },
    [start],
  );

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const sel = rect;
    if (!sel || sel.w < MIN_DRAG || sel.h < MIN_DRAG) {
      cancel();
      return;
    }
    void finish(sel);
  }, [rect, cancel, finish]);

  const hasSelection = !!rect && rect.w > 1 && rect.h > 1;

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      style={{
        position: "fixed",
        inset: 0,
        cursor: "crosshair",
      }}
    >
      {/* Dim wash over the whole screen. The selection is "punched out" with
          four dark panels around it so the chosen region stays full-brightness
          and readable (matches the native screenshot convention + the Mac
          evenOdd punch-out). */}
      {!hasSelection ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.20)",
          }}
        />
      ) : (
        <>
          {/* top */}
          <div style={dimStyle(0, 0, "100%", rect!.y)} />
          {/* bottom */}
          <div style={dimStyle(0, rect!.y + rect!.h, "100%", `calc(100% - ${rect!.y + rect!.h}px)`)} />
          {/* left */}
          <div style={dimStyle(0, rect!.y, rect!.x, rect!.h)} />
          {/* right */}
          <div
            style={dimStyle(
              rect!.x + rect!.w,
              rect!.y,
              `calc(100% - ${rect!.x + rect!.w}px)`,
              rect!.h,
            )}
          />
          {/* Marquee border: dark base + white dashes → visible on any bg. */}
          <div
            style={{
              position: "fixed",
              left: rect!.x,
              top: rect!.y,
              width: rect!.w,
              height: rect!.h,
              boxSizing: "border-box",
              border: "1.5px solid rgba(0,0,0,0.55)",
              outline: "1.5px dashed #fff",
              outlineOffset: "-1.5px",
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* Hint chip — only before the first drag. */}
      {!hasSelection && (
        <div
          style={{
            position: "fixed",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 14px",
            borderRadius: 10,
            background: "rgba(20,20,22,0.72)",
            color: "#fff",
            fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: 0.2,
            pointerEvents: "none",
            backdropFilter: "blur(8px)",
          }}
        >
          Drag a box over anything to ask Keyfloe · Esc to cancel
        </div>
      )}
    </div>
  );
}

function dimStyle(
  left: number | string,
  top: number | string,
  width: number | string,
  height: number | string,
): React.CSSProperties {
  return {
    position: "fixed",
    left,
    top,
    width,
    height,
    background: "rgba(0,0,0,0.20)",
    pointerEvents: "none",
  };
}
