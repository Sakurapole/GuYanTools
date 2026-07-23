import { describe, expect, it } from 'vitest';

const declaration = {
  id: 'source',
  kind: 'media-source' as const,
  operations: ['resolve'],
  match: { hosts: ['example.com'] },
};

describe('capability registry', () => {
  it('registers capabilities under the plugin namespace', async () => {
    const { CapabilityRegistry } = await import('./capability_registry');
    const registry = new CapabilityRegistry();

    registry.register('guyantools.example', [declaration]);

    expect(registry.list()).toEqual([{
      ...declaration,
      pluginId: 'guyantools.example',
      qualifiedId: 'guyantools.example.source',
    }]);
  });

  it('replaces only the registering plugin capabilities', async () => {
    const { CapabilityRegistry } = await import('./capability_registry');
    const registry = new CapabilityRegistry();

    registry.register('guyantools.one', [declaration]);
    registry.register('guyantools.two', [{ ...declaration, id: 'other' }]);
    registry.register('guyantools.one', [{ ...declaration, id: 'replacement' }]);

    expect(registry.list().map(item => item.qualifiedId)).toEqual([
      'guyantools.two.other',
      'guyantools.one.replacement',
    ]);
  });
});
