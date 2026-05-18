/**
 * Cursor-anchored chat pill — port of Pill/PillView.swift. Reads the
 * same warm-paper palette as the dashboard so it visually belongs to
 * Keyfloe (not a generic dark Electron overlay).
 *
 * Three modes share this surface:
 *   • Idle chat — text input, streaming reply with screen context,
 *     suggestion chips on the home view.
 *   • Dictation — when hold-to-record fires from main, the mic
 *     waveform pulses; on release the WAV is shipped to main for
 *     transcription + paste.
 *   • Interview — toggle in the toolbar starts mic + WASAPI loopback;
 *     rolling transcript replaces the chat area when bodyMode = 'transcript';
 *     the "How do I answer?" button drops a Claude verbatim reply into
 *     the chat as an assistant bubble.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, InterviewState, VoiceUIState } from '@shared/types';
import { v4 as uuid } from 'uuid';
import { BubbleRow } from '../components/BubbleRow';
import { MicWaveform } from '../components/MicWaveform';
import { InterviewTranscript } from '../components/InterviewTranscript';
import { EditorialEyebrow } from '../components/editorial';
import { MicRecorder, b64encode } from '../audio/MicRecorder';
import { SystemAudioRecorder } from '../audio/SystemAudioRecorder';

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
  const endRef = useRef<HTMLDivElement | null>(null);

  // ─── IPC wires ───────────────────────────────────────────────────

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

  // Dictation: main asks to record / stop. We push the encoded WAV back
  // and persist a dictations entry to localStorage so the Dashboard's
  // Dictations tab can show it.
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

  // Interview mode: dual capture mic + WASAPI loopback (Mac's
  // ScreenCaptureKit equivalent in Chromium). Each side pushes 4 s
  // chunks; main transcribes + gates via cross-channel mic suppression.
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

  // Persist successful dictations to localStorage for the Dashboard
  // tab. We listen for voice.state transitioning to .idle right after
  // a clipboard write; transcript text isn't sent to the renderer
  // (main does the paste), so the renderer reads the clipboard.
  useEffect(() => {
    if (voice.kind !== 'idle') return;
    const ts = Date.now();
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        const stored = JSON.parse(localStorage.getItem('keyfloe.dictations') ?? '[]');
        // Don't record duplicates — if the last entry's text matches, skip.
        if (stored[0]?.text === text || !text || text.length > 4000) return;
        const entry = {
          id: uuid(), text, recordedAt: ts, durationSec: 0,
        };
        const next = [entry, ...stored].slice(0, 200);
        localStorage.setItem('keyfloe.dictations', JSON.stringify(next));
        window.dispatchEvent(new Event('storage'));
      } catch { /* clipboard might not be permitted */ }
    }, 250);
  }, [voice]);

  // Auto-resize the pill window to fit the rendered content.
  useEffect(() => {
    const el = document.getElementById('pill-root');
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        window.keyfloe.pill.resize(
          Math.ceil(cr.width + 24),
          Math.ceil(cr.height + 24),
        );
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

  // ─── Render ─────────────────────────────────────────────────────

  const voiceLabel = useMemo<string | null>(() => {
    if (voice.kind === 'recording')    return 'Listening…';
    if (voice.kind === 'transcribing') return 'Transcribing…';
    if (voice.kind === 'error')        return voice.message;
    return null;
  }, [voice]);

  return (
    <div className="w-screen h-screen p-3 app-drag" style={{ background: 'transparent' }}>
      <div
        id="pill-root"
        className="panel-sculpted flex flex-col gap-2.5 relative"
        style={{
          minWidth: 360,
          maxWidth: 'calc(100vw - 24px)',
          width: 'fit-content',
          padding: 14,
          borderRadius: 22,
          background: 'var(--paper)',
        }}
      >
        {/* Status header — interview toggle, dictation status, pro star */}
        <div className="flex items-center justify-between gap-2 app-no-drag">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleInterview}
              className={[
                'pixel-eyebrow px-2.5 py-1 border',
                interview.isRunning
                  ? 'border-ink-900 bg-ink-900 text-paper'
                  : 'border-hairline text-ink-600 hover:text-ink-900',
              ].join(' ')}
            >
              {interview.isRunning ? '● INTERVIEW' : 'INTERVIEW'}
            </button>
            {interview.isRunning && (
              <button
                type="button"
                onClick={() => setBodyMode((b) => (b === 'chat' ? 'transcript' : 'chat'))}
                className="pixel-eyebrow px-2.5 py-1 border border-hairline text-ink-600 hover:text-ink-900"
              >
                {bodyMode === 'chat' ? 'TRANSCRIPT' : 'CHAT'}
              </button>
            )}
            {interview.isRunning && (
              <button
                type="button"
                onClick={askInterviewAnswer}
                className="pixel-eyebrow px-2.5 py-1 border border-ink-900 bg-ink-900 text-paper"
              >
                HOW DO I ANSWER?
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setProReasoning((p) => !p)}
            title="Sonnet (deep reasoning) for the next turn"
            className={[
              'app-no-drag w-7 h-7 rounded-full flex items-center justify-center',
              proReasoning ? 'text-ink-900 bg-bone' : 'text-ink-400 hover:bg-bone',
            ].join(' ')}
            style={{ fontSize: 16 }}
          >
            ★
          </button>
        </div>

        {/* Body */}
        <div className="app-no-drag">
          {interview.isRunning && bodyMode === 'transcript' ? (
            <InterviewTranscript state={interview} />
          ) : (
            <div className="overflow-y-auto flex flex-col gap-2"
                 style={{ minWidth: 320, maxHeight: 360 }}>
              {messages.length === 0 && !lastError ? (
                <SuggestionsHome onPick={(s) => setQuery(s)} />
              ) : (
                <>
                  {messages.map((m) => <BubbleRow key={m.id} message={m} />)}
                  {lastError && (
                    <div className="rounded text-red-700 px-2.5 py-2"
                         style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12 }}>
                      {lastError}
                    </div>
                  )}
                  <div ref={endRef} />
                </>
              )}
            </div>
          )}
        </div>

        {/* Input row */}
        <div className="app-no-drag bg-bone border border-hairline px-2.5 py-1.5 flex items-end gap-2 rounded-2xl">
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
            placeholder={
              voiceLabel ??
              (interview.isRunning ? 'Type or use the buttons above…' : 'Ask Keyfloe…')
            }
            rows={1}
            className="flex-1 bg-transparent text-ink-900 placeholder:text-ink-400 resize-none outline-none"
            style={{ fontSize: 14, maxHeight: 96, minHeight: 24 }}
          />
          {submitting ? (
            <button
              type="button"
              onClick={cancelStream}
              className="pixel-eyebrow px-2 py-1 text-ink-600 hover:text-ink-900"
            >
              STOP
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!query.trim()}
              className={[
                'pixel-eyebrow px-2.5 py-1 border',
                query.trim()
                  ? 'border-ink-900 bg-ink-900 text-paper'
                  : 'border-hairline text-ink-400 cursor-not-allowed',
              ].join(' ')}
            >
              SEND
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
  const suggestions = [
    'What\'s on my screen?',
    'Summarise this page',
    'Help me draft a reply',
    'What should I do next?',
  ];
  return (
    <div className="flex flex-col gap-1.5 p-1">
      <EditorialEyebrow text="Try" />
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="app-no-drag px-2.5 py-1.5 rounded-full bg-bone border border-hairline text-ink-900 hover:bg-paper"
            style={{ fontSize: 12 }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
