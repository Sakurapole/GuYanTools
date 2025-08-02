import { BrowserWindow } from "electron";
import path from 'path';

export default () => {
  let mainWindow: BrowserWindow;

  const init = () => {
    createWindow();
  }

  const createWindow = async () => {
    // Create the browser window.
    mainWindow = new BrowserWindow({
      width: 1366,
      height: 768,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
      frame: false,
      show: false, // 初始不显示，等待splash结束后显示
    });

    // and load the index.html of the app.
    console.log(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    console.log(FUNC_WINDOW_VITE_DEV_SERVER_URL, FUNC_WINDOW_VITE_NAME);
    if (FUNC_WINDOW_VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + '/index.html');
    } else {
      mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }

    // Open the DevTools.
    mainWindow.webContents.openDevTools();
  }

  const getWindow = () => mainWindow;

  return {
    init,
    getWindow
  }
}