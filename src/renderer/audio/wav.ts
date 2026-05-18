// Encode a Float32 audio buffer (sampleRate as captured) into a 16-bit
// PCM mono WAV blob at 16 kHz — the format Whisper wants. We resample
// inline with a simple linear interpolation. Good enough for speech;
// no need for a polyphase filter at our sample rates.

export function encodeWav16k(input: Float32Array, inSampleRate: number): Uint8Array {
  const outRate = 16000;
  const resampled = inSampleRate === outRate ? input : downsample(input, inSampleRate, outRate);
  const pcm16 = floatTo16BitPCM(resampled);
  return wrapWav(pcm16, outRate, 1);
}

function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIdx - i0;
    out[pos++] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}

function wrapWav(pcm: Int16Array, sampleRate: number, channels: number): Uint8Array {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  // RIFF header
  writeStr(view, 0,  'RIFF');
  view.setUint32(4,  36 + dataSize, true);
  writeStr(view, 8,  'WAVE');
  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);            // chunk size
  view.setUint16(20, 1, true);             // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);            // bits per sample
  // data chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  const out = new Uint8Array(buffer);
  out.set(new Uint8Array(pcm.buffer), 44);
  return out;
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export function b64encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
