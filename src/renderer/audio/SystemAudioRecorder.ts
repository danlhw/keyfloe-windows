import { encodeWav16k, b64encode, rmsOf } from './wav';
import type { ChunkHandler } from './MicRecorder';

// Captures Windows system-audio loopback via Chromium's desktopCapturer
// + the chromeMediaSource:'desktop' constraint. This is the WASAPI
// loopback that lets us hear what the user's speakers are outputting —
// the interviewer's voice on a Zoom / Meet / Teams call, regardless of
// whether they're on speakers or AirPods.
//
// Used only in interview mode.

export class SystemAudioRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private buf: Float32Array[] = [];
  private bufSamples = 0;
  private inSampleRate = 48000;
  private chunkSamples = 0;
  private running = false;

  onChunk: ChunkHandler | null = null;

  async start(chunkMs: number) {
    if (this.running) return;
    // Electron's desktopCapturer.getSources lives in main; the renderer
    // can call getDisplayMedia with the special "loopback" hints to get
    // the audio. We use the standard browser API because Electron's
    // getDisplayMedia is gated through a setDisplayMediaRequestHandler
    // installed by the main process.
    const stream = await (navigator.mediaDevices as any).getDisplayMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
        },
      },
      video: false,
    });
    this.stream = stream;
    // The video track (if any) is unused — kill it so we don't burn
    // GPU + memory streaming pixels we never read.
    stream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.inSampleRate = this.ctx.sampleRate;
    await this.ctx.audioWorklet.addModule(workletURL());
    this.source = this.ctx.createMediaStreamSource(stream);
    this.worklet = new AudioWorkletNode(this.ctx, 'pcm-tap-sys', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    this.worklet.port.onmessage = (e) => this.onWorkletData(e.data);
    this.source.connect(this.worklet);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    this.worklet.connect(gain).connect(this.ctx.destination);
    this.chunkSamples = Math.round(this.inSampleRate * (chunkMs / 1000));
    this.running = true;
  }

  async stop() {
    if (!this.running) return;
    if (this.bufSamples > 0) this.flush();
    try { this.worklet?.disconnect(); } catch { /* ignore */ }
    try { this.source?.disconnect(); } catch { /* ignore */ }
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { await this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = this.stream = this.source = this.worklet = null;
    this.buf = []; this.bufSamples = 0;
    this.running = false;
  }

  private onWorkletData(chunk: Float32Array) {
    this.buf.push(chunk);
    this.bufSamples += chunk.length;
    if (this.bufSamples >= this.chunkSamples) this.flush();
  }

  private flush() {
    const total = this.bufSamples;
    const merged = new Float32Array(total);
    let pos = 0;
    for (const chunk of this.buf) { merged.set(chunk, pos); pos += chunk.length; }
    this.buf = []; this.bufSamples = 0;
    if (merged.length === 0) return;
    const durationMs = Math.round((merged.length / this.inSampleRate) * 1000);
    const wav = encodeWav16k(merged, this.inSampleRate);
    this.onChunk?.(wav, durationMs, rmsOf(merged));
  }
}

function workletURL(): string {
  const src = `
    class PCMTapSys extends AudioWorkletProcessor {
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
    registerProcessor('pcm-tap-sys', PCMTapSys);
  `;
  return URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
}

export { b64encode };
