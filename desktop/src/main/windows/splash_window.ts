import { BrowserWindow } from "electron";
import path from 'path';
import { waitForDevServer } from "./wait_for_dev_server";

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
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    splashWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      console.error('Splash window failed to load:', { errorCode, errorDescription, validatedURL });
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const splashUrl = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/splash.html`;
      await waitForDevServer(splashUrl);
      await splashWindow.loadURL(splashUrl);
    } else {
      await splashWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/splash.html`));
    }

    splashWindow.show();
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
