import { BrowserWindow } from 'electron';
import path from 'node:path';
import type { AiCanvasPreviewPayload } from '@/contracts/ai';
import { waitForDevServer } from '@/main/windows/wait_for_dev_server';

let previewWindow: BrowserWindow | null = null;
let lastPayload: AiCanvasPreviewPayload | null = null;

export async function showAiCanvasPreviewWindow(payload: AiCanvasPreviewPayload, parent?: BrowserWindow | null) {
  lastPayload = payload;

  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.setTitle(payload.title || 'Canvas 预览');
    if (previewWindow.isMinimized()) {
      previewWindow.restore();
    }
    previewWindow.show();
    previewWindow.focus();
    emitPayload();
    return;
  }

  previewWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    parent: parent ?? undefined,
    show: false,
    title: payload.title || 'Canvas 预览',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  previewWindow.on('closed', () => {
    previewWindow = null;
  });

  previewWindow.webContents.on('did-finish-load', emitPayload);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/ai_canvas_preview.html`;
    await waitForDevServer(url);
    await previewWindow.loadURL(url);
  } else {
    await previewWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/ai_canvas_preview.html`),
    );
  }

  previewWindow.show();
  previewWindow.focus();
}

function emitPayload() {
  if (!lastPayload || !previewWindow || previewWindow.isDestroyed()) {
    return;
  }

  previewWindow.webContents.send('ai:canvas-preview-payload', lastPayload);
}
