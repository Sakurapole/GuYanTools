import { app, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';

/**
 * Register IPC handlers for tray-related events.
 * Must be called after the main window is created.
 */
export function registerTrayIpcHandlers(getWindow: () => BrowserWindow | null) {
  // Renderer requests to quit the application
  ipcMain.on('tray:quit', () => {
    app.quit();
  });

  // Renderer requests to show (and focus) the main window
  ipcMain.on('tray:show-window', () => {
    const win = getWindow();
    if (win) {
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });
}
