import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as electronUpdater from 'electron-updater';
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import type { UpdateInfo } from '@/contracts/updater';

const { autoUpdater } = electronUpdater;

const RELEASE_PAGE_URL = 'https://github.com/Sakurapole/GuYanTools/releases/latest';
const SUPPORTED_PLATFORM: NodeJS.Platform = 'win32';
const INITIAL_DELAY_MS = 10_000;

type SetupAutoUpdaterOptions = {
  getMainWindow: () => BrowserWindow | null;
  prepareForQuit: () => void;
};

let registered = false;
let state: UpdateInfo = createState({ status: 'idle' });

function createState(partial: Partial<UpdateInfo>): UpdateInfo {
  return {
    status: 'idle',
    supported: app.isPackaged && process.platform === SUPPORTED_PLATFORM,
    platform: process.platform,
    currentVersion: app.getVersion(),
    latestVersion: null,
    releaseName: null,
    releaseNotes: null,
    releaseDate: null,
    manualUrl: RELEASE_PAGE_URL,
    progress: null,
    error: null,
    ...partial,
  };
}

function serializeReleaseNotes(releaseNotes: ElectronUpdateInfo['releaseNotes']): string | null {
  if (!releaseNotes) {
    return null;
  }

  if (typeof releaseNotes === 'string') {
    return releaseNotes;
  }

  return releaseNotes
    .map((item) => {
      const title = item.version ? `v${item.version}` : 'Release';
      return `${title}\n${item.note}`;
    })
    .join('\n\n');
}

function applyUpdateInfo(info: ElectronUpdateInfo | UpdateDownloadedEvent): Partial<UpdateInfo> {
  return {
    latestVersion: info.version ?? null,
    releaseName: info.releaseName ?? null,
    releaseNotes: serializeReleaseNotes(info.releaseNotes),
    releaseDate: info.releaseDate ?? null,
  };
}

function emitUpdate(getMainWindow: () => BrowserWindow | null) {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('updater:event', state);
}

function setState(getMainWindow: () => BrowserWindow | null, partial: Partial<UpdateInfo>) {
  state = createState({
    ...state,
    ...partial,
  });
  emitUpdate(getMainWindow);
}

async function checkForUpdates(getMainWindow: () => BrowserWindow | null) {
  if (!state.supported) {
    setState(getMainWindow, { status: 'unsupported' });
    return state;
  }

  await autoUpdater.checkForUpdates();
  return state;
}

async function downloadUpdate(getMainWindow: () => BrowserWindow | null) {
  if (!state.supported) {
    setState(getMainWindow, { status: 'unsupported' });
    return state;
  }

  await autoUpdater.downloadUpdate();
  return state;
}

export function setupAutoUpdater({ getMainWindow, prepareForQuit }: SetupAutoUpdaterOptions) {
  if (registered) {
    return;
  }

  registered = true;
  state = createState({
    status: app.isPackaged && process.platform === SUPPORTED_PLATFORM ? 'idle' : 'unsupported',
  });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    setState(getMainWindow, {
      status: 'checking',
      error: null,
      progress: null,
    });
  });

  autoUpdater.on('update-available', (info) => {
    setState(getMainWindow, {
      status: 'available',
      error: null,
      progress: null,
      ...applyUpdateInfo(info),
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    setState(getMainWindow, {
      status: 'not-available',
      error: null,
      progress: null,
      ...applyUpdateInfo(info),
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState(getMainWindow, {
      status: 'downloading',
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      },
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setState(getMainWindow, {
      status: 'downloaded',
      progress: null,
      error: null,
      ...applyUpdateInfo(info),
    });
  });

  autoUpdater.on('error', (error) => {
    setState(getMainWindow, {
      status: 'error',
      error: error.message,
      progress: null,
    });
  });

  ipcMain.handle('updater:get-status', async () => state);
  ipcMain.handle('updater:check', async () => checkForUpdates(getMainWindow));
  ipcMain.handle('updater:download', async () => downloadUpdate(getMainWindow));
  ipcMain.handle('updater:install', async () => {
    if (state.status !== 'downloaded') {
      throw new Error('当前没有可安装的更新');
    }

    prepareForQuit();
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
  ipcMain.handle('updater:open-release-page', async () => {
    await shell.openExternal(RELEASE_PAGE_URL);
  });

  if (!state.supported) {
    return;
  }

  setTimeout(() => {
    void checkForUpdates(getMainWindow).catch((error: Error) => {
      setState(getMainWindow, {
        status: 'error',
        error: error.message,
      });
    });
  }, INITIAL_DELAY_MS);
}
