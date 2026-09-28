import {
  utilityProcess,
  MessageChannelMain,
  type MessagePortMain,
  type UtilityProcess,
} from 'electron';
import path from 'node:path';
import type { InstalledPluginRecord, PluginRuntimeContext } from '@/contracts/plugin_host';
import type { HostServiceRegistry } from './host_services';
import { PluginApiError, toPluginApiErrorPayload } from './plugin_api_error';

export interface UtilityWorkerHandle {
  pluginId: string;
  process: UtilityProcess;
  context: PluginRuntimeContext;
  /** Synthetic id used in runtime context maps (negative to avoid webContents collision). */
  runtimeId: number;
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

  constructor(private readonly hostServices: HostServiceRegistry) {}

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

    const child = utilityProcess.fork(entryPath, [], {
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

    child.once('exit', (code) => {
      this.workers.delete(record.manifest.id);
      if (code !== 0) {
        this.hostServices.observability.error(
          record.manifest.id,
          `Utility worker exited with code ${code}`
        );
      }
    });

    const handle: UtilityWorkerHandle = {
      pluginId: record.manifest.id,
      process: child,
      context,
      runtimeId,
    };
    this.workers.set(record.manifest.id, handle);
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

  private bindInvokePort(port: MessagePortMain, context: PluginRuntimeContext) {
    port.on('message', (event) => {
      void this.handleInvoke(port, context, event.data);
    });
    port.start();
  }

  private async handleInvoke(port: MessagePortMain, context: PluginRuntimeContext, data: unknown) {
    const payload = data as { id?: string; channel?: string; args?: unknown[] } | null;
    if (!payload || typeof payload.channel !== 'string') return;
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
        if (!host.quota.tryAcquireJobSlot(pluginId))
          throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_JOB_QUOTA');
        const { JobService } = await import('./services/job_service');
        const { dbManager } = await import('../../core/database');
        return new JobService(dbManager.getDatabase() as never).create(
          pluginId,
          String(args[0]),
          args[1],
          args[2] as string | undefined
        );
      }
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
