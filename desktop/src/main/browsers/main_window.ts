import { BrowserWindow, ipcMain } from "electron";
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

    // console.log(global.LOCAL_PLUGINS);
    // console.log(global.LOCAL_PLUGINS.plguins[0].name, global.LOCAL_PLUGINS.plguins[0].main);
    // const pluginWebContentsView = await global.LOCAL_PLUGINS.getPluginWebContentsView(global.LOCAL_PLUGINS.plguins[0], { width: 1366, height: 768, x: 0, y: 0 });
    // mainWindow.contentView.addChildView(pluginWebContentsView);

    mainWindow.on('close', (event) => {
      // 阻止窗口关闭
      event.preventDefault();
      // 最小化窗口而不是关闭
      mainWindow.hide();
    });

    // 监听窗口关闭事件
    mainWindow.on('closed', () => {
      mainWindow = null; // 清理引用
    });

    ipcMain.on('main-renderer-minimize', () => {
      // 最小化窗口时的处理逻辑
      mainWindow.minimize();
      console.log('Window minimized');
    });

    ipcMain.on('main-renderer-maximize', () => {
      // 切换窗口最大化状态
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      console.log('Window maximized');
    });

    ipcMain.on('main-renderer-close', () => {
      // 关闭窗口时的处理逻辑
      mainWindow.close();
      console.log('Window closed');
    });
  }

  const getWindow = () => mainWindow;

  return {
    init,
    getWindow
  }
}