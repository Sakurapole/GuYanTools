import path from 'node:path';
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import fs from 'fs-extra';
import * as electronUpdater from 'electron-updater';
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import type { UpdateInfo, UpdaterAuthInfo } from '@/contracts/updater';

const { autoUpdater } = electronUpdater;

const GITHUB_OWNER = 'Sakurapole';
const GITHUB_REPO = 'GuYanTools';
const PRIVATE_GITHUB_RELEASES = true;
const RELEASE_PAGE_URL = 'https://github.com/Sakurapole/GuYanTools/releases/latest';
const SUPPORTED_PLATFORM: NodeJS.Platform = 'win32';
const INITIAL_DELAY_MS = 10_000;
const AUTH_FILE_NAME = 'updater-auth.json';

type SetupAutoUpdaterOptions = {
  getMainWindow: () => BrowserWindow | null;
  prepareForQuit: () => void;
};

let registered = false;
let state: UpdateInfo = createState({ status: 'idle' });
let storedToken: string | null = null;
let storedTokenLoaded = false;
let feedToken: string | null | undefined;

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

function getAuthFilePath() {
  return path.join(app.getPath('userData'), AUTH_FILE_NAME);
}

function getEnvironmentToken() {
  return process.env.GUYANTOOLS_GITHUB_TOKEN
    || process.env.GH_TOKEN
    || process.env.GITHUB_TOKEN
    || null;
}

async function loadStoredToken() {
  if (storedTokenLoaded) {
    return storedToken;
  }

  storedTokenLoaded = true;
  try {
    const payload = await fs.readJSON(getAuthFilePath()) as { encryptedToken?: string };
    if (payload.encryptedToken && safeStorage.isEncryptionAvailable()) {
      storedToken = safeStorage.decryptString(Buffer.from(payload.encryptedToken, 'base64'));
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn('[Updater] Failed to load stored GitHub token:', error);
    }
    storedToken = null;
  }

  return storedToken;
}

async function persistStoredToken(token: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统不支持安全保存 GitHub Token，可改用 GUYANTOOLS_GITHUB_TOKEN 环境变量。');
  }

  const encryptedToken = safeStorage.encryptString(token).toString('base64');
  await fs.ensureDir(app.getPath('userData'));
  await fs.writeJSON(getAuthFilePath(), { encryptedToken }, { spaces: 2 });
  storedToken = token;
  storedTokenLoaded = true;
}

async function clearStoredToken() {
  await fs.remove(getAuthFilePath());
  storedToken = null;
  storedTokenLoaded = true;
}

async function resolveUpdaterToken() {
  return getEnvironmentToken() || await loadStoredToken();
}

async function getAuthInfo(): Promise<UpdaterAuthInfo> {
  const environmentToken = getEnvironmentToken();
  const persistedToken = environmentToken ? null : await loadStoredToken();
  return {
    required: PRIVATE_GITHUB_RELEASES,
    hasToken: Boolean(environmentToken || persistedToken),
    source: environmentToken ? 'environment' : persistedToken ? 'stored' : 'none',
  };
}

async function configureFeedUrl() {
  const token = await resolveUpdaterToken();
  if (feedToken === token) {
    return token;
  }

  feedToken = token;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    private: PRIVATE_GITHUB_RELEASES,
    ...(token ? { token } : {}),
  });
  return token;
}

function setMissingPrivateRepoTokenState(getMainWindow: () => BrowserWindow | null) {
  setState(getMainWindow, {
    status: 'error',
    error: '当前更新源是私有 GitHub 仓库，请先在设置中配置有仓库读取权限的 GitHub Token。',
    progress: null,
  });
}

async function checkForUpdates(getMainWindow: () => BrowserWindow | null) {
  if (!state.supported) {
    setState(getMainWindow, { status: 'unsupported' });
    return state;
  }

  const token = await configureFeedUrl();
  if (PRIVATE_GITHUB_RELEASES && !token) {
    setMissingPrivateRepoTokenState(getMainWindow);
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

  const token = await configureFeedUrl();
  if (PRIVATE_GITHUB_RELEASES && !token) {
    setMissingPrivateRepoTokenState(getMainWindow);
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
  void configureFeedUrl().catch((error) => {
    console.warn('[Updater] Failed to configure feed URL:', error);
  });

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
  ipcMain.handle('updater:get-auth', async () => getAuthInfo());
  ipcMain.handle('updater:set-github-token', async (_event, token: string) => {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new Error('GitHub Token 不能为空');
    }
    await persistStoredToken(normalizedToken);
    await configureFeedUrl();
    return getAuthInfo();
  });
  ipcMain.handle('updater:clear-github-token', async () => {
    await clearStoredToken();
    await configureFeedUrl();
    return getAuthInfo();
  });
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
