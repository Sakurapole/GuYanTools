import { app, BrowserWindow, ipcMain, screen } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PinImageConfig, PinImageWindowState } from '@/contracts/pin_image';
import type { ScreenshotRect } from '@/contracts/screenshot';
import { waitForDevServer } from '@/main/windows/wait_for_dev_server';

const MAX_PIN_WINDOWS = 10;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;
const CASCADE_OFFSET = 32;
const STATE_FILE = 'pin_image_windows.json';

interface PinWindowState {
  id: number;
  window: BrowserWindow;
  pngBase64: string;
  opacity: number;
  scale: number;
}

const pinWindows = new Map<number, PinWindowState>();
let nextPinId = 1;
let registered = false;

interface PersistedPinState {
  windows?: Array<{ bounds?: Partial<ScreenshotRect> }>;
}

export function registerPinImageIpcHandlers() {
  if (registered) return;
  registered = true;

  ipcMain.handle('pin-image:create', async (_event, config: PinImageConfig) => {
    return createPinWindow(config);
  });

  ipcMain.handle('pin-image:close', async (_event, pinId: number) => {
    closePinWindow(pinId);
  });

  ipcMain.handle('pin-image:set-opacity', async (_event, pinId: number, opacity: number) => {
    const state = pinWindows.get(pinId);
    if (!state || state.window.isDestroyed()) return;
    state.opacity = Math.max(0.1, Math.min(1, opacity));
    state.window.setOpacity(state.opacity);
  });

  ipcMain.handle('pin-image:list', async () => {
    return listPinWindows();
  });

  // 应用退出时清理所有贴图窗口
  app.on('before-quit', () => {
    for (const state of pinWindows.values()) {
      if (!state.window.isDestroyed()) {
        state.window.destroy();
      }
    }
    pinWindows.clear();
  });
}

async function createPinWindow(config: PinImageConfig): Promise<{ pinId: number }> {
  // 限制最大贴图数量
  if (pinWindows.size >= MAX_PIN_WINDOWS) {
    const oldest = pinWindows.keys().next().value;
    if (oldest !== undefined) {
      closePinWindow(oldest);
    }
  }

  const pinId = nextPinId++;
  const initialBounds = config.initialBounds ?? computeDefaultBounds();
  const opacity = config.opacity ?? 1;

  const win = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width || DEFAULT_WIDTH,
    height: initialBounds.height || DEFAULT_HEIGHT,
    minWidth: 80,
    minHeight: 60,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setOpacity(opacity);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const state: PinWindowState = {
    id: pinId,
    window: win,
    pngBase64: config.pngBase64,
    opacity,
    scale: 1,
  };
  pinWindows.set(pinId, state);

  win.once('closed', () => {
    pinWindows.delete(pinId);
  });

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('pin-image:payload', {
      pinId,
      pngBase64: config.pngBase64,
    });
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/pin_image.html`;
    await waitForDevServer(url);
    await win.loadURL(url);
  } else {
    await win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/pin_image.html`),
    );
  }

  win.show();
  return { pinId };
}

function closePinWindow(pinId: number) {
  const state = pinWindows.get(pinId);
  if (state && !state.window.isDestroyed()) {
    state.window.close();
  }
  pinWindows.delete(pinId);
}

function listPinWindows(): PinImageWindowState[] {
  const result: PinImageWindowState[] = [];
  for (const state of pinWindows.values()) {
    if (state.window.isDestroyed()) continue;
    const bounds = state.window.getBounds();
    result.push({
      pinId: state.id,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      opacity: state.opacity,
      scale: state.scale,
    });
  }
  return result;
}

function computeDefaultBounds(): ScreenshotRect {
  const display = screen.getPrimaryDisplay();
  const cascadeIndex = pinWindows.size;
  return {
    x: display.workArea.x + 60 + cascadeIndex * CASCADE_OFFSET,
    y: display.workArea.y + 60 + cascadeIndex * CASCADE_OFFSET,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
}

// ── 窗口状态持久化 ────────────────────────────────

async function getStateFilePath(): Promise<string> {
  return path.join(app.getPath('userData'), STATE_FILE);
}

export async function savePinWindowState() {
  const states: PersistedPinState = {
    windows: listPinWindows().map((w) => ({
      bounds: { x: w.bounds.x, y: w.bounds.y, width: w.bounds.width, height: w.bounds.height },
    })),
  };
  try {
    const filePath = await getStateFilePath();
    await fs.writeFile(filePath, JSON.stringify(states, null, 2), 'utf-8');
  } catch {
    // 持久化失败不影响功能
  }
}
