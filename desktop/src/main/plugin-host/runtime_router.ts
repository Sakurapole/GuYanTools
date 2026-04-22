import { BrowserWindow, WebContentsView } from 'electron';
import type {
  InstalledPluginRecord,
  PluginRuntimeContext,
  PluginViewportBounds,
} from '@/contracts/plugin_host';
import { HostServiceRegistry } from './host_services';

type MountedPluginView = {
  mainWindow: BrowserWindow;
  view: WebContentsView;
  pluginId: string;
  pageId: string;
  lastActivityAt: number;
};

export class PluginRuntimeRouter {
  private readonly runtimeContextByWebContentsId = new Map<number, PluginRuntimeContext>();
  private mountedByWindowId = new Map<number, MountedPluginView>();
  private readonly idleCheckTimer: NodeJS.Timeout;

  constructor(
    private readonly hostServices: HostServiceRegistry,
    private readonly preloadPath: string,
    private readonly getUnloadAfterMinutes: () => number,
  ) {
    this.idleCheckTimer = setInterval(() => {
      void this.cleanupIdleMountedViews();
    }, 15_000);
    this.idleCheckTimer.unref?.();
  }

  getRuntimeContext(webContentsId: number) {
    return this.runtimeContextByWebContentsId.get(webContentsId) ?? null;
  }

  async mountUiPage(
    mainWindow: BrowserWindow,
    record: InstalledPluginRecord,
    pageId: string,
    bounds: PluginViewportBounds,
  ) {
    if (!['ui', 'hybrid'].includes(record.manifest.runtime)) {
      throw new Error(`Plugin ${record.manifest.id} does not support UI runtime`);
    }

    await this.unmountUiPage(mainWindow, record.manifest.id);

    const isTrusted = record.manifest.trustLevel === 'trusted';
    const pluginView = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: isTrusted,
        webSecurity: !isTrusted,
        webviewTag: false,
        devTools: true,
        additionalArguments: [
          `--guyantools-plugin-id=${record.manifest.id}`,
          `--guyantools-page-id=${pageId}`,
        ],
      },
    });

    const context: PluginRuntimeContext = {
      pluginId: record.manifest.id,
      pageId,
      trustLevel: record.manifest.trustLevel,
      runtime: record.manifest.runtime,
      permissions: record.manifest.permissions,
    };

    this.runtimeContextByWebContentsId.set(pluginView.webContents.id, context);

    pluginView.webContents.on('destroyed', () => {
      this.runtimeContextByWebContentsId.delete(pluginView.webContents.id);
    });

    pluginView.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
      this.hostServices.observability.info(`Plugin console ${record.manifest.id}: ${message}`, {
        line,
        sourceId,
      });
    });

    await pluginView.webContents.loadURL(`file://${record.resolvedEntryPath}`);
    pluginView.setBounds(bounds);

    mainWindow.contentView.addChildView(pluginView);
    this.mountedByWindowId.set(mainWindow.id, {
      mainWindow,
      view: pluginView,
      pluginId: record.manifest.id,
      pageId,
      lastActivityAt: Date.now(),
    });
  }

  async updateMountedBounds(mainWindow: BrowserWindow, bounds: PluginViewportBounds) {
    const mounted = this.mountedByWindowId.get(mainWindow.id);
    if (!mounted) {
      return;
    }

    mounted.view.setBounds(bounds);
    mounted.lastActivityAt = Date.now();
  }

  async unmountUiPage(mainWindow: BrowserWindow, pluginId?: string) {
    const mounted = this.mountedByWindowId.get(mainWindow.id);
    if (!mounted) {
      return;
    }

    if (pluginId && mounted.pluginId !== pluginId) {
      return;
    }

    mainWindow.contentView.removeChildView(mounted.view);
    mounted.view.webContents.close();
    this.mountedByWindowId.delete(mainWindow.id);
  }

  private async cleanupIdleMountedViews() {
    const unloadAfterMinutes = this.getUnloadAfterMinutes();
    if (unloadAfterMinutes <= 0) {
      return;
    }

    const idleMs = unloadAfterMinutes * 60 * 1000;
    const now = Date.now();

    for (const mounted of this.mountedByWindowId.values()) {
      if (mounted.mainWindow.isDestroyed()) {
        this.mountedByWindowId.delete(mounted.mainWindow.id);
        continue;
      }

      if (now - mounted.lastActivityAt < idleMs) {
        continue;
      }

      await this.unmountUiPage(mounted.mainWindow, mounted.pluginId);
    }
  }
}
