//! Dual-channel audio capture for interview mode.
//!
//!   MIC (you)          → cpal default input device (cross-platform).
//!   SYSTEM (interviewer) → WASAPI loopback on the default *output* device.
//!     cpal 0.16's WASAPI backend opens a render endpoint with
//!     `AUDCLNT_STREAMFLAGS_LOOPBACK` when you call `build_input_stream` on an
//!     output device — i.e. we capture exactly what the OS plays through the
//!     speakers/headset, which is the interviewer's voice from Zoom/Meet/Teams.
//!     Same approach as the Meetily donor's Windows path. Gated `#[cfg(windows)]`;
//!     a stub returns an error elsewhere so the crate still `cargo check`s on macOS.
//!
//! Each channel is downmixed to mono, resampled to 16 kHz, and fed through an
//! energy-VAD `UtteranceChunker` that emits a Whisper-native WAV per utterance —
//! mirroring the Mac `SystemAudioCapture` + `UtteranceChunker` split, including
//! the more sensitive VAD config on the (often-quiet) system channel.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
// `from_sample` lives on the `Sample` trait.
use cpal::Sample;
use std::sync::mpsc;

pub const TARGET_RATE: u32 = 16_000;

/// Which speaker a captured chunk belongs to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Channel {
    Me,
    Interviewer,
}

// ------------------------------------------------------------------ WAV

/// Wrap 16 kHz mono f32 samples as a canonical PCM-16 mono WAV (Whisper-native).
pub fn samples_to_wav(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(44 + samples.len() * 2);
    let channels: u16 = 1;
    let bits: u16 = 16;
    let byte_rate = sample_rate * channels as u32 * bits as u32 / 8;
    let block_align = channels * bits / 8;
    let data_size = (samples.len() * 2) as u32;

    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_size).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&bits.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    for &s in samples {
        let clipped = s.clamp(-1.0, 1.0);
        out.extend_from_slice(&((clipped * 32767.0) as i16).to_le_bytes());
    }
    out
}

/// Downmix interleaved N-channel f32 to mono and linearly resample to 16 kHz.
fn to_mono_16k(interleaved: &[f32], channels: u16, src_rate: u32) -> Vec<f32> {
    let ch = channels.max(1) as usize;
    // Downmix to mono.
    let mono: Vec<f32> = if ch == 1 {
        interleaved.to_vec()
    } else {
        interleaved
            .chunks(ch)
            .map(|frame| frame.iter().copied().sum::<f32>() / ch as f32)
            .collect()
    };
    if src_rate == TARGET_RATE || mono.is_empty() {
        return mono;
    }
    // Linear resample src_rate → 16k.
    let ratio = TARGET_RATE as f64 / src_rate as f64;
    let out_len = ((mono.len() as f64) * ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_pos = i as f64 / ratio;
        let idx = src_pos.floor() as usize;
        let frac = (src_pos - idx as f64) as f32;
        let a = mono.get(idx).copied().unwrap_or(0.0);
        let b = mono.get(idx + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac);
    }
    out
}

// -------------------------------------------------------------- VAD chunker

/// Energy-VAD utterance segmenter. Accumulates 16 kHz mono samples and, when a
/// speech burst is followed by `hangover` seconds of silence, emits the burst as
/// a WAV. Deliberately simple (RMS gate) — matches the Mac chunker's role, and
/// keeps every heavy decision on the server transcriber.
pub struct UtteranceChunker {
    rms_threshold: f32,
    hangover_samples: usize,
    min_utterance_samples: usize,
    buf: Vec<f32>,
    trailing_silence: usize,
    in_speech: bool,
}

impl UtteranceChunker {
    /// Mic-side default gate.
    pub fn for_mic() -> Self {
        Self::new(0.010, 0.7, 0.35)
    }

    /// System-side gate — far more sensitive because a quiet interviewer over a
    /// laptop mic through Zoom often sits around 0.003 RMS (see Mac comment).
    pub fn for_system() -> Self {
        Self::new(0.004, 0.7, 0.30)
    }

    fn new(rms_threshold: f32, hangover_secs: f32, min_secs: f32) -> Self {
        Self {
            rms_threshold,
            hangover_samples: (hangover_secs * TARGET_RATE as f32) as usize,
            min_utterance_samples: (min_secs * TARGET_RATE as f32) as usize,
            buf: Vec::new(),
            trailing_silence: 0,
            in_speech: false,
        }
    }

    /// Feed a block of 16 kHz mono samples. Returns Some(wav) when an utterance
    /// just completed.
    pub fn push(&mut self, samples: &[f32]) -> Option<Vec<u8>> {
        // Chunk into ~30 ms frames for a stable RMS decision.
        let frame = (TARGET_RATE as usize) * 30 / 1000;
        let mut emitted = None;
        for block in samples.chunks(frame) {
            let rms = (block.iter().map(|s| s * s).sum::<f32>() / block.len().max(1) as f32).sqrt();
            let voiced = rms >= self.rms_threshold;
            if voiced {
                self.in_speech = true;
                self.trailing_silence = 0;
                self.buf.extend_from_slice(block);
            } else if self.in_speech {
                // Keep trailing silence in the buffer so words aren't clipped.
                self.buf.extend_from_slice(block);
                self.trailing_silence += block.len();
                if self.trailing_silence >= self.hangover_samples {
                    if self.buf.len() >= self.min_utterance_samples {
                        emitted = Some(samples_to_wav(&self.buf, TARGET_RATE));
                    }
                    self.buf.clear();
                    self.trailing_silence = 0;
                    self.in_speech = false;
                }
            }
        }
        emitted
    }

    /// Whether the chunker currently believes speech is in progress. Used for
    /// the cross-channel mic gate (suppress the mic while the interviewer talks).
    pub fn is_in_speech(&self) -> bool {
        self.in_speech && self.trailing_silence == 0
    }

    /// Flush whatever is buffered (called on stop).
    pub fn finalize(&mut self) -> Option<Vec<u8>> {
        if self.buf.len() >= self.min_utterance_samples {
            let wav = samples_to_wav(&self.buf, TARGET_RATE);
            self.buf.clear();
            return Some(wav);
        }
        self.buf.clear();
        None
    }
}

/// Peak amplitude of a 16 kHz mono block — drives the pill's mic waveform.
pub fn peak_level(samples: &[f32]) -> f32 {
    samples.iter().fold(0.0f32, |m, &s| m.max(s.abs()))
}

// ------------------------------------------------------- capture handles

/// A running capture. Holds the cpal stream alive; dropping it stops capture.
/// `cpal::Stream` is `!Send`, so this MUST stay on the thread that built it.
pub struct CaptureHandle {
    _stream: cpal::Stream,
}

/// Start microphone capture. Every 16 kHz mono block is sent on `tx` tagged
/// `Channel::Me`. Cross-platform (default input device).
pub fn start_mic(tx: mpsc::Sender<(Channel, Vec<f32>)>) -> Result<CaptureHandle, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone (default input device) available".to_string())?;
    let config = device
        .default_input_config()
        .map_err(|e| format!("mic default config: {e}"))?;
    start_stream(device, config, Channel::Me, tx)
}

/// Start system-audio (loopback) capture — the interviewer's voice.
///
/// Windows: WASAPI loopback on the default output device. Other platforms: not
/// supported here (the Mac app uses ScreenCaptureKit / Core Audio taps), so we
/// return an error and the session runs mic-only. VERIFY ON WINDOWS.
#[cfg(windows)]
pub fn start_system(tx: mpsc::Sender<(Channel, Vec<f32>)>) -> Result<CaptureHandle, String> {
    // WASAPI host explicitly — its output devices support loopback capture.
    let host = cpal::host_from_id(cpal::HostId::Wasapi)
        .map_err(|e| format!("WASAPI host: {e}"))?;
    let device = host
        .default_output_device()
        .ok_or_else(|| "No default output device for loopback".to_string())?;
    // Prefer the render endpoint's own output config; cpal opens it in loopback
    // when we call build_input_stream on an output device.
    let config = device
        .default_output_config()
        .map_err(|e| format!("output default config: {e}"))?;
    start_stream(device, config, Channel::Interviewer, tx)
}

#[cfg(not(windows))]
pub fn start_system(_tx: mpsc::Sender<(Channel, Vec<f32>)>) -> Result<CaptureHandle, String> {
    Err("System-audio loopback is only implemented on Windows (WASAPI).".to_string())
}

/// Shared stream builder: converts whatever native format cpal gives us into
/// 16 kHz mono f32 blocks and forwards them tagged with `channel`.
fn start_stream(
    device: cpal::Device,
    supported: cpal::SupportedStreamConfig,
    channel: Channel,
    tx: mpsc::Sender<(Channel, Vec<f32>)>,
) -> Result<CaptureHandle, String> {
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let src_rate = config.sample_rate.0;
    let channels = config.channels;

    let err_fn = |e| log::error!("interview capture stream error: {e}");

    macro_rules! build {
        ($sample:ty) => {{
            let tx = tx.clone();
            device.build_input_stream(
                &config,
                move |data: &[$sample], _| {
                    let floats: Vec<f32> = data.iter().map(|s| f32::from_sample(*s)).collect();
                    let mono = to_mono_16k(&floats, channels, src_rate);
                    if !mono.is_empty() {
                        let _ = tx.send((channel, mono));
                    }
                },
                err_fn,
                None,
            )
        }};
    }

    let stream = match sample_format {
        cpal::SampleFormat::F32 => build!(f32),
        cpal::SampleFormat::I16 => build!(i16),
        cpal::SampleFormat::U16 => build!(u16),
        other => return Err(format!("unsupported sample format: {other:?}")),
    }
    .map_err(|e| format!("build_input_stream: {e}"))?;

    stream.play().map_err(|e| format!("stream.play: {e}"))?;
    Ok(CaptureHandle { _stream: stream })
}
