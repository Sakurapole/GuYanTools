import { app } from 'electron';
import os from 'node:os';
import path from 'path';

// Electron exposes `app` before ready in production. Vitest imports a few
// main-process modules without Electron, so keep those imports side-effect
// free and use an isolated temporary root for that environment.
const appPath = app?.getPath?.('userData')
  ?? process.env.GUYANTOOLS_USER_DATA
  ?? path.join(os.tmpdir(), 'guyantools-test-data');

const PLUGIN_INSTALL_DIR = path.join(appPath, './guyantools-plugins');
const APP_CONFIG_FILE = path.join(appPath, 'guyantools.config.json');
const CHROME_EXTENSIONS_DIR = path.join(appPath, 'chrome-extensions');
const ANDROID_TOOLCHAIN_DOWNLOAD_DIR = path.join(appPath, 'android-tools');

export {
  APP_CONFIG_FILE,
  ANDROID_TOOLCHAIN_DOWNLOAD_DIR,
  CHROME_EXTENSIONS_DIR,
  PLUGIN_INSTALL_DIR
};
