import { app, BrowserWindow, ipcMain, protocol } from "electron";
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { dbManager } from "../core/database";
import { registerAiIpcHandlers } from "./ai/ipc";
import { registerAppConfigIpcHandlers } from "./app-config/ipc";
import { appConfigManager } from "./app-config/manager";
import { registerHomeLayoutIpcHandlers } from "./home-layout/ipc";
import { registerHomeProfileIpcHandlers } from "./home-profile/ipc";
import { registerHomeWorkspaceIpcHandlers } from "./home-workspace/ipc";
import { registerKnowledgeIpcHandlers } from "./knowledge/ipc";
import {
  captureClipboardToQuickNoteWindow,
  registerQuickNoteWindowHandlers,
  toggleQuickNoteWindow,
} from "./knowledge/quick_note_window";
import { registerMediaIpcHandlers } from "./media/ipc";
import { registerMultiDeviceClipboardIpcHandlers } from "./multi-device-clipboard/ipc";
import { multiDeviceClipboardService } from "./multi-device-clipboard/service";
import { registerMultiDeviceClipboardWindowHandlers, toggleMultiDeviceClipboardWindow } from "./multi-device-clipboard/window";
import { registerNotificationIpcHandlers } from "./notification/ipc";
import { registerShellIpcHandlers } from "./shell/ipc";
import { registerShortcutIpcHandlers } from "./shortcuts/ipc";
import { shortcutService } from "./shortcuts/service";
import { registerSyncIpcHandlers } from "./sync/ipc";
import { syncScheduler } from "./sync/sync_scheduler";
import { registerQuickLaunchIpcHandlers } from "./quick-launch/ipc";
import { quickLaunchService } from "./quick-launch/service";
import { preloadQuickLaunchWindow, toggleQuickLaunchWindow } from "./quick-launch/window";
import { registerTerminalIpcHandlers } from "./terminal/ipc";
import { registerTodoIpcHandlers, initializeTodoData } from "./todo/ipc";
import { startTodoScheduler, stopTodoScheduler } from "./todo/scheduler";
import { registerPluginHostIpcHandlers } from "./plugin-host/ipc";
import { pluginHost } from "./plugin-host";
import { registerWebviewIpcHandlers } from "./webview/ipc";
import { webViewManager } from "./webview/manager";
import { registerWebScriptBridge } from "./webview/script-bridge";
import { registerWorkspaceWindowIpcHandlers } from "./workspace-window/ipc";
import { workspaceWindowManager } from "./workspace-window/manager";
import { registerSshIpcHandlers } from "./ssh/ipc";
import { sshHost } from "./ssh/host";
import { registerFtpIpcHandlers } from "./ftp/ipc";
import { ftpHost } from "./ftp/host";
import { handleFtpCliArgs, resolveCliExitCode, type FtpCliInvocationResult } from "./ftp/integration";
import { ftpSchedulerService } from "./ftp/scheduler";
import { main_window, splash_window } from "./windows";
import { initializeTray, destroyTray } from "./tray";
import { registerTrayIpcHandlers } from "./tray/ipc";
import { registerTrayMenuWindowHandlers } from "./tray/tray_menu_window";
import { setupAutoUpdater } from "./updater";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const MULTI_DEVICE_CLIPBOARD_ASSET_HOST = 'multi-device-clipboard-assets';
const KNOWLEDGE_ASSET_HOST = 'knowledge-assets';

type KnowledgeAssetProtocolRecord = {
  storagePath: string;
  mimeType?: string;
};

type FtpCliRelayAdditionalData = {
  ftpCliResponsePath?: string;
};

type FtpCliRelayResponse = {
  exitCode: number;
  stdoutLines?: string[];
  stderrLines?: string[];
};

class App {
  public mainWindowCreator: {
    init: () => Promise<void>;
    getWindow: () => BrowserWindow;
    showWindow: () => void;
    navigateToHash: (hashPath: string) => Promise<void>;
    prepareForQuit: () => void;
  };
  private splashWindowCreator: {
    create: () => Promise<BrowserWindow>;
    close: () => void;
  };
  private systemPlugins: any;
  private readonly cliRelayResponsePath = hasFtpCliArgs(process.argv)
    ? createFtpCliRelayResponsePath()
    : undefined;

  constructor() {
    protocol.registerSchemesAsPrivileged([
      { scheme: 'app', privileges: { secure: true, standard: true } }
    ]);
    this.mainWindowCreator = main_window();
    this.splashWindowCreator = splash_window();
    registerAiIpcHandlers();
    registerAppConfigIpcHandlers();
    registerHomeProfileIpcHandlers();
    registerHomeLayoutIpcHandlers();
    registerHomeWorkspaceIpcHandlers();
    registerKnowledgeIpcHandlers();
    registerQuickNoteWindowHandlers();
    registerMediaIpcHandlers();
    registerMultiDeviceClipboardIpcHandlers();
    registerMultiDeviceClipboardWindowHandlers();
    registerNotificationIpcHandlers(() => {
      try {
        return this.mainWindowCreator.getWindow();
      } catch {
        return null;
      }
    });
    registerShellIpcHandlers();
    registerShortcutIpcHandlers();
    registerSyncIpcHandlers();
    registerQuickLaunchIpcHandlers();
    registerTerminalIpcHandlers();
    registerTodoIpcHandlers();
    registerSshIpcHandlers();
    registerFtpIpcHandlers();
    registerTrayIpcHandlers(() => {
      try {
        return this.mainWindowCreator.getWindow();
      } catch {
        return null;
      }
    });
    registerTrayMenuWindowHandlers();
    registerPluginHostIpcHandlers(() => {
      try {
        return this.mainWindowCreator.getWindow();
      } catch {
        return null;
      }
    });
    registerWebviewIpcHandlers(() => {
      return this.mainWindowCreator.getWindow();
    });
    registerWorkspaceWindowIpcHandlers();
    registerWebScriptBridge();

    const singleLock = app.requestSingleInstanceLock(
      this.cliRelayResponsePath ? { ftpCliResponsePath: this.cliRelayResponsePath } : undefined,
    );
    if (!singleLock) {
      if (this.cliRelayResponsePath) {
        void this.awaitCliRelayAndExit(this.cliRelayResponsePath);
        return;
      }
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
    // 禁用自动化检测标志，避免 Google 等第三方服务识别为嵌入式浏览器
    app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
  }

  onReady() {
    const readyFunc = async () => {
      try {
        this.registerAppProtocolHandlers();
        if (!dbManager.isInitialized()) {
          await dbManager.initialize();
        }
        await appConfigManager.initialize();
        quickLaunchService.bindMainWindow({
          getWindow: () => {
            try {
              return this.mainWindowCreator.getWindow();
            } catch {
              return null;
            }
          },
          showWindow: () => {
            try {
              this.mainWindowCreator.showWindow();
            } catch {
              // main window may still be loading during early global shortcut use
            }
          },
          navigateToHash: async (hashPath: string) => {
            try {
              await this.mainWindowCreator.navigateToHash(hashPath);
            } catch {
              // main window may still be loading during early global shortcut use
            }
          },
        });
        workspaceWindowManager.bindMainWindow({
          getWindow: () => {
            try {
              return this.mainWindowCreator.getWindow();
            } catch {
              return null;
            }
          },
          showWindow: () => {
            try {
              this.mainWindowCreator.showWindow();
            } catch {
              // main window may not exist during early shortcut use
            }
          },
          navigateToHash: async (hashPath: string) => {
            try {
              await this.mainWindowCreator.navigateToHash(hashPath);
            } catch {
              // main window may not exist during early shortcut use
            }
          },
        });
        // 数据库就绪后，初始化 Todo 系统数据（确保 default-tasks 列表存在）
        await initializeTodoData();
        // 初始化 SSH 宿主（依赖数据库）
        sshHost.initialize();
        ftpHost.initialize();
        await ftpSchedulerService.initialize();
        await pluginHost.initialize();
        await multiDeviceClipboardService.initialize();
        await syncScheduler.start();
        await shortcutService.initialize(
          () => {
            try {
              return this.mainWindowCreator.getWindow();
            } catch {
              return null;
            }
          },
          toggleMultiDeviceClipboardWindow,
          toggleQuickNoteWindow,
          captureClipboardToQuickNoteWindow,
          toggleQuickLaunchWindow,
          (key) => {
            void workspaceWindowManager.openDetached(key);
          },
        );
        void preloadQuickLaunchWindow();

        // ─── 初始化共享 webview session ───
        // 集中管理 UA 清洗、请求头改写等，避免 Google 等第三方服务拦截嵌入式 WebView
        await webViewManager.initSharedSession();

        setupAutoUpdater({
          getMainWindow: () => {
            try {
              return this.mainWindowCreator.getWindow();
            } catch {
              return null;
            }
          },
          prepareForQuit: () => {
            this.mainWindowCreator.prepareForQuit();
          },
        });

        // 显示开屏窗口
        await this.splashWindowCreator.create();

        // 主窗口在 splash 动画期间后台加载，避免切换时卡住
        const mainWindowInitPromise = this.mainWindowCreator.init();
        const splashDonePromise = new Promise<void>((resolve) => {
          ipcMain.once('splash-animation-finished', () => resolve());
        });

        try {
          await Promise.race([splashDonePromise, delay(4000)]);
          await mainWindowInitPromise;

          const mainWindow = this.mainWindowCreator.getWindow();
          pluginHost.bindMainWindow(mainWindow);
          if (!mainWindow.isVisible()) {
            mainWindow.show();
          }

          // Initialize system tray after main window is ready
          initializeTray(() => {
            try {
              return this.mainWindowCreator.getWindow();
            } catch {
              return null;
            }
          });

          setTimeout(() => {
            this.splashWindowCreator.close();
          }, 300);

          workspaceWindowManager.prewarmDetachedWindows();

          // Start Todo reminder scheduler
          startTodoScheduler();
          await this.processLaunchArgs(process.argv, { printOutput: true });
        } catch (error) {
          console.error('Failed to initialize main window after splash:', error);
          this.splashWindowCreator.close();
          app.quit();
        }
      } catch (error) {
        console.error('Failed during app ready sequence:', error);
        this.splashWindowCreator.close();
        app.quit();
      }
    }

    if (!app.isReady()) {
      app.on('ready', readyFunc);
    } else {
      readyFunc();
    }
  }

  onRunning() {
    app.on('second-instance', async (_event, argv, _workingDirectory, additionalData: FtpCliRelayAdditionalData) => {
      try {
        await this.processLaunchArgs(argv, {
          responsePath: additionalData?.ftpCliResponsePath,
          printOutput: false,
        });
      } catch (error) {
        console.error('Failed to process second-instance FTP args:', error);
      }
      try {
        this.mainWindowCreator.showWindow();
      } catch {
        // ignore
      }
    });
  }

  onQuit() {
    // Do not quit when all windows are closed — app lives in the system tray
    app.on('window-all-closed', () => {
      // macOS: standard behavior, do nothing here
      // Windows/Linux: keep process alive (tray icon remains)
    });

    app.on('will-quit', () => {
      stopTodoScheduler();
      syncScheduler.stop();
      ftpSchedulerService.dispose();
      void multiDeviceClipboardService.dispose();
      shortcutService.dispose();
      destroyTray();
    });
  }

  private registerAppProtocolHandlers() {
    if (protocol.isProtocolHandled('app')) {
      return;
    }

    protocol.handle('app', async (request) => {
      const url = new URL(request.url);
      if (url.hostname === MULTI_DEVICE_CLIPBOARD_ASSET_HOST) {
        const assetRoot = path.resolve(app.getPath('userData'), 'multi-device-clipboard-assets');
        const requestedPath = decodeURIComponent(url.pathname.slice(1));
        return serveLocalAsset(requestedPath, assetRoot);
      }

      if (url.hostname === KNOWLEDGE_ASSET_HOST) {
        return this.handleKnowledgeAssetProtocolRequest(url);
      }

      return new Response('Not found', { status: 404 });
    });
  }

  private async handleKnowledgeAssetProtocolRequest(url: URL) {
    const parts = url.pathname
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    const mode = parts[0];
    const assetRoot = path.resolve(app.getPath('userData'), 'knowledge-assets');

    if (mode === 'path' && parts[1]) {
      return serveLocalAsset(parts[1], assetRoot);
    }

    if (mode !== 'id' || !parts[1]) {
      return new Response('Bad request', { status: 400 });
    }

    if (!dbManager.isInitialized()) {
      return new Response('Database is not ready', { status: 503 });
    }

    try {
      const database = dbManager.getDatabase() as unknown as {
        getKnowledgeAsset: (assetId: string) => Promise<KnowledgeAssetProtocolRecord>;
      };
      const asset = await database.getKnowledgeAsset(parts[1]);
      return serveLocalAsset(asset.storagePath, assetRoot, asset.mimeType);
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  private async processLaunchArgs(
    argv: string[],
    options: {
      responsePath?: string;
      printOutput?: boolean;
    } = {},
  ) {
    try {
      const result = await handleFtpCliArgs(argv);
      if (!result) return null;
      this.emitCliOutput(result, options.printOutput !== false);
      if (options.responsePath) {
        await writeFtpCliRelayResponse(options.responsePath, {
          exitCode: result.exitCode ?? 0,
          stdoutLines: result.stdoutLines,
          stderrLines: result.stderrLines,
        });
      } else if (typeof result.exitCode === 'number') {
        process.exitCode = result.exitCode;
      }
      this.mainWindowCreator.showWindow();
      if (result.route) {
        await this.mainWindowCreator.navigateToHash(result.route);
      }
      return result;
    } catch (error) {
      const exitCode = resolveCliExitCode(error);
      const stderrLines = [error instanceof Error ? error.message : String(error)];
      if (options.printOutput !== false) {
        for (const line of stderrLines) {
          console.error(line);
        }
      }
      if (options.responsePath) {
        await writeFtpCliRelayResponse(options.responsePath, {
          exitCode,
          stderrLines,
        });
      } else {
        process.exitCode = exitCode;
      }
      return null;
    }
  }

  private emitCliOutput(result: FtpCliInvocationResult, printOutput: boolean) {
    if (!printOutput) return;
    for (const line of result.stdoutLines ?? []) {
      console.log(line);
    }
    for (const line of result.stderrLines ?? []) {
      console.error(line);
    }
    if (!result.stdoutLines?.length && result.summary) {
      console.log(result.summary);
    }
  }

  private async awaitCliRelayAndExit(responsePath: string) {
    try {
      const response = await waitForFtpCliRelayResponse(responsePath, 20_000);
      for (const line of response.stdoutLines ?? []) {
        console.log(line);
      }
      for (const line of response.stderrLines ?? []) {
        console.error(line);
      }
      app.exit(response.exitCode);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      app.exit(3);
    }
  }
}

function hasFtpCliArgs(argv: string[]) {
  return argv.includes('ftp');
}

function createFtpCliRelayResponsePath() {
  return path.join(os.tmpdir(), 'guyantools-cli', `${randomUUID()}.json`);
}

async function writeFtpCliRelayResponse(responsePath: string, response: FtpCliRelayResponse) {
  await fs.mkdir(path.dirname(responsePath), { recursive: true });
  await fs.writeFile(responsePath, JSON.stringify(response, null, 2), 'utf8');
}

async function waitForFtpCliRelayResponse(responsePath: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(responsePath, 'utf8');
      const parsed = JSON.parse(raw) as FtpCliRelayResponse;
      await fs.rm(responsePath, { force: true });
      return parsed;
    } catch {
      await delay(100);
    }
  }
  throw new Error('等待主实例返回 FTP CLI 结果超时');
}

function isPathInsideRoot(filePath: string, rootPath: string) {
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(rootPath);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`);
}

async function serveLocalAsset(filePath: string, rootPath: string, contentType?: string) {
  const resolvedPath = path.resolve(filePath);
  if (!isPathInsideRoot(resolvedPath, rootPath)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const bytes = await fs.readFile(resolvedPath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentType || guessLocalAssetMimeType(resolvedPath),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function guessLocalAssetMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.md' || ext === '.markdown') return 'text/markdown; charset=utf-8';
  if (ext === '.txt' || ext === '.csv' || ext === '.log') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

export default new App();
