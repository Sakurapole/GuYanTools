import { BrowserWindow, WebContentsView } from 'electron';
import type {
  InstalledPluginRecord,
  PluginRuntimeContext,
  PluginViewportBounds,
} from '@/contracts/plugin_host';
import { HostServiceRegistry } from './host_services';
import { getSandboxedPluginWebPreferences } from './runtime_security';

type MountedPluginView = {
  mainWindow: BrowserWindow;
  view: WebContentsView;
  pluginId: string;
  pageId: string;
  lastActivityAt: number;
};

type WorkerPluginView = {
  view: WebContentsView;
  pluginId: string;
};

export class PluginRuntimeRouter {
  private readonly runtimeContextByWebContentsId = new Map<number, PluginRuntimeContext>();
  private mountedByWindowId = new Map<number, MountedPluginView>();
  private workerViewsByPluginId = new Map<string, WorkerPluginView>();
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

    const pluginView = new WebContentsView({
      webPreferences: getSandboxedPluginWebPreferences(this.preloadPath, record.manifest.id, pageId),
    });

    const context: PluginRuntimeContext = {
      pluginId: record.manifest.id,
      pageId,
      trustLevel: record.manifest.trustLevel,
      runtime: record.manifest.runtime,
      permissions: record.approvedPermissions,
    };

    this.runtimeContextByWebContentsId.set(pluginView.webContents.id, context);

    pluginView.webContents.on('destroyed', () => {
      this.runtimeContextByWebContentsId.delete(pluginView.webContents.id);
    });

    pluginView.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
      this.hostServices.observability.info(record.manifest.id, `Plugin console ${record.manifest.id}: ${message}`, {
        line,
        sourceId,
      });
    });

    const entryPath = record.resolvedEntryPaths.ui;
    if (!entryPath) {
      throw new Error(`Plugin ${record.manifest.id} does not declare a UI entry`);
    }

    await pluginView.webContents.loadURL(`file://${entryPath}`);
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

  async startWorker(record: InstalledPluginRecord) {
    if (!['worker', 'hybrid'].includes(record.manifest.runtime)) return;
    const entryPath = record.resolvedEntryPaths.worker;
    if (!entryPath) throw new Error(`Plugin ${record.manifest.id} does not declare a worker entry`);
    await this.stopWorker(record.manifest.id);
    const view = new WebContentsView({
      webPreferences: getSandboxedPluginWebPreferences(this.preloadPath, record.manifest.id, '__worker__'),
    });
    const context: PluginRuntimeContext = {
      pluginId: record.manifest.id,
      pageId: '__worker__',
      trustLevel: record.manifest.trustLevel,
      runtime: record.manifest.runtime,
      permissions: record.approvedPermissions,
    };
    this.runtimeContextByWebContentsId.set(view.webContents.id, context);
    view.webContents.once('destroyed', () => {
      this.runtimeContextByWebContentsId.delete(view.webContents.id);
      this.workerViewsByPluginId.delete(record.manifest.id);
    });
    await view.webContents.loadURL(`file://${entryPath}`);
    this.workerViewsByPluginId.set(record.manifest.id, { view, pluginId: record.manifest.id });
  }

  async stopWorker(pluginId: string) {
    const worker = this.workerViewsByPluginId.get(pluginId);
    if (!worker) return;
    this.workerViewsByPluginId.delete(pluginId);
    this.runtimeContextByWebContentsId.delete(worker.view.webContents.id);
    if (!worker.view.webContents.isDestroyed()) worker.view.webContents.close();
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

    for (const worker of this.workerViewsByPluginId.values()) {
      if (!worker.view.webContents.isDestroyed()) continue;
      await this.stopWorker(worker.pluginId);
    }
  }
}
