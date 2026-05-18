import { encodeWav16k, b64encode, rmsOf } from './wav';

// Continuous mic recorder driving two consumers:
//
//   • a streaming "level" callback fired every ~50 ms with peak RMS so
//     the UI can show the live mic waveform.
//   • a "chunk" callback fired every N seconds with a 16 kHz mono WAV
//     buffer ready for Whisper.
//
// Designed for two modes:
//   1. one-shot dictation — startOneShot() → stopOneShot() returns the
//      full WAV at once. Used by the push-to-talk flow.
//   2. continuous interview — startContinuous(chunkMs) → onChunk fires
//      every chunkMs with a fresh buffer; stop() at end.
//
// Uses AudioWorklet rather than the legacy ScriptProcessorNode so the
// capture thread doesn't fight with React rendering on the main thread.

export type ChunkHandler = (wav: Uint8Array, durationMs: number, rms: number) => void;
export type LevelHandler = (peak: number) => void;

export class MicRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private buf: Float32Array[] = [];
  private bufSamples = 0;
  private startedAt = 0;
  private chunkSamples = 0;
  private mode: 'idle' | 'oneshot' | 'continuous' = 'idle';
  private inSampleRate = 48000;

  onLevel: LevelHandler | null = null;
  onChunk: ChunkHandler | null = null;

  async startOneShot() {
    if (this.mode !== 'idle') await this.stop();
    this.mode = 'oneshot';
    await this.openMic();
  }

  async stopOneShot(): Promise<{ wav: Uint8Array; durationMs: number } | null> {
    if (this.mode !== 'oneshot') return null;
    const durationMs = Date.now() - this.startedAt;
    const merged = this.merge();
    await this.stop();
    if (merged.length === 0) return null;
    const wav = encodeWav16k(merged, this.inSampleRate);
    return { wav, durationMs };
  }

  async startContinuous(chunkMs: number) {
    if (this.mode !== 'idle') await this.stop();
    this.mode = 'continuous';
    await this.openMic();
    this.chunkSamples = Math.round(this.inSampleRate * (chunkMs / 1000));
  }

  async stop() {
    if (this.mode === 'continuous' && this.bufSamples > 0) {
      this.flushChunk();
    }
    try { this.worklet?.disconnect(); } catch { /* ignore */ }
    try { this.source?.disconnect(); } catch { /* ignore */ }
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { await this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = this.stream = this.source = this.worklet = null;
    this.buf = []; this.bufSamples = 0;
    this.mode = 'idle';
  }

  private async openMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // We want raw signal; Chromium's AEC/NS can clip soft speech.
        // Whisper does its own denoising downstream.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.inSampleRate = this.ctx.sampleRate;
    await this.ctx.audioWorklet.addModule(workletURL());
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.ctx, 'pcm-tap', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    this.worklet.port.onmessage = (e) => this.onWorkletData(e.data);
    this.source.connect(this.worklet);
    // Connect to destination only so the worklet runs; we mute it.
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    this.worklet.connect(gain).connect(this.ctx.destination);
    this.startedAt = Date.now();
  }

  private onWorkletData(chunk: Float32Array) {
    this.buf.push(chunk);
    this.bufSamples += chunk.length;
    if (this.onLevel) this.onLevel(rmsOf(chunk));
    if (this.mode === 'continuous' && this.bufSamples >= this.chunkSamples) {
      this.flushChunk();
    }
  }

  private flushChunk() {
    const merged = this.merge();
    this.buf = []; this.bufSamples = 0;
    if (merged.length === 0) return;
    const durationMs = Math.round((merged.length / this.inSampleRate) * 1000);
    const wav = encodeWav16k(merged, this.inSampleRate);
    this.onChunk?.(wav, durationMs, rmsOf(merged));
  }

  private merge(): Float32Array {
    const total = this.bufSamples;
    const out = new Float32Array(total);
    let pos = 0;
    for (const chunk of this.buf) { out.set(chunk, pos); pos += chunk.length; }
    return out;
  }
}

// AudioWorklet module as a blob URL. Inline so we don't need a separate
// .js asset path. Sends every 128-sample block back to the main thread
// as Float32 via the worklet message port.
function workletURL(): string {
  const src = `
    class PCMTap extends AudioWorkletProcessor {
      process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;
        const ch = input[0];
        const copy = new Float32Array(ch.length);
        copy.set(ch);
        this.port.postMessage(copy, [copy.buffer]);
        return true;
      }
    }
    registerProcessor('pcm-tap', PCMTap);
  `;
  return URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
}

export { b64encode };
