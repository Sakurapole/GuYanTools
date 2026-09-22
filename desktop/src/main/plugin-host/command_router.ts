import { PluginApiError } from './plugin_api_error';

export type PluginCommandHandler = (payload?: unknown) => Promise<unknown> | unknown;

export interface PluginCommandRoute {
  pluginId: string;
  commandId: string;
  handler: PluginCommandHandler;
}

/**
 * Routes plugin commands to handlers registered by UI/worker runtimes.
 * Host-side commands stay namespaced under the owning plugin id.
 */
export class PluginCommandRouter {
  private readonly handlers = new Map<string, PluginCommandRoute>();

  register(pluginId: string, commandId: string, handler: PluginCommandHandler) {
    if (!commandId.startsWith(`${pluginId}.`)) {
      throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_COMMAND_DENIED');
    }
    this.handlers.set(commandId, { pluginId, commandId, handler });
  }

  unregisterPlugin(pluginId: string) {
    for (const [commandId, route] of this.handlers) {
      if (route.pluginId === pluginId) this.handlers.delete(commandId);
    }
  }

  list(pluginId?: string): PluginCommandRoute[] {
    return [...this.handlers.values()].filter(route => !pluginId || route.pluginId === pluginId);
  }

  has(commandId: string) {
    return this.handlers.has(commandId);
  }

  async execute(pluginId: string, commandId: string, payload?: unknown, timeoutMs = 10_000) {
    if (!commandId.startsWith(`${pluginId}.`) || commandId.length > 200) {
      throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_COMMAND_DENIED');
    }
    const route = this.handlers.get(commandId);
    if (!route) {
      throw new PluginApiError('PLUGIN_NOT_FOUND', `PLUGIN_COMMAND_NOT_FOUND: ${commandId}`);
    }
    if (route.pluginId !== pluginId) {
      throw new PluginApiError('OWNER_MISMATCH', 'PLUGIN_COMMAND_OWNER_MISMATCH');
    }

    const result = route.handler(payload);
    const isPromise = result && typeof (result as Promise<unknown>).then === 'function';
    if (!isPromise) {
      return { accepted: true, result };
    }

    return Promise.race([
      (result as Promise<unknown>).then(value => ({ accepted: true, result: value })),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new PluginApiError('INTERNAL', `PLUGIN_COMMAND_TIMEOUT: ${commandId}`)), timeoutMs);
      }),
    ]);
  }
}
