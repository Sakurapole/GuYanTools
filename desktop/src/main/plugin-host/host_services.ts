import { BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import { dbManager } from '../../core/database';
import type { PluginCapabilitySummary } from '@/contracts/plugin_host';
import type { NotificationPayload } from '@/contracts/notification';
import { showNotification } from '../windows';
import { NetworkService } from './services/network_service';
import { FileGrantService } from './services/file_grant_service';
import { DownloadsService } from './services/downloads_service';
import { MediaService } from './services/media_service';
import { SecretService } from './services/secret_service';
import { redactPluginLogMeta, validatePluginCommand } from './security_guards';
import { AndroidHostService } from './android_service';

class WorkspaceService {
  getCurrentWorkspace() {
    return {
      workspaceKey: 'default',
      name: 'Default Workspace',
    };
  }
}

class DataService {
  getCapabilities(): PluginCapabilitySummary['data'] {
    return [
      'user.read',
      'project.read',
      'project.write',
      'settings.read',
      'settings.write',
      'homeLayout.read',
      'homeLayout.write',
    ];
  }

  getDatabase() {
    return dbManager.getDatabase();
  }
}

class StorageService {
  async getPluginState(pluginId: string, key: string): Promise<unknown> {
    const db = dbManager.getDatabase();
    const raw = await db.getPluginStateValue(pluginId, key);
    if (raw === null || raw === undefined) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async setPluginState(pluginId: string, key: string, value: unknown): Promise<void> {
    const db = dbManager.getDatabase();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await db.setPluginStateValue(pluginId, key, serialized);
  }

  async deletePluginState(pluginId: string, key: string): Promise<void> {
    const db = dbManager.getDatabase();
    await db.deletePluginStateValue(pluginId, key);
  }

  getCapabilities(): PluginCapabilitySummary['storage'] {
    return ['plugin.self.get', 'plugin.self.set'];
  }
}

class NavigationService {
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  openRoute(route: string) {
    this.mainWindow?.webContents.send('plugin-host:navigate', route);
  }

  getCapabilities(): PluginCapabilitySummary['navigation'] {
    return ['route.open'];
  }
}

class CommandService {
  async executeHost(commandId: string, payload?: unknown) {
    console.log('[host-command]', commandId, redactPluginLogMeta(payload));
    return { accepted: true };
  }

  async execute(pluginId: string, commandId: string, payload?: unknown) {
    validatePluginCommand(pluginId, commandId);
    console.log('[plugin-command]', pluginId, commandId, redactPluginLogMeta(payload));
    return { accepted: true };
  }

  getCapabilities(): PluginCapabilitySummary['commands'] {
    return ['execute'];
  }
}

class UiService {
  getCapabilities(): PluginCapabilitySummary['ui'] {
    return ['pages', 'widgets', 'menus', 'shortcuts'];
  }
}

class SystemService {
  async pickLocalPluginPath(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: '选择插件目录或清单文件',
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'Plugin manifest', extensions: ['json'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }

  async openExternal(url: string) {
    await shell.openExternal(url);
  }

  async showNotification(payload: NotificationPayload): Promise<void> {
    await showNotification(payload);
  }

  getCapabilities(): PluginCapabilitySummary['system'] {
    return ['dialog.open', 'external.open', 'notifications', 'clipboard', 'shortcuts'];
  }
}

class ObservabilityService {
  info(pluginId: string, message: string, meta?: unknown) {
    console.log('[plugin-info]', pluginId, message, redactPluginLogMeta(meta ?? ''));
  }

  error(pluginId: string, message: string, meta?: unknown) {
    console.error('[plugin-error]', pluginId, message, redactPluginLogMeta(meta ?? ''));
  }

  getCapabilities(): PluginCapabilitySummary['observability'] {
    return ['logger.info', 'logger.error'];
  }
}

export class HostServiceRegistry {
  readonly workspace = new WorkspaceService();
  readonly data = new DataService();
  readonly storage: StorageService;
  readonly navigation = new NavigationService();
  readonly commands = new CommandService();
  readonly ui = new UiService();
  readonly system = new SystemService();
  readonly observability = new ObservabilityService();
  readonly files = new FileGrantService();
  readonly secrets: SecretService;
  readonly network: NetworkService;
  readonly downloads: DownloadsService;
  readonly media: MediaService;
  readonly android: AndroidHostService;
  private readonly pluginDataRoot: string;

  constructor(pluginDataRoot = path.join(process.cwd(), 'guyantools-plugin-data')) {
    this.pluginDataRoot = pluginDataRoot;
    this.storage = new StorageService();
    this.android = new AndroidHostService();
    this.secrets = new SecretService(() => dbManager.getDatabase() as any);
    this.network = new NetworkService((pluginId, key) => this.secrets.get(pluginId, key));
    this.downloads = new DownloadsService(this.network, this.files);
    this.media = new MediaService(this.files, undefined, undefined, (pluginId, key) => this.secrets.get(pluginId, key));
  }

  async createPluginDataGrant(pluginId: string, accessMode: 'read' | 'write' | 'read-write' = 'read-write') {
    const grant = this.files.create(pluginId, {
      purpose: 'plugin-data',
      rootPath: path.join(this.pluginDataRoot, pluginId),
      accessMode,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      maxBytes: 512 * 1024 * 1024,
    });
    const db = dbManager.getDatabase() as any;
    if (typeof db.createFileGrant === 'function') {
      await db.createFileGrant({
        id: grant.id,
        pluginId: grant.pluginId,
        purpose: grant.purpose,
        rootPath: grant.rootPath,
        accessMode: grant.accessMode,
        expiresAt: grant.expiresAt,
        maxBytes: grant.maxBytes,
      });
    }
    return grant;
  }

  async revokePluginDataGrant(pluginId: string, grantId: string) {
    const grant = this.files.revoke(pluginId, grantId);
    const db = dbManager.getDatabase() as any;
    if (typeof db.revokeFileGrant === 'function') await db.revokeFileGrant(pluginId, grantId);
    return grant;
  }

  async pickPluginDirectoryGrant(pluginId: string) {
    const result = await dialog.showOpenDialog({
      title: '选择 B 站媒体输出目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const grant = this.files.create(pluginId, {
      purpose: 'plugin-output',
      rootPath: result.filePaths[0],
      accessMode: 'read-write',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      maxBytes: 2 * 1024 * 1024 * 1024,
    });
    const db = dbManager.getDatabase() as any;
    if (typeof db.createFileGrant === 'function') await db.createFileGrant({
      id: grant.id,
      pluginId: grant.pluginId,
      purpose: grant.purpose,
      rootPath: grant.rootPath,
      accessMode: grant.accessMode,
      expiresAt: grant.expiresAt,
      maxBytes: grant.maxBytes,
    });
    return grant;
  }

  bindMainWindow(mainWindow: BrowserWindow) {
    this.navigation.setMainWindow(mainWindow);
  }

  getCapabilitySummary(): PluginCapabilitySummary {
    return {
      workspace: ['workspace.current'],
      data: this.data.getCapabilities(),
      storage: this.storage.getCapabilities(),
      navigation: this.navigation.getCapabilities(),
      commands: this.commands.getCapabilities(),
      ui: this.ui.getCapabilities(),
      system: this.system.getCapabilities(),
      observability: this.observability.getCapabilities(),
      network: ['network.fetch'],
      downloads: ['downloads.direct'],
      jobs: ['jobs.create', 'jobs.list', 'jobs.update'],
      files: ['files.createGrant', 'files.read', 'files.write', 'files.revoke'],
      media: ['media.probe', 'media.transcode', 'media.preview', 'media.writeTags'],
      secrets: ['secrets.get', 'secrets.set', 'secrets.delete'],
      android: this.android.getCapabilities(),
    };
  }
}
