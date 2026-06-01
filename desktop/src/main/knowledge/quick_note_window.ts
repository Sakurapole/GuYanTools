import { waitForDevServer } from '@/main/windows/wait_for_dev_server';
import type { QuickNotePrefillPayload } from '@/contracts/knowledge';
import { BrowserWindow, clipboard, ipcMain, screen } from 'electron';
import path from 'node:path';

const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 460;
const MARGIN = 18;

let quickNoteWindow: BrowserWindow | null = null;
let pendingPrefill: QuickNotePrefillPayload | null = null;
let registered = false;

export async function showQuickNoteWindow(prefill?: QuickNotePrefillPayload) {
  pendingPrefill = prefill ?? pendingPrefill;

  if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
    positionQuickNoteWindow(quickNoteWindow);
    quickNoteWindow.show();
    quickNoteWindow.focus();
    emitPrefillWhenReady();
    return;
  }

  quickNoteWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 320,
    minHeight: 360,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    title: '速记',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  quickNoteWindow.on('closed', () => {
    quickNoteWindow = null;
    pendingPrefill = null;
  });
  quickNoteWindow.webContents.once('did-finish-load', () => {
    emitPrefillWhenReady();
  });

  positionQuickNoteWindow(quickNoteWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/quick_note.html`;
    await waitForDevServer(url);
    await quickNoteWindow.loadURL(url);
  } else {
    await quickNoteWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/quick_note.html`),
    );
  }

  quickNoteWindow.show();
  quickNoteWindow.focus();
}

export function toggleQuickNoteWindow() {
  if (quickNoteWindow && !quickNoteWindow.isDestroyed() && quickNoteWindow.isVisible() && quickNoteWindow.isFocused()) {
    quickNoteWindow.hide();
    return;
  }
  void showQuickNoteWindow();
}

export function captureClipboardToQuickNoteWindow() {
  const text = clipboard.readText().trim();
  void showQuickNoteWindow({
    body: text,
    tags: ['剪贴板'],
    color: 'blue',
  });
}

export function registerQuickNoteWindowHandlers() {
  if (registered) return;

  ipcMain.handle('quick-note:show-window', async (_event, prefill?: QuickNotePrefillPayload) => {
    await showQuickNoteWindow(prefill);
  });

  ipcMain.handle('quick-note:close-window', async () => {
    if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
      quickNoteWindow.hide();
    }
  });

  ipcMain.handle('quick-note:dock-window', async () => {
    if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
      quickNoteWindow.hide();
    }
  });

  ipcMain.handle('quick-note:set-always-on-top', async (_event, alwaysOnTop: boolean) => {
    if (quickNoteWindow && !quickNoteWindow.isDestroyed()) {
      quickNoteWindow.setAlwaysOnTop(alwaysOnTop);
    }
  });

  registered = true;
}

function positionQuickNoteWindow(win: BrowserWindow) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  win.setBounds({
    x: workArea.x + workArea.width - WINDOW_WIDTH - MARGIN,
    y: workArea.y + workArea.height - WINDOW_HEIGHT - MARGIN,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  });
}

function emitPrefillWhenReady() {
  if (!pendingPrefill || !quickNoteWindow || quickNoteWindow.isDestroyed()) {
    return;
  }

  quickNoteWindow.webContents.send('quick-note:prefill', pendingPrefill);
  pendingPrefill = null;
}
