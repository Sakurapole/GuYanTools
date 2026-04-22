import type {
  PluginManifest,
  PluginPermission,
  PluginTrustLevel,
} from '@/contracts/plugin_host';

const SANDBOXED_ALLOWED: PluginPermission[] = [
  'workspace.read',
  'data.user.read',
  'data.project.read',
  'data.settings.read',
  'storage.self',
  'navigation.open',
  'ui.contribute',
  'commands.execute',
  'system.dialog',
  'system.clipboard',
  'system.notifications',
  'system.shortcuts',
  'background.run',
];

const TRUSTED_ALLOWED: PluginPermission[] = [
  ...SANDBOXED_ALLOWED,
  'data.project.write',
  'data.settings.write',
];

export class PluginPermissionManager {
  getAllowedPermissions(trustLevel: PluginTrustLevel) {
    return trustLevel === 'trusted' ? TRUSTED_ALLOWED : SANDBOXED_ALLOWED;
  }

  validateManifest(manifest: PluginManifest) {
    const allowed = this.getAllowedPermissions(manifest.trustLevel);
    const rejected = manifest.permissions.filter(permission => !allowed.includes(permission));
    if (rejected.length > 0) {
      throw new Error(`Plugin ${manifest.id} requested unsupported permissions: ${rejected.join(', ')}`);
    }

    if (manifest.trustLevel === 'sandboxed' && manifest.runtime === 'host') {
      throw new Error(`Sandboxed plugin ${manifest.id} cannot use host runtime`);
    }
  }
}
