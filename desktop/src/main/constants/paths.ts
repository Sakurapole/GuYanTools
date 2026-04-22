import { app } from 'electron';
import path from 'path';

const appPath = app.getPath('userData');

const PLUGIN_INSTALL_DIR = path.join(appPath, './guyan-plugins');
const APP_CONFIG_FILE = path.join(appPath, 'guyantools.config.json');
const CHROME_EXTENSIONS_DIR = path.join(appPath, 'chrome-extensions');

export {
  APP_CONFIG_FILE,
  CHROME_EXTENSIONS_DIR,
  PLUGIN_INSTALL_DIR
};
