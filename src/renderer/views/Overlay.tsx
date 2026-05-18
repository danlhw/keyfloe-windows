import { useEffect, useState } from 'react';
import type { PointerState } from '@shared/types';

// Port of Clicky/OverlayWindow.swift's BlueCursorView. A transparent,
// click-through fullscreen window per display. Renders a blue cursor
// triangle + speech bubble when the pointer state is in "pointing"
// mode; hidden otherwise.
//
// We use CSS transforms (translate3d) so the cursor animates smoothly
// without rerendering its DOM subtree.

export function Overlay() {
  const [state, setState] = useState<PointerState>({
    mode: 'hidden',
    target: null,
    cursor: { x: 0, y: 0 },
  });

  useEffect(() => {
    const off = window.keyfloe.pointer.onState(setState);
    return () => off();
  }, []);

  if (state.mode !== 'pointing' || !state.target) {
    return <div className="w-screen h-screen pointer-events-none" />;
  }

  const t = state.target;

  return (
    <div className="w-screen h-screen pointer-events-none relative">
      {/* Blue cursor pointer landing on the target */}
      <div
        className="absolute"
        style={{
          left: 0,
          top: 0,
          transform: `translate3d(${t.x - 14}px, ${t.y - 14}px, 0)`,
          transition: 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32">
          <defs>
            <radialGradient id="cur-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="rgba(96,165,250,0.75)" />
              <stop offset="60%"  stopColor="rgba(96,165,250,0.15)" />
              <stop offset="100%" stopColor="rgba(96,165,250,0)" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="14" fill="url(#cur-glow)" />
          {/* Mac-style "split-tail" white cursor silhouette */}
          <path
            d="M16 6 L8 26 L16 21 L24 26 Z"
            fill="white"
            stroke="black"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Speech bubble next to the cursor with the label */}
      {t.message && (
        <div
          className="absolute"
          style={{
            left: 0,
            top: 0,
            transform: `translate3d(${t.x + 28}px, ${Math.max(t.y - 14, 8)}px, 0)`,
            transition: 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <div className="pill-glass rounded-2xl px-3 py-2 text-sm text-text-primary max-w-[260px] shadow-2xl">
            {t.message}
          </div>
        </div>
      )}
    </div>
  );
}
