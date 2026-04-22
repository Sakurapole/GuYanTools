import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { webViewManager } from './manager';

let registered = false;

export function registerWebviewIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  if (registered) return;

  ipcMain.handle('webview:check-domain', async (_event, domain: string) => {
    return webViewManager.checkDomain(domain);
  });

  ipcMain.handle('webview:get-injected-scripts', async (_event, domain: string) => {
    return webViewManager.getMatchedScripts(domain);
  });

  ipcMain.handle('webview:open-new-window', async (_event, url: string) => {
    webViewManager.openInNewWindow(url);
  });

  ipcMain.handle('webview:clear-session', async () => {
    await webViewManager.clearSessionData();
  });

  // ─── Chrome 扩展管理 ───
  ipcMain.handle('webview:install-extension', async (_event, sourcePath: string) => {
    return await webViewManager.installExtension(sourcePath);
  });

  ipcMain.handle('webview:remove-extension', async (_event, id: string) => {
    await webViewManager.removeExtension(id);
  });

  ipcMain.handle('webview:toggle-extension', async (_event, id: string, enabled: boolean) => {
    await webViewManager.toggleExtension(id, enabled);
  });

  ipcMain.handle('webview:get-extensions', async () => {
    return await webViewManager.getExtensions();
  });

  // ─── 脚本编辑器（新窗口） ───
  ipcMain.handle('webview:open-script-editor', async (_event, scriptId?: string, domain?: string) => {
    const mainWin = getMainWindow();
    const parentBounds = mainWin?.getBounds();

    const query = new URLSearchParams();
    query.set('popup', '1');
    if (scriptId) query.set('scriptId', scriptId);
    if (domain) query.set('domain', domain);
    const hash = `/script-editor${query.toString() ? '?' + query.toString() : ''}`;

    // 使用与主窗口相同的 preload 路径
    const preloadPath = path.join(__dirname, 'preload.js');

    const win = new BrowserWindow({
      width: 960,
      height: 680,
      minWidth: 720,
      minHeight: 480,
      frame: false,
      titleBarStyle: 'hidden',
      backgroundColor: '#00000000',
      transparent: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
      ...(parentBounds ? {
        x: parentBounds.x + Math.round((parentBounds.width - 960) / 2),
        y: parentBounds.y + Math.round((parentBounds.height - 680) / 2),
      } : {}),
    });

    // 加载主应用 URL 并导航到脚本编辑器路由
    const mainUrl = mainWin?.webContents.getURL() ?? '';
    const baseUrl = mainUrl.split('#')[0];
    await win.loadURL(`${baseUrl}#${hash}`);
  });

  // ─── 通用窗口控制（操作发送者所在的窗口，用于弹窗模式） ───
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.minimize();
  });

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  registered = true;
}
