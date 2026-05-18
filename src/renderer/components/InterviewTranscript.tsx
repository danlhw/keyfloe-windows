import { useEffect, useRef } from 'react';
import type { InterviewState } from '@shared/types';

// Mirror of Pill/InterviewTranscriptView.swift. Rolling, role-labelled
// chronological transcript with auto-scroll while at the bottom.

export interface InterviewTranscriptProps {
  state: InterviewState;
}

export function InterviewTranscript({ state }: InterviewTranscriptProps) {
  const ref = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [state.turns]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-wider text-text-tertiary px-1">
        Live transcript
        {state.systemAudioActive ? (
          <span className="ml-2 text-accent-400">● system audio</span>
        ) : (
          <span className="ml-2 text-text-tertiary/60">○ mic-only</span>
        )}
      </div>
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
        }}
        className="app-no-drag overflow-y-auto rounded-lg bg-bg-2/70 border border-border-subtle p-2.5 min-h-[120px] max-h-[280px] flex flex-col gap-2"
      >
        {state.turns.length === 0 ? (
          <div className="text-text-tertiary text-sm italic p-2">
            Listening — say something or wait for the interviewer to speak.
          </div>
        ) : (
          state.turns.map((t) => (
            <div key={t.id} className="flex flex-col gap-0.5">
              <span className={[
                'text-[11px] uppercase tracking-wider font-medium',
                t.role === 'Me' ? 'text-accent-400' : 'text-text-secondary',
              ].join(' ')}>
                {t.role}
                {t.isLive && <span className="ml-1 text-accent-400">●</span>}
              </span>
              <span className="text-sm text-text-primary leading-snug whitespace-pre-wrap">
                {t.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
