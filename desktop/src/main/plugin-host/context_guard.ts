import type { PluginPermission, PluginRuntimeContext } from '@/contracts/plugin_host';

export interface PluginAuditEvent {
  pluginId: string;
  runtime: PluginRuntimeContext['runtime'];
  operation: string;
  result: 'allowed' | 'denied';
}

export class PluginContextGuard {
  constructor(private readonly audit: (event: PluginAuditEvent) => void = event => console.info('[plugin-audit]', event)) {}

  requirePermission(context: PluginRuntimeContext, permission: PluginPermission) {
    if (!context.permissions.includes(permission)) {
      this.audit({ pluginId: context.pluginId, runtime: context.runtime, operation: permission, result: 'denied' });
      throw new Error(`PLUGIN_PERMISSION_DENIED: ${context.pluginId} lacks ${permission}`);
    }
    this.audit({ pluginId: context.pluginId, runtime: context.runtime, operation: permission, result: 'allowed' });
  }

  requireOwner(context: PluginRuntimeContext, ownerPluginId: string) {
    if (context.pluginId !== ownerPluginId) {
      this.audit({ pluginId: context.pluginId, runtime: context.runtime, operation: 'owner-check', result: 'denied' });
      throw new Error('PLUGIN_OWNER_MISMATCH: resource belongs to another plugin');
    }
    this.audit({ pluginId: context.pluginId, runtime: context.runtime, operation: 'owner-check', result: 'allowed' });
  }
}
