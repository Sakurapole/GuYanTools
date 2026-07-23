import crypto from 'node:crypto';
import type { MarketplaceCacheRecord, MarketplaceCatalog, MarketplacePluginSummary } from '@/contracts/plugin_host';

export type MarketplaceFetcher = (url: string, ref: string) => Promise<string>;

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fail(message: string): never {
  throw new Error(`PLUGIN_MARKETPLACE_INVALID: ${message}`);
}

export function validateMarketplaceCatalog(value: unknown): asserts value is MarketplaceCatalog {
  if (!value || typeof value !== 'object') fail('catalog must be an object');
  const catalog = value as Partial<MarketplaceCatalog>;
  if (catalog.schemaVersion !== '1.0' || typeof catalog.marketplaceId !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(catalog.marketplaceId)) {
    fail('schemaVersion and marketplaceId are required');
  }
  if (typeof catalog.name !== 'string' || !Array.isArray(catalog.plugins)) fail('name and plugins are required');
  for (const plugin of catalog.plugins) {
    if (!plugin || typeof plugin !== 'object') fail('plugin entry must be an object');
    const entry = plugin as Partial<MarketplacePluginSummary>;
    if (typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(entry.id) || typeof entry.name !== 'string' || typeof entry.version !== 'string') {
      fail('plugin id, name, and version are required');
    }
    if (typeof entry.repository !== 'string') fail(`plugin ${entry.id} repository is required`);
    let repository: URL;
    try { repository = new URL(entry.repository); } catch { fail(`plugin ${entry.id} repository is invalid`); }
    if (repository.protocol !== 'https:' || repository.username || repository.password) fail(`plugin ${entry.id} repository must be HTTPS`);
    if (typeof entry.ref !== 'string' || !['branch', 'tag', 'commit'].includes(entry.refType ?? '') || !/^[0-9a-f]{7,64}$/i.test(entry.resolvedCommit ?? '')) {
      fail(`plugin ${entry.id} must pin ref and resolvedCommit`);
    }
    if (!Array.isArray(entry.permissions) || !Array.isArray(entry.capabilities)) {
      fail(`plugin ${entry.id} must declare permission and capability summaries`);
    }
  }
}

export class MarketplaceResolver {
  private readonly cache = new Map<string, MarketplaceCacheRecord>();

  constructor(private readonly fetchCatalog: MarketplaceFetcher) {}

  async refresh(input: { id: string; url: string; ref: string }): Promise<MarketplaceCacheRecord> {
    let parsed: URL;
    try { parsed = new URL(input.url); } catch { throw new Error('PLUGIN_MARKETPLACE_URL_INVALID: URL is invalid'); }
    if (parsed.protocol !== 'https:') throw new Error('PLUGIN_MARKETPLACE_URL_INVALID: URL must use HTTPS');
    try {
      const raw = await this.fetchCatalog(input.url, input.ref);
      const catalog = JSON.parse(raw) as unknown;
      validateMarketplaceCatalog(catalog);
      if (catalog.marketplaceId !== input.id) fail('marketplace id does not match source');
      const record: MarketplaceCacheRecord = {
        marketplaceId: input.id,
        url: input.url,
        ref: input.ref,
        catalog,
        catalogSha256: sha256(raw),
        refreshedAt: new Date().toISOString(),
        fromCache: false,
      };
      this.cache.set(input.id, record);
      return record;
    } catch (error) {
      const cached = this.cache.get(input.id);
      if (!cached) throw error;
      return { ...cached, fromCache: true };
    }
  }

  list() { return Array.from(this.cache.values()); }

  hydrate(records: MarketplaceCacheRecord[]) {
    for (const record of records) this.cache.set(record.marketplaceId, record);
  }

  search(query: string) {
    const normalized = query.trim().toLowerCase();
    return this.list().flatMap(record => record.catalog.plugins).filter(plugin => {
      if (!normalized) return true;
      return [plugin.id, plugin.name, plugin.description ?? ''].some(value => value.toLowerCase().includes(normalized));
    });
  }
}
