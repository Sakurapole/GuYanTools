import type { PluginCapabilityDeclaration } from '@/contracts/plugin_host';
import { PluginApiError } from './plugin_api_error';

export type CapabilityInvokeKind = 'resolve' | 'download' | string;

export interface CapabilityInvokeInput {
  capabilityId: string;
  operation: string;
  payload?: unknown;
}

export interface ResolvedCapability extends PluginCapabilityDeclaration {
  pluginId: string;
  qualifiedId: string;
}

/**
 * Routes host-side lookups (URL/mime/scheme) to plugin-declared capabilities.
 * Business semantics stay inside the plugin; the host only arbitrates ownership.
 */
export class CapabilityRouter {
  private readonly providers = new Map<string, ResolvedCapability>();
  private readonly invokeHandlers = new Map<
    string,
    (input: CapabilityInvokeInput) => Promise<unknown>
  >();

  register(pluginId: string, declarations: PluginCapabilityDeclaration[]): ResolvedCapability[] {
    this.unregister(pluginId);
    const registered: ResolvedCapability[] = [];
    for (const declaration of declarations) {
      const qualifiedId = declaration.id.startsWith(`${pluginId}.`)
        ? declaration.id
        : `${pluginId}.${declaration.id}`;
      if (this.providers.has(qualifiedId)) {
        throw new PluginApiError('INVALID_INPUT', `PLUGIN_CAPABILITY_CONFLICT: ${qualifiedId}`);
      }
      const resolved: ResolvedCapability = { ...declaration, pluginId, qualifiedId };
      this.providers.set(qualifiedId, resolved);
      registered.push(resolved);
    }
    return registered;
  }

  unregister(pluginId: string) {
    for (const [qualifiedId, capability] of this.providers) {
      if (capability.pluginId === pluginId) this.providers.delete(qualifiedId);
    }
    for (const key of [...this.invokeHandlers.keys()]) {
      if (key.startsWith(`${pluginId}.`)) this.invokeHandlers.delete(key);
    }
  }

  list(pluginId?: string): ResolvedCapability[] {
    return [...this.providers.values()].filter(
      (capability) => !pluginId || capability.pluginId === pluginId
    );
  }

  findByHost(host: string): ResolvedCapability[] {
    const normalized = host.toLowerCase();
    return this.list().filter(
      (capability) =>
        capability.match?.hosts?.some((entry) => {
          const candidate = entry.toLowerCase();
          return normalized === candidate || normalized.endsWith(`.${candidate}`);
        }) ?? false
    );
  }

  findByMime(mimeType: string): ResolvedCapability[] {
    const normalized = mimeType.toLowerCase();
    return this.list().filter(
      (capability) =>
        capability.match?.mimeTypes?.some((entry) => entry.toLowerCase() === normalized) ?? false
    );
  }

  findByScheme(scheme: string): ResolvedCapability[] {
    const normalized = scheme.toLowerCase().replace(/:$/, '');
    return this.list().filter(
      (capability) =>
        capability.match?.schemes?.some((entry) => entry.toLowerCase() === normalized) ?? false
    );
  }

  findByUrl(rawUrl: string): ResolvedCapability[] {
    try {
      const url = new URL(rawUrl);
      const byHost = this.findByHost(url.hostname);
      if (byHost.length > 0) return byHost;
      return this.findByScheme(url.protocol.replace(/:$/, ''));
    } catch {
      return [];
    }
  }

  registerInvokeHandler(
    pluginId: string,
    capabilityId: string,
    handler: (input: CapabilityInvokeInput) => Promise<unknown>
  ) {
    this.invokeHandlers.set(`${pluginId}.${capabilityId}`, handler);
  }

  async invoke(pluginId: string, input: CapabilityInvokeInput): Promise<unknown> {
    const qualifiedId = input.capabilityId.includes('.')
      ? input.capabilityId
      : `${pluginId}.${input.capabilityId}`;
    const capability = this.providers.get(qualifiedId);
    if (!capability) {
      throw new PluginApiError('PLUGIN_NOT_FOUND', `PLUGIN_CAPABILITY_NOT_FOUND: ${qualifiedId}`);
    }
    if (capability.pluginId !== pluginId) {
      throw new PluginApiError('OWNER_MISMATCH', 'PLUGIN_CAPABILITY_OWNER_MISMATCH');
    }
    if (!capability.operations.includes(input.operation)) {
      throw new PluginApiError(
        'INVALID_INPUT',
        `PLUGIN_CAPABILITY_OPERATION_DENIED: ${input.operation}`
      );
    }
    const handler = this.invokeHandlers.get(qualifiedId);
    if (!handler) {
      throw new PluginApiError('INTERNAL', `PLUGIN_CAPABILITY_HANDLER_MISSING: ${qualifiedId}`);
    }
    return handler(input);
  }
}
