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
  'network.fetch',
  'downloads.manage',
  'jobs.manage',
  'files.read',
  'files.write',
  'tools.ffmpeg',
  'media.preview',
  'media.transcode',
  'media.tag',
  'secrets.self',
  'observability.logs',
];

const TRUSTED_ALLOWED: PluginPermission[] = [
  ...SANDBOXED_ALLOWED,
  'data.project.write',
  'data.settings.write',
];

// Plugin compatibility follows the host platform API version, independent of the app package version.
export const HOST_VERSION = '1.0.0';
export const PLUGIN_API_VERSION = '1.0.0';

function versionParts(value: string) {
  const match = value.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function satisfiesRange(version: string, range: string) {
  const actual = versionParts(version);
  if (!actual) return false;
  const normalized = range.trim();
  const match = normalized.match(/^(>=|<=|>|<|\^|~)?\s*(\d+)\.(\d+)\.(\d+)/);
  if (!match) return normalized === version;
  const target = [Number(match[2]), Number(match[3]), Number(match[4])];
  const comparison = actual[0] - target[0] || actual[1] - target[1] || actual[2] - target[2];
  switch (match[1]) {
    case '>=': return comparison >= 0;
    case '>': return comparison > 0;
    case '<=': return comparison <= 0;
    case '<': return comparison < 0;
    case '^': return actual[0] === target[0] && comparison >= 0;
    case '~': return actual[0] === target[0] && actual[1] === target[1] && comparison >= 0;
    default: return comparison === 0;
  }
}

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

  validateCompatibility(manifest: PluginManifest) {
    if (!satisfiesRange(HOST_VERSION, manifest.hostVersionRange)) {
      throw new Error(`PLUGIN_HOST_VERSION_UNSUPPORTED: ${manifest.hostVersionRange}`);
    }
    if (!satisfiesRange(PLUGIN_API_VERSION, manifest.pluginApiVersion)) {
      throw new Error(`PLUGIN_API_VERSION_UNSUPPORTED: ${manifest.pluginApiVersion}`);
    }
  }

  validateApprovedPermissions(manifest: PluginManifest, approvedPermissions: PluginPermission[]) {
    const declared = new Set(manifest.permissions);
    if (approvedPermissions.some(permission => !declared.has(permission))) {
      throw new Error(`PLUGIN_APPROVED_PERMISSION_INVALID: ${manifest.id}`);
    }
    const allowed = new Set(this.getAllowedPermissions(manifest.trustLevel));
    if (approvedPermissions.some(permission => !allowed.has(permission))) {
      throw new Error(`PLUGIN_APPROVED_PERMISSION_INVALID: ${manifest.id}`);
    }
  }
}
