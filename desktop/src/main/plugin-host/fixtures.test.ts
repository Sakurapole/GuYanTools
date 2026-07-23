import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PluginManifestResolver } from './manifest_resolver';
import { validateMarketplaceSummary } from './lifecycle_manager';

const fixtures = path.join(__dirname, 'fixtures');

describe('local plugin fixtures', () => {
  it('resolves the valid hybrid fixture and rejects the invalid fixture', async () => {
    const resolver = new PluginManifestResolver();
    const valid = await resolver.resolveFromDirectory(path.join(fixtures, 'valid'));
    expect(valid.manifest.id).toBe('guyantools.fixture');
    expect(valid.resolvedEntryPaths.worker).toContain('worker.js');
    await expect(resolver.resolveFromDirectory(path.join(fixtures, 'invalid'))).rejects.toThrow('PLUGIN_TRUST_UNSUPPORTED');
  });

  it('keeps the catalog commit pinned to the fixture metadata', async () => {
    const metadata = JSON.parse(await fs.readFile(path.join(fixtures, 'catalog-fixture.json'), 'utf8')) as { tag: string; resolvedCommit: string };
    expect(metadata.tag).toBe('v1.0.0');
    expect(metadata.resolvedCommit).toMatch(/^[0-9a-f]{40}$/);
    validateMarketplaceSummary({ id: 'guyantools.fixture', version: '1.0.0' } as any, metadata.resolvedCommit, {
      id: 'guyantools.fixture', version: '1.0.0', resolvedCommit: metadata.resolvedCommit,
    });
  });
});
