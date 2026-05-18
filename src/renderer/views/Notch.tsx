/**
 * Notch shell — the top-of-screen window. Three states, matching
 * NotchState.swift:
 *   idle          → just the notch lip (Windows = always-rendered fake
 *                   notch since no Windows machine has a hardware one)
 *   hoverCompact  → small status pill + quick action buttons
 *   expandedFull  → the full Dashboard rendered inside the hanging body
 *
 * Hover triggers idle → hoverCompact; click the gear (or the expand
 * button) to go to expandedFull; click the ✕ in the corner to collapse;
 * Esc collapses expandedFull to hoverCompact; mouse leaves → grace
 * period → back to idle.
 */
import { useEffect, useRef, useState } from 'react';
import { NotchHang, NotchLip, NOTCH_WIDTH, NOTCH_HEIGHT } from '../components/NotchShape';
import { Dashboard } from './Dashboard';
import type { InterviewState } from '@shared/types';

type State = 'idle' | 'hoverCompact' | 'expandedFull';

const SIZES = {
  idle:         { width: NOTCH_WIDTH, height: NOTCH_HEIGHT },
  hoverCompact: { width: 420,         height: 110 },
  expandedFull: { width: 980,         height: 660 },
};

export function Notch() {
  const [state, setState] = useState<State>('idle');
  const [interview, setInterview] = useState<InterviewState>({
    isRunning: false, turns: [], micLevel: 0, systemAudioActive: false,
    startedAt: null, lastError: null,
  });
  const [stealthOn, setStealthOn] = useState(false);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tell main to resize the window every time we change state so the
  // OS-level click area matches what we paint.
  useEffect(() => {
    const size = SIZES[state];
    window.keyfloe.notch.setState({ state, ...size });
  }, [state]);

  // Subscribe to interview state so the status line + dot accurately
  // reflect "Interview listening · N turns".
  useEffect(() => {
    const off = window.keyfloe.interview.onState(setInterview);
    return () => off();
  }, []);

  // Subscribe to settings (so the stealth toggle in the compact pill
  // reflects the saved value, and an external change keeps it in sync).
  useEffect(() => {
    window.keyfloe.settings.get().then((s) => setStealthOn(s.stealthMode));
    const off = window.keyfloe.settings.onChange((s) => setStealthOn(s.stealthMode));
    return () => off();
  }, []);

  // Esc collapses expanded → compact, never further (so the user can
  // still reach the dashboard quickly after a stray Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state === 'expandedFull') {
        e.preventDefault();
        setState('hoverCompact');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state]);

  // Hover plumbing. Mouse enter cancels any pending leave-grace timer;
  // mouse leave starts one. Grace period is longer in expandedFull so
  // brushing a scrollbar / context menu doesn't dismiss the dashboard.
  function onMouseEnter() {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (state === 'idle') setState('hoverCompact');
  }
  function onMouseLeave() {
    if (state === 'idle') return;
    const grace = state === 'expandedFull' ? 600 : 350;
    leaveTimerRef.current = setTimeout(() => {
      setState('idle');
      leaveTimerRef.current = null;
    }, grace);
  }

  function openPill()             { window.keyfloe.pill.show(); }
  function toggleInterview() {
    if (interview.isRunning) window.keyfloe.interview.stop();
    else                     window.keyfloe.interview.start();
  }
  function toggleStealth() {
    const next = !stealthOn;
    setStealthOn(next);
    window.keyfloe.settings.set({ stealthMode: next });
  }

  const size = SIZES[state];

  return (
    <div
      ref={containerRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: '100vw', height: '100vh',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        overflow: 'hidden',
      }}
    >
      {state === 'idle' ? (
        // Windows doesn't have a hardware notch — always paint a fake
        // black lip so the user can find the hover target.
        <NotchLip width={size.width} />
      ) : (
        <NotchHang width={size.width} height={size.height}>
          {/* Reserve the lip strip at the top so dashboard chrome
              doesn't sit under it. */}
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <div style={{ height: NOTCH_HEIGHT }} />
            {state === 'hoverCompact' ? (
              <CompactBody
                interview={interview}
                stealthOn={stealthOn}
                onOpenPill={openPill}
                onExpand={() => setState('expandedFull')}
                onToggleInterview={toggleInterview}
                onToggleStealth={toggleStealth}
              />
            ) : (
              <div
                className="bg-paper"
                style={{ height: `calc(100% - ${NOTCH_HEIGHT}px)`, overflow: 'auto' }}
              >
                <Dashboard />
                <button
                  onClick={() => setState('hoverCompact')}
                  aria-label="Close (Esc)"
                  style={{
                    position: 'absolute', top: NOTCH_HEIGHT + 8, right: 12,
                    width: 22, height: 22, borderRadius: 999,
                    background: 'rgba(0,0,0,0.4)', color: 'white',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </NotchHang>
      )}
    </div>
  );
}

// ─── Compact body — "what's Keyfloe doing right now?" + quick actions
function CompactBody({
  interview, stealthOn,
  onOpenPill, onExpand, onToggleInterview, onToggleStealth,
}: {
  interview: InterviewState;
  stealthOn: boolean;
  onOpenPill: () => void;
  onExpand: () => void;
  onToggleInterview: () => void;
  onToggleStealth: () => void;
}) {
  const statusLine = (() => {
    if (interview.isRunning) {
      const n = interview.turns.length;
      return `Interview listening · ${n} turn${n === 1 ? '' : 's'}`;
    }
    return 'Ready';
  })();
  const dotColor = interview.isRunning ? '#ef4444' : '#22c55e';
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 18px', height: '100%',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: 999,
          background: dotColor,
          boxShadow: interview.isRunning ? '0 0 6px rgba(239,68,68,0.6)' : 'none',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: '-apple-system, "Segoe UI Variable", sans-serif',
          fontSize: 13, fontWeight: 600, color: 'white',
        }}>Keyfloe</span>
        <span style={{
          fontSize: 11, color: 'rgba(255,255,255,0.65)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{statusLine}</span>
      </div>
      <QuickButton
        title={interview.isRunning ? 'Stop interview helper' : 'Start interview helper'}
        tint={interview.isRunning ? '#ef4444' : 'white'}
        onClick={onToggleInterview}
        glyph={interview.isRunning ? '◉' : '○'}
      />
      <QuickButton
        title={stealthOn ? 'Stealth ON — click to disable' : 'Stealth OFF — click to enable'}
        tint={stealthOn ? '#60a5fa' : 'white'}
        onClick={onToggleStealth}
        glyph={'✦'}
      />
      <QuickButton
        title="Open chat pill"
        tint="white"
        onClick={onOpenPill}
        glyph="◐"
      />
      <QuickButton
        title="Open dashboard"
        tint="white"
        onClick={onExpand}
        glyph="⚙"
      />
    </div>
  );
}

function QuickButton({
  title, tint, glyph, onClick,
}: {
  title: string; tint: string; glyph: string; onClick: () => void;
}) {
  const [hovering, setHovering] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        width: 28, height: 28, borderRadius: 999,
        background: hovering ? `${tint === 'white' ? 'rgba(255,255,255,0.18)' : 'rgba(96,165,250,0.18)'}` : 'transparent',
        border: 'none', cursor: 'pointer',
        color: hovering ? tint : `${tint === 'white' ? 'rgba(255,255,255,0.78)' : tint}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, lineHeight: 1,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      {glyph}
    </button>
  );
}
