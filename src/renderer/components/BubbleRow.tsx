import type { ChatMessage } from '@shared/types';
import { TypingDots } from './TypingDots';

/**
 * Chat bubble — iMessage-style. User bubbles flush-right on ink fill;
 * assistant bubbles flush-left on a sculpted paper surface. Same shape
 * + spacing as Pill/BubbleRow.swift.
 */
export interface BubbleRowProps {
  message: ChatMessage;
}

export function BubbleRow({ message }: BubbleRowProps) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[82%] rounded-2xl px-3.5 py-2',
          'app-no-drag select-text whitespace-pre-wrap break-words',
          isUser ? 'text-paper' : 'text-ink-900',
        ].join(' ')}
        style={{
          fontSize: 13.5,
          lineHeight: 1.42,
          background: isUser ? 'var(--ink-900)' : 'var(--bone)',
          boxShadow: isUser
            ? '0 1px 0 rgba(255,255,255,0.08) inset, 0 2px 6px rgba(0,0,0,0.18)'
            : 'inset 0 1px 0 rgba(255,255,255,0.45), 0 2px 6px rgba(10,10,11,0.12)',
        }}
      >
        {message.text || (message.isStreaming ? <TypingDots /> : null)}
        {message.isStreaming && message.text ? (
          <span className="typing-dot ml-1 inline-block translate-y-[-2px]" />
        ) : null}
      </div>
    </div>
  );
}
