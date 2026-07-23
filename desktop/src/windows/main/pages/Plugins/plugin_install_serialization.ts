import type { PluginPermission } from '@/contracts/plugin_host';

/** Convert renderer-owned reactive collections into IPC-safe plain arrays. */
export function serializeApprovedPermissions(
  permissions: readonly PluginPermission[] | undefined,
): PluginPermission[] {
  return permissions ? Array.from(permissions) : [];
}
