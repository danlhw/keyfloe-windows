// Mirror of Pill/TypingDotsView.swift. Three dots, staggered ease.

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[5px] py-1">
      <span className="typing-dot animate-typing-dot" style={{ animationDelay: '0ms' }} />
      <span className="typing-dot animate-typing-dot" style={{ animationDelay: '160ms' }} />
      <span className="typing-dot animate-typing-dot" style={{ animationDelay: '320ms' }} />
    </span>
  );
}
