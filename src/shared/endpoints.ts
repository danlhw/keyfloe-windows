import type { AppSettings } from './types';

// Same Cloudflare Worker the Mac client talks to. The user can override
// in Settings → Advanced to point at a local `wrangler dev`. Keep the
// path layout identical so the Worker doesn't need a separate code path
// for Windows clients.
export const DEFAULT_WORKER_URL =
  'https://oneclick-worker.daniel-leung101.workers.dev';

export const endpoints = (base: string) => ({
  authExchange:  `${base}/v1/auth/exchange`,
  account:       `${base}/v1/auth/account`,
  chat:          `${base}/v1/chat`,
  transcribe:    `${base}/v1/transcribe`,
  point:         `${base}/v1/point`,
  deepseek:      `${base}/v1/deepseek`,
});

export const baseFromSettings = (s: AppSettings) =>
  s.workerUrl?.trim() || DEFAULT_WORKER_URL;
