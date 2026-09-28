import type { PluginPermission, PluginRuntimeContext } from '@/contracts/plugin_host';
import { PluginApiError } from './plugin_api_error';
import type { PluginAuditEvent } from './audit_store';

export type { PluginAuditEvent };

export class PluginContextGuard {
  private readonly listeners = new Set<(event: PluginAuditEvent) => void>();

  constructor(
    private readonly fallbackAudit: (event: PluginAuditEvent) => void = (event) =>
      console.info('[plugin-audit]', event)
  ) {}

  onAudit(listener: (event: PluginAuditEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  requirePermission(context: PluginRuntimeContext, permission: PluginPermission) {
    if (!context.permissions.includes(permission)) {
      this.emit({
        pluginId: context.pluginId,
        runtime: context.runtime,
        operation: permission,
        result: 'denied',
      });
      throw new PluginApiError(
        'PERMISSION_DENIED',
        `PLUGIN_PERMISSION_DENIED: ${context.pluginId} lacks ${permission}`
      );
    }
    this.emit({
      pluginId: context.pluginId,
      runtime: context.runtime,
      operation: permission,
      result: 'allowed',
    });
  }

  requireOwner(context: PluginRuntimeContext, ownerPluginId: string) {
    if (context.pluginId !== ownerPluginId) {
      this.emit({
        pluginId: context.pluginId,
        runtime: context.runtime,
        operation: 'owner-check',
        result: 'denied',
      });
      throw new PluginApiError(
        'OWNER_MISMATCH',
        'PLUGIN_OWNER_MISMATCH: resource belongs to another plugin'
      );
    }
    this.emit({
      pluginId: context.pluginId,
      runtime: context.runtime,
      operation: 'owner-check',
      result: 'allowed',
    });
  }

  private emit(event: PluginAuditEvent) {
    for (const listener of this.listeners) listener(event);
    this.fallbackAudit(event);
  }
}
