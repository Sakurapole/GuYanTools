import { BrowserWindow, WebContentsView, webContents } from 'electron';
import type { InstalledPluginRecord, PluginRuntimeContext, PluginViewportBounds, PluginDevSession } from '@/contracts/plugin_host';
import { HostServiceRegistry } from './host_services';
import { getSandboxedPluginWebPreferences, isAllowedPluginDevUrl } from './runtime_security';
import { PluginDevSessionManager } from './dev_session';

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
    private readonly devSessions: PluginDevSessionManager = new PluginDevSessionManager(),
    private readonly onPluginRuntimeDestroyed: (pluginId: string) => void = () => undefined,
  ) {
    this.idleCheckTimer = setInterval(() => {
      void this.cleanupIdleMountedViews().catch((error) => {
        this.hostServices.observability.error('Plugin idle cleanup failed', error);
      });
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
      this.onPluginRuntimeDestroyed(record.manifest.id);
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

    await pluginView.webContents.loadURL(resolvePluginRuntimeUrl(record, this.devSessions.get(record.manifest.id), 'ui'));
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
      this.onPluginRuntimeDestroyed(record.manifest.id);
    });
    await view.webContents.loadURL(resolvePluginRuntimeUrl(record, this.devSessions.get(record.manifest.id), 'worker'));
    this.workerViewsByPluginId.set(record.manifest.id, { view, pluginId: record.manifest.id });
  }

  async stopWorker(pluginId: string) {
    const worker = this.workerViewsByPluginId.get(pluginId);
    if (!worker) return;
    this.workerViewsByPluginId.delete(pluginId);
    this.runtimeContextByWebContentsId.delete(worker.view.webContents.id);
    if (!worker.view.webContents.isDestroyed()) worker.view.webContents.close();
  }

  connectDevSession(session: PluginDevSession) { return this.devSessions.connect(session); }
  disconnectDevSession(pluginId: string) { this.devSessions.disconnect(pluginId); }
  getDevSession(pluginId: string) { return this.devSessions.get(pluginId); }
  listDevSessions() { return this.devSessions.list(); }
  disconnectAllDevSessions() { this.devSessions.disconnectAll(); }

  broadcastTheme(theme: unknown) {
    for (const [webContentsId, context] of this.runtimeContextByWebContentsId) {
      const target = webContents.fromId(webContentsId);
      if (!target || target.isDestroyed()) {
        this.runtimeContextByWebContentsId.delete(webContentsId);
        continue;
      }
      target.send('plugin-runtime:ui:theme-changed', theme);
      void context;
    }
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

export function resolvePluginRuntimeUrl(record: InstalledPluginRecord, session: PluginDevSession | null, kind: 'ui' | 'worker'): string {
  const filePath = kind === 'ui' ? record.resolvedEntryPaths.ui : record.resolvedEntryPaths.worker;
  if (!filePath) throw new Error(`Plugin ${record.manifest.id} does not declare a ${kind} entry`);
  const devUrl = kind === 'ui' ? session?.uiUrl : session?.workerUrl;
  if (devUrl && isAllowedPluginDevUrl(devUrl, session)) return devUrl;
  return `file://${filePath}`;
}
