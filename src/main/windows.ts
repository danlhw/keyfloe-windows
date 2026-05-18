import { BrowserWindow, screen, Display, ipcMain } from 'electron';
import path from 'node:path';
import { logger } from './log';
import { preloadPath } from './index';
import { IPC } from '../shared/ipc';

// Three classes of window:
//   notch    — pinned top-center, frameless transparent, always on top.
//              Hosts the notch shell (idle / hoverCompact / expandedFull).
//   pill     — frameless transparent, anchored to the cursor on tap.
//   overlay  — one per display, transparent click-through, hosts the
//              Clicky blue cursor + speech bubble.
//
// Renderer entry points are separate HTML files emitted by Vite under
// dist/renderer/.

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

function rendererUrl(page: 'notch' | 'dashboard' | 'pill' | 'overlay'): string {
  if (DEV_URL) return `${DEV_URL}/${page}.html`;
  return `file://${path.join(__dirname, '..', 'renderer', `${page}.html`)}`;
}

// Notch geometry mirrored from NotchGeometry.swift. Lip dimensions and
// the three state-size profiles need to stay in lockstep with the
// renderer (see src/renderer/views/Notch.tsx).
const NOTCH_WIDTH  = 200;
const NOTCH_HEIGHT = 32;
type NotchState = 'idle' | 'hoverCompact' | 'expandedFull';
const NOTCH_SIZES: Record<NotchState, { width: number; height: number }> = {
  idle:         { width: NOTCH_WIDTH, height: NOTCH_HEIGHT },
  hoverCompact: { width: 420,         height: 110 },
  expandedFull: { width: 980,         height: 660 },
};

export class WindowManager {
  static shared = new WindowManager();

  private notch: BrowserWindow | null = null;
  private pill: BrowserWindow | null = null;
  private overlays: BrowserWindow[] = [];

  build() {
    // The notch is the primary surface — it owns the dashboard. The pill
    // is created lazily on first hotkey press. Overlays are one per
    // display, always painted but transparent + click-through.
    this.createNotch();
    this.pill = this.createPill();
    this.createOverlaysForAllDisplays();

    // Reposition the notch and rebuild overlays when the display
    // topology changes (lid open/close, monitor plug, resolution flip).
    screen.on('display-added',           () => { this.repositionNotch(); this.createOverlaysForAllDisplays(); });
    screen.on('display-removed',         () => { this.repositionNotch(); this.createOverlaysForAllDisplays(); });
    screen.on('display-metrics-changed', () => { this.repositionNotch(); this.createOverlaysForAllDisplays(); });

    ipcMain.handle(IPC.notchSetState, (_e, payload: { state: NotchState; width: number; height: number }) => {
      this.resizeNotch(payload.width, payload.height);
    });
  }

  // ─── Notch (the primary, always-on-top top-of-screen surface) ───

  private createNotch() {
    const primary = screen.getPrimaryDisplay();
    const size = NOTCH_SIZES.idle;
    const { x, y } = this.notchOrigin(primary, size);
    const win = new BrowserWindow({
      x, y,
      width: size.width,
      height: size.height,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      show: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadURL(rendererUrl('notch'));
    win.on('closed', () => { this.notch = null; });
    this.notch = win;
  }

  private notchOrigin(display: Display, size: { width: number; height: number }) {
    // Centered along the top edge of the primary display's *bounds*
    // (not work area) so it visually replaces the menu-bar/title-area
    // strip the way the Mac notch does.
    const x = Math.round(display.bounds.x + (display.bounds.width - size.width) / 2);
    const y = display.bounds.y;
    return { x, y };
  }

  private repositionNotch() {
    if (!this.notch || this.notch.isDestroyed()) return;
    const primary = screen.getPrimaryDisplay();
    const [w, h] = this.notch.getSize();
    const { x, y } = this.notchOrigin(primary, { width: w, height: h });
    this.notch.setPosition(x, y);
  }

  private resizeNotch(width: number, height: number) {
    if (!this.notch || this.notch.isDestroyed()) return;
    const [w, h] = this.notch.getSize();
    if (Math.abs(w - width) < 2 && Math.abs(h - height) < 2) return;
    const primary = screen.getPrimaryDisplay();
    const { x, y } = this.notchOrigin(primary, { width, height });
    this.notch.setBounds({ x, y, width: Math.round(width), height: Math.round(height) });
  }

  focusDashboard() {
    // "Open the dashboard" from the tray = grow the notch to expandedFull.
    // We just bring the notch window forward and ping the renderer; the
    // renderer flips its internal state machine.
    if (!this.notch || this.notch.isDestroyed()) {
      this.createNotch();
    }
    this.notch?.show();
    this.notch?.focus();
    // The renderer subscribes to this so the user gets the dashboard
    // open immediately, even though they didn't hover.
    this.notch?.webContents.send('notch:request-expand');
  }

  // ─── Pill (cursor-anchored chat) ────────────────────────────────

  private createPill(): BrowserWindow {
    const win = new BrowserWindow({
      width: 432,
      height: 220,
      minWidth: 360,
      minHeight: 140,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadURL(rendererUrl('pill'));
    return win;
  }

  showPill() {
    if (!this.pill || this.pill.isDestroyed()) {
      this.pill = this.createPill();
    }
    this.anchorPillToCursor();
    this.pill.showInactive();
    this.pill.focus();
  }

  hidePill() {
    if (this.pill && !this.pill.isDestroyed()) this.pill.hide();
  }

  togglePill() {
    if (!this.pill) { this.showPill(); return; }
    if (this.pill.isVisible()) this.hidePill();
    else this.showPill();
  }

  resizePill(width: number, height: number) {
    if (!this.pill || this.pill.isDestroyed()) return;
    const [w, h] = this.pill.getSize();
    if (Math.abs(w - width) < 2 && Math.abs(h - height) < 2) return;
    this.pill.setSize(Math.round(width), Math.round(height));
  }

  private anchorPillToCursor() {
    if (!this.pill) return;
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const [w, h] = this.pill.getSize();
    const x = Math.min(
      Math.max(cursor.x - Math.floor(w / 2), display.workArea.x + 8),
      display.workArea.x + display.workArea.width - w - 8,
    );
    const y = Math.min(
      cursor.y + 24,
      display.workArea.y + display.workArea.height - h - 8,
    );
    this.pill.setPosition(x, y);
  }

  // ─── Overlays (Clicky cursor + speech bubble) ───────────────────

  private createOverlaysForAllDisplays() {
    this.overlays.forEach((w) => { if (!w.isDestroyed()) w.destroy(); });
    this.overlays = [];
    screen.getAllDisplays().forEach((d) => this.overlays.push(this.createOverlay(d)));
  }

  private createOverlay(display: Display): BrowserWindow {
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      hasShadow: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      show: true,
      resizable: false,
      movable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadURL(rendererUrl('overlay'));
    return win;
  }

  overlayWindows() { return this.overlays.filter((w) => !w.isDestroyed()); }

  // ─── Screen capture (per-display, sent into Claude as the per-turn image) ─

  async captureScreen(display: Display): Promise<string | null> {
    const { desktopCapturer } = await import('electron');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: display.bounds.width, height: display.bounds.height },
    });
    const match = sources.find((s) => s.display_id === String(display.id))
                || sources[0];
    if (!match) {
      logger.warn('captureScreen: no source');
      return null;
    }
    const img = match.thumbnail;
    const resized = img.resize({ width: Math.min(1280, img.getSize().width) });
    return resized.toDataURL();
  }
}
