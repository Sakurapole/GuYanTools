import { describe, expect, it } from 'vitest';
import { resolvePluginDependencies, assertPluginDependencies } from './dependency_resolver';
import { CapabilityRouter } from './capability_router';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';

function record(dependencies?: Array<{ capability: string; optional?: boolean }>): Pick<InstalledPluginRecord, 'manifest'> {
  return {
    manifest: {
      schemaVersion: '1.1',
      id: 'guyantools.consumer',
      name: 'consumer',
      displayName: 'Consumer',
      version: '1.0.0',
      description: '',
      pluginApiVersion: '1.0.0',
      hostVersionRange: '>=1.0.0',
      trustLevel: 'sandboxed',
      runtime: 'ui',
      entry: { ui: 'index.html' },
      permissions: [],
      capabilities: [],
      contributes: {},
      ...(dependencies ? { dependencies } : {}),
    },
  };
}

describe('PluginCapabilityDependency resolver', () => {
  it('satisfies dependencies when another plugin provides the capability', () => {
    const router = new CapabilityRouter();
    router.register('guyantools.provider', [{
      id: 'source',
      kind: 'media-source',
      operations: ['resolve'],
    }]);
    const result = resolvePluginDependencies(
      record([{ capability: 'guyantools.provider.source' }]),
      router,
    );
    expect(result.satisfied).toBe(true);
    expect(result.resolved[0].providerPluginId).toBe('guyantools.provider');
  });

  it('fails when a required dependency is missing', () => {
    const router = new CapabilityRouter();
    const consumer = record([{ capability: 'guyantools.provider.source' }]);
    expect(() => assertPluginDependencies(consumer, router)).toThrow('PLUGIN_DEPENDENCY_MISSING');
  });

  it('allows optional missing dependencies', () => {
    const router = new CapabilityRouter();
    const result = resolvePluginDependencies(
      record([{ capability: 'guyantools.provider.source', optional: true }]),
      router,
    );
    expect(result.satisfied).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});
