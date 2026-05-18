/**
 * Editorial design-system primitives. Direct TypeScript/React ports of
 * the SwiftUI views in app/Sources/Dashboard/OneClickStyle.swift —
 * EditorialEyebrow, DisplayTitle, EditorialDivider, EditorialCard,
 * EditorialButton, TabHeader, StatusChip, SegmentedLoader, plus the
 * .panelSculpted modifier expressed as a className.
 *
 * Everything ultimately keys off the paper/bone/ink palette in
 * globals.css; do not introduce new colors here — extend the palette
 * in OneClickStyle.swift first, mirror it back into globals.css and
 * tailwind.config.cjs, then use the new token.
 */
import { useEffect, useState, type ReactNode } from 'react';

/** Uppercase, widely-tracked Departure Mono eyebrow label. */
export function EditorialEyebrow({
  text, muted = true,
}: { text: string; muted?: boolean }) {
  return (
    <span
      className={[
        'pixel-eyebrow',
        muted ? 'text-ink-600' : 'text-ink-900',
      ].join(' ')}
    >
      {text}
    </span>
  );
}

/**
 * Display serif headline. Mixes a roman `leading` with an optional
 * italic emphasis word — matches the SwiftUI DisplayTitle's pattern:
 *   "Your Mac, with a " + "memory."  (italic on the second part)
 */
export function DisplayTitle({
  leading, italic, size = 'lg',
}: {
  leading: string;
  italic?: string | null;
  size?: 'xl' | 'lg' | 'md' | 'sm';
}) {
  const sizeClass = {
    xl: 'text-display-xl',
    lg: 'text-display-lg',
    md: 'text-display-md',
    sm: 'text-display-sm',
  }[size];
  return (
    <h1 className={`${sizeClass} text-ink-900 font-display`}>
      <span>{leading}</span>
      {italic && (
        <span className="font-display-italic font-normal">{italic}</span>
      )}
    </h1>
  );
}

/** Hairline horizontal rule. */
export function EditorialDivider({ className = '' }: { className?: string }) {
  return <hr className={`editorial-divider ${className}`} />;
}

/** Sculpted-panel card container. Variants: paper (default) and ink. */
export function EditorialCard({
  children, inset = 24, variant = 'paper', className = '',
}: {
  children: ReactNode;
  inset?: number;
  variant?: 'paper' | 'ink';
  className?: string;
}) {
  return (
    <div
      className={[
        variant === 'ink' ? 'panel-sculpted-ink' : 'panel-sculpted',
        className,
      ].join(' ')}
      style={{ padding: inset }}
    >
      {children}
    </div>
  );
}

/** Section headline — small serif title for the card header. */
export function SectionHeading({
  title, italic,
}: { title: string; italic?: string }) {
  return <DisplayTitle leading={title} italic={italic ? ` ${italic}` : null} size="sm" />;
}

/** Square uppercase tracked button — primary or secondary. */
export function EditorialButton({
  label, solid = false, destructive = false, onClick,
  className = '',
}: {
  label: string;
  solid?: boolean;
  destructive?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const classes = [
    'editorial-button app-no-drag',
    solid ? 'solid' : '',
    destructive
      ? 'border-red-500 text-red-500 hover:bg-red-500 hover:text-white'
      : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} onClick={onClick}>
      {label.toUpperCase()}
    </button>
  );
}

/**
 * Top header bundle for a tab: eyebrow row + hairline + display headline.
 * Same shape + spacing as TabHeader in OneClickStyle.swift.
 */
export function TabHeader({
  eyebrow, trailingEyebrow, title, italic, size = 'lg',
}: {
  eyebrow: string;
  trailingEyebrow?: string;
  title: string;
  italic?: string;
  size?: 'xl' | 'lg' | 'md';
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between pb-3">
        <EditorialEyebrow text={eyebrow} />
        {trailingEyebrow && <EditorialEyebrow text={trailingEyebrow} />}
      </div>
      <EditorialDivider className="mb-7" />
      <div className="pb-8">
        <DisplayTitle leading={title} italic={italic ?? null} size={size} />
      </div>
    </div>
  );
}

/**
 * Pixel-mono pill with semantic dot. Variants:
 *   live   — pulsing green ("happening right now")
 *   ok     — solid green ("just completed")
 *   ink    — dark fill, paper text, no green dot
 *   ghost  — no dot, low emphasis
 */
export function StatusChip({
  text, trailing, variant = 'live',
}: {
  text: string;
  trailing?: string;
  variant?: 'live' | 'ok' | 'ink' | 'ghost';
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-2 px-3 py-1.5',
        'panel-sculpted-pill',
        variant === 'ink' ? 'panel-sculpted-ink' : 'panel-sculpted',
      ].join(' ')}
    >
      {variant === 'live' && <span className="live-dot" />}
      {variant === 'ok'   && <span className="ok-dot"   />}
      {variant === 'ink'  && <span className="ink-dot"  />}
      <span className={[
        'pixel-eyebrow',
        variant === 'ink' ? 'text-paper' : 'text-ink-900',
      ].join(' ')}>
        {text.toUpperCase()}
      </span>
      {trailing && (
        <>
          <span className={variant === 'ink' ? 'text-paper/30' : 'text-ink-900/30'}>
            ·
          </span>
          <span className={[
            'pixel-eyebrow',
            variant === 'ink' ? 'text-paper/70' : 'text-ink-900/70',
          ].join(' ')}>
            {trailing.toUpperCase()}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * SegmentedLoader — the "battery filling" indicator. Cycles in .auto
 * mode (no real progress) or fills to a fixed fraction in .progress.
 */
export function SegmentedLoader({
  cells = 14,
  mode = 'auto',
  progress,
  tone = 'ink',
  height = 8,
  gap = 3,
}: {
  cells?: number;
  mode?: 'auto' | 'progress';
  progress?: number;
  tone?: 'ink' | 'paper';
  height?: number;
  gap?: number;
}) {
  const [filled, setFilled] = useState(0);
  useEffect(() => {
    if (mode === 'progress' && typeof progress === 'number') {
      setFilled(Math.min(cells, Math.max(0, Math.round(progress * cells))));
      return;
    }
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      setFilled(i);
      i = i + 1;
      if (i > cells) {
        i = 0;
        setTimeout(tick, 600);
      } else {
        setTimeout(tick, 180);
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [mode, progress, cells]);
  const trackColor = tone === 'ink' ? 'rgba(10,10,11,0.08)' : 'rgba(245,241,234,0.18)';
  const cellOnColor  = tone === 'ink' ? 'var(--ink-900)' : 'var(--paper)';
  const cellOffColor = tone === 'ink' ? 'rgba(10,10,11,0.12)' : 'rgba(245,241,234,0.22)';
  return (
    <div
      className="flex items-stretch p-[1.5px]"
      style={{
        gap,
        height: height + 3,
        background: trackColor,
        borderRadius: Math.max(2, height / 2),
      }}
      role="progressbar"
      aria-valuenow={filled}
      aria-valuemin={0}
      aria-valuemax={cells}
    >
      {Array.from({ length: cells }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: i < filled ? cellOnColor : cellOffColor,
            borderRadius: 1.5,
            transition: 'background 180ms ease',
          }}
        />
      ))}
    </div>
  );
}
