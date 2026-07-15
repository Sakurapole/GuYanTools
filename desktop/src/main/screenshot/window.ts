import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import type { ScreenshotCaptureRequest, ScreenshotDisplayInfo, ScreenshotRect } from '@/contracts/screenshot';
import { waitForDevServer } from '@/main/windows/wait_for_dev_server';
import { preloadScreenCaptures, clearPreloadedScreens } from './capture';

let screenshotWindow: BrowserWindow | null = null;

export async function showScreenshotWindow(input: ScreenshotCaptureRequest = { mode: 'region', recognize: true }) {
  if (screenshotWindow && !screenshotWindow.isDestroyed()) {
    screenshotWindow.focus();
    return { accepted: true };
  }

  // 检测鼠标当前位置，确定目标显示器（只在鼠标所在屏幕上截图）
  const cursorPos = screen.getCursorScreenPoint();
  const targetDisplay = screen.getDisplayMatching({ x: cursorPos.x, y: cursorPos.y, width: 1, height: 1 });

  // 窗口只覆盖目标显示器，而非所有显示器的联合区域
  const bounds: ScreenshotRect = {
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
  };

  console.log('[screenshot] target display:', {
    id: targetDisplay.id,
    bounds: targetDisplay.bounds,
    scaleFactor: targetDisplay.scaleFactor,
  });
  console.log('[screenshot] window bounds:', bounds);

  // 不在构造函数中设置 x/y/width/height，避免 Windows DWM 透明窗口边框导致位置偏移
  screenshotWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const win = screenshotWindow;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 在窗口创建后用 setBounds 精确设置边界，比构造函数参数更可靠
  win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });

  win.once('closed', () => {
    if (screenshotWindow === win) {
      screenshotWindow = null;
    }
    clearPreloadedScreens();
  });

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('screenshot:capture-options', {
      request: input,
      displays: getDisplays(targetDisplay.id),
      bounds,
    });
  });

  // 并行执行：预截取屏幕 + 加载页面，减少用户等待时间
  const loadPage = async () => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/screenshot.html`;
      await waitForDevServer(url);
      await win.loadURL(url);
    } else {
      await win.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/screenshot.html`),
      );
    }
  };

  await Promise.all([
    preloadScreenCaptures(targetDisplay.id),
    loadPage(),
  ]);

  win.show();
  win.focus();
  win.moveTop();

  // 验证窗口实际位置，修正 DWM 透明窗口可能的位置偏移
  const [actualX, actualY] = win.getPosition();
  const [actualW, actualH] = win.getSize();
  console.log('[screenshot] actual window pos:', { x: actualX, y: actualY }, 'size:', { w: actualW, h: actualH });
  if (actualX !== bounds.x || actualY !== bounds.y || actualW !== bounds.width || actualH !== bounds.height) {
    console.log('[screenshot] position mismatch, correcting...');
    win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  }

  return { accepted: true };
}
export function closeScreenshotWindow() {
  if (screenshotWindow && !screenshotWindow.isDestroyed()) {
    screenshotWindow.close();
  }
  screenshotWindow = null;
}

export function isScreenshotWindow(window: BrowserWindow | null) {
  return Boolean(window && screenshotWindow === window && !window.isDestroyed());
}

export function registerScreenshotWindowEvents() {
  ipcMain.handle('screenshot-overlay:close', async () => {
    closeScreenshotWindow();
  });
}

function getDisplays(displayId?: number): ScreenshotDisplayInfo[] {
  return screen.getAllDisplays()
    .filter((d) => displayId == null || d.id === displayId)
    .map((display) => ({
      id: display.id,
      scaleFactor: display.scaleFactor,
      bounds: display.bounds,
      workArea: display.workArea,
    }));
}
