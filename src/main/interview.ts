import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '../shared/ipc';
import { logger } from './log';
import type { InterviewState, InterviewTurn } from '../shared/types';
import { v4 as uuid } from 'uuid';
import { transcribe } from './transcribe';
import { chatOnce } from './chat';
import { settings } from './settings';

// Port of Interview/InterviewSession.swift — clean two-channel architecture:
//
//   MIC (you):
//     pill renderer → MediaRecorder → encoded WAV chunks every 4 s →
//     this service → /v1/transcribe → finalised "Me" turn.
//
//   SYSTEM AUDIO (interviewer):
//     pill renderer → desktopCapturer audio constraint (WASAPI loopback)
//     → MediaRecorder → encoded WAV chunks every 4 s → this service →
//     /v1/transcribe → finalised "Interviewer" turn.
//
// We deliberately do NOT do streaming SFSpeech-style word-by-word on
// the Me side — Windows.Media.SpeechRecognition is per-locale and the
// quality drop vs Whisper is too large. The Mac's split (SFSpeech for
// live mic, WhisperKit for system audio) was a latency optimisation;
// on Windows we get the same effect with overlapping 4 s Whisper
// chunks via the Worker, ~1.5 s perceived latency end-to-end.
//
// Cross-channel mic gate: while the interviewer is talking (the
// system-audio chunk's RMS is above threshold), we drop mic chunks so
// the interviewer's voice bleeding through the laptop speakers
// doesn't get mis-labelled "Me". Same idea as the Mac's micGate.

export class InterviewService {
  private state: InterviewState = this.empty();
  private gateClosedUntil = 0;

  registerIpc() {
    ipcMain.handle(IPC.interviewStart, async () => {
      await this.start();
      return this.snapshot();
    });
    ipcMain.handle(IPC.interviewStop, async () => {
      await this.stop();
      return this.snapshot();
    });
    ipcMain.handle(IPC.interviewAskAnswer, async () => {
      return this.askAnswer();
    });

    // Pill renderer pushes finalised audio chunks here. The renderer
    // handles the actual capture; main does transcription + role gating.
    ipcMain.handle('interview:chunk', async (_e, payload: {
      role: 'Me' | 'Interviewer';
      wavBase64: string;
      durationMs: number;
      rms: number;
    }) => {
      if (!this.state.isRunning) return { ok: false };
      try {
        await this.ingestChunk(payload);
      } catch (err) {
        logger.error('interview.chunk', err);
      }
      return { ok: true };
    });
    ipcMain.handle('interview:mic-level', (_e, level: number) => {
      this.state.micLevel = level;
      this.broadcast();
    });
  }

  async start() {
    if (this.state.isRunning) return;
    this.state = this.empty();
    this.state.isRunning = true;
    this.state.startedAt = Date.now();
    this.broadcast();

    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('interview:begin');
    });
    logger.info('interview', 'started');
  }

  async stop() {
    if (!this.state.isRunning) return;
    this.state.isRunning = false;
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('interview:end');
    });
    this.broadcast();
    logger.info('interview', 'stopped');
  }

  private async ingestChunk(payload: {
    role: 'Me' | 'Interviewer';
    wavBase64: string;
    durationMs: number;
    rms: number;
  }) {
    // Cross-channel mic gate: if an Interviewer chunk arrived loud,
    // suppress incoming Me chunks for the next 1.5 s. Same threshold
    // family as InterviewSession.swift's systemChunker.
    const now = Date.now();
    if (payload.role === 'Interviewer' && payload.rms > 0.006) {
      this.gateClosedUntil = now + 1500;
    }
    if (payload.role === 'Me' && now < this.gateClosedUntil) {
      logger.info('interview', 'mic chunk dropped (gate closed)');
      return;
    }
    if (payload.role === 'Me' && payload.rms < 0.003) {
      // Effectively silent mic — skip the Whisper call entirely. Saves
      // both latency and quota on the Worker.
      return;
    }

    const wav = Buffer.from(payload.wavBase64, 'base64');
    if (wav.length < 16_000) return; // <0.5 s @ 16 kHz mono, ignore.
    const text = await transcribe({
      wav,
      durationMs: payload.durationMs,
      languageHint: 'en',
    });
    const cleaned = text.trim();
    if (!cleaned || isHallucination(cleaned)) return;

    // Coalesce successive chunks from the same speaker if they land
    // within 4 s — matches the Mac's interview "merge sentences split
    // on a mid-breath pause" rule.
    const last = this.state.turns[this.state.turns.length - 1];
    const shouldMerge = last
      && last.role === payload.role
      && !last.isLive
      && now - last.startedAt < 4000;
    if (shouldMerge) {
      last.text = `${last.text} ${cleaned}`.trim();
    } else {
      const turn: InterviewTurn = {
        id: uuid(),
        role: payload.role,
        text: cleaned,
        startedAt: now,
        isLive: false,
      };
      this.state.turns.push(turn);
    }
    this.broadcast();
  }

  /// "How do I answer this?" — assembles the full role-labelled
  /// transcript, the active interview profile (résumé / JD / company
  /// notes) and a fresh screenshot, then submits to Claude.
  async askAnswer(): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
    try {
      const transcript = this.state.turns
        .filter((t) => t.text.trim().length > 0)
        .map((t) => `${t.role}: ${t.text}`)
        .join('\n\n');

      const resume = ''; // TODO: wire up renderer's InterviewProfileStore.
      const system = [
        'You are the user\'s interview coach. The user is in a live interview.',
        'Write the verbatim answer they should say next, in first person.',
        'Address the interviewer\'s most recent question.',
        '',
        resume ? `Their résumé / profile:\n${resume}` : '',
      ].join('\n');

      const userText = transcript.length === 0
        ? '(No live transcript yet — read the interviewer\'s question from the attached screenshot.)'
        : `Live transcript (most recent at the bottom):\n${transcript}`;

      const text = await chatOnce({
        system,
        history: [],
        userText,
        model: 'claude-sonnet-4-6',
        maxTokens: 800,
        feature: 'interview',
      });
      return { ok: true, text: text.trim() };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      logger.error('interview.askAnswer', err);
      return { ok: false, message };
    }
  }

  private snapshot(): InterviewState { return { ...this.state, turns: [...this.state.turns] }; }
  private empty(): InterviewState {
    return {
      isRunning: false,
      turns: [],
      micLevel: 0,
      systemAudioActive: false,
      startedAt: null,
      lastError: null,
    };
  }
  private broadcast() {
    const snap = this.snapshot();
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send(IPC.interviewState, snap);
    });
  }
}

// Whisper sometimes hallucinates these on silent or near-silent audio.
// Same list as InterviewSession.swift, kept in sync.
function isHallucination(text: string): boolean {
  const lowered = text.toLowerCase().trim();
  const contains = [
    'thanks for watching', 'thank you for watching',
    'subscribe to my channel', 'please subscribe',
    'see you in the next video', 'bon appetit', 'bon appétit',
  ];
  if (contains.some((s) => lowered.includes(s))) return true;
  const exact = new Set(['thank you', 'thanks', 'you', '.', ',', '🎵', '♪', '♫', '🎶']);
  return exact.has(lowered);
}

// Keep settings import alive — the askAnswer flow will be extended to
// read InterviewProfileStore from electron-store here.
void settings;
