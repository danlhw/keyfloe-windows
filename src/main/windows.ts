import { BrowserWindow, screen, Display, ipcMain } from 'electron';
import path from 'node:path';
import { logger } from './log';
import { preloadPath } from './index';
import { IPC } from '../shared/ipc';

// Three classes of window:
//   notch    — pinned top-center, frameless transparent, always on top.
//              Hosts the notch shell (idle / hoverCompact / expandedFull).
//   pill     — frameless transparent, anchored to the cursor on tap.
//   overlay  — one per display, transparent click-through, lazily created
//              ONLY when the Clicky pointer needs to land somewhere.
//              They used to be permanent fullscreen always-on-top windows;
//              on macOS that combination + setIgnoreMouseEvents(true,
//              {forward:true}) wedged input and rendered the screen blank
//              while we figured out body-background bugs. Lazy + small
//              when hidden is the safe default — see windows.showOverlays /
//              hideOverlays.

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

function rendererUrl(page: 'notch' | 'dashboard' | 'pill' | 'overlay'): string {
  if (DEV_URL) return `${DEV_URL}/${page}.html`;
  return `file://${path.join(__dirname, '..', 'renderer', `${page}.html`)}`;
}

// Notch geometry mirrored from NotchGeometry.swift. Keep these in lockstep
// with src/renderer/views/Notch.tsx.
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
    // Notch is the primary surface. Pill is lazy on first hotkey press.
    // Overlays are lazy on first pointer target.
    this.createNotch();
    this.pill = this.createPill();

    // Reposition the notch when the display topology changes.
    screen.on('display-added',           () => this.repositionNotch());
    screen.on('display-removed',         () => this.repositionNotch());
    screen.on('display-metrics-changed', () => this.repositionNotch());

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
    // Use 'floating' rather than 'screen-saver' so we sit above normal
    // app windows but BELOW the macOS menu bar / screen-saver — that
    // way a misbehaving notch can't lock the user out of the menu bar.
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadURL(rendererUrl('notch'));
    win.on('closed', () => { this.notch = null; });
    this.notch = win;
  }

  private notchOrigin(display: Display, size: { width: number; height: number }) {
    // Center horizontally on the display. Vertically:
    //   • Windows: bounds.y (top of the physical display) — there's no
    //     menu bar to collide with.
    //   • macOS:   workArea.y so the notch sits just below the menu bar
    //     during the dev loop. Otherwise a transparent always-on-top
    //     window pinned at bounds.y fights for space with the menu bar
    //     and renders unpredictably.
    const x = Math.round(display.bounds.x + (display.bounds.width - size.width) / 2);
    const yBase = process.platform === 'darwin' ? display.workArea.y : display.bounds.y;
    return { x, y: yBase };
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
    if (!this.notch || this.notch.isDestroyed()) this.createNotch();
    this.notch?.show();
    this.notch?.focus();
    this.notch?.webContents.send('notch:request-expand');
  }

  // ─── Pill (cursor-anchored chat) ────────────────────────────────

  private createPill(): BrowserWindow {
    const win = new BrowserWindow({
      // Start large enough to fit header + suggestions + input without
      // depending on the renderer-side ResizeObserver firing first. On
      // virtualized GPUs (Parallels/VMware) the ResizeObserver-driven
      // grow path doesn't always fire on first paint — content was
      // getting clipped below the input row.
      width: 540,
      height: 380,
      minWidth: 480,
      minHeight: 320,
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
    // 'floating' here too — same reason as the notch. Without it,
    // 'screen-saver' on macOS can wedge focus when the pill loses key.
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadURL(rendererUrl('pill'));
    return win;
  }

  showPill() {
    if (!this.pill || this.pill.isDestroyed()) this.pill = this.createPill();
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
    // Only meaningful (>4px) changes propagate. Without this guard the
    // renderer's ResizeObserver could ping-pong with the OS layout
    // engine — each round trip shaving sub-pixel float values would
    // re-fire the observer.
    if (Math.abs(w - width) < 4 && Math.abs(h - height) < 4) return;
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

  // ─── Overlays (Clicky cursor + speech bubble) — LAZY ────────────

  /// Create one transparent click-through window per display, ONLY when
  /// the Clicky pointer has a target to render. Called from
  /// ClickyPointer.showTarget(). When the target is cleared,
  /// hideOverlays() destroys them — eliminates the "fullscreen
  /// always-on-top window swallowing input" failure mode.
  showOverlays(): BrowserWindow[] {
    if (this.overlays.length > 0) return this.overlays;
    screen.getAllDisplays().forEach((d) => this.overlays.push(this.createOverlay(d)));
    return this.overlays;
  }

  hideOverlays() {
    this.overlays.forEach((w) => { if (!w.isDestroyed()) w.destroy(); });
    this.overlays = [];
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
    // forward:false because forward:true on macOS leaks clicks under
    // some conditions and we don't need cursor-position forwarding for
    // the overlay use-case (we drive it from screen.getCursorScreenPoint
    // in main).
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadURL(rendererUrl('overlay'));
    return win;
  }

  overlayWindows() { return this.overlays.filter((w) => !w.isDestroyed()); }

  // ─── Screen capture ─────────────────────────────────────────────

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
