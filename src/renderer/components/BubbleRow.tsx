import type { ChatMessage } from '@shared/types';
import { TypingDots } from './TypingDots';

// Mirror of Pill/BubbleRow.swift (compact). User bubbles flush-right
// with accent fill; assistant bubbles flush-left on the elevated
// surface fill. Streaming bubbles show typing dots inline when empty.

export interface BubbleRowProps {
  message: ChatMessage;
}

export function BubbleRow({ message }: BubbleRowProps) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[80%] rounded-[18px] px-3.5 py-2 text-[13.5px] leading-[1.42]',
          isUser
            ? 'bg-accent-600 text-white'
            : 'bg-bg-2 text-text-primary border border-border-subtle',
          'app-no-drag select-text whitespace-pre-wrap break-words',
        ].join(' ')}
      >
        {message.text || (message.isStreaming ? <TypingDots /> : null)}
        {message.isStreaming && message.text ? (
          <span className="typing-dot animate-typing-dot ml-1 inline-block translate-y-[-2px]" />
        ) : null}
      </div>
    </div>
  );
}
