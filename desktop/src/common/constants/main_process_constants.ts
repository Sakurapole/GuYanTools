import { app } from 'electron';
import path from 'path';

const appPath = app.getPath('userData');

const PLUGIN_INSTALL_DIR = path.join(appPath, './plugins-new');

export {
  PLUGIN_INSTALL_DIR
};

