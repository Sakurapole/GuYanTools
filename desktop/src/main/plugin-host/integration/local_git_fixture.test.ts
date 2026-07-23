import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';
import { GitPluginInstaller } from '../git_installer';
import { PluginLifecycleManager } from '../lifecycle_manager';
import { PluginManifestResolver } from '../manifest_resolver';
import { PluginPermissionManager } from '../permission_manager';
import { PluginPaths } from '../plugin_paths';

const fixtures = path.join(__dirname, '..', 'fixtures');
const commits = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'];

class MemoryRegistry {
  private readonly records = new Map<string, InstalledPluginRecord>();
  get(id: string) { return this.records.get(id); }
  async upsert(record: InstalledPluginRecord) { this.records.set(record.manifest.id, record); return record; }
  async updateStatus(id: string, status: InstalledPluginRecord['status'], enabled: boolean) {
    const record = this.records.get(id);
    if (!record) throw new Error('missing record');
    const next = { ...record, status, enabled };
    this.records.set(id, next);
    return next;
  }
  async remove(id: string) { this.records.delete(id); }
}

describe('local Git plugin lifecycle', () => {
  it('installs, enables, updates, rolls back, and uninstalls a pinned fixture', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-plugin-integration-'));
    const source = path.join(root, 'source');
    await fs.copy(path.join(fixtures, 'valid'), source);
    const registry = new MemoryRegistry();
    let installCount = 0;
    const installer = new GitPluginInstaller(async args => {
      if (args[0] === 'clone') {
        installCount += 1;
        await fs.copy(source, args[4]);
        if (installCount > 1) {
          const manifestPath = path.join(args[4], 'guyantools.plugin.json');
          const manifest = await fs.readJSON(manifestPath);
          manifest.version = '1.1.0';
          await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
        }
      }
      return args[0] === 'rev-parse' ? commits[Math.min(installCount - 1, 1)] : '';
    }, async () => `digest-${installCount}`);
    const paths = new PluginPaths(root);
    const lifecycle = new PluginLifecycleManager(
      registry as any,
      new PluginManifestResolver(),
      new PluginPermissionManager(),
      { install: async (): Promise<void> => undefined } as any,
      path.join(root, 'packages'),
      paths,
      installer,
    );

    const first = await lifecycle.installFromGit({ url: 'https://github.com/example/fixture.git', ref: 'v1.0.0', refType: 'tag', expected: { id: 'guyantools.fixture', version: '1.0.0', resolvedCommit: commits[0] } });
    expect(first.status).toBe('resolved');
    expect(await fs.pathExists(paths.currentPath('guyantools.fixture'))).toBe(true);
    expect((await lifecycle.enable('guyantools.fixture')).enabled).toBe(true);
    const updated = await lifecycle.update('guyantools.fixture');
    expect(updated.manifest.version).toBe('1.1.0');
    expect(await lifecycle.rollback('guyantools.fixture')).toMatchObject({ enabled: false, status: 'disabled', manifest: { version: '1.0.0' } });
    await lifecycle.uninstall('guyantools.fixture');
    expect(registry.get('guyantools.fixture')).toBeUndefined();
    expect(await fs.pathExists(paths.currentPath('guyantools.fixture'))).toBe(false);
  });

  it('accepts a second generic media fixture without a site-specific host branch', async () => {
    const registry = new MemoryRegistry();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-plugin-generic-'));
    const source = path.join(root, 'source');
    await fs.copy(path.join(fixtures, 'valid'), source);
    const installer = new GitPluginInstaller(async args => { if (args[0] === 'clone') await fs.copy(source, args[4]); return args[0] === 'rev-parse' ? commits[0] : ''; }, async () => 'digest');
    const lifecycle = new PluginLifecycleManager(registry as any, new PluginManifestResolver(), new PluginPermissionManager(), {} as any, path.join(root, 'packages'), new PluginPaths(root), installer);
    const record = await lifecycle.installFromGit({ url: 'https://github.com/example/generic-media.git', ref: commits[0], refType: 'commit' });
    expect(record.manifest.id).toBe('guyantools.fixture');
    expect(record.manifest.capabilities).toEqual([]);
  });

  it('reports host-controlled milestones while installing a pinned Git plugin', async () => {
    const registry = new MemoryRegistry();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-plugin-progress-'));
    const source = path.join(root, 'source');
    await fs.copy(path.join(fixtures, 'valid'), source);
    const installer = new GitPluginInstaller(
      async args => {
        if (args[0] === 'clone') await fs.copy(source, args[4]);
        return args[0] === 'rev-parse' ? commits[0] : '';
      },
      async () => 'digest',
    );
    const lifecycle = new PluginLifecycleManager(
      registry as any,
      new PluginManifestResolver(),
      new PluginPermissionManager(),
      {} as any,
      path.join(root, 'packages'),
      new PluginPaths(root),
      installer,
    );
    const phases: string[] = [];

    await lifecycle.installFromGit(
      { url: 'https://github.com/example/progress.git', ref: commits[0], refType: 'commit' },
      progress => phases.push(progress.phase),
    );

    expect(phases).toEqual(['cloning', 'validating', 'activating', 'registering', 'completed']);
  });
});
