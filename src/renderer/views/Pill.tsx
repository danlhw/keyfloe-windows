import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, InterviewState, VoiceUIState } from '@shared/types';
import { v4 as uuid } from 'uuid';
import { BubbleRow } from '../components/BubbleRow';
import { MicWaveform } from '../components/MicWaveform';
import { InterviewTranscript } from '../components/InterviewTranscript';
import { MicRecorder, b64encode } from '../audio/MicRecorder';
import { SystemAudioRecorder } from '../audio/SystemAudioRecorder';

// Port of Pill/PillView.swift — the floating chat pill. iMessage-style
// glass surface anchored to the user's cursor. Three modes share this
// surface:
//
//   • Idle chat — text input, send → streaming reply with screen context.
//   • Dictation — hold the activation key; mic waveform pulses; release
//     transcribes via Worker and pastes into the focused field.
//   • Interview — toggle button on the input row; rolling live
//     transcript replaces the chat area; "How do I answer?" button
//     drops the verbatim reply into the chat as an assistant bubble.

type BodyMode = 'chat' | 'transcript';

export function Pill() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [voice, setVoice] = useState<VoiceUIState>({ kind: 'idle' });
  const [interview, setInterview] = useState<InterviewState>({
    isRunning: false, turns: [], micLevel: 0, systemAudioActive: false,
    startedAt: null, lastError: null,
  });
  const [bodyMode, setBodyMode] = useState<BodyMode>('chat');
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [proReasoning, setProReasoning] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const streamIdRef = useRef<string | null>(null);
  const recorderRef = useRef<MicRecorder | null>(null);
  const sysRecorderRef = useRef<SystemAudioRecorder | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ─── IPC wires ──────────────────────────────────────────────────

  useEffect(() => {
    const off1 = window.keyfloe.voice.onState(setVoice);
    const off2 = window.keyfloe.interview.onState(setInterview);
    const off3 = window.keyfloe.chat.onDelta((e) => {
      if (e.streamId !== streamIdRef.current) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.isStreaming) next[next.length - 1] = { ...last, text: last.text + e.delta };
        return next;
      });
    });
    const off4 = window.keyfloe.chat.onDone((e) => {
      if (e.streamId !== streamIdRef.current) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.isStreaming) next[next.length - 1] = { ...last, isStreaming: false };
        return next;
      });
      setSubmitting(false);
      streamIdRef.current = null;
    });
    const off5 = window.keyfloe.chat.onError((e) => {
      if (e.streamId !== streamIdRef.current) return;
      setLastError(e.message);
      setSubmitting(false);
      streamIdRef.current = null;
    });
    return () => { off1(); off2(); off3(); off4(); off5(); };
  }, []);

  // Dictation: main asks us to record / stop. We run a MicRecorder one-shot
  // and push the WAV back via voice.pushWav so main can transcribe + paste.
  useEffect(() => {
    const offBegin = window.keyfloe.voice.onBegin(async () => {
      try {
        const rec = new MicRecorder();
        rec.onLevel = (l) => setMicLevel(l);
        await rec.startOneShot();
        recorderRef.current = rec;
      } catch (err) {
        console.error('mic open failed', err);
        await window.keyfloe.voice.pushWav(null);
      }
    });
    const offEnd = window.keyfloe.voice.onEnd(async () => {
      const rec = recorderRef.current;
      if (!rec) { await window.keyfloe.voice.pushWav(null); return; }
      const out = await rec.stopOneShot();
      recorderRef.current = null;
      setMicLevel(0);
      if (!out) { await window.keyfloe.voice.pushWav(null); return; }
      await window.keyfloe.voice.pushWav(b64encode(out.wav));
    });
    const offAbort = window.keyfloe.voice.onAbort(async () => {
      const rec = recorderRef.current;
      if (rec) { await rec.stop(); recorderRef.current = null; }
      setMicLevel(0);
    });
    return () => { offBegin(); offEnd(); offAbort(); };
  }, []);

  // Interview mode: main fires interview:begin → we open the mic +
  // (try to) open system-audio loopback. We push 4 s chunks per channel.
  useEffect(() => {
    const offBegin = window.keyfloe.interview.onBegin(async () => {
      try {
        const mic = new MicRecorder();
        mic.onLevel = (l) => window.keyfloe.interview.pushMicLevel(l);
        mic.onChunk = async (wav, durationMs, rms) => {
          await window.keyfloe.interview.pushChunk({
            role: 'Me',
            wavBase64: b64encode(wav),
            durationMs,
            rms,
          });
        };
        await mic.startContinuous(4000);
        recorderRef.current = mic;
      } catch (err) {
        console.error('interview: mic open failed', err);
      }
      try {
        const sys = new SystemAudioRecorder();
        sys.onChunk = async (wav, durationMs, rms) => {
          await window.keyfloe.interview.pushChunk({
            role: 'Interviewer',
            wavBase64: b64encode(wav),
            durationMs,
            rms,
          });
        };
        await sys.start(4000);
        sysRecorderRef.current = sys;
      } catch (err) {
        // System audio is optional — without it we still get mic-only.
        console.warn('interview: system audio unavailable', err);
      }
      setBodyMode('transcript');
    });
    const offEnd = window.keyfloe.interview.onEnd(async () => {
      const rec = recorderRef.current; if (rec) { await rec.stop(); recorderRef.current = null; }
      const sys = sysRecorderRef.current; if (sys) { await sys.stop(); sysRecorderRef.current = null; }
      setBodyMode('chat');
    });
    return () => { offBegin(); offEnd(); };
  }, []);

  // Auto-resize the pill window to fit the rendered content. Use a
  // ResizeObserver on the outer container.
  useEffect(() => {
    const el = document.getElementById('pill-root');
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        // Outer padding + a small gutter so the shadow isn't clipped.
        window.keyfloe.pill.resize(Math.ceil(cr.width + 24), Math.ceil(cr.height + 24));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Always keep input focus when the pill is visible.
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // ─── Submit / streaming ─────────────────────────────────────────

  const submit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || submitting) return;
    setLastError(null);
    setSubmitting(true);
    setQuery('');

    const userMsg: ChatMessage = {
      id: uuid(), role: 'user', text: trimmed, createdAt: Date.now(),
    };
    const assistant: ChatMessage = {
      id: uuid(), role: 'assistant', text: '', isStreaming: true, createdAt: Date.now(),
    };
    const priorHistory = messages.map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev, userMsg, assistant]);

    // Grab a fresh screenshot so Claude has screen context per turn.
    const shot = await window.keyfloe.capture.screen().catch(() => null);

    const streamId = await window.keyfloe.chat.stream({
      system: SYSTEM_PROMPT,
      history: priorHistory,
      userText: trimmed,
      userImageDataUrl: shot ?? undefined,
      userImageLabel: shot ? '(screenshot of the user\'s current display attached)' : undefined,
      model: proReasoning ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
      maxTokens: 1024,
    });
    streamIdRef.current = streamId;
  }, [query, submitting, messages, proReasoning]);

  const cancelStream = useCallback(() => {
    if (streamIdRef.current) {
      window.keyfloe.chat.cancel(streamIdRef.current);
      streamIdRef.current = null;
      setSubmitting(false);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.isStreaming) next[next.length - 1] = { ...last, isStreaming: false };
        return next;
      });
    }
  }, []);

  const toggleInterview = useCallback(async () => {
    if (interview.isRunning) {
      await window.keyfloe.interview.stop();
    } else {
      await window.keyfloe.interview.start();
    }
  }, [interview.isRunning]);

  const askInterviewAnswer = useCallback(async () => {
    const assistant: ChatMessage = {
      id: uuid(), role: 'assistant', text: '', isStreaming: true, createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, assistant]);
    setBodyMode('chat');
    const result = await window.keyfloe.interview.ask();
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last) {
        next[next.length - 1] = {
          ...last,
          text: result.ok ? result.text : `Interview helper: ${result.message}`,
          isStreaming: false,
        };
      }
      return next;
    });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────

  const voiceLabel = useMemo<string | null>(() => {
    if (voice.kind === 'recording')    return 'Listening…';
    if (voice.kind === 'transcribing') return 'Transcribing…';
    if (voice.kind === 'error')        return voice.message;
    return null;
  }, [voice]);

  return (
    <div className="w-screen h-screen p-3 app-drag">
      <div
        id="pill-root"
        className="pill-glass rounded-pill px-4 py-3 flex flex-col gap-2 min-w-[360px]"
        style={{ width: 'fit-content', maxWidth: 'calc(100vw - 24px)' }}
      >
        {/* Dot-grid overlay sits on top of the glass for the same
            paper-fill texture the Mac pill has. */}
        <div className="dot-grid pointer-events-none absolute inset-3 rounded-pill" />

        {/* Status header — interview toggle, dictation status, pro star */}
        <div className="flex items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleInterview}
              className={[
                'app-no-drag text-[11px] uppercase tracking-wider px-2 py-1 rounded-md border',
                interview.isRunning
                  ? 'bg-accent-600/20 border-accent-600/60 text-accent-300'
                  : 'border-border-subtle text-text-secondary hover:bg-bg-3',
              ].join(' ')}
            >
              {interview.isRunning ? '● Interview' : 'Interview'}
            </button>
            {interview.isRunning && (
              <button
                type="button"
                onClick={() => setBodyMode((b) => (b === 'chat' ? 'transcript' : 'chat'))}
                className="app-no-drag text-[11px] uppercase tracking-wider px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:bg-bg-3"
              >
                {bodyMode === 'chat' ? 'Show transcript' : 'Show chat'}
              </button>
            )}
            {interview.isRunning && (
              <button
                type="button"
                onClick={askInterviewAnswer}
                className="app-no-drag text-[11px] uppercase tracking-wider px-2 py-1 rounded-md bg-accent-600 text-white hover:bg-accent-700"
              >
                How do I answer?
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setProReasoning((p) => !p)}
            title="Toggle Sonnet (deep reasoning) for the next turn"
            className={[
              'app-no-drag text-base w-7 h-7 rounded-md flex items-center justify-center',
              proReasoning ? 'text-accent-400 bg-accent-600/20' : 'text-text-tertiary hover:bg-bg-3',
            ].join(' ')}
          >
            ★
          </button>
        </div>

        {/* Body — chat or transcript */}
        <div className="z-10 app-no-drag">
          {interview.isRunning && bodyMode === 'transcript' ? (
            <InterviewTranscript state={interview} />
          ) : (
            <div className="max-h-[360px] overflow-y-auto flex flex-col gap-2 min-w-[320px]">
              {messages.length === 0 && !lastError ? (
                <SuggestionsHome onPick={(s) => setQuery(s)} />
              ) : (
                <>
                  {messages.map((m) => <BubbleRow key={m.id} message={m} />)}
                  {lastError && (
                    <div className="rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-2.5 py-2">
                      {lastError}
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          )}
        </div>

        {/* Input row */}
        <div className="z-10 app-no-drag bg-bg-2/80 rounded-2xl border border-border-subtle px-2.5 py-1.5 flex items-end gap-2">
          {voice.kind === 'recording' ? (
            <MicWaveform level={micLevel} active />
          ) : null}
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                window.keyfloe.pill.hide();
              }
            }}
            placeholder={
              voiceLabel ??
              (interview.isRunning ? 'Type or use the buttons above…' : 'Ask Keyfloe…')
            }
            rows={1}
            className="flex-1 bg-transparent text-text-primary text-sm placeholder:text-text-tertiary resize-none outline-none max-h-24 min-h-[24px]"
          />
          {submitting ? (
            <button
              type="button"
              onClick={cancelStream}
              className="text-text-secondary text-xs px-2 py-1 rounded hover:bg-bg-3"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!query.trim()}
              className={[
                'text-xs px-2.5 py-1 rounded',
                query.trim()
                  ? 'bg-accent-600 text-white hover:bg-accent-700'
                  : 'bg-bg-3 text-text-tertiary cursor-not-allowed',
              ].join(' ')}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const SYSTEM_PROMPT = [
  'You are Keyfloe, a friendly screen-aware assistant running on the user\'s Windows desktop.',
  'Each turn you receive a fresh screenshot of what they\'re looking at.',
  'Keep replies short and concrete; the chat surface is a small floating pill.',
  'If they ask "where is X?" emit a single [POINT: x,y "label"] tag against the screenshot pixel coordinates so the cursor overlay can point at it.',
  'If they ask you to click something, emit [CLICK: x,y].',
].join(' ');

function SuggestionsHome({ onPick }: { onPick: (text: string) => void }) {
  // Mirror of Pill/SuggestionEngine.swift starter chips.
  const suggestions = [
    'What\'s on my screen?',
    'Summarise this page',
    'Help me draft a reply',
    'What should I do next?',
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] uppercase tracking-wider text-text-tertiary px-1">
        Try
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="app-no-drag text-xs px-2.5 py-1.5 rounded-full bg-bg-3 border border-border-subtle text-text-primary hover:bg-bg-4"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
