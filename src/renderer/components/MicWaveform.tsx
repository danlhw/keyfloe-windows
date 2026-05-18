import { useEffect, useState } from 'react';

// Mirrors Pill/MicWaveform.swift — 5 vertical bars pulsing in a stagger
// while the mic is hot. Driven by `level` (0..1) rather than a fixed
// animation so the bars respond to the user's actual voice loudness.

export interface MicWaveformProps {
  level: number;
  active: boolean;
}

const BAR_COUNT = 5;

export function MicWaveform({ level, active }: MicWaveformProps) {
  // Lightly smoothed history so the bars don't strobe on every frame.
  const [history, setHistory] = useState<number[]>(() => Array(BAR_COUNT).fill(0));

  useEffect(() => {
    if (!active) {
      setHistory(Array(BAR_COUNT).fill(0));
      return;
    }
    setHistory((prev) => {
      const next = [...prev];
      next.shift();
      next.push(Math.min(1, Math.max(0.05, level)));
      return next;
    });
  }, [level, active]);

  return (
    <div className="flex items-center gap-[3px] h-5">
      {history.map((h, i) => (
        <div
          key={i}
          className="mic-bar"
          style={{
            height: `${4 + h * 16}px`,
            opacity: active ? 0.6 + h * 0.4 : 0.25,
            transition: 'height 80ms ease, opacity 80ms ease',
          }}
        />
      ))}
    </div>
  );
}
