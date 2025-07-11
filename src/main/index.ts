import { app, BrowserWindow, protocol } from "electron";
import { main_window } from "./browsers";

class App {
  public mainWindowCreator: {
    init: () => void;
    getWindow: () => BrowserWindow
  };
  private systemPlugins: any;

  constructor() {
    protocol.registerSchemesAsPrivileged([
      { scheme: 'app', privileges: { secure: true, standard: true } }
    ]);
    this.mainWindowCreator = main_window();

    const singleLock = app.requestSingleInstanceLock();
    if (!singleLock) {
      app.quit()
    } else {
      this.beforeReady()
    }
  }

  // Lifecycle Funcs
  beforeReady() {

  }

  onReady() {

  }

  onRunning() {

  }

  onQuit() {

  }
}

export default new App();