import { waitForDevServer } from '@/main/windows/wait_for_dev_server';
import type { MultiDeviceClipboardItem } from '@/contracts/multi_device_clipboard';
import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { clipboardWindowPlatformAdapter, type ClipboardAlwaysOnTopLevel } from './window_platform_adapter';

const WINDOW_WIDTH = 420;
const WINDOW_HEIGHT = 560;
const MARGIN = 12;
const ANIMATION_DURATION_MS = 180;
const PASTE_AFTER_HIDE_DELAY_MS = 160;
const RAISE_ABOVE_DURATION_MS = 720;
const RAISE_ABOVE_INTERVAL_MS = 60;

let clipboardWindow: BrowserWindow | null = null;
let textPreviewWindow: BrowserWindow | null = null;
let pasteTargetWindowToken: string | null = null;
let isHiding = false;
let animationTimer: ReturnType<typeof setInterval> | null = null;
let raiseAboveTimer: ReturnType<typeof setInterval> | null = null;
let anchorDisplayId: number | null = null;

export async function showMultiDeviceClipboardWindow() {
  anchorDisplayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
  pasteTargetWindowToken = await clipboardWindowPlatformAdapter.getForegroundPasteTargetToken().catch((): null => null);

  if (clipboardWindow && !clipboardWindow.isDestroyed()) {
    isHiding = false;
    stopBoundsAnimation();
    positionWindow(clipboardWindow, 'offscreen');
    clipboardWindow.showInactive();
    keepWindowAboveNormalApps(clipboardWindow);
    expandMultiDeviceClipboardWindow(true);
    return;
  }

  clipboardWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  clipboardWindow.on('closed', () => {
    stopBoundsAnimation();
    stopRaiseAboveTimer();
    clipboardWindow = null;
    isHiding = false;
  });
  clipboardWindow.on('blur', () => {
    if (clipboardWindow && !clipboardWindow.isDestroyed() && clipboardWindow.isVisible()) {
      keepWindowAboveNormalApps(clipboardWindow);
      keepWindowAboveNormalAppsForAWhile(clipboardWindow);
    }
  });

  positionWindow(clipboardWindow, 'offscreen');

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/clipboard.html`;
    await waitForDevServer(url);
    await clipboardWindow.loadURL(url);
  } else {
    await clipboardWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/clipboard.html`),
    );
  }

  clipboardWindow.showInactive();
  keepWindowAboveNormalApps(clipboardWindow);
  expandMultiDeviceClipboardWindow(true);
}

export function closeMultiDeviceClipboardWindow() {
  if (clipboardWindow && !clipboardWindow.isDestroyed()) {
    stopBoundsAnimation();
    stopRaiseAboveTimer();
    isHiding = true;
    clipboardWindow.hide();
  }
}

export function openMultiDeviceClipboardDevTools() {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return;
  }
  if (!clipboardWindow || clipboardWindow.isDestroyed()) {
    return;
  }
  clipboardWindow.webContents.openDevTools({ mode: 'detach', activate: true });
}

export async function showMultiDeviceClipboardTextPreviewWindow(item: MultiDeviceClipboardItem) {
  if (item.contentType !== 'text') {
    return;
  }

  if (textPreviewWindow && !textPreviewWindow.isDestroyed()) {
    textPreviewWindow.close();
  }

  const targetBounds = clipboardWindow && !clipboardWindow.isDestroyed()
    ? clipboardWindow.getBounds()
    : getTargetBounds('expanded');
  const display = screen.getDisplayMatching(targetBounds);
  const { workArea } = display;
  const width = Math.min(560, Math.max(420, workArea.width - MARGIN * 2));
  const height = Math.min(460, Math.max(320, workArea.height - MARGIN * 2));
  const x = Math.max(workArea.x + MARGIN, Math.min(targetBounds.x - width - MARGIN, workArea.x + workArea.width - width - MARGIN));
  const y = Math.max(workArea.y + MARGIN, Math.min(targetBounds.y, workArea.y + workArea.height - height - MARGIN));

  textPreviewWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 360,
    minHeight: 240,
    title: '剪贴板文本预览',
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  textPreviewWindow.setMenu(null);
  textPreviewWindow.on('closed', () => {
    textPreviewWindow = null;
  });
  textPreviewWindow.webContents.once('did-finish-load', () => {
    if (textPreviewWindow && !textPreviewWindow.isDestroyed()) {
      textPreviewWindow.webContents.send('multi-device-clipboard:text-preview-data', item);
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/clipboard_text_preview.html`;
    await waitForDevServer(url);
    await textPreviewWindow.loadURL(url);
  } else {
    await textPreviewWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/clipboard_text_preview.html`),
    );
  }
  textPreviewWindow.show();
}

export async function pasteMultiDeviceClipboardIntoActiveTarget() {
  const targetWindowToken = pasteTargetWindowToken;
  closeMultiDeviceClipboardWindow();

  await delay(PASTE_AFTER_HIDE_DELAY_MS);
  await clipboardWindowPlatformAdapter.sendPasteShortcut(targetWindowToken).catch((error) => {
    console.warn('[multi-device-clipboard] Failed to send paste shortcut:', error);
  });
}

export function toggleMultiDeviceClipboardWindow() {
  if (clipboardWindow && !clipboardWindow.isDestroyed() && clipboardWindow.isVisible()) {
    closeMultiDeviceClipboardWindow();
    return;
  }
  void showMultiDeviceClipboardWindow();
}

export function registerMultiDeviceClipboardWindowHandlers() {
  ipcMain.on('multi-device-clipboard:window-ready', () => {
    if (clipboardWindow && !clipboardWindow.isDestroyed() && clipboardWindow.isVisible()) {
      positionWindow(clipboardWindow, 'expanded');
      keepWindowAboveNormalApps(clipboardWindow);
    }
  });
}

export function expandMultiDeviceClipboardWindow(animated = true) {
  if (!clipboardWindow || clipboardWindow.isDestroyed()) {
    return;
  }

  isHiding = false;
  const target = getTargetBounds('expanded');
  if (animated) {
    keepWindowAboveNormalApps(clipboardWindow);
    keepWindowAboveNormalAppsForAWhile(clipboardWindow);
    animateWindowTo(clipboardWindow, target);
  } else {
    clipboardWindow.setBounds(target, false);
    keepWindowAboveNormalApps(clipboardWindow);
  }
}

function positionWindow(
  win: BrowserWindow,
  mode: 'expanded' | 'offscreen' = 'expanded',
) {
  win.setBounds(getTargetBounds(mode), false);
}

function keepWindowAboveNormalApps(win: BrowserWindow) {
  win.setAlwaysOnTop(false);
  win.setAlwaysOnTop(true, getClipboardAlwaysOnTopLevel());
  win.moveTop();
}

function keepWindowAboveNormalAppsForAWhile(win: BrowserWindow) {
  stopRaiseAboveTimer();
  const startedAt = Date.now();
  raiseAboveTimer = setInterval(() => {
    if (win.isDestroyed() || !win.isVisible() || isHiding) {
      stopRaiseAboveTimer();
      return;
    }

    keepWindowAboveNormalApps(win);
    if (Date.now() - startedAt >= RAISE_ABOVE_DURATION_MS) {
      stopRaiseAboveTimer();
    }
  }, RAISE_ABOVE_INTERVAL_MS);
}

function stopRaiseAboveTimer() {
  if (raiseAboveTimer) {
    clearInterval(raiseAboveTimer);
    raiseAboveTimer = null;
  }
}

function getClipboardAlwaysOnTopLevel(): ClipboardAlwaysOnTopLevel {
  return clipboardWindowPlatformAdapter.getAlwaysOnTopLevel();
}

function getTargetBounds(mode: 'expanded' | 'offscreen') {
  const { anchorBounds, workArea } = getAnchorBounds();
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  const anchorRight = clamp(anchorBounds.x + anchorBounds.width, workArea.x + MARGIN, right);
  const anchorBottom = clamp(anchorBounds.y + anchorBounds.height, workArea.y + MARGIN, bottom);

  const expanded = {
    x: clamp(anchorRight - WINDOW_WIDTH - MARGIN, workArea.x + MARGIN, right - WINDOW_WIDTH - MARGIN),
    y: clamp(anchorBottom - WINDOW_HEIGHT - MARGIN, workArea.y + MARGIN, bottom - WINDOW_HEIGHT - MARGIN),
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  };

  if (mode === 'offscreen') {
    return {
      ...expanded,
      x: right + MARGIN,
    };
  }

  return expanded;
}

function getAnchorBounds() {
  const display = getAnchorDisplay();
  return { anchorBounds: display.workArea, workArea: display.workArea };
}

function getAnchorDisplay() {
  const displays = screen.getAllDisplays();
  const matched = anchorDisplayId == null
    ? undefined
    : displays.find((display) => display.id === anchorDisplayId);
  return matched ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function animateWindowTo(win: BrowserWindow, target: Electron.Rectangle, onComplete?: () => void) {
  stopBoundsAnimation();

  const from = win.getBounds();
  const startedAt = Date.now();

  animationTimer = setInterval(() => {
    if (win.isDestroyed()) {
      stopBoundsAnimation();
      return;
    }

    const elapsed = Date.now() - startedAt;
    const progress = Math.min(1, elapsed / ANIMATION_DURATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    const next = {
      x: Math.round(from.x + (target.x - from.x) * eased),
      y: Math.round(from.y + (target.y - from.y) * eased),
      width: Math.round(from.width + (target.width - from.width) * eased),
      height: Math.round(from.height + (target.height - from.height) * eased),
    };

    win.setBounds(next, false);

    if (progress >= 1) {
      stopBoundsAnimation();
      win.setBounds(target, false);
      onComplete?.();
    }
  }, 12);
}

function stopBoundsAnimation() {
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
