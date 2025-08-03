import { app } from 'electron';
import path from 'path';

const appPath = app.getPath('userData');

const PLUGIN_INSTALL_DIR = path.join(appPath, './guyan-plugins');

export {
  PLUGIN_INSTALL_DIR
};

