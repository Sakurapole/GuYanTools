import { BrowserWindow, clipboard, ipcMain } from 'electron';
import path from 'path';
import { terminalHost } from './host';
import { sshHost } from '../ssh/host';
import type {
  CreateTerminalSessionPayload,
  DetachedTerminalSessionKind,
  ResizeTerminalSessionPayload,
} from '@/contracts/terminal';

let registered = false;
const detachedWindowCloseModes = new Map<number, 'close-session' | 'return-to-main'>();

function buildPopupTarget(sessionId: string, kind: DetachedTerminalSessionKind) {
  return `popup:${kind}:${sessionId}:${Date.now()}`;
}

async function openDetachedTerminalWindow(
  sourceWindow: BrowserWindow,
  sessionId: string,
  kind: DetachedTerminalSessionKind = 'local',
  requestedLabel = '',
) {
  const target = buildPopupTarget(sessionId, kind);
  let label = requestedLabel || 'Terminal';

  if (kind === 'local') {
    terminalHost.attachSession(sessionId, target);
    const sessions = terminalHost.listSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    label = session?.profileLabel ?? label;
  } else {
    sshHost.attachSession(sessionId, target);
    const sessions = sshHost.listSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    label = session?.profileLabel ?? label;
  }

  const preloadPath = path.join(__dirname, 'preload.js');
  const parentBounds = sourceWindow.getBounds();
  const width = 1080;
  const height = 720;
  const win = new BrowserWindow({
    width,
    height,
    minWidth: 720,
    minHeight: 480,
    frame: false,
    backgroundColor: '#101821',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(parentBounds ? {
      x: parentBounds.x + Math.round((parentBounds.width - width) / 2),
      y: parentBounds.y + Math.round((parentBounds.height - height) / 2),
    } : {}),
  });
  detachedWindowCloseModes.set(win.id, 'close-session');

  win.on('closed', () => {
    const closeMode = detachedWindowCloseModes.get(win.id) ?? 'close-session';
    detachedWindowCloseModes.delete(win.id);
    if (closeMode === 'return-to-main') {
      return;
    }

    if (kind === 'local') {
      try {
        terminalHost.killSession(sessionId);
      } catch (error) {
        console.error('[terminal] Failed to close detached terminal session:', error);
      }
    } else {
      try {
        sshHost.disconnect(sessionId);
      } catch (error) {
        console.error('[terminal] Failed to close detached SSH session:', error);
      }
    }
  });

  /**
   * Load the dedicated terminal HTML entry with session identity and metadata.
   * The detached window has its own independent Vue app / Pinia store
   * that is completely isolated from the main window.
   */
  const queryParams = new URLSearchParams({ sessionId, target, label, kind });
  const query = `?${queryParams.toString()}`;
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const terminalUrl = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/index_terminal.html${query}`;
    console.log('[terminal] Opening detached window at:', terminalUrl);
    await win.loadURL(terminalUrl);
  } else {
    const terminalHtmlPath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index_terminal.html`);
    console.log('[terminal] Opening detached window from file:', terminalHtmlPath);
    await win.loadFile(terminalHtmlPath, { query: { sessionId, target, label, kind } });
  }
}

export function registerTerminalIpcHandlers() {
  if (registered) return;

  ipcMain.handle('terminal:list-profiles', async () => {
    return terminalHost.listProfiles();
  });

  ipcMain.handle('terminal:list-sessions', async () => {
    return terminalHost.listSessions();
  });

  ipcMain.handle('terminal:create-session', async (_event, payload: CreateTerminalSessionPayload) => {
    return terminalHost.createSession(payload);
  });

  ipcMain.handle('terminal:get-buffer', async (_event, sessionId: string) => {
    return terminalHost.getBuffer(sessionId);
  });

  ipcMain.handle('terminal:clear-buffer', async (_event, sessionId: string) => {
    terminalHost.clearBuffer(sessionId);
  });

  ipcMain.handle('terminal:write', async (_event, sessionId: string, data: string) => {
    terminalHost.write(sessionId, data);
  });

  ipcMain.handle('terminal:resize-session', async (_event, payload: ResizeTerminalSessionPayload) => {
    terminalHost.resizeSession(payload);
  });

  ipcMain.handle('terminal:kill-session', async (_event, sessionId: string) => {
    terminalHost.killSession(sessionId);
  });

  ipcMain.handle('terminal:attach-session', async (_event, sessionId: string, target: string) => {
    terminalHost.attachSession(sessionId, target);
  });

  ipcMain.handle('terminal:attach-main', async (_event, sessionId: string) => {
    terminalHost.attachToMain(sessionId);
  });

  ipcMain.handle('terminal:detach-to-window', async (
    event,
    sessionId: string,
    kind: DetachedTerminalSessionKind = 'local',
    label = '',
  ) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow || sourceWindow.isDestroyed()) {
      throw new Error('无法获取当前窗口');
    }
    const sessionKind = kind === 'ssh' ? 'ssh' : 'local';
    await openDetachedTerminalWindow(sourceWindow, sessionId, sessionKind, label);
  });

  ipcMain.handle('terminal:return-detached-to-main', async (
    event,
    sessionId: string,
    target: string,
    kind: DetachedTerminalSessionKind = 'local',
  ) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    const sessionKind = kind === 'ssh' ? 'ssh' : 'local';
    if (sessionKind === 'ssh') {
      sshHost.closeDetachedView(sessionId, target);
    } else {
      terminalHost.closeDetachedView(sessionId, target);
    }

    if (sourceWindow && !sourceWindow.isDestroyed()) {
      detachedWindowCloseModes.set(sourceWindow.id, 'return-to-main');
      sourceWindow.close();
    }
  });

  ipcMain.handle('terminal:clipboard-read', async () => {
    return clipboard.readText();
  });

  ipcMain.handle('terminal:clipboard-write', async (_event, text: string) => {
    clipboard.writeText(text ?? '');
  });

  registered = true;
}
