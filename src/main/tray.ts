import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import path from 'node:path';
import { WindowManager } from './windows';

// System tray icon — Windows users expect a notification-area presence
// for tray-resident apps. Tray click opens the dashboard; right-click
// gives quick toggles + Quit.

let tray: Tray | null = null;

export function installTray() {
  if (tray) return;
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(__dirname, '..', '..', 'build', 'tray.png');
  const icon = nativeImage.createFromPath(iconPath);
  // Resize so Windows doesn't blur a 256-px image down to 16px badly.
  const sized = icon.isEmpty()
    ? nativeImage.createEmpty()
    : icon.resize({ width: 16, height: 16 });
  tray = new Tray(sized);
  tray.setToolTip('Keyfloe');
  rebuildMenu();
  tray.on('click', () => WindowManager.shared.focusDashboard());
}

export function rebuildMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Open Keyfloe', click: () => WindowManager.shared.focusDashboard() },
    { label: 'Toggle pill', click: () => WindowManager.shared.togglePill() },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.destroy(); });
      app.quit();
    } },
  ]);
  tray.setContextMenu(menu);
}
