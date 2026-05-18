import { useEffect, useRef } from 'react';
import type { InterviewState } from '@shared/types';
import { EditorialEyebrow } from './editorial';

/**
 * Live transcript view shown inside the pill when interview mode is
 * running. Mirror of Pill/InterviewTranscriptView.swift — chronological,
 * role-labelled, auto-scrolls when the user is at the bottom.
 */
export function InterviewTranscript({ state }: { state: InterviewState }) {
  const ref = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [state.turns]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <EditorialEyebrow text="Live transcript" />
        {state.systemAudioActive ? (
          <span className="pixel-eyebrow text-live">● SYS AUDIO</span>
        ) : (
          <span className="pixel-eyebrow text-ink-400">○ MIC ONLY</span>
        )}
      </div>
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
        }}
        className="app-no-drag overflow-y-auto panel-sculpted p-3 flex flex-col gap-3"
        style={{ minHeight: 120, maxHeight: 280 }}
      >
        {state.turns.length === 0 ? (
          <div className="text-ink-600 italic p-1" style={{ fontSize: 13 }}>
            Listening — say something or wait for the interviewer to speak.
          </div>
        ) : (
          state.turns.map((t) => (
            <div key={t.id} className="flex flex-col gap-0.5">
              <span
                className={[
                  'pixel-eyebrow',
                  t.role === 'Me' ? 'text-ink-900' : 'text-ink-600',
                ].join(' ')}
              >
                {t.role}
                {t.isLive && <span className="ml-1 live-dot inline-block" />}
              </span>
              <span className="text-ink-900 whitespace-pre-wrap" style={{ fontSize: 14, lineHeight: 1.5 }}>
                {t.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
