import type { MarketplaceCatalogEntry } from './publish_config.js';

export function createCatalogEntry(manifest: Record<string, unknown>, repository: string, tag: string, resolvedCommit: string): MarketplaceCatalogEntry {
  return {
    id: requireString(manifest, 'id'),
    name: optionalString(manifest, 'displayName') ?? optionalString(manifest, 'name') ?? requireString(manifest, 'id'),
    version: requireString(manifest, 'version'),
    description: optionalString(manifest, 'description'),
    repository,
    ref: tag,
    refType: 'tag',
    resolvedCommit,
    hostVersionRange: optionalString(manifest, 'hostVersionRange'),
    permissions: stringArray(manifest.permissions),
    capabilities: Array.isArray(manifest.capabilities) ? [...manifest.capabilities] : [],
  };
}

function requireString(value: Record<string, unknown>, key: string): string {
  const result = optionalString(value, key);
  if (!result) throw new Error(`PLUGIN_PUBLISH_MANIFEST_INVALID: ${key} is required`);
  return result;
}

function optionalString(value: Record<string, unknown>, key: string): string | undefined {
  const result = value[key];
  return typeof result === 'string' && result.trim() ? result : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
