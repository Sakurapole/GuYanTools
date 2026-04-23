import { Tray, nativeImage, app } from 'electron';
import path from 'path';
import type { BrowserWindow } from 'electron';
import { showTrayMenu, closeTrayMenu } from './tray_menu_window';

let tray: Tray | null = null;
const TRAY_ICON_FILENAME = 'icon_32.png';

function resolveTrayIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icons', TRAY_ICON_FILENAME);
  }

  return path.join(app.getAppPath(), 'src', 'assets', 'icons', TRAY_ICON_FILENAME);
}

/**
 * Initialize the system tray icon.
 * - Left-click: toggle main window visibility.
 * - Right-click: open a transparent frameless popup window
 *   positioned directly next to the tray icon (screen coordinates).
 */
export function initializeTray(getWindow: () => BrowserWindow | null) {
  const iconPath = resolveTrayIconPath();
  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    console.warn(`[tray] Failed to load tray icon from ${iconPath}`);
  }

  tray = new Tray(icon);
  tray.setToolTip('GuYan Tools');

  // Toggle main window on left-click
  tray.on('click', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  // Show custom context menu popup next to the tray icon on right-click.
  // `bounds` contains the screen-coordinate rectangle of the tray icon.
  tray.on('right-click', (_event, bounds) => {
    void showTrayMenu(bounds);
  });
}

/** Destroy the tray instance on app quit */
export function destroyTray() {
  closeTrayMenu();
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
