import { settings } from './settings';
import { baseFromSettings, endpoints } from '../shared/endpoints';
import { deviceId } from './deviceId';
import { logger } from './log';

// Speech-to-text. Two providers, tried in order:
//
//   1. Local whisper.cpp via the bundled CLI. We download/install
//      whisper-cli.exe + the chosen model file under userData/whisper
//      on first run. Sub-second on a modern CPU for the base model;
//      <300 ms on small-v3-turbo with DirectML acceleration.
//      (Implementation deferred to localWhisper.ts when the user
//      first triggers a dictation — the CLI is heavy to ship in the
//      MVP installer; we set up the download flow on demand.)
//
//   2. Server-side Whisper via the existing Cloudflare Worker's
//      /v1/transcribe endpoint. Always available (just needs internet)
//      and matches the Mac app's fallback path exactly.
//
// This module exposes a single async function that picks whichever
// path is ready. Output is a UTF-8 string, already trimmed.

export interface TranscribeOptions {
  wav: Buffer;
  durationMs: number;
  languageHint?: string;
}

export async function transcribe(opts: TranscribeOptions): Promise<string> {
  // For the MVP we route everything through the Worker — it works on
  // every Windows box without us having to ship a 200 MB whisper-cli
  // binary in the installer. The local-whisper path lives behind the
  // same interface so we can flip it on as soon as the downloader is
  // wired up (see scripts/install-whisper.ts).
  return transcribeViaWorker(opts);
}

async function transcribeViaWorker({ wav, languageHint }: TranscribeOptions): Promise<string> {
  const eps = endpoints(baseFromSettings(settings));
  const form = new FormData();
  // The Worker expects a multipart upload identical to OpenAI's
  // /v1/audio/transcriptions — file + optional language. The Mac
  // client posts the same payload (WhisperClient.swift).
  // Copy into a fresh ArrayBuffer so the Blob constructor's strict
  // BlobPart signature accepts it (TS 5.7 distinguishes ArrayBuffer
  // from ArrayBufferLike; Buffer.buffer is ArrayBufferLike).
  const ab = new ArrayBuffer(wav.byteLength);
  new Uint8Array(ab).set(wav);
  form.append('file', new Blob([ab], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', 'whisper-1');
  if (languageHint) form.append('language', languageHint);

  const res = await fetch(eps.transcribe, {
    method: 'POST',
    headers: {
      'x-oneclick-device-id': deviceId(),
      ...(settings.openaiApiKey ? { 'authorization': `Bearer ${settings.openaiApiKey}` } : {}),
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker /v1/transcribe HTTP ${res.status}: ${text}`);
  }
  const json = await res.json() as { text?: string; transcript?: string };
  const text = (json.text ?? json.transcript ?? '').trim();
  logger.info('transcribe', `len=${text.length}`);
  return text;
}
