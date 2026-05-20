/**
 * Notch shell — top-of-screen status pill + quick actions.
 * Three states (matching Mac NotchState.swift):
 *   idle          → tiny 200×32 black lip
 *   hoverCompact  → 420×110 pill with status + 4 quick action buttons
 *   expandedFull  → 980×660 full Dashboard
 *
 * Hover plumbing:
 *   - Mouse enters → enter hoverCompact (instant)
 *   - Mouse leaves → 350ms grace → idle (no flicker on accidental brush)
 *   - Click gear  → expandedFull
 *   - Esc / X     → expandedFull → hoverCompact
 *
 * Inside content uses CSS opacity + transform transitions so the change
 * feels animated even though the BrowserWindow snaps size instantly.
 */
import { useEffect, useRef, useState } from 'react';
import { NotchHang, NotchLip, NOTCH_WIDTH, NOTCH_HEIGHT } from '../components/NotchShape';
import { Dashboard } from './Dashboard';
import type { InterviewState, StealthMode } from '@shared/types';
import {
  InterviewIcon, EyeSlashIcon, ChatBubbleIcon, GearIcon, CloseIcon,
} from '../components/icons';

type State = 'idle' | 'hoverCompact' | 'expandedFull';

const SIZES = {
  idle:         { width: NOTCH_WIDTH, height: NOTCH_HEIGHT },
  // Mac NotchGeometry uses 110pt hoverCompact tall — bumping ours to
  // match so text doesn't get vertically cut off ("letters cut off
  // by the edges" user report).
  hoverCompact: { width: 520,         height: 112 },
  expandedFull: { width: 1080,        height: 720 },
};

export function Notch() {
  const [state, setState] = useState<State>('idle');
  const [interview, setInterview] = useState<InterviewState>({
    isRunning: false, turns: [], micLevel: 0, systemAudioActive: false,
    startedAt: null, lastError: null,
  });
  const [stealthMode, setStealthMode] = useState<StealthMode>('auto');
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Resize the BrowserWindow whenever state changes — the click area
  // must match what we paint or the user clicks "outside" their target.
  useEffect(() => {
    const size = SIZES[state];
    window.keyfloe.notch.setState({ state, ...size });
  }, [state]);

  useEffect(() => {
    const off = window.keyfloe.interview.onState(setInterview);
    return () => off();
  }, []);

  useEffect(() => {
    window.keyfloe.settings.get().then((s) => setStealthMode(s.stealthMode));
    const off = window.keyfloe.settings.onChange((s) => setStealthMode(s.stealthMode));
    return () => off();
  }, []);

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

  function onMouseEnter() {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (state === 'idle') setState('hoverCompact');
    // Force window focus on entry. Frameless transparent always-on-top
    // windows on Windows often need an explicit focus poke before they
    // accept clicks — that was the "have to press twice" report. With
    // focus pre-acquired, the very first click on a quick-action button
    // fires its onClick instead of being eaten as a focus-grab gesture.
    window.focus();
  }
  function onMouseLeave() {
    if (state === 'idle') return;
    // Snappy close — user said the previous 320ms compact / 800ms
    // expanded grace made them have to move "so much further away".
    // Tighter: 120ms compact (fast collapse if they truly left),
    // 350ms expanded (still forgiving for scrollbar brush).
    const grace = state === 'expandedFull' ? 350 : 120;
    leaveTimerRef.current = setTimeout(() => {
      setState('idle');
      leaveTimerRef.current = null;
    }, grace);
  }

  const stealthOn = stealthMode === 'always-on' || stealthMode === 'auto';

  function openPill() { window.keyfloe.pill.show(); }
  function toggleInterview() {
    if (interview.isRunning) window.keyfloe.interview.stop();
    else                     window.keyfloe.interview.start();
  }
  function toggleStealth() {
    const next: StealthMode = stealthOn ? 'always-off' : 'always-on';
    setStealthMode(next);
    window.keyfloe.settings.set({ stealthMode: next });
  }

  const size = SIZES[state];

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: '100vw', height: '100vh',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        overflow: 'hidden',
      }}
    >
      {state === 'idle' ? (
        <NotchLip width={size.width} />
      ) : (
        <NotchHang width={size.width} height={size.height}>
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
              <ExpandedBody onClose={() => setState('hoverCompact')} />
            )}
          </div>
        </NotchHang>
      )}
    </div>
  );
}

// ─── Compact body — status pill with 4 quick action buttons ─────

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
      className="fadein"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 18px', height: '100%',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: 999,
          background: dotColor, flexShrink: 0,
          boxShadow: interview.isRunning ? '0 0 8px rgba(239,68,68,0.55)' : '0 0 4px rgba(34,197,94,0.35)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: '-apple-system, "Segoe UI Variable", sans-serif',
          fontSize: 13, fontWeight: 600, color: '#f5f1ea', letterSpacing: '-0.005em',
        }}>Keyfloe</span>
        <span style={{
          fontSize: 11, color: 'rgba(245,241,234,0.65)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{statusLine}</span>
      </div>
      <button
        type="button"
        className="notch-icon-btn"
        data-on={interview.isRunning ? 'true' : 'false'}
        data-tone="red"
        title={interview.isRunning ? 'Stop interview' : 'Start interview helper'}
        onClick={onToggleInterview}
      >
        <InterviewIcon size={15} />
      </button>
      <button
        type="button"
        className="notch-icon-btn"
        data-on={stealthOn ? 'true' : 'false'}
        data-tone="blue"
        title={stealthOn ? 'Stealth ON — invisible to screen recordings' : 'Stealth OFF — click to enable'}
        onClick={onToggleStealth}
      >
        <EyeSlashIcon size={15} />
      </button>
      <button
        type="button"
        className="notch-icon-btn"
        title="Open chat pill"
        onClick={onOpenPill}
      >
        <ChatBubbleIcon size={15} />
      </button>
      <button
        type="button"
        className="notch-icon-btn"
        title="Open dashboard"
        onClick={onExpand}
      >
        <GearIcon size={15} />
      </button>
    </div>
  );
}

// ─── Expanded body — full dashboard inside the hanging window ────

function ExpandedBody({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="bg-paper fadein"
      style={{
        height: `calc(100% - ${NOTCH_HEIGHT}px)`,
        overflow: 'auto', position: 'relative',
      }}
    >
      <Dashboard />
      <button
        onClick={onClose}
        aria-label="Close (Esc)"
        title="Close (Esc)"
        style={{
          position: 'absolute', top: 12, right: 14,
          width: 28, height: 28, borderRadius: 999,
          background: 'rgba(10,10,11,0.55)', color: '#f5f1ea',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }}
      >
        <CloseIcon size={13} />
      </button>
    </div>
  );
}
