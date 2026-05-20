import { app, BrowserWindow, ipcMain, screen, session, desktopCapturer } from 'electron';
import path from 'node:path';
import { settings, getSettings, setSettings } from './settings';
import { WindowManager } from './windows';
import { HotkeyMonitor } from './hotkey';
import { ChatRouter } from './chat';
import { ClickyPointer } from './pointer';
import { Dictation } from './dictation';
import { InterviewService } from './interview';
import { installTray } from './tray';
import { IPC } from '../shared/ipc';
import { logger } from './log';

// Hardware acceleration: disable by default on Windows. The transparent
// pill window flickers on integrated Intel UHD, and worse, virtualized
// GPUs (Parallels, VMware, VirtualBox) report HW accel as available but
// fail to composite transparent always-on-top windows reliably — that's
// the "window cut off in half / nothing rendering" symptom in a VM. On
// real Windows laptops the perf hit from disabling HW accel is small;
// users who want to re-enable can pass `--hw-accel`.
if (process.platform === 'win32' && !process.argv.includes('--hw-accel')) {
  app.disableHardwareAcceleration();
}

// Single-instance lock. If the user double-clicks the .exe while Keyfloe
// is already running, focus the existing dashboard instead of opening a
// second tray icon + second hotkey listener.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    WindowManager.shared.focusDashboard();
  });
}

class Keyfloe {
  windows = WindowManager.shared;
  hotkey = new HotkeyMonitor();
  chat = new ChatRouter();
  pointer = new ClickyPointer();
  dictation = new Dictation();
  interview = new InterviewService();

  async start() {
    await app.whenReady();
    logger.info('Keyfloe starting', { platform: process.platform, version: app.getVersion() });

    // Hook the desktopCapturer for system-audio loopback in the
    // interview mode. Modern Electron requires opt-in via
    // setDisplayMediaRequestHandler before getDisplayMedia({audio: …})
    // works from the renderer. We grant the primary screen with audio.
    session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        const primary = sources[0];
        if (!primary) { cb({}); return; }
        cb({ video: primary, audio: 'loopback' });
      } catch (e) {
        logger.error('displayMediaHandler', e);
        cb({});
      }
    });

    this.windows.build();
    installTray();
    this.registerIpc();

    this.hotkey.install(settings.activationKey);
    this.hotkey.onTap = () => {
      this.windows.togglePill();
    };
    this.hotkey.onHoldStart = () => {
      this.dictation.start().catch((e) => logger.error('dictation.start', e));
    };
    this.hotkey.onHoldEnd = () => {
      this.dictation.finish().catch((e) => logger.error('dictation.finish', e));
    };

    app.on('window-all-closed', () => {
      // We're a tray-resident app — don't quit when the dashboard closes.
      // Quit only via the tray menu's Quit item.
    });
    app.on('before-quit', () => {
      this.hotkey.uninstall();
      this.interview.stop().catch(() => undefined);
    });
    app.on('activate', () => {
      // Dock icon clicked (macOS dev) or no notch window left.
      this.windows.focusDashboard();
    });
  }

  private registerIpc() {
    // Settings: simple get/set. The renderer pushes the whole AppSettings
    // object on every write — cheap (small struct) and avoids partial
    // updates landing in the wrong order.
    ipcMain.handle(IPC.settingsGet, () => getSettings());
    ipcMain.handle(IPC.settingsSet, (_e, next) => {
      const updated = setSettings(next);
      // Hotkey rebind: if the activation key changed, re-install the
      // global hook so the next press uses the new binding.
      if (next?.activationKey) this.hotkey.rebind(next.activationKey);
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send(IPC.settingsChanged, updated)
      );
      return updated;
    });

    // Chat + pointer + interview wire-up: each subsystem owns its own
    // handlers but registers through here so the IPC channel list is
    // discoverable in one place.
    this.chat.registerIpc();
    this.pointer.registerIpc();
    this.interview.registerIpc();
    this.dictation.registerIpc();

    ipcMain.handle(IPC.pillShow, () => this.windows.showPill());
    ipcMain.handle(IPC.pillHide, () => this.windows.hidePill());
    ipcMain.handle(IPC.pillToggle, () => this.windows.togglePill());
    ipcMain.handle(IPC.pillResize, (_e, size: { width: number; height: number }) => {
      this.windows.resizePill(size.width, size.height);
    });
    ipcMain.handle(IPC.captureScreen, async () => {
      // Used by chat + pointer to attach a per-turn screenshot. We capture
      // the display under the cursor, not display 0 — multi-monitor users
      // got the wrong screen otherwise.
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      return this.windows.captureScreen(display);
    });
    ipcMain.handle(IPC.permissionsCheck, () => ({
      // Windows doesn't have a TCC-style central permission store. The
      // only thing we genuinely need to surface is microphone access,
      // which Windows 10/11 routes through Settings → Privacy →
      // Microphone. We can't query it from the main process without a
      // native add-on; the renderer asks via getUserMedia and reports
      // back if it was denied.
      platform: process.platform,
    }));
  }
}

new Keyfloe().start().catch((err) => {
  logger.error('Keyfloe.start failed', err);
  app.quit();
});

// Resolve the preload path once. Vite emits dist/preload/index.js next
// to dist/main/index.js; exposing it as a function so the renderer
// constructor doesn't have to know the layout.
export function preloadPath() {
  return path.join(__dirname, '..', 'preload', 'index.js');
}
