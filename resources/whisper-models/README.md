# whisper-models

Bundled at install time alongside the app. Populated by the on-demand
downloader the first time the user triggers a dictation while the local
whisper.cpp backend is enabled.

For the MVP build we ship empty — transcription goes via the Cloudflare
Worker's `/v1/transcribe` endpoint, which proxies OpenAI Whisper.
Switching to local on-device whisper.cpp is a future drop-in change: see
`src/main/transcribe.ts` for the integration point.
