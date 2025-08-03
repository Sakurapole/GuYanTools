import { app, BrowserWindow, ipcMain, protocol } from "electron";
import "../core/plugin_core/index";
import { main_window, splash_window } from "./browsers";

class App {
  public mainWindowCreator: {
    init: () => void;
    getWindow: () => BrowserWindow
  };
  private splashWindowCreator: {
    create: () => Promise<BrowserWindow>;
    close: () => void;
  };
  private systemPlugins: any;

  constructor() {
    protocol.registerSchemesAsPrivileged([
      { scheme: 'app', privileges: { secure: true, standard: true } }
    ]);
    this.mainWindowCreator = main_window();
    this.splashWindowCreator = splash_window();

    const singleLock = app.requestSingleInstanceLock();
    if (!singleLock) {
      app.quit()
    } else {
      this.beforeReady();
      this.onReady();
      this.onRunning();
      this.onQuit();
    }
  }

  // Lifecycle Funcs
  beforeReady() {
  }

  onReady() {
    const readyFunc = async () => {
      // 显示开屏窗口
      const splashWindow = await this.splashWindowCreator.create();

      // 监听开屏动画完成事件
      ipcMain.once('splash-animation-finished', () => {
        // 初始化主窗口
        this.mainWindowCreator.init();

        // 主窗口准备好后关闭开屏窗口
        const mainWindow = this.mainWindowCreator.getWindow();
        mainWindow.once('ready-to-show', () => {
          mainWindow.show();
          setTimeout(() => {
            this.splashWindowCreator.close();
          }, 500);
        });
      });
    }

    if (!app.isReady()) {
      app.on('ready', readyFunc);
    } else {
      readyFunc();
    }
  }

  onRunning() {

  }

  onQuit() {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('will-quit', () => {
      // globalShortcut.unregisterAll();
    });
  }
}

export default new App();