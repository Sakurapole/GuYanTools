import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { PluginPermissionManager } from './permission_manager';
import { validateMarketplaceSummary } from './lifecycle_manager';
import type { MarketplacePluginSummary } from '@/contracts/plugin_host';
import { PluginManifestResolver } from './manifest_resolver';

type ManifestInput = Record<string, unknown>;

type PluginManifestLike = Parameters<PluginPermissionManager['validateManifest']>[0];

function manifest(overrides: ManifestInput = {}): ManifestInput {
  return {
    schemaVersion: '1.0',
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
  };
}

describe('plugin manifest validation', () => {
  it('exports a validator for the v1 manifest contract', async () => {
    const resolver = await import('./manifest_resolver');

    expect(resolver.validatePluginManifest).toBeTypeOf('function');
  });

  it('rejects malformed ids before a plugin can be installed', async () => {
    const { validatePluginManifest } = await import('./manifest_resolver');

    expect(() => validatePluginManifest(manifest({ id: 'bad id' }))).toThrow('PLUGIN_MANIFEST_INVALID');
  });

  it('rejects trusted runtime declarations for market plugins', async () => {
    const { validatePluginManifest } = await import('./manifest_resolver');

    expect(() => validatePluginManifest(manifest({ trustLevel: 'trusted' }))).toThrow('PLUGIN_TRUST_UNSUPPORTED');
  });

  it('requires capabilities to be declared separately from permissions', async () => {
    const { validatePluginManifest } = await import('./manifest_resolver');

    expect(() => validatePluginManifest(manifest({ capabilities: undefined }))).toThrow('PLUGIN_CAPABILITIES_REQUIRED');
  });

  it('requires a worker entry for worker runtimes', async () => {
    const { validatePluginManifest } = await import('./manifest_resolver');

    expect(() => validatePluginManifest(manifest({ runtime: 'worker', entry: {} }))).toThrow('PLUGIN_ENTRY_INVALID');
  });

  it('accepts the UI contract fields introduced by manifest 1.1', async () => {
    const { validatePluginManifest } = await import('./manifest_resolver');

    expect(() => validatePluginManifest(manifest({
      schemaVersion: '1.1',
      uiApiVersion: '1.0.0',
      ui: { theme: 'guyantools', components: '@guyantools/plugin-ui' },
    }))).not.toThrow();
  });

  it('rejects development URLs in a production manifest', async () => {
    const { validatePluginManifest } = await import('./manifest_resolver');

    expect(() => validatePluginManifest(manifest({
      dev: { uiUrl: 'http://127.0.0.1:5173/index.html' },
    }))).toThrow('PLUGIN_MANIFEST_DEV_FIELD');
  });

  it('requires each declared entry to be a regular file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-plugin-entry-'));
    await fs.writeJSON(path.join(root, 'guyantools.plugin.json'), manifest());
    await fs.ensureDir(path.join(root, 'dist', 'index.html'));

    await expect(new PluginManifestResolver().resolveFromDirectory(root)).rejects.toThrow('Plugin entry is not a file');
  });

  it('rejects an entry symlink that points outside the plugin directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-plugin-symlink-'));
    const outsideFile = path.join(root, '..', `${path.basename(root)}-outside.html`);
    await fs.writeJSON(path.join(root, 'guyantools.plugin.json'), manifest());
    await fs.outputFile(outsideFile, '<html></html>');
    await fs.ensureDir(path.join(root, 'dist'));
    await fs.ensureSymlink(outsideFile, path.join(root, 'dist', 'index.html'), 'file');

    await expect(new PluginManifestResolver().resolveFromDirectory(root)).rejects.toThrow('Plugin entry must not be a symbolic link');
  });

  it('rejects duplicate capability ids and invalid host matches', async () => {
    const { validatePluginManifest } = await import('./manifest_resolver');
    const capability = {
      id: 'guyantools.example.source',
      kind: 'media-source',
      operations: ['resolve'],
      match: { hosts: ['https://example.com'] },
    };

    expect(() => validatePluginManifest(manifest({ capabilities: [capability, capability] }))).toThrow('PLUGIN_CAPABILITY_INVALID');
    expect(() => validatePluginManifest(manifest({ capabilities: [capability] }))).toThrow('PLUGIN_CAPABILITY_INVALID');
  });
});

describe('plugin permissions', () => {
  it('allows the generic network and media permissions for sandboxed plugins', () => {
    const manager = new PluginPermissionManager();

    expect(() => manager.validateManifest(manifest({
      permissions: ['network.fetch', 'downloads.manage', 'jobs.manage', 'tools.ffmpeg', 'media.tag'],
    }) as unknown as PluginManifestLike)).not.toThrow();
  });

  it('does not convert capability declarations into permissions', () => {
    const manager = new PluginPermissionManager();

    expect(() => manager.validateManifest(manifest({
      permissions: [],
      capabilities: [{
        id: 'guyantools.example.source',
        kind: 'media-source',
        operations: ['resolve'],
        match: { hosts: ['example.com'] },
      }],
    }) as unknown as PluginManifestLike)).not.toThrow();
  });

  it('enforces host/API compatibility and approved permission ownership', () => {
    const manager = new PluginPermissionManager();
    expect(() => manager.validateCompatibility(manifest({ hostVersionRange: '>=2.0.0' }) as any)).toThrow('PLUGIN_HOST_VERSION_UNSUPPORTED');
    expect(() => manager.validateCompatibility(manifest({ pluginApiVersion: '2.0.0' }) as any)).toThrow('PLUGIN_API_VERSION_UNSUPPORTED');
    expect(() => manager.validateApprovedPermissions(manifest({ permissions: ['network.fetch'] }) as any, ['files.read'])).toThrow('PLUGIN_APPROVED_PERMISSION_INVALID');
  });

  it('rejects a marketplace summary that does not match the resolved plugin', () => {
    expect(() => validateMarketplaceSummary(manifest() as any, 'abc1234', {
      id: 'guyantools.other', version: '1.0.0', resolvedCommit: 'abc1234',
    })).toThrow('PLUGIN_CATALOG_MISMATCH');
  });

  it('rejects marketplace permission and capability summaries that differ from the manifest', () => {
    const expected: Pick<MarketplacePluginSummary, 'id' | 'version' | 'resolvedCommit' | 'permissions' | 'capabilities'> = {
      id: 'guyantools.example',
      version: '1.0.0',
      resolvedCommit: 'abc1234',
      permissions: ['files.read'],
      capabilities: [],
    };

    expect(() => validateMarketplaceSummary(manifest({ permissions: ['network.fetch'] }) as any, 'abc1234', expected)).toThrow('PLUGIN_CATALOG_MISMATCH');
    expect(() => validateMarketplaceSummary(manifest({ capabilities: [{ id: 'guyantools.example.source', kind: 'media-source', operations: ['resolve'] }] }) as any, 'abc1234', { ...expected, permissions: [], capabilities: [] })).toThrow('PLUGIN_CATALOG_MISMATCH');
  });

  it('accepts semantically equal marketplace capability summaries with a different property order', () => {
    const capabilities = [{ id: 'guyantools.example.source', kind: 'media-source', operations: ['resolve'] }];
    expect(() => validateMarketplaceSummary(manifest({ capabilities }) as any, 'abc1234', {
      id: 'guyantools.example', version: '1.0.0', resolvedCommit: 'abc1234', permissions: [],
      capabilities: [{ kind: 'media-source', operations: ['resolve'], id: 'guyantools.example.source' }],
    })).not.toThrow();
  });
});
