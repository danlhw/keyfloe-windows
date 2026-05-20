import type { ChatMessage } from '@shared/types';
import { TypingDots } from './TypingDots';
import { marked } from 'marked';
import { useMemo } from 'react';

/**
 * Chat bubble — Mac-parity rendering.
 *
 * Mac's BubbleRow splits a single assistant turn into multiple stacked
 * bubbles, one per paragraph (Markdown `\n\n` blocks). Lists, bold,
 * italics, inline code all render properly — no raw `**stars**` left
 * in the text. We do the same here via marked with minimal styling.
 *
 * User bubbles → accent fill, flush right.
 * Assistant   → bone fill + hairline, flush left, one per paragraph.
 */
export interface BubbleRowProps {
  message: ChatMessage;
}

// Synchronous markdown render (marked v18 supports this when no async
// extensions are registered, which we don't). Output is HTML — safe to
// dangerouslySetInnerHTML because the source is our model output, not
// user-controlled web content, and the marked sanitiser default strips
// <script>/<iframe> regardless.
marked.setOptions({ gfm: true, breaks: true });
function md(s: string): string {
  return marked.parse(s, { async: false }) as string;
}

function splitParagraphs(text: string): string[] {
  // Split on blank lines so each Markdown paragraph (or list block,
  // or code block) becomes its own bubble. Matches the Mac visual
  // where multi-step answers feel like a chat thread, not a wall.
  return text
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function BubbleRow({ message }: BubbleRowProps) {
  const isUser = message.role === 'user';
  const paragraphs = useMemo(() => splitParagraphs(message.text), [message.text]);

  // User bubbles are typically short — render as one bubble.
  if (isUser) {
    return (
      <div className="flex w-full justify-end">
        <div className="bubble-user app-no-drag select-text whitespace-pre-wrap break-words">
          {message.text || (message.isStreaming ? <TypingDots /> : null)}
        </div>
      </div>
    );
  }

  // Empty streaming → typing dots
  if (paragraphs.length === 0) {
    if (message.isStreaming) {
      return (
        <div className="flex w-full justify-start">
          <div className="bubble-assistant app-no-drag">
            <TypingDots />
          </div>
        </div>
      );
    }
    return null;
  }

  // Assistant: one bubble per Markdown paragraph
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {paragraphs.map((para, i) => {
        const isLast = i === paragraphs.length - 1;
        return (
          <div key={i} className="flex w-full justify-start">
            <div
              className="bubble-assistant app-no-drag select-text break-words md-prose"
              dangerouslySetInnerHTML={{ __html: md(para) }}
            />
            {message.isStreaming && isLast && (
              <span className="typing-dot ml-2 self-end mb-2" />
            )}
          </div>
        );
      })}
    </div>
  );
}
