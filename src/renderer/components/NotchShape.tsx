/**
 * SVG ports of NotchShape.swift. Two shapes:
 *   NotchLipShape  — just the lip itself (rendered in idle state on
 *                    non-notched displays so the affordance exists).
 *   NotchHangShape — the body that hangs off the bottom of the lip:
 *                    flat top with concave inner corners where it meets
 *                    the screen edge, convex outer corners on the body.
 *
 * The shape morphs between hover-compact and expanded-full just by
 * changing its SVG size — the corner radii are constant so the
 * silhouette stays recognisable at every size.
 */
import { type ReactNode } from 'react';

export const NOTCH_WIDTH  = 200;
export const NOTCH_HEIGHT = 32;
const INNER_R = 10;
const OUTER_R = 18;

export interface NotchHangProps {
  width: number;
  height: number;
  children?: ReactNode;
  fill?: string;
  stroke?: string;
}

export function NotchHang({
  width, height, children,
  fill = '#000', stroke = 'rgba(255,255,255,0.06)',
}: NotchHangProps) {
  const w = width, h = height;
  const notchLeft  = (w - NOTCH_WIDTH) / 2;
  const notchRight = (w + NOTCH_WIDTH) / 2;
  const r = INNER_R;
  const R = OUTER_R;
  const d = [
    `M ${notchLeft} 0`,
    `L ${notchRight} 0`,
    // concave right tuck
    `Q ${notchRight} ${NOTCH_HEIGHT} ${notchRight + r} ${NOTCH_HEIGHT}`,
    // right shoulder
    `L ${w - R} ${NOTCH_HEIGHT}`,
    // top-right convex
    `Q ${w} ${NOTCH_HEIGHT} ${w} ${NOTCH_HEIGHT + R}`,
    // right wall
    `L ${w} ${h - R}`,
    // bottom-right convex
    `Q ${w} ${h} ${w - R} ${h}`,
    // bottom edge
    `L ${R} ${h}`,
    // bottom-left convex
    `Q 0 ${h} 0 ${h - R}`,
    // left wall
    `L 0 ${NOTCH_HEIGHT + R}`,
    // top-left convex
    `Q 0 ${NOTCH_HEIGHT} ${R} ${NOTCH_HEIGHT}`,
    // left shoulder
    `L ${notchLeft - r} ${NOTCH_HEIGHT}`,
    // concave left tuck
    `Q ${notchLeft} ${NOTCH_HEIGHT} ${notchLeft} 0`,
    'Z',
  ].join(' ');

  // The clip path lets us render arbitrary children clipped to the
  // notch silhouette — that's how the expanded dashboard "lives inside"
  // the hanging body.
  const clipId = `notch-clip-${width}-${height}`;
  return (
    <div style={{ position: 'relative', width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.35))' }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={d} />
          </clipPath>
        </defs>
        <path d={d} fill={fill} stroke={stroke} strokeWidth={0.5} />
      </svg>
      {children && (
        <div
          style={{
            position: 'absolute', inset: 0,
            clipPath: `path('${d}')`,
            WebkitClipPath: `path('${d}')`,
            pointerEvents: 'auto',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Just the notch lip — for non-notched displays in idle. */
export function NotchLip({ width }: { width: number }) {
  const w = width;
  const notchLeft  = (w - NOTCH_WIDTH) / 2;
  const notchRight = (w + NOTCH_WIDTH) / 2;
  const r = INNER_R;
  const h = NOTCH_HEIGHT;
  const d = [
    `M ${notchLeft - r} 0`,
    `Q ${notchLeft} 0 ${notchLeft} ${r}`,
    `L ${notchLeft} ${h - r}`,
    `Q ${notchLeft} ${h} ${notchLeft + r} ${h}`,
    `L ${notchRight - r} ${h}`,
    `Q ${notchRight} ${h} ${notchRight} ${h - r}`,
    `L ${notchRight} ${r}`,
    `Q ${notchRight} 0 ${notchRight + r} 0`,
    'Z',
  ].join(' ');
  return (
    <svg
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      style={{ display: 'block' }}
    >
      <path d={d} fill="#000" />
    </svg>
  );
}
