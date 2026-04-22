import { ipcMain } from 'electron';
import type { NotificationPayload } from '@/contracts/notification';
import { closeNotificationByWebContentsId, showNotification } from '../windows';

export function registerNotificationIpcHandlers(getMainWindow?: () => Electron.BrowserWindow | null) {
  // 主渲染进程/任意进程请求显示通知
  ipcMain.handle('notification:show', async (_event, payload: NotificationPayload) => {
    await showNotification(payload);
  });

  // 通知窗口请求关闭自身
  ipcMain.on('notification:close', (event) => {
    closeNotificationByWebContentsId(event.sender.id);
  });

  ipcMain.on('notification:activate', async (_event, route?: string) => {
    if (!route || !getMainWindow) return;
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) {
      win.restore();
    }
    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
    await win.webContents.executeJavaScript(
      `window.location.hash = ${JSON.stringify(route.startsWith('#') ? route : `#${route}`)};`,
      true,
    );
  });
}
