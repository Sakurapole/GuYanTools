import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@/contracts/plugin_host';
import { PluginPermissionManager } from './permission_manager';

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.1',
    id: 'guyantools.example',
    name: 'example',
    displayName: 'Example',
    version: '1.0.0',
    description: 'fixture',
    pluginApiVersion: '1.0.0',
    hostVersionRange: '>=1.0.0',
    trustLevel: 'sandboxed',
    runtime: 'ui',
    entry: { ui: 'dist/index.html' },
    permissions: [],
    capabilities: [],
    contributes: {},
    ...overrides,
  } as unknown as PluginManifest;
}

describe('plugin UI API compatibility', () => {
  it('rejects an unsupported UI API version', () => {
    const manager = new PluginPermissionManager();

    expect(() => manager.validateCompatibility(manifest({ uiApiVersion: '2.0.0' }))).toThrow('PLUGIN_UI_API_VERSION_UNSUPPORTED');
  });
});
