import { BrowserWindow, dialog, shell } from 'electron';
import { dbManager } from '../../core/database';
import type { PluginCapabilitySummary } from '@/contracts/plugin_host';
import type { NotificationPayload } from '@/contracts/notification';
import { showNotification } from '../windows';

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
  async execute(commandId: string, payload?: unknown) {
    console.log('[plugin-command]', commandId, payload);
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
  info(message: string, meta?: unknown) {
    console.log('[plugin-info]', message, meta ?? '');
  }

  error(message: string, meta?: unknown) {
    console.error('[plugin-error]', message, meta ?? '');
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

  constructor() {
    this.storage = new StorageService();
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
    };
  }
}
