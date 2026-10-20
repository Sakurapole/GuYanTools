import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, WebContentsView, webContents } from 'electron';
import type {
  InstalledPluginRecord,
  PluginRuntimeContext,
  PluginViewportBounds,
  PluginDevSession,
  PluginWorkerRuntimeKind,
} from '@/contracts/plugin_host';
import { HostServiceRegistry } from './host_services';
import {
  getSandboxedPluginWebPreferences,
  getPluginResourceRoot,
  isAllowedPluginDevUrl,
  securePluginWebContents,
} from './runtime_security';
import { PluginDevSessionManager } from './dev_session';
import { UtilityWorkerHost } from './utility_worker_host';
import { PluginApiError, normalizePluginError } from './plugin_api_error';

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
  kind: 'browser';
};

type PendingWorkerReady = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type PendingCommand = {
  pluginId: string;
  runtimeId: number;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: NodeJS.Timeout;
};

export function resolveWorkerRuntimeKind(record: InstalledPluginRecord): PluginWorkerRuntimeKind {
  const workerEntry = record.resolvedEntryPaths.worker ?? '';
  if (record.manifest.workerRuntime === 'utility')
    throw new PluginApiError('INVALID_INPUT', 'PLUGIN_RUNTIME_INVALID: third-party utility worker');
  if (!/\.html?$/i.test(workerEntry))
    throw new PluginApiError('INVALID_INPUT', 'PLUGIN_ENTRY_INVALID: worker must be HTML');
  return 'browser';
}

export class PluginRuntimeRouter {
  private readonly runtimeContextByWebContentsId = new Map<number, PluginRuntimeContext>();
  private mountedByWindowId = new Map<number, MountedPluginView>();
  private workerViewsByPluginId = new Map<string, WorkerPluginView>();
  private readonly pendingWorkerReady = new Map<number, PendingWorkerReady>();
  private readonly registeredCommandsByRuntimeId = new Map<number, Set<string>>();
  private readonly registeredCapabilitiesByRuntimeId = new Map<number, Set<string>>();
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly utilityWorkers: UtilityWorkerHost;
  private readonly idleCheckTimer: NodeJS.Timeout;

  constructor(
    private readonly hostServices: HostServiceRegistry,
    private readonly preloadPath: string,
    private readonly getUnloadAfterMinutes: () => number,
    private readonly devSessions: PluginDevSessionManager = new PluginDevSessionManager(),
    private readonly onPluginRuntimeDestroyed: (pluginId: string) => void = () => undefined,
    utilityWorkers: UtilityWorkerHost = new UtilityWorkerHost(hostServices)
  ) {
    this.utilityWorkers = utilityWorkers;
    this.utilityWorkers.setOnWorkerExit((pluginId, runtimeId) => {
      this.runtimeContextByWebContentsId.delete(runtimeId);
      this.registeredCommandsByRuntimeId.delete(runtimeId);
      this.registeredCapabilitiesByRuntimeId.delete(runtimeId);
      this.onPluginRuntimeDestroyed(pluginId);
    });
    this.idleCheckTimer = setInterval(() => {
      void this.cleanupIdleMountedViews().catch((error) => {
        this.hostServices.observability.error('Plugin idle cleanup failed', error);
      });
    }, 15_000);
    this.idleCheckTimer.unref?.();
  }

  getRuntimeContext(webContentsId: number) {
    const direct = this.runtimeContextByWebContentsId.get(webContentsId);
    if (direct) return direct;
    for (const handle of this.utilityWorkers.list()) {
      if (handle.runtimeId === webContentsId) return handle.context;
    }
    return null;
  }

  getUtilityWorkerHost() {
    return this.utilityWorkers;
  }

  async mountUiPage(
    mainWindow: BrowserWindow,
    record: InstalledPluginRecord,
    pageId: string,
    bounds: PluginViewportBounds
  ) {
    if (!['ui', 'hybrid'].includes(record.manifest.runtime)) {
      throw new Error(`Plugin ${record.manifest.id} does not support UI runtime`);
    }

    await this.unmountUiPage(mainWindow, record.manifest.id);

    const pluginView = new WebContentsView({
      webPreferences: getSandboxedPluginWebPreferences(
        this.preloadPath,
        record.manifest.id,
        pageId
      ),
    });
    securePluginWebContents(
      pluginView.webContents,
      getPluginResourceRoot(record, 'ui'),
      this.devSessions.get(record.manifest.id)
    );

    const context: PluginRuntimeContext = {
      pluginId: record.manifest.id,
      pageId,
      trustLevel: record.manifest.trustLevel,
      runtime: record.manifest.runtime,
      permissions: record.approvedPermissions,
    };

    this.runtimeContextByWebContentsId.set(pluginView.webContents.id, context);
    this.registeredCommandsByRuntimeId.set(pluginView.webContents.id, new Set());
    this.registeredCapabilitiesByRuntimeId.set(pluginView.webContents.id, new Set());

    pluginView.webContents.on('destroyed', () => {
      this.runtimeContextByWebContentsId.delete(pluginView.webContents.id);
      this.registeredCommandsByRuntimeId.delete(pluginView.webContents.id);
      this.registeredCapabilitiesByRuntimeId.delete(pluginView.webContents.id);
      this.rejectPendingCommandsForRuntime(pluginView.webContents.id);
    });

    pluginView.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
      this.hostServices.observability.info(
        record.manifest.id,
        `Plugin console ${record.manifest.id}: ${message}`,
        {
          line,
          sourceId,
        }
      );
    });

    const entryPath = record.resolvedEntryPaths.ui;
    if (!entryPath) {
      throw new Error(`Plugin ${record.manifest.id} does not declare a UI entry`);
    }

    await pluginView.webContents.loadURL(
      resolvePluginRuntimeUrl(record, this.devSessions.get(record.manifest.id), 'ui')
    );
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

    resolveWorkerRuntimeKind(record);

    const view = new WebContentsView({
      webPreferences: getSandboxedPluginWebPreferences(
        this.preloadPath,
        record.manifest.id,
        '__worker__'
      ),
    });
    securePluginWebContents(
      view.webContents,
      getPluginResourceRoot(record, 'worker'),
      this.devSessions.get(record.manifest.id)
    );
    const context: PluginRuntimeContext = {
      pluginId: record.manifest.id,
      pageId: '__worker__',
      trustLevel: record.manifest.trustLevel,
      runtime: record.manifest.runtime,
      permissions: record.approvedPermissions,
    };
    this.runtimeContextByWebContentsId.set(view.webContents.id, context);
    this.registeredCommandsByRuntimeId.set(view.webContents.id, new Set());
    this.registeredCapabilitiesByRuntimeId.set(view.webContents.id, new Set());
    const runtimeId = view.webContents.id;
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingWorkerReady.delete(runtimeId);
        reject(new PluginApiError('TOOL_FAILED', 'PLUGIN_WORKER_READY_TIMEOUT'));
      }, 10_000);
      this.pendingWorkerReady.set(runtimeId, { resolve, reject, timer });
    });
    this.workerViewsByPluginId.set(record.manifest.id, {
      view,
      pluginId: record.manifest.id,
      kind: 'browser',
    });
    view.webContents.once('destroyed', () => {
      const pending = this.pendingWorkerReady.get(runtimeId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingWorkerReady.delete(runtimeId);
        pending.reject(new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE'));
      }
      this.runtimeContextByWebContentsId.delete(view.webContents.id);
      this.registeredCommandsByRuntimeId.delete(view.webContents.id);
      this.registeredCapabilitiesByRuntimeId.delete(view.webContents.id);
      this.rejectPendingCommandsForRuntime(runtimeId);
      if (this.workerViewsByPluginId.get(record.manifest.id)?.view === view) {
        this.workerViewsByPluginId.delete(record.manifest.id);
        this.onPluginRuntimeDestroyed(record.manifest.id);
      }
    });
    try {
      await Promise.all([
        view.webContents.loadURL(
          resolvePluginRuntimeUrl(record, this.devSessions.get(record.manifest.id), 'worker')
        ),
        ready,
      ]);
    } catch (error) {
      await this.stopWorker(record.manifest.id);
      throw error;
    }
  }

  markWorkerReady(runtimeId: number) {
    const context = this.runtimeContextByWebContentsId.get(runtimeId);
    const pending = this.pendingWorkerReady.get(runtimeId);
    if (!context || context.pageId !== '__worker__' || !pending) {
      throw new PluginApiError('INVALID_INPUT', 'PLUGIN_WORKER_READY_INVALID');
    }
    clearTimeout(pending.timer);
    this.pendingWorkerReady.delete(runtimeId);
    pending.resolve();
  }

  async stopWorker(pluginId: string) {
    const utility = this.utilityWorkers.getHandle(pluginId);
    if (utility) {
      this.runtimeContextByWebContentsId.delete(utility.runtimeId);
      this.registeredCommandsByRuntimeId.delete(utility.runtimeId);
      await this.utilityWorkers.stop(pluginId);
      this.rejectPendingCommandsForRuntime(utility.runtimeId);
      this.onPluginRuntimeDestroyed(pluginId);
    }
    const worker = this.workerViewsByPluginId.get(pluginId);
    if (!worker) return;
    this.workerViewsByPluginId.delete(pluginId);
    const pending = this.pendingWorkerReady.get(worker.view.webContents.id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingWorkerReady.delete(worker.view.webContents.id);
      pending.reject(new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE'));
    }
    this.runtimeContextByWebContentsId.delete(worker.view.webContents.id);
    this.registeredCommandsByRuntimeId.delete(worker.view.webContents.id);
    this.registeredCapabilitiesByRuntimeId.delete(worker.view.webContents.id);
    if (!worker.view.webContents.isDestroyed()) worker.view.webContents.close();
  }

  async stopAll() {
    clearInterval(this.idleCheckTimer);
    await Promise.all([
      ...[...this.workerViewsByPluginId.keys()].map((pluginId) => this.stopWorker(pluginId)),
      this.utilityWorkers.stopAll(),
    ]);
    this.pendingWorkerReady.clear();
    for (const [requestId, pending] of this.pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE'));
      this.pendingCommands.delete(requestId);
    }
  }

  connectDevSession(session: PluginDevSession) {
    return this.devSessions.connect(session);
  }
  disconnectDevSession(pluginId: string) {
    this.devSessions.disconnect(pluginId);
  }
  getDevSession(pluginId: string) {
    return this.devSessions.get(pluginId);
  }
  listDevSessions() {
    return this.devSessions.list();
  }
  disconnectAllDevSessions() {
    this.devSessions.disconnectAll();
  }

  registerCommandRuntime(runtimeId: number, commandId: string) {
    const context = this.getRuntimeContext(runtimeId);
    if (!context || !commandId.startsWith(`${context.pluginId}.`)) {
      throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_COMMAND_DENIED');
    }
    if (runtimeId < 0) {
      this.utilityWorkers.registerCommand(context.pluginId, commandId);
      return;
    }
    const commands = this.registeredCommandsByRuntimeId.get(runtimeId) ?? new Set<string>();
    commands.add(commandId);
    this.registeredCommandsByRuntimeId.set(runtimeId, commands);
  }

  registerCapabilityRuntime(runtimeId: number, capabilityId: string) {
    const context = this.getRuntimeContext(runtimeId);
    if (!context || runtimeId < 0) {
      throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_CAPABILITY_RUNTIME_DENIED');
    }
    const ids = this.registeredCapabilitiesByRuntimeId.get(runtimeId) ?? new Set<string>();
    ids.add(capabilityId);
    this.registeredCapabilitiesByRuntimeId.set(runtimeId, ids);
  }

  async invokeCapability(
    pluginId: string,
    capabilityId: string,
    operation: string,
    payload?: unknown
  ) {
    const runtimeId = [...this.runtimeContextByWebContentsId.entries()].find(
      ([id, context]) =>
        context.pluginId === pluginId &&
        this.registeredCapabilitiesByRuntimeId.get(id)?.has(capabilityId)
    )?.[0];
    if (runtimeId === undefined) {
      throw new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_CAPABILITY_RUNTIME_UNAVAILABLE');
    }
    const targetContents = webContents.fromId(runtimeId);
    if (!targetContents || targetContents.isDestroyed()) {
      throw new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE');
    }
    const requestId = crypto.randomUUID();
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new PluginApiError('TOOL_FAILED', `PLUGIN_CAPABILITY_TIMEOUT: ${capabilityId}`));
      }, 10_000);
      this.pendingCommands.set(requestId, { pluginId, runtimeId, resolve, reject, timer });
    });
    targetContents.send('plugin-runtime:capability:invoke', {
      requestId,
      capabilityId,
      operation,
      payload,
    });
    return response;
  }

  async invokeCommand(pluginId: string, commandId: string, payload?: unknown) {
    const target = [...this.runtimeContextByWebContentsId.entries()].find(
      ([runtimeId, context]) => {
        if (context.pluginId !== pluginId) return false;
        return (
          this.registeredCommandsByRuntimeId.get(runtimeId)?.has(commandId) ??
          (this.utilityWorkers.getRuntimeId(pluginId) === runtimeId &&
            this.utilityWorkers.hasCommand(pluginId, commandId))
        );
      }
    );
    if (!target) throw new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE');

    const [runtimeId] = target;
    if (runtimeId < 0) {
      return this.utilityWorkers.invokeCommand(pluginId, commandId, payload);
    }
    const targetContents = webContents.fromId(runtimeId);
    if (!targetContents || targetContents.isDestroyed()) {
      throw new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE');
    }

    const requestId = crypto.randomUUID();
    targetContents.send('plugin-runtime:command:invoke', { requestId, commandId, payload });
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new PluginApiError('TOOL_FAILED', `PLUGIN_COMMAND_TIMEOUT: ${commandId}`));
      }, 10_000);
      this.pendingCommands.set(requestId, { pluginId, runtimeId, resolve, reject, timer });
    });
  }

  resolveCommandResult(
    runtimeId: number,
    result: {
      requestId?: string;
      ok?: boolean;
      result?: unknown;
      error?: unknown;
    }
  ) {
    if (!result?.requestId) return;
    const pending = this.pendingCommands.get(result.requestId);
    if (!pending || pending.runtimeId !== runtimeId) return;
    clearTimeout(pending.timer);
    this.pendingCommands.delete(result.requestId);
    if (result.ok) pending.resolve(result.result);
    else pending.reject(normalizePluginError(result.error));
  }

  broadcastJobEvent(pluginId: string, job: unknown) {
    this.utilityWorkers.broadcast(pluginId, 'plugin-runtime:jobs:event', job);
  }

  private rejectPendingCommandsForRuntime(runtimeId: number) {
    for (const [requestId, pending] of this.pendingCommands) {
      if (pending.runtimeId !== runtimeId) continue;
      clearTimeout(pending.timer);
      this.pendingCommands.delete(requestId);
      pending.reject(new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE'));
    }
  }

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
  openMountedDevTools(mainWindow: BrowserWindow, pluginId: string, pageId: string) {
    const mounted = this.mountedByWindowId.get(mainWindow.id);
    if (
      !mounted ||
      mounted.pluginId !== pluginId ||
      mounted.pageId !== pageId ||
      mounted.view.webContents.isDestroyed()
    )
      throw new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_PAGE_NOT_MOUNTED');
    mounted.view.webContents.openDevTools({ mode: 'detach' });
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

export function resolvePluginRuntimeUrl(
  record: InstalledPluginRecord,
  session: PluginDevSession | null,
  kind: 'ui' | 'worker'
): string {
  const filePath = kind === 'ui' ? record.resolvedEntryPaths.ui : record.resolvedEntryPaths.worker;
  if (!filePath) throw new Error(`Plugin ${record.manifest.id} does not declare a ${kind} entry`);
  const devUrl = kind === 'ui' ? session?.uiUrl : session?.workerUrl;
  if (devUrl && isAllowedPluginDevUrl(devUrl, session)) return devUrl;
  return pathToFileURL(filePath).toString();
}
