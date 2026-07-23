import { describe, expect, it } from 'vitest';
import { MarketplaceResolver, validateMarketplaceCatalog } from './marketplace_resolver';
import type { PluginCapabilityDeclaration, PluginPermission } from '@/contracts/plugin_host';

const catalog = {
  schemaVersion: '1.0',
  marketplaceId: 'official',
  name: 'Official',
  plugins: [{
    id: 'guyantools.example',
    name: 'Example',
    version: '1.0.0',
    repository: 'https://github.com/Sakurapole/example.git',
    ref: 'v1.0.0',
    refType: 'tag',
    resolvedCommit: '0123456789abcdef0123456789abcdef01234567',
    permissions: [] as PluginPermission[],
    capabilities: [] as PluginCapabilityDeclaration[],
  }],
};

describe('marketplace resolver', () => {
  it('validates pinned HTTPS plugin sources', () => {
    expect(() => validateMarketplaceCatalog({ ...catalog, plugins: [{ ...catalog.plugins[0], repository: 'ssh://git@example.com/x' }] })).toThrow('PLUGIN_MARKETPLACE_INVALID');
    expect(() => validateMarketplaceCatalog(catalog)).not.toThrow();
    expect(() => validateMarketplaceCatalog({ ...catalog, plugins: [{ ...catalog.plugins[0], permissions: undefined }] })).toThrow('PLUGIN_MARKETPLACE_INVALID');
  });

  it('falls back to the last valid cache after a refresh failure', async () => {
    let fail = false;
    const resolver = new MarketplaceResolver(async () => {
      if (fail) throw new Error('offline');
      return JSON.stringify(catalog);
    });
    const first = await resolver.refresh({ id: 'official', url: 'https://example.com/catalog.json', ref: 'main' });
    fail = true;
    const cached = await resolver.refresh({ id: 'official', url: 'https://example.com/catalog.json', ref: 'main' });
    expect(first.fromCache).toBe(false);
    expect(cached.fromCache).toBe(true);
    expect(resolver.search('example')).toHaveLength(1);
  });
});
