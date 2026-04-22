import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { waitForDevServer } from '../windows/wait_for_dev_server';

/** Fixed dimensions of the tray popup menu */
const MENU_WIDTH = 190;
const MENU_HEIGHT = 122; // header + divider + 2 items + divider + padding

let menuWindow: BrowserWindow | null = null;

/**
 * Calculate the best position for the tray menu popup near the tray icon.
 * Respects whether the taskbar is at the bottom, top, left, or right of the screen.
 */
function calcMenuPosition(
  trayX: number,
  trayY: number,
  trayW: number,
  trayH: number,
): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x: trayX, y: trayY });
  const { workArea } = display;

  // Determine taskbar edge by comparing tray center to work area edges
  const trayCX = trayX + trayW / 2;
  const trayCY = trayY + trayH / 2;

  const fromLeft   = trayCX - workArea.x;
  const fromRight  = workArea.x + workArea.width  - trayCX;
  const fromTop    = trayCY - workArea.y;
  const fromBottom = workArea.y + workArea.height - trayCY;

  const minDist = Math.min(fromLeft, fromRight, fromTop, fromBottom);

  let x: number;
  let y: number;

  if (minDist === fromBottom) {
    // Taskbar at bottom — show menu above tray icon
    x = trayX + trayW / 2 - MENU_WIDTH / 2;
    y = trayY - MENU_HEIGHT - 4;
  } else if (minDist === fromTop) {
    // Taskbar at top — show menu below tray icon
    x = trayX + trayW / 2 - MENU_WIDTH / 2;
    y = trayY + trayH + 4;
  } else if (minDist === fromRight) {
    // Taskbar at right — show menu to the left
    x = trayX - MENU_WIDTH - 4;
    y = trayY + trayH / 2 - MENU_HEIGHT / 2;
  } else {
    // Taskbar at left — show menu to the right
    x = trayX + trayW + 4;
    y = trayY + trayH / 2 - MENU_HEIGHT / 2;
  }

  // Clamp to work area bounds
  x = Math.max(workArea.x + 4, Math.min(x, workArea.x + workArea.width  - MENU_WIDTH  - 4));
  y = Math.max(workArea.y + 4, Math.min(y, workArea.y + workArea.height - MENU_HEIGHT - 4));

  return { x: Math.round(x), y: Math.round(y) };
}

/** Show (or create) the tray context menu popup near the given tray icon bounds */
export async function showTrayMenu(trayBounds: Electron.Rectangle): Promise<void> {
  // If already visible, just close it (toggle behavior)
  if (menuWindow && !menuWindow.isDestroyed()) {
    menuWindow.close();
    menuWindow = null;
    return;
  }

  const { x, y } = calcMenuPosition(
    trayBounds.x,
    trayBounds.y,
    trayBounds.width,
    trayBounds.height,
  );

  menuWindow = new BrowserWindow({
    width: MENU_WIDTH,
    height: MENU_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  // Load the tray menu renderer
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/tray_menu.html`;
    await waitForDevServer(url);
    await menuWindow.loadURL(url);
  } else {
    await menuWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/tray_menu.html`),
    );
  }

  menuWindow.show();

  // Close on blur (click outside)
  menuWindow.on('blur', () => closeTrayMenu());

  menuWindow.on('closed', () => {
    menuWindow = null;
  });
}

/** Close the tray menu if open */
export function closeTrayMenu() {
  if (menuWindow && !menuWindow.isDestroyed()) {
    menuWindow.close();
    menuWindow = null;
  }
}

/** Register IPC handlers for tray-menu-ready signal */
export function registerTrayMenuWindowHandlers() {
  ipcMain.on('tray-menu:ready', () => {
    // Window is ready — no extra config needed currently
  });
}
