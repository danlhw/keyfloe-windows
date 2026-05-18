import { BrowserWindow, screen, Display, app } from 'electron';
import path from 'node:path';
import { logger } from './log';
import { preloadPath } from './index';

// One owner for every window Keyfloe creates: dashboard (regular),
// pill (frameless, follows cursor), overlay (transparent click-through,
// covers every screen). Renderer entry points are separate HTML files
// emitted by Vite under dist/renderer/.

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const IS_DEV = !app.isPackaged;

function rendererUrl(page: 'dashboard' | 'pill' | 'overlay'): string {
  if (IS_DEV) return `${DEV_URL}/${page}.html`;
  return `file://${path.join(__dirname, '..', 'renderer', `${page}.html`)}`;
}

export class WindowManager {
  static shared = new WindowManager();

  private dashboard: BrowserWindow | null = null;
  private pill: BrowserWindow | null = null;
  private overlays: BrowserWindow[] = [];

  build() {
    // Pre-create pill so the first hotkey press paints instantly. The
    // Mac app does the same with NSPanel — keep one hidden in memory
    // and just show/hide on toggle rather than rebuilding the WebContents.
    this.pill = this.createPill();
    this.createOverlaysForAllDisplays();

    // Rebuild overlays when displays change (monitor plug/unplug, lid
    // close on laptop, resolution flip after game launch).
    screen.on('display-added',   () => this.createOverlaysForAllDisplays());
    screen.on('display-removed', () => this.createOverlaysForAllDisplays());
    screen.on('display-metrics-changed', () => this.createOverlaysForAllDisplays());
  }

  // MARK: dashboard

  openDashboard() {
    if (this.dashboard && !this.dashboard.isDestroyed()) {
      this.focusDashboard();
      return;
    }
    const win = new BrowserWindow({
      width: 1100,
      height: 720,
      minWidth: 720,
      minHeight: 480,
      title: 'Keyfloe',
      backgroundColor: '#101211',
      // Custom title bar — matches the Mac dashboard's traffic-light area.
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#171918',
        symbolColor: '#ECEEED',
        height: 36,
      },
      show: false,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.once('ready-to-show', () => win.show());
    win.loadURL(rendererUrl('dashboard'));
    win.on('closed', () => { this.dashboard = null; });
    this.dashboard = win;
  }

  focusDashboard() {
    if (!this.dashboard || this.dashboard.isDestroyed()) {
      this.openDashboard();
      return;
    }
    if (this.dashboard.isMinimized()) this.dashboard.restore();
    this.dashboard.focus();
  }

  // MARK: pill

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
      // Vibrancy on Windows is faked in CSS (backdrop-filter: blur) since
      // there's no system-wide vibrancy material like NSVisualEffectView.
      // We set a transparent background and let the renderer paint its
      // own pill body.
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
    win.on('blur', () => {
      // Mac pill stays open when it loses focus; matches that behavior.
      // The user closes it via Escape or by clicking outside + the
      // dismiss button, never just by clicking off it.
    });
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
    // Mac centers the pill under the cursor with a 24pt drop. Mirror that
    // here, clamped to the work area so it never paints under the taskbar.
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

  // MARK: overlays (clicky)

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

  // MARK: screen capture

  async captureScreen(display: Display): Promise<string | null> {
    // desktopCapturer is available from the main process but the cleaner
    // path on modern Electron is webContents.capturePage on a hidden
    // window. For now we use desktopCapturer because we want the actual
    // screen content (apps, taskbar) rather than our own DOM.
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
    // Shrink to ~1280 wide before sending to Claude — vision tokens are
    // priced by image area, and Claude grounds coordinates against the
    // image it receives so we have to remember the scale ratio at the
    // call site to map them back onto the real screen.
    const resized = img.resize({ width: Math.min(1280, img.getSize().width) });
    return resized.toDataURL();
  }
}

