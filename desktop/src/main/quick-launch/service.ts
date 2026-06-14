import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { clipboard, shell, type BrowserWindow } from 'electron';
import type {
  QuickLaunchAction,
  QuickLaunchExecuteOptions,
  QuickLaunchExecutionMode,
  QuickLaunchProviderId,
  QuickLaunchRefreshInput,
  QuickLaunchRefreshResponse,
  QuickLaunchResizeInput,
  QuickLaunchResult,
  QuickLaunchSearchInput,
  QuickLaunchSearchResponse,
} from '@/contracts/quick_launch';
import { appConfigManager } from '@/main/app-config/manager';
import { pluginHost } from '@/main/plugin-host';
import { quickLaunchHistoryStore } from './history_store';
import { internalRouteProvider } from './providers/internal_route_provider';
import { terminalProvider } from './providers/terminal_provider';
import { sshProvider } from './providers/ssh_provider';
import { ftpProvider } from './providers/ftp_provider';
import { todoProvider } from './providers/todo_provider';
import { knowledgeProvider } from './providers/knowledge_provider';
import { pluginProvider } from './providers/plugin_provider';
import { appProvider } from './providers/app_provider';
import { everythingFileProvider } from './providers/everything_file_provider';
import type { QuickLaunchProvider } from './types';
import { WORKSPACE_WINDOW_DEFINITIONS, type WorkspaceWindowKey } from '@/contracts/workspace_window';
import { workspaceWindowManager } from '@/main/workspace-window/manager';
import {
  getQuickLaunchGameModeStatus,
  resizeQuickLaunchWindow,
  setQuickLaunchGameMode,
} from './window';

interface MainWindowBridge {
  getWindow: () => BrowserWindow | null;
  showWindow: () => void;
  navigateToHash: (hashPath: string) => Promise<void>;
}

const DEFAULT_LIMIT = 12;

export class QuickLaunchService {
  private mainWindowBridge: MainWindowBridge | null = null;
  private readonly providers = new Map<QuickLaunchProviderId, QuickLaunchProvider>(
    [
      internalRouteProvider,
      terminalProvider,
      sshProvider,
      ftpProvider,
      todoProvider,
      knowledgeProvider,
      pluginProvider,
      appProvider,
      everythingFileProvider,
    ].map((provider) => [provider.id, provider]),
  );

  bindMainWindow(bridge: MainWindowBridge) {
    this.mainWindowBridge = bridge;
  }

  async search(input: QuickLaunchSearchInput): Promise<QuickLaunchSearchResponse> {
    const startedAt = Date.now();
    const config = await appConfigManager.getConfig();
    const feature = config.features.quickLaunch;
    const query = input.query ?? '';
    const sessionId = input.sessionId || `main-${startedAt}`;
    const limit = Math.max(1, Math.min(50, Math.round(input.limit ?? feature.maxResults ?? DEFAULT_LIMIT)));
    const requestedProviders = input.providers?.length
      ? input.providers
      : feature.enabledProviders;
    const searchedProviders = requestedProviders.filter((providerId) => (
      feature.enabledProviders.includes(providerId)
      && this.providers.has(providerId)
    ));

    if (!feature.enabled || searchedProviders.length === 0) {
      return {
        query,
        sessionId,
        results: [],
        searchedProviders,
        elapsedMs: Date.now() - startedAt,
        partial: false,
        errors: [],
      };
    }

    const errors: QuickLaunchSearchResponse['errors'] = [];
    const batches = await Promise.all(searchedProviders.map(async (providerId) => {
      const provider = this.providers.get(providerId);
      if (!provider) {
        return [];
      }

      try {
        return await provider.search({ query, limit });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ providerId, message });
        console.warn(`[quick-launch] Provider "${providerId}" failed:`, error);
        return [];
      }
    }));

    let decorated = batches.flat();
    try {
      decorated = await quickLaunchHistoryStore.decorate(decorated);
    } catch (error) {
      console.warn('[quick-launch] Failed to apply usage history:', error);
    }
    const results = decorated
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .slice(0, limit);

    return {
      query,
      sessionId,
      results,
      searchedProviders,
      elapsedMs: Date.now() - startedAt,
      partial: errors.length > 0,
      errors,
    };
  }

  async execute(result: QuickLaunchResult, options?: QuickLaunchExecuteOptions) {
    const mode = normalizeQuickLaunchExecutionMode(options?.mode);
    if (mode === 'copy' || mode === 'copy-path') {
      clipboard.writeText(copyQuickLaunchResultText(result, mode === 'copy-path'));
      return;
    }

    try {
      await quickLaunchHistoryStore.record(result);
    } catch (error) {
      console.warn('[quick-launch] Failed to record usage history:', error);
    }
    await this.executeAction(result.action, mode);
  }

  async refreshIndex(input?: QuickLaunchRefreshInput): Promise<QuickLaunchRefreshResponse> {
    const startedAt = Date.now();
    const config = await appConfigManager.getConfig();
    const enabledProviders = input?.providers?.length
      ? input.providers.filter((providerId) => config.features.quickLaunch.enabledProviders.includes(providerId))
      : config.features.quickLaunch.enabledProviders;

    const refreshedProviders = enabledProviders.filter((providerId) => this.providers.has(providerId));
    await Promise.all(refreshedProviders.map(async (providerId) => {
      const provider = this.providers.get(providerId);
      await provider?.refresh?.();
    }));

    return {
      refreshedProviders,
      elapsedMs: Date.now() - startedAt,
    };
  }

  setGameMode(enabled: boolean) {
    return setQuickLaunchGameMode(enabled);
  }

  getGameModeStatus() {
    return getQuickLaunchGameModeStatus();
  }

  resizeWindow(input: QuickLaunchResizeInput) {
    resizeQuickLaunchWindow(input);
  }

  private async executeAction(action: QuickLaunchAction, mode: QuickLaunchExecutionMode = 'default') {
    if (mode === 'open-detached-window') {
      const target = workspaceWindowTargetFromAction(action, () => this.nextRequestId());
      if (!target) {
        throw new Error('当前结果不支持独立窗口打开。');
      }
      await workspaceWindowManager.openDetached(target.key, { routeOverride: target.route });
      return;
    }

    if (mode === 'open-containing-folder') {
      const targetPath = extractQuickLaunchPath(action);
      if (!targetPath) {
        throw new Error('当前结果不支持打开所在位置。');
      }
      shell.showItemInFolder(targetPath);
      return;
    }

    if (mode === 'run-as-admin') {
      const targetPath = extractQuickLaunchPath(action);
      if (!targetPath) {
        throw new Error('当前结果不支持以管理员身份启动。');
      }
      await this.runPathAsAdmin(targetPath);
      return;
    }

    switch (action.type) {
      case 'open-route':
        await this.openMainRoute(action.route);
        return;
      case 'open-terminal-profile':
        await this.openMainRoute(`/terminal?openTerminalRequestId=${this.nextRequestId()}&openLocalProfileId=${encodeURIComponent(action.profileId)}`);
        return;
      case 'open-ssh-profile':
        await this.openMainRoute(`/terminal?openTerminalRequestId=${this.nextRequestId()}&connectSshProfileId=${encodeURIComponent(action.profileId)}`);
        return;
      case 'open-ftp-profile':
        await this.openMainRoute(`/ftp?openFtpRequestId=${this.nextRequestId()}&openFtpProfileId=${encodeURIComponent(action.profileId)}`);
        return;
      case 'open-todo':
        await this.openMainRoute(`/todo?openTodoRequestId=${this.nextRequestId()}&todoId=${encodeURIComponent(action.todoId)}`);
        return;
      case 'open-knowledge-result':
        await this.openMainRoute(`/knowledge?openKnowledgeRequestId=${this.nextRequestId()}&nodeId=${encodeURIComponent(action.nodeId ?? action.sourceId)}`);
        return;
      case 'open-plugin-page':
        await this.openMainRoute(action.routePath || `/plugins/${action.pluginId}/${action.pageId}`);
        return;
      case 'execute-plugin-command':
        await pluginHost.getHostServices().commands.execute(action.commandId, action.payload);
        return;
      case 'open-path':
        await this.openPath(action.path);
        return;
      case 'open-windows-app':
        await this.launchWindowsApp(action.appUserModelId);
        return;
      case 'show-path-in-folder':
        shell.showItemInFolder(action.path);
        return;
      case 'open-external':
        await shell.openExternal(action.url);
        return;
      case 'copy-text':
        clipboard.writeText(action.text);
        return;
      default:
        assertNever(action);
    }
  }

  private async openMainRoute(route: string) {
    if (!this.mainWindowBridge) {
      return;
    }

    const window = this.mainWindowBridge.getWindow();
    if (window && !window.isDestroyed()) {
      this.mainWindowBridge.showWindow();
    }
    await this.mainWindowBridge.navigateToHash(route);
  }

  private nextRequestId() {
    return randomUUID();
  }

  private async openPath(path: string) {
    const message = await shell.openPath(path);
    if (message) {
      throw new Error(message);
    }
  }

  private async runPathAsAdmin(targetPath: string) {
    if (process.platform !== 'win32') {
      throw new Error('当前平台不支持以管理员身份启动。');
    }

    const stat = await fs.stat(targetPath).catch(() => undefined);
    if (stat?.isDirectory()) {
      await this.openPath(targetPath);
      return;
    }

    await runWindowsPathAsAdmin(targetPath, stat ? path.dirname(targetPath) : '');
  }

  private async launchWindowsApp(appUserModelId: string) {
    if (process.platform !== 'win32') {
      throw new Error('当前平台不支持启动 Windows 开始菜单应用。');
    }

    await launchWindowsShellTarget(`shell:AppsFolder\\${appUserModelId}`);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported quick launch action: ${JSON.stringify(value)}`);
}

function normalizeQuickLaunchExecutionMode(value: QuickLaunchExecuteOptions['mode']): QuickLaunchExecutionMode {
  switch (value) {
    case 'open-detached-window':
    case 'open-containing-folder':
    case 'run-as-admin':
    case 'copy':
    case 'copy-path':
      return value;
    default:
      return 'default';
  }
}

function workspaceWindowKeyFromAction(action: QuickLaunchAction): WorkspaceWindowKey | null {
  if (action.type !== 'open-route') {
    return null;
  }

  const routePath = action.route.split('?')[0];
  const definition = Object.values(WORKSPACE_WINDOW_DEFINITIONS).find(item => item.route === routePath);
  return definition?.key ?? null;
}

function workspaceWindowTargetFromAction(
  action: QuickLaunchAction,
  nextRequestId: () => string,
): { key: WorkspaceWindowKey; route: string } | null {
  const key = workspaceWindowKeyFromAction(action);
  if (key && action.type === 'open-route') {
    return { key, route: action.route };
  }

  if (action.type === 'open-terminal-profile') {
    return {
      key: 'terminal',
      route: `/terminal?openTerminalRequestId=${nextRequestId()}&openLocalProfileId=${encodeURIComponent(action.profileId)}`,
    };
  }

  if (action.type === 'open-ssh-profile') {
    return {
      key: 'terminal',
      route: `/terminal?openTerminalRequestId=${nextRequestId()}&connectSshProfileId=${encodeURIComponent(action.profileId)}`,
    };
  }

  if (action.type === 'open-ftp-profile') {
    return {
      key: 'ftp',
      route: `/ftp?openFtpRequestId=${nextRequestId()}&openFtpProfileId=${encodeURIComponent(action.profileId)}`,
    };
  }

  if (action.type === 'open-todo') {
    return {
      key: 'todo',
      route: `/todo?openTodoRequestId=${nextRequestId()}&todoId=${encodeURIComponent(action.todoId)}`,
    };
  }

  if (action.type === 'open-knowledge-result') {
    return {
      key: 'knowledge',
      route: `/knowledge?openKnowledgeRequestId=${nextRequestId()}&nodeId=${encodeURIComponent(action.nodeId ?? action.sourceId)}`,
    };
  }

  return null;
}

function copyQuickLaunchResultText(result: QuickLaunchResult, pathOnly: boolean) {
  const targetPath = extractQuickLaunchPath(result.action);
  if (pathOnly) {
    if (!targetPath) {
      throw new Error('当前结果没有可复制的路径。');
    }
    return targetPath;
  }

  if (result.action.type === 'copy-text') {
    return result.action.text;
  }
  if (targetPath) {
    return targetPath;
  }
  if (result.action.type === 'open-external') {
    return result.action.url;
  }
  if (result.action.type === 'open-windows-app') {
    return result.action.appUserModelId;
  }
  return result.detail || result.subtitle || result.title;
}

function extractQuickLaunchPath(action: QuickLaunchAction) {
  switch (action.type) {
    case 'open-path':
    case 'show-path-in-folder':
      return action.path;
    default:
      return '';
  }
}

function launchWindowsShellTarget(target: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('explorer.exe', [target], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function runWindowsPathAsAdmin(targetPath: string, workingDirectory: string) {
  const command = [
    '$ErrorActionPreference = "Stop";',
    '$target = $env:QUICK_LAUNCH_TARGET;',
    '$workingDirectory = $env:QUICK_LAUNCH_WORKING_DIRECTORY;',
    'if ([string]::IsNullOrWhiteSpace($workingDirectory)) {',
    '  Start-Process -FilePath $target -Verb RunAs;',
    '} else {',
    '  Start-Process -FilePath $target -WorkingDirectory $workingDirectory -Verb RunAs;',
    '}',
  ].join(' ');

  return new Promise<void>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      {
        windowsHide: true,
        env: {
          ...process.env,
          QUICK_LAUNCH_TARGET: targetPath,
          QUICK_LAUNCH_WORKING_DIRECTORY: workingDirectory,
        },
      },
      (error, _stdout, stderr) => {
        if (error) {
          const message = typeof stderr === 'string' && stderr.trim()
            ? stderr.trim()
            : error.message;
          reject(new Error(message));
          return;
        }
        resolve();
      },
    );
  });
}

export const quickLaunchService = new QuickLaunchService();
