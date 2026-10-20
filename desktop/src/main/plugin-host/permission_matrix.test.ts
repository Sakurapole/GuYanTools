import { describe, expect, it } from 'vitest';
import {
  PLUGIN_PERMISSION_META,
  getDefaultApprovedSuggestions,
  getAllowedPermissionsForTrust,
  getPermissionTier,
  diffPermissionSets,
} from './permission_matrix';
import { PluginPermissionManager } from './permission_manager';
import type { PluginManifest } from '@/contracts/plugin_host';

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.1',
    id: 'guyantools.example',
    name: 'example',
    displayName: 'Example',
    version: '1.0.0',
    description: 'fixture',
    pluginApiVersion: '1.0.0',
    hostVersionRange: '>=1.1.0',
    trustLevel: 'sandboxed',
    runtime: 'ui',
    entry: { ui: 'dist/index.html' },
    permissions: [],
    capabilities: [],
    contributes: {},
    ...overrides,
  } as unknown as PluginManifest;
}

describe('permission matrix', () => {
  it('classifies permissions into default/elevated/builtin tiers', () => {
    expect(getPermissionTier('models.execute')).toBe('elevated');
    expect(getPermissionTier('workspace.read')).toBe('default');
    expect(getPermissionTier('network.fetch')).toBe('default');
    expect(getPermissionTier('files.write')).toBe('elevated');
    expect(getPermissionTier('android.fastboot.reboot')).toBe('elevated');
    expect(getPermissionTier('data.project.write')).toBe('builtin');
  });

  it('restricts sandboxed plugins from builtin permissions', () => {
    const sandboxed = getAllowedPermissionsForTrust('sandboxed');
    const trusted = getAllowedPermissionsForTrust('trusted');
    expect(sandboxed).not.toContain('data.project.write');
    expect(sandboxed).not.toContain('data.settings.write');
    expect(trusted).toContain('data.project.write');
    expect(sandboxed).toContain('files.write');
    expect(sandboxed).toContain('android.sessions.control');
  });

  it('only pre-selects default tier in install dialog suggestions', () => {
    const declared = ['workspace.read', 'files.write', 'android.fastboot.reboot'] as const;
    expect(getDefaultApprovedSuggestions(declared)).toEqual(['workspace.read']);
  });

  it('diffs newly declared permissions for re-approval', () => {
    expect(
      diffPermissionSets(['workspace.read', 'storage.self', 'files.write'], ['workspace.read'])
    ).toEqual(['storage.self', 'files.write']);
    expect(diffPermissionSets(['workspace.read'], ['workspace.read', 'storage.self'])).toEqual([]);
  });

  it('covers every permission declared in contracts', () => {
    const manager = new PluginPermissionManager();
    const sandboxed = manager.getAllowedPermissions('sandboxed');
    const trusted = manager.getAllowedPermissions('trusted');
    expect(PLUGIN_PERMISSION_META.length).toBeGreaterThanOrEqual(30);
    expect(sandboxed.length + 2).toBe(trusted.length);
  });
});

describe('PluginPermissionManager matrix enforcement', () => {
  it('rejects sandboxed manifests requesting builtin permissions', () => {
    const manager = new PluginPermissionManager();
    expect(() =>
      manager.validateManifest(manifest({ permissions: ['data.project.write'] }))
    ).toThrow('unsupported permissions');
  });

  it('allows elevated permissions for sandboxed manifests', () => {
    const manager = new PluginPermissionManager();
    expect(() =>
      manager.validateManifest(
        manifest({ permissions: ['files.write', 'android.sessions.control'] })
      )
    ).not.toThrow();
  });

  it('rejects approved permissions outside the declared set', () => {
    const manager = new PluginPermissionManager();
    const m = manifest({ permissions: ['workspace.read'] });
    expect(() => manager.validateApprovedPermissions(m, ['files.write'])).toThrow(
      'PLUGIN_APPROVED_PERMISSION_INVALID'
    );
  });

  it('accepts empty approved permissions as pending confirmation', () => {
    const manager = new PluginPermissionManager();
    const m = manifest({ permissions: ['workspace.read', 'files.write'] });
    expect(() => manager.validateApprovedPermissions(m, [])).not.toThrow();
  });

  it('validates host version against bumped HOST_VERSION', () => {
    const manager = new PluginPermissionManager();
    expect(() =>
      manager.validateCompatibility(manifest({ hostVersionRange: '>=1.0.0' }))
    ).not.toThrow();
    expect(() => manager.validateCompatibility(manifest({ hostVersionRange: '>=2.0.0' }))).toThrow(
      'PLUGIN_HOST_VERSION_UNSUPPORTED'
    );
  });
});
