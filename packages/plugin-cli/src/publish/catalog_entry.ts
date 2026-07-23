import type { MarketplaceCatalogEntry } from './publish_config.js';

export function createCatalogEntry(manifest: Record<string, any>, repository: string, tag: string, resolvedCommit: string): MarketplaceCatalogEntry {
  return { id: manifest.id, version: manifest.version, repository, ref: tag, refType: 'tag', resolvedCommit, permissions: [...(manifest.permissions ?? [])], capabilities: [...(manifest.capabilities ?? [])] };
}
