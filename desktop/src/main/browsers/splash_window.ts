import { BrowserWindow } from "electron";
import path from 'path';

export default () => {
  let splashWindow: BrowserWindow | null = null;

  const create = async () => {
    // 创建开屏窗口
    splashWindow = new BrowserWindow({
      width: 500,
      height: 300,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    // 加载开屏页面
    if (SPLASH_WINDOW_VITE_DEV_SERVER_URL) {
      await splashWindow.loadURL(SPLASH_WINDOW_VITE_DEV_SERVER_URL + '/splash.html');
    } else {
      await splashWindow.loadFile(path.join(__dirname, `../renderer/${SPLASH_WINDOW_VITE_NAME}/splash.html`));
    }

    return splashWindow;
  };

  const close = () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  };

  return {
    create,
    close
  };
};