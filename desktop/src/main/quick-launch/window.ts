import { waitForDevServer } from '@/main/windows/wait_for_dev_server';
import { appConfigManager } from '@/main/app-config/manager';
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

const WINDOW_WIDTH = 720;
const WINDOW_HEIGHT = 460;
const MIN_WINDOW_WIDTH = 560;
const MIN_WINDOW_HEIGHT = 360;
const MAX_WINDOW_WIDTH = 1120;
const MAX_WINDOW_HEIGHT = 820;
const RENDERER_READY_TIMEOUT_MS = 700;

let quickLaunchWindow: BrowserWindow | null = null;
let quickLaunchGameModeEnabled = false;
let pendingRendererReady:
  | {
      webContentsId: number;
      resolve: () => void;
      timeout: ReturnType<typeof setTimeout>;
      promise: Promise<void>;
    }
  | null = null;

export async function showQuickLaunchWindow() {
  const config = await appConfigManager.getConfig();
  if (!config.features.quickLaunch.enabled || quickLaunchGameModeEnabled) {
    return;
  }

  if (quickLaunchWindow && !quickLaunchWindow.isDestroyed()) {
    await waitForQuickLaunchRendererReady(quickLaunchWindow);
    revealQuickLaunchWindow(quickLaunchWindow);
    return;
  }

  quickLaunchWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const currentWebContentsId = quickLaunchWindow.webContents.id;
  quickLaunchWindow.on('closed', () => {
    clearPendingRendererReady(currentWebContentsId);
    quickLaunchWindow = null;
  });

  quickLaunchWindow.on('blur', () => {
    const shouldHide = appConfigManager.getCachedConfig().features.quickLaunch.hideOnBlur;
    if (shouldHide) {
      closeQuickLaunchWindow();
    }
  });

  positionWindow(quickLaunchWindow);
  const rendererReadyPromise = createRendererReadyWaiter(quickLaunchWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/quick_launcher.html`;
    await waitForDevServer(url);
    await quickLaunchWindow.loadURL(url);
  } else {
    await quickLaunchWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/quick_launcher.html`),
    );
  }

  await rendererReadyPromise;
  revealQuickLaunchWindow(quickLaunchWindow);
}

export function closeQuickLaunchWindow() {
  if (quickLaunchWindow && !quickLaunchWindow.isDestroyed()) {
    quickLaunchWindow.webContents.send('quick-launch:hidden');
    quickLaunchWindow.hide();
  }
}

export function notifyQuickLaunchRendererReady(webContentsId: number) {
  if (pendingRendererReady?.webContentsId === webContentsId) {
    pendingRendererReady.resolve();
  }
}

export function toggleQuickLaunchWindow() {
  if (quickLaunchGameModeEnabled) {
    return;
  }

  if (quickLaunchWindow && !quickLaunchWindow.isDestroyed() && quickLaunchWindow.isVisible()) {
    closeQuickLaunchWindow();
    return;
  }

  void showQuickLaunchWindow();
}

export function setQuickLaunchGameMode(enabled: boolean) {
  quickLaunchGameModeEnabled = enabled;
  if (enabled) {
    closeQuickLaunchWindow();
  }
  return quickLaunchGameModeEnabled;
}

export function getQuickLaunchGameModeStatus() {
  return quickLaunchGameModeEnabled;
}

export function resizeQuickLaunchWindow(input: { widthDelta?: number; heightDelta?: number }) {
  if (!quickLaunchWindow || quickLaunchWindow.isDestroyed()) {
    return;
  }

  const [currentWidth, currentHeight] = quickLaunchWindow.getSize();
  const display = screen.getDisplayMatching(quickLaunchWindow.getBounds());
  const maxWidth = Math.min(MAX_WINDOW_WIDTH, display.workArea.width - 32);
  const maxHeight = Math.min(MAX_WINDOW_HEIGHT, display.workArea.height - 32);
  const width = clampWindowSize(currentWidth + Math.round(input.widthDelta ?? 0), MIN_WINDOW_WIDTH, maxWidth);
  const height = clampWindowSize(currentHeight + Math.round(input.heightDelta ?? 0), MIN_WINDOW_HEIGHT, maxHeight);
  quickLaunchWindow.setSize(width, height, true);
  positionWindow(quickLaunchWindow);
}

export function registerQuickLaunchWindowHandlers() {
  // Reserved for future window-local channels.
}

async function waitForQuickLaunchRendererReady(win: BrowserWindow) {
  if (pendingRendererReady?.webContentsId !== win.webContents.id) {
    return;
  }

  await pendingRendererReady.promise;
}

function createRendererReadyWaiter(win: BrowserWindow) {
  clearPendingRendererReady();
  const webContentsId = win.webContents.id;
  let finished = false;
  let resolvePromise: () => void = () => {};

  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(timeout);
    if (pendingRendererReady?.webContentsId === webContentsId) {
      pendingRendererReady = null;
    }
    resolvePromise();
  };
  const timeout = setTimeout(finish, RENDERER_READY_TIMEOUT_MS);

  pendingRendererReady = {
    webContentsId,
    resolve: finish,
    timeout,
    promise,
  };

  return promise;
}

function clearPendingRendererReady(webContentsId?: number) {
  if (!pendingRendererReady) {
    return;
  }

  if (webContentsId !== undefined && pendingRendererReady.webContentsId !== webContentsId) {
    return;
  }

  clearTimeout(pendingRendererReady.timeout);
  pendingRendererReady.resolve();
  pendingRendererReady = null;
}

function revealQuickLaunchWindow(win: BrowserWindow) {
  if (quickLaunchWindow !== win || win.isDestroyed()) {
    return;
  }

  positionWindow(win);
  win.show();
  win.focus();
  win.webContents.send('quick-launch:reveal');
}

function positionWindow(win: BrowserWindow) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  const [currentWidth, currentHeight] = win.getSize();
  const width = Math.min(currentWidth || WINDOW_WIDTH, workArea.width - 32);
  const height = Math.min(currentHeight || WINDOW_HEIGHT, workArea.height - 32);
  win.setBounds({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + Math.max(32, workArea.height * 0.18)),
  });
}

function clampWindowSize(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
