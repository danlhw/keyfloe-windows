// Audio capture is performed in the RENDERER using the Web Audio /
// MediaRecorder APIs rather than in the main process. Two reasons:
//
//   1. Electron's renderer process already exposes getUserMedia + the
//      Windows mic stack with permission prompts integrated. Doing it
//      from main would require a native add-on (naudiodon / portaudio).
//   2. WASAPI loopback (system audio for interview mode) is exposed in
//      Chromium under `audio: { mandatory: { chromeMediaSource:
//      'desktop' } }` — a desktopCapturer constraint that has no main-
//      process equivalent.
//
// So the audio modules live under src/renderer/audio/. This main-side
// module is just a thin pipe: it accepts encoded WAV buffers from the
// renderer over IPC and hands them to the transcriber.

import { ipcMain } from 'electron';
import { transcribe } from './transcribe';
import { logger } from './log';

export interface TranscribePayload {
  wavBase64: string;
  durationMs: number;
  languageHint?: string;
}

export function registerAudioIpc() {
  ipcMain.handle('audio:transcribe', async (_e, payload: TranscribePayload) => {
    try {
      const wav = Buffer.from(payload.wavBase64, 'base64');
      const text = await transcribe({
        wav,
        durationMs: payload.durationMs,
        languageHint: payload.languageHint,
      });
      return { ok: true as const, text };
    } catch (err) {
      logger.error('audio:transcribe', err);
      return { ok: false as const, message: (err as Error).message ?? String(err) };
    }
  });
}
