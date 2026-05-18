import { BrowserWindow, ipcMain, clipboard } from 'electron';
import { exec } from 'node:child_process';
import { IPC } from '../shared/ipc';
import { logger } from './log';
import { registerAudioIpc } from './audio';

// Port of Voice/VoiceSession.swift — push-to-talk → record → transcribe
// → paste flow. The actual audio capture happens in the pill window's
// renderer (Web Audio MediaRecorder); main just orchestrates start/stop
// and pastes the result.
//
// Flow when the user holds the activation key:
//   1. hold-start: tell the pill to begin capture, broadcast voice:state recording
//   2. hold-end:   tell the pill to stop, await the encoded WAV, transcribe,
//                  put text on clipboard + paste via Ctrl+V SendInput.
//
// "Paste" on Windows uses powershell's SendKeys as the no-native-dep
// path. Works in every app that accepts Ctrl+V (Slack, Word, Chrome,
// VSCode, anything). The Mac uses CGEventPost; functionally identical.

export class Dictation {
  private pendingResolve: ((wavB64: string | null) => void) | null = null;
  private startedAt = 0;

  registerIpc() {
    registerAudioIpc();

    // The pill responds to dictation:start by recording, dictation:stop
    // by encoding + posting back the WAV. We use a request/response
    // round-trip on a single IPC handler for the encoded WAV.
    ipcMain.handle('dictation:wav', async (_e, payload: { wavBase64: string | null }) => {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve?.(payload?.wavBase64 ?? null);
      return { ok: true };
    });

    ipcMain.handle(IPC.dictationPaste, async (_e, text: string) => {
      this.paste(text);
      return { ok: true };
    });
  }

  async start() {
    this.startedAt = Date.now();
    this.broadcast(IPC.voiceState, { kind: 'recording' });
    // Tell whichever window owns the pill (the renderer registered for
    // 'dictation:begin') to start mic capture. We send to all windows;
    // the pill is the only one that responds.
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('dictation:begin');
    });
    logger.info('dictation', 'started');
  }

  async finish() {
    const heldMs = Date.now() - this.startedAt;
    if (heldMs < 200) {
      // Too short to be a real dictation — likely a missed-tap edge.
      // Cancel everything and quietly drop. Matches the Mac's
      // "Tap was too short — hold ⌃⌥ longer next time" path.
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) w.webContents.send('dictation:abort');
      });
      this.broadcast(IPC.voiceState, { kind: 'idle' });
      return;
    }

    this.broadcast(IPC.voiceState, { kind: 'transcribing' });
    const wavB64 = await new Promise<string | null>((resolve) => {
      this.pendingResolve = resolve;
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) w.webContents.send('dictation:end');
      });
      // Safety net — if the pill never replies within 5 s, bail.
      setTimeout(() => {
        if (this.pendingResolve === resolve) {
          this.pendingResolve = null;
          resolve(null);
        }
      }, 5000);
    });

    if (!wavB64) {
      this.broadcast(IPC.voiceState, { kind: 'idle' });
      return;
    }
    try {
      const { transcribe } = await import('./transcribe');
      const wav = Buffer.from(wavB64, 'base64');
      const text = await transcribe({ wav, durationMs: heldMs });
      this.broadcast(IPC.voiceState, { kind: 'idle' });
      if (!text) return;
      // 1. Always clipboard.
      clipboard.writeText(text);
      // 2. Paste into whatever has focus.
      this.paste(text);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      logger.error('dictation', err);
      this.broadcast(IPC.voiceState, { kind: 'error', message: msg });
    }
  }

  // Paste into whatever app currently has focus. Platform-specific
  // shim — we only ship Windows in production, but the macOS path is
  // here so the dev loop works end-to-end on the developer's Mac.
  private paste(_text: string) {
    if (process.platform === 'win32') {
      // VB SendKeys trick: "^v" = Ctrl+V. Hits the foreground window,
      // not Keyfloe itself — that's the focused text field.
      exec(
        'powershell -NoProfile -WindowStyle Hidden -Command ' +
        '"[System.Reflection.Assembly]::LoadWithPartialName(\'System.Windows.Forms\') | Out-Null; ' +
        '[System.Windows.Forms.SendKeys]::SendWait(\'^v\')"',
        (err) => { if (err) logger.error('dictation.paste', err); },
      );
      return;
    }
    if (process.platform === 'darwin') {
      // AppleScript equivalent — sends ⌘V to the frontmost app. Needs
      // Accessibility permission for the Electron binary; the same
      // grant that lets uiohook capture keyboard events.
      exec(
        `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
        (err) => { if (err) logger.error('dictation.paste', err); },
      );
      return;
    }
    logger.warn('dictation', `paste skipped — unsupported platform ${process.platform}`);
  }

  private broadcast(channel: string, payload: unknown) {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send(channel, payload);
    });
  }
}
