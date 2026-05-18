import { BrowserWindow } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import type { ActivationKey } from '../shared/types';
import { IPC } from '../shared/ipc';
import { logger } from './log';

// Port of FnTapDetector.swift: detect a tap (< 300 ms quick press-release,
// no chord) vs a hold (key still down past the threshold) on the user's
// chosen activation key. We use uIOhook because Electron's globalShortcut
// API can't distinguish "key pressed alone" from "key as a modifier in a
// chord" — it just fires on every keydown matching the binding. Low-level
// keyboard hook (SetWindowsHookExW WH_KEYBOARD_LL under the hood in
// uiohook) lets us watch every keydown/keyup including raw modifier
// transitions, which is what we need to mirror the Mac's CGEventTap.
//
// On the chord-disqualifier side: if any OTHER key goes down while the
// activation key is held, we cancel both tap + hold and treat the
// session as "user was typing a real chord". This matches FnTapDetector's
// `seenKeyWhileFn` flag.

const TAP_MAX_MS = 300;     // press-release must close within this for a tap
const HOLD_MS    = 300;     // key held past this is a hold

function keyCodeFor(key: ActivationKey): number {
  // uiohook's UiohookKey enum is the same one libuiohook ships. We pin
  // RightCtrl / RightAlt / CapsLock / F8 — the four practical Windows
  // analogs to the Mac fn key.
  switch (key) {
    case 'RightCtrl':  return UiohookKey.CtrlRight;
    case 'RightAlt':   return UiohookKey.AltRight;
    case 'CapsLock':   return UiohookKey.CapsLock;
    case 'F8':         return UiohookKey.F8;
  }
}

export class HotkeyMonitor {
  private installed = false;
  private watchedKey: ActivationKey = 'RightCtrl';
  private watchedCode = -1;

  private down = false;
  private downAt = 0;
  private chordSeen = false;
  private holdFired = false;
  private holdTimer: NodeJS.Timeout | null = null;

  onTap:       (() => void) | null = null;
  onHoldStart: (() => void) | null = null;
  onHoldEnd:   (() => void) | null = null;

  install(key: ActivationKey) {
    if (this.installed) this.uninstall();
    this.watchedKey = key;
    this.watchedCode = keyCodeFor(key);

    uIOhook.on('keydown', (e) => {
      if (e.keycode !== this.watchedCode) {
        // Any other key while we're tracking → chord, disqualify.
        if (this.down) this.chordSeen = true;
        return;
      }
      // Auto-repeat fires keydown repeatedly while held. We want only
      // the first edge.
      if (this.down) return;
      this.down = true;
      this.downAt = Date.now();
      this.chordSeen = false;
      this.holdFired = false;
      if (this.holdTimer) clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (this.down && !this.chordSeen) {
          this.holdFired = true;
          logger.info('hotkey', 'HOLD start');
          this.broadcast(IPC.hotkeyHoldStart);
          this.onHoldStart?.();
        }
      }, HOLD_MS);
    });

    uIOhook.on('keyup', (e) => {
      if (e.keycode !== this.watchedCode || !this.down) return;
      const held = Date.now() - this.downAt;
      this.down = false;
      if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
      if (this.holdFired) {
        logger.info('hotkey', `HOLD end (${held}ms)`);
        this.broadcast(IPC.hotkeyHoldEnd);
        this.onHoldEnd?.();
      } else if (!this.chordSeen && held <= TAP_MAX_MS) {
        logger.info('hotkey', `TAP (${held}ms)`);
        this.broadcast(IPC.hotkeyTap);
        this.onTap?.();
      } else {
        logger.info('hotkey', `release ignored (chord=${this.chordSeen} held=${held}ms)`);
      }
      this.chordSeen = false;
      this.holdFired = false;
    });

    try {
      uIOhook.start();
      this.installed = true;
      logger.info('hotkey', `installed key=${key}`);
    } catch (e) {
      logger.error('hotkey', e);
    }
  }

  rebind(key: ActivationKey) {
    if (key === this.watchedKey && this.installed) return;
    this.install(key);
  }

  uninstall() {
    if (!this.installed) return;
    try { uIOhook.stop(); } catch { /* ignore */ }
    uIOhook.removeAllListeners('keydown');
    uIOhook.removeAllListeners('keyup');
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
    this.installed = false;
  }

  private broadcast(channel: string) {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send(channel);
    });
  }
}
