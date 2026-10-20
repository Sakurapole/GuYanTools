import {
  utilityProcess,
  MessageChannelMain,
  type MessagePortMain,
  type UtilityProcess,
} from 'electron';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { InstalledPluginRecord, PluginRuntimeContext } from '@/contracts/plugin_host';
import type { HostServiceRegistry } from './host_services';
import type { JobService } from './services/job_service';
import { PluginApiError, normalizePluginError, toPluginApiErrorPayload } from './plugin_api_error';

export interface UtilityWorkerHandle {
  pluginId: string;
  process: UtilityProcess;
  context: PluginRuntimeContext;
  /** Synthetic id used in runtime context maps (negative to avoid webContents collision). */
  runtimeId: number;
  port: MessagePortMain;
  commands: Set<string>;
  pendingCommands: Map<string, { resolve: (value: unknown) => void; reject: (error: unknown) => void; timer: NodeJS.Timeout }>;
}

let nextRuntimeId = -1;

function allocateRuntimeId() {
  nextRuntimeId -= 1;
  return nextRuntimeId;
}

/**
 * Boots a worker plugin inside Electron utilityProcess (true process isolation).
 * Browser WebContentsView remains the fallback for legacy workers.
 */
export class UtilityWorkerHost {
  private readonly workers = new Map<string, UtilityWorkerHandle>();

  constructor(
    private readonly hostServices: HostServiceRegistry,
    private readonly getJobService: () => JobService = () => {
      throw new PluginApiError('INTERNAL', 'PLUGIN_JOB_SERVICE_UNAVAILABLE');
    },
    private onWorkerExit: (pluginId: string, runtimeId: number) => void = () => undefined
  ) {}

  setOnWorkerExit(listener: (pluginId: string, runtimeId: number) => void) {
    this.onWorkerExit = listener;
  }

  isRunning(pluginId: string) {
    return this.workers.has(pluginId);
  }

  getHandle(pluginId: string) {
    return this.workers.get(pluginId) ?? null;
  }

  getRuntimeId(pluginId: string) {
    return this.workers.get(pluginId)?.runtimeId ?? null;
  }

  list() {
    return [...this.workers.values()];
  }

  async start(record: InstalledPluginRecord): Promise<UtilityWorkerHandle> {
    const entryPath = record.resolvedEntryPaths.worker;
    if (!entryPath) {
      throw new Error(`Plugin ${record.manifest.id} does not declare a worker entry`);
    }
    await this.stop(record.manifest.id);

    const bootstrapPath = path.join(__dirname, 'plugin-worker.js');
    if (!fs.existsSync(bootstrapPath)) {
      throw new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_WORKER_BOOTSTRAP_MISSING');
    }
    const child = utilityProcess.fork(bootstrapPath, [entryPath], {
      serviceName: `plugin-worker-${record.manifest.id}`,
      env: {
        GUYANTOOLS_PLUGIN_ID: record.manifest.id,
        GUYANTOOLS_WORKER_RUNTIME: 'utility',
      },
      stdio: 'pipe',
    });

    const runtimeId = allocateRuntimeId();
    const context: PluginRuntimeContext = {
      pluginId: record.manifest.id,
      pageId: '__worker__',
      trustLevel: record.manifest.trustLevel,
      runtime: record.manifest.runtime,
      permissions: record.approvedPermissions,
    };

    const channel = new MessageChannelMain();
    child.postMessage('guyantools:port', [channel.port1]);
    this.bindInvokePort(channel.port2, context);

    const handle: UtilityWorkerHandle = {
      pluginId: record.manifest.id,
      process: child,
      context,
      runtimeId,
      port: channel.port2,
      commands: new Set(),
      pendingCommands: new Map(),
    };
    this.workers.set(record.manifest.id, handle);

    child.once('exit', (code) => {
      this.workers.delete(record.manifest.id);
      if (code !== 0) {
        this.hostServices.observability.error(
          record.manifest.id,
          `Utility worker exited with code ${code}`
        );
      }
      for (const pending of handle.pendingCommands.values()) {
        clearTimeout(pending.timer);
        pending.reject(new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE'));
      }
      handle.pendingCommands.clear();
      this.onWorkerExit(record.manifest.id, runtimeId);
    });
    return handle;
  }

  async stop(pluginId: string) {
    const handle = this.workers.get(pluginId);
    if (!handle) return;
    this.workers.delete(pluginId);
    try {
      handle.process.kill();
    } catch {
      // already exited
    }
  }

  async stopAll() {
    await Promise.all([...this.workers.keys()].map((pluginId) => this.stop(pluginId)));
  }

  registerCommand(pluginId: string, commandId: string) {
    const handle = this.workers.get(pluginId);
    if (!handle || !commandId.startsWith(`${pluginId}.`)) {
      throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_COMMAND_DENIED');
    }
    handle.commands.add(commandId);
  }

  hasCommand(pluginId: string, commandId: string) {
    return this.workers.get(pluginId)?.commands.has(commandId) ?? false;
  }

  invokeCommand(pluginId: string, commandId: string, payload?: unknown) {
    const handle = this.workers.get(pluginId);
    if (!handle || !handle.commands.has(commandId)) {
      return Promise.reject(new PluginApiError('TOOL_UNAVAILABLE', 'PLUGIN_RUNTIME_UNAVAILABLE'));
    }
    const requestId = crypto.randomUUID();
    handle.port.postMessage({ type: 'command:invoke', requestId, commandId, payload });
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        handle.pendingCommands.delete(requestId);
        reject(new PluginApiError('TOOL_FAILED', `PLUGIN_COMMAND_TIMEOUT: ${commandId}`));
      }, 10_000);
      handle.pendingCommands.set(requestId, { resolve, reject, timer });
    });
  }

  broadcast(pluginId: string, channel: string, payload: unknown) {
    this.workers.get(pluginId)?.port.postMessage({ type: 'event', channel, payload });
  }

  private bindInvokePort(port: MessagePortMain, context: PluginRuntimeContext) {
    port.on('message', (event) => {
      void this.handleInvoke(port, context, event.data);
    });
    port.start();
  }

  private async handleInvoke(port: MessagePortMain, context: PluginRuntimeContext, data: unknown) {
    const payload = data as {
      id?: string;
      channel?: string;
      args?: unknown[];
      type?: string;
      requestId?: string;
      ok?: boolean;
      result?: unknown;
      error?: unknown;
    } | null;
    if (!payload) return;
    if (payload.type === 'command:result' && payload.requestId) {
      const pending = this.workers.get(context.pluginId)?.pendingCommands.get(payload.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.workers.get(context.pluginId)?.pendingCommands.delete(payload.requestId);
      if (payload.ok) pending.resolve(payload.result);
      else pending.reject(normalizePluginError(payload.error));
      return;
    }
    if (typeof payload.channel !== 'string') return;
    try {
      const result = await this.dispatch(context, payload.channel, payload.args ?? []);
      port.postMessage({ id: payload.id, ok: true, result });
    } catch (error) {
      port.postMessage({ id: payload.id, ok: false, error: toPluginApiErrorPayload(error) });
    }
  }

  private async dispatch(context: PluginRuntimeContext, channel: string, args: unknown[]) {
    const host = this.hostServices;
    const pluginId = context.pluginId;
    const require = (permission: Parameters<typeof requirePermission>[1]) =>
      requirePermission(context, permission);

    switch (channel) {
      case 'plugin-runtime:get-context':
        return context;
      case 'plugin-runtime:workspace:get-current':
        require('workspace.read');
        return host.workspace.getCurrentWorkspace();
      case 'plugin-runtime:storage:get':
        require('storage.self');
        return host.storage.getPluginState(pluginId, String(args[0]));
      case 'plugin-runtime:storage:set':
        require('storage.self');
        await host.storage.setPluginState(pluginId, String(args[0]), args[1]);
        return undefined;
      case 'plugin-runtime:logger:info':
        require('observability.logs');
        if (!host.quota.allowLog(pluginId))
          throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_LOG_QUOTA');
        host.observability.info(pluginId, String(args[0]), args[1]);
        return undefined;
      case 'plugin-runtime:logger:error':
        require('observability.logs');
        if (!host.quota.allowLog(pluginId))
          throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_LOG_QUOTA');
        host.observability.error(pluginId, String(args[0]), args[1]);
        return undefined;
      case 'plugin-runtime:network:fetch':
        require('network.fetch');
        return host.network.fetch(args[0] as never, pluginId);
      case 'plugin-runtime:jobs:create': {
        require('jobs.manage');
        return this.getJobService().create(
          pluginId,
          String(args[0]),
          args[1],
          args[2] as string | undefined
        );
      }
      case 'plugin-runtime:jobs:list':
        require('jobs.manage');
        return this.getJobService().list(pluginId);
      case 'plugin-runtime:jobs:get':
        require('jobs.manage');
        return this.getJobService().get(pluginId, String(args[0]));
      case 'plugin-runtime:jobs:update':
        require('jobs.manage');
        return this.getJobService().update(pluginId, String(args[0]), args[1]);
      case 'plugin-runtime:jobs:cancel':
        require('jobs.manage');
        return this.getJobService().cancel(pluginId, String(args[0]));
      case 'plugin-runtime:jobs:retry': {
        require('jobs.manage');
        return this.getJobService().retry(pluginId, String(args[0]));
      }
      case 'plugin-runtime:commands:register':
        require('commands.execute');
        this.registerCommand(pluginId, String(args[0]));
        return undefined;
      case 'plugin-runtime:commands:execute':
        require('commands.execute');
        return host.commands.execute(pluginId, String(args[0]), args[1]);
      default:
        throw new PluginApiError('INVALID_INPUT', `PLUGIN_UTILITY_CHANNEL_UNSUPPORTED: ${channel}`);
    }
  }
}

function requirePermission(
  context: PluginRuntimeContext,
  permission: PluginRuntimeContext['permissions'][number]
) {
  if (!context.permissions.includes(permission)) {
    throw new PluginApiError(
      'PERMISSION_DENIED',
      `PLUGIN_PERMISSION_DENIED: ${context.pluginId} lacks ${permission}`
    );
  }
}

export function resolveUtilityWorkerScript(entryPath: string) {
  return path.resolve(entryPath);
}
