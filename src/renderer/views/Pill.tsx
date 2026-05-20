/**
 * Cursor-anchored chat pill — full Mac PillView.swift parity.
 *
 * Layout (top to bottom):
 *   • Status chip      — only when there's activity ("Ready" / "Listening"
 *                        / "Floe is thinking" / "Interview MM:SS")
 *   • Chat toggle      — only during interview ("CHAT" / "TRANSCRIPT")
 *   • Body             — flex-1, scrolls inside the pill
 *       - empty state  → suggestion chips
 *       - chat mode    → bubble list
 *       - interview    → InterviewTranscript
 *   • Input row        — pinned bottom, all action buttons
 *       [≡ menu] [voice] [brain] [interview] [sparkles?] [textarea] [refresh] [send]
 *   • Resize curve     — bottom-right visual hint
 *
 * Pill window itself is `.pill-glass`: backdrop-filter blur + saturate,
 * 22px continuous rounded corners, paper-opacity background. Stealth
 * mode opacity drops to ~55%.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, ChatMessage, InterviewState, VoiceUIState } from '@shared/types';
import { v4 as uuid } from 'uuid';
import { BubbleRow } from '../components/BubbleRow';
import { MicWaveform } from '../components/MicWaveform';
import { InterviewTranscript } from '../components/InterviewTranscript';
import { MicRecorder, b64encode } from '../audio/MicRecorder';
import { SystemAudioRecorder } from '../audio/SystemAudioRecorder';
import {
  MenuIcon, MicIcon, BrainIcon, InterviewIcon, SparkleIcon,
  RefreshIcon, SendIcon, ResizeCurve, WarningIcon,
} from '../components/icons';

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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [interviewElapsed, setInterviewElapsed] = useState('00:00');
  const streamIdRef = useRef<string | null>(null);
  const recorderRef = useRef<MicRecorder | null>(null);
  const sysRecorderRef = useRef<SystemAudioRecorder | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // ─── Settings load + subscribe ──────────────────────────────────
  useEffect(() => {
    window.keyfloe.settings.get().then(setSettings);
    const off = window.keyfloe.settings.onChange(setSettings);
    return () => { off(); };
  }, []);

  // ─── IPC wires: chat + voice + interview ─────────────────────────
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

  // Dictation hold-to-talk
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

  // Interview dual capture
  useEffect(() => {
    const offBegin = window.keyfloe.interview.onBegin(async () => {
      try {
        const mic = new MicRecorder();
        mic.onLevel = (l) => window.keyfloe.interview.pushMicLevel(l);
        mic.onChunk = async (wav, durationMs, rms) => {
          await window.keyfloe.interview.pushChunk({
            role: 'Me', wavBase64: b64encode(wav), durationMs, rms,
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
            role: 'Interviewer', wavBase64: b64encode(wav), durationMs, rms,
          });
        };
        await sys.start(4000);
        sysRecorderRef.current = sys;
      } catch (err) {
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

  // Interview elapsed timer
  useEffect(() => {
    if (!interview.isRunning || !interview.startedAt) {
      setInterviewElapsed('00:00');
      return;
    }
    const tick = () => {
      const sec = Math.floor((Date.now() - interview.startedAt!) / 1000);
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      setInterviewElapsed(`${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [interview.isRunning, interview.startedAt]);

  // Persist successful dictations
  useEffect(() => {
    if (voice.kind !== 'idle') return;
    const ts = Date.now();
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        const stored = JSON.parse(localStorage.getItem('keyfloe.dictations') ?? '[]');
        if (stored[0]?.text === text || !text || text.length > 4000) return;
        const entry = { id: uuid(), text, recordedAt: ts, durationSec: 0 };
        const next = [entry, ...stored].slice(0, 200);
        localStorage.setItem('keyfloe.dictations', JSON.stringify(next));
        window.dispatchEvent(new Event('storage'));
      } catch { /* ignore */ }
    }, 250);
  }, [voice]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // ─── Actions ────────────────────────────────────────────────────
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
    if (interview.isRunning) await window.keyfloe.interview.stop();
    else                     await window.keyfloe.interview.start();
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

  const newChat = useCallback(() => {
    setMessages([]);
    setLastError(null);
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const goHome = useCallback(() => {
    setMessages([]);
    setLastError(null);
  }, []);

  // ─── Derived state ──────────────────────────────────────────────
  const stealthOn = settings?.stealthMode === 'always-on' ||
                    (settings?.stealthMode === 'auto');
  const isEmpty = messages.length === 0 && !lastError;
  const showInterviewToggle = interview.isRunning;
  const showHowDoIAnswer = interview.isRunning;

  const statusChip = useMemo<{ text: string; variant: 'live' | 'ok' | 'ink' } | null>(() => {
    if (interview.isRunning) return { text: `Interview · ${interviewElapsed}`, variant: 'live' };
    if (submitting)          return { text: 'Floe is thinking', variant: 'ink' };
    if (voice.kind === 'recording')    return { text: 'Listening', variant: 'live' };
    if (voice.kind === 'transcribing') return { text: 'Transcribing', variant: 'ok' };
    if (voice.kind === 'error')        return { text: voice.message, variant: 'ink' };
    if (!isEmpty)            return { text: 'Ready', variant: 'ok' };
    return null;
  }, [interview.isRunning, interviewElapsed, submitting, voice, isEmpty]);

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="w-screen h-screen p-3 app-drag flex" style={{ background: 'transparent' }}>
      <div
        id="pill-root"
        className="pill-glass flex flex-col gap-2.5 relative flex-1"
        data-stealth={stealthOn ? 'true' : 'false'}
        style={{ padding: 14, minWidth: 0, minHeight: 0 }}
      >
        {/* Status chip + interview toggles header — only when active */}
        {(statusChip || showInterviewToggle) && (
          <div className="flex items-center justify-between gap-2 app-no-drag flex-shrink-0">
            <div className="flex items-center gap-2">
              {statusChip && (
                <div className="status-chip" data-variant={statusChip.variant}>
                  {statusChip.variant === 'live' && <span className="live-dot" />}
                  {statusChip.variant === 'ok'   && <span className="ok-dot" />}
                  <span>{statusChip.text}</span>
                </div>
              )}
            </div>
            {showInterviewToggle && (
              <div className="flex items-center gap-1">
                <SegmentedToggle
                  options={[{ key: 'chat', label: 'CHAT' }, { key: 'transcript', label: 'TRANSCRIPT' }]}
                  value={bodyMode}
                  onChange={(v) => setBodyMode(v as BodyMode)}
                />
              </div>
            )}
          </div>
        )}

        {/* Body — flex-1, scrolls inside */}
        <div className="app-no-drag flex-1 min-h-0 overflow-y-auto">
          {interview.isRunning && bodyMode === 'transcript' ? (
            <InterviewTranscript state={interview} />
          ) : isEmpty ? (
            <SuggestionsHome onPick={(s) => { setQuery(s); inputRef.current?.focus(); }} />
          ) : (
            <div className="flex flex-col gap-1.5">
              {messages.map((m) => <BubbleRow key={m.id} message={m} />)}
              {lastError && (
                <div
                  className="rounded-lg px-2.5 py-2 flex items-start gap-2"
                  style={{
                    background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
                    border: '0.5px solid color-mix(in srgb, var(--danger) 30%, transparent)',
                    color: 'var(--danger)', fontSize: 12,
                  }}
                >
                  <WarningIcon size={14} />
                  <span>{lastError}</span>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Input row — pinned, all Mac buttons */}
        <div className="pill-input-row flex items-end gap-1.5 px-2 py-1.5 app-no-drag flex-shrink-0"
             data-stealth={stealthOn ? 'true' : 'false'}>
          {/* Left action cluster */}
          <button type="button" className="icon-btn" title="Home" onClick={goHome}>
            <MenuIcon size={14} />
          </button>
          <VoiceStateIcon voice={voice} />
          <button
            type="button"
            className="icon-btn"
            data-on={proReasoning ? 'true' : 'false'}
            data-tone="purple"
            title="Pro reasoning (Sonnet)"
            onClick={() => setProReasoning((p) => !p)}
          >
            <BrainIcon size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            data-on={interview.isRunning ? 'true' : 'false'}
            data-tone="red"
            title={interview.isRunning ? 'Stop interview' : 'Start interview mode'}
            onClick={toggleInterview}
          >
            <InterviewIcon size={14} />
          </button>
          {showHowDoIAnswer && (
            <button
              type="button"
              className="icon-btn"
              data-on="true"
              title="How do I answer this?"
              onClick={askInterviewAnswer}
              style={{ color: 'var(--accent)' }}
            >
              <SparkleIcon size={14} />
            </button>
          )}

          {/* Text field — grows up to 96px then scrolls */}
          <div className="flex-1 flex items-end px-1">
            {voice.kind === 'recording' ? (
              <MicWaveform level={micLevel} active />
            ) : null}
            <textarea
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault(); submit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  window.keyfloe.pill.hide();
                }
              }}
              placeholder={voice.kind === 'recording' ? 'Listening…' :
                          voice.kind === 'transcribing' ? 'Transcribing…' :
                          interview.isRunning ? 'Type or use the buttons above…' :
                          'Ask Keyfloe…'}
              rows={1}
              className="w-full bg-transparent resize-none outline-none"
              style={{
                fontSize: 13.5,
                lineHeight: 1.42,
                maxHeight: 96,
                minHeight: 22,
                color: 'var(--ink-900)',
              }}
            />
          </div>

          {/* Right action cluster */}
          <button type="button" className="icon-btn" title="New chat" onClick={newChat}>
            <RefreshIcon size={14} />
          </button>
          {submitting ? (
            <button type="button" className="icon-btn" data-tone="red" title="Stop" onClick={cancelStream}>
              <span style={{ width: 8, height: 8, background: 'currentColor', borderRadius: 2 }} />
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              onClick={submit}
              disabled={!query.trim()}
              title="Send (Enter)"
            >
              <SendIcon size={14} />
            </button>
          )}
        </div>

        {/* Resize curve hint — visual that the bottom-right is a resize edge */}
        <div
          className="pointer-events-none absolute"
          style={{ bottom: 6, right: 6, color: 'var(--ink-400)' }}
        >
          <ResizeCurve size={12} />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function SegmentedToggle({
  options, value, onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-full p-0.5"
         style={{ background: 'color-mix(in srgb, var(--ink-900) 8%, transparent)' }}>
      {options.map((opt) => {
        const on = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className="px-2.5 py-1 rounded-full font-pixel transition"
            style={{
              fontSize: 9.5,
              letterSpacing: '0.16em',
              background: on ? 'var(--paper)' : 'transparent',
              color: on ? 'var(--ink-900)' : 'var(--ink-600)',
              boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function VoiceStateIcon({ voice }: { voice: VoiceUIState }) {
  if (voice.kind === 'recording') {
    return <div className="icon-btn" data-on="true" data-tone="red" title="Recording"><MicIcon size={14} /></div>;
  }
  if (voice.kind === 'transcribing') {
    return <div className="icon-btn" title="Transcribing"><MicIcon size={14} className="animate-pulse" /></div>;
  }
  if (voice.kind === 'error') {
    return <div className="icon-btn" data-tone="red" title={voice.message} style={{ color: 'var(--danger)' }}><WarningIcon size={14} /></div>;
  }
  return <div className="icon-btn" title="Hold the activation key to dictate"><SparkleIcon size={14} /></div>;
}

function SuggestionsHome({ onPick }: { onPick: (text: string) => void }) {
  // Three generic suggestions — Mac uses a per-app SuggestionEngine; for v0.1
  // Windows we ship the safe defaults from Mac's default tier. Per-app
  // detection (via UI Automation) is a roadmap item.
  const suggestions = [
    'What\'s on my screen?',
    'Summarise this for me',
    'What should I do next?',
  ];
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 py-6">
      <div className="font-pixel text-ink-400" style={{ fontSize: 9.5, letterSpacing: '0.2em' }}>
        TRY
      </div>
      <div className="flex flex-col gap-2 w-full max-w-[80%]">
        {suggestions.map((s) => (
          <button key={s} type="button" className="suggestion-chip w-full" onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="font-pixel text-ink-400 mt-2 text-center px-4" style={{ fontSize: 10, letterSpacing: '0.1em', lineHeight: 1.6 }}>
        Type to chat · Hold the activation key to dictate
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
