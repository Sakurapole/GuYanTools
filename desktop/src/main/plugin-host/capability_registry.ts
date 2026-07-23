import type { PluginCapabilityDeclaration } from '@/contracts/plugin_host';

export interface RegisteredPluginCapability extends PluginCapabilityDeclaration {
  pluginId: string;
  qualifiedId: string;
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, RegisteredPluginCapability>();

  register(pluginId: string, declarations: PluginCapabilityDeclaration[]): RegisteredPluginCapability[] {
    this.unregister(pluginId);

    const registered = declarations.map(declaration => ({
      ...declaration,
      pluginId,
      qualifiedId: `${pluginId}.${declaration.id}`,
    }));

    for (const capability of registered) {
      if (this.capabilities.has(capability.qualifiedId)) {
        throw new Error(`PLUGIN_CAPABILITY_CONFLICT: ${capability.qualifiedId}`);
      }
      this.capabilities.set(capability.qualifiedId, capability);
    }

    return registered;
  }

  unregister(pluginId: string): void {
    for (const [qualifiedId, capability] of this.capabilities) {
      if (capability.pluginId === pluginId) {
        this.capabilities.delete(qualifiedId);
      }
    }
  }

  list(pluginId?: string): RegisteredPluginCapability[] {
    return Array.from(this.capabilities.values()).filter(capability => !pluginId || capability.pluginId === pluginId);
  }

  findByHost(host: string): RegisteredPluginCapability[] {
    return this.list().filter(capability => capability.match?.hosts?.includes(host) ?? false);
  }
}
