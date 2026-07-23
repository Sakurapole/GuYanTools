import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { publish } from '../src/commands/publish';
import type { CommandExecutor, PublishConfig } from '../src/publish/publish_config';

function validPublishConfig(rootPath: string): PublishConfig { return { rootPath, repository: 'https://github.com/example/demo', marketplace: 'sakurapole', catalogMode: 'pull-request', releaseAsset: true }; }

describe('plugin publish', () => {
  it('generates a release and catalog dry-run without credentials', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-publish-'));
    await fs.writeFile(path.join(root, 'guyantools.plugin.json'), JSON.stringify({ schemaVersion: '1.1', id: 'demo.plugin', version: '1.2.3', entry: { ui: 'index.html' }, permissions: ['ui.contribute'], capabilities: [] }));
    await fs.writeFile(path.join(root, 'index.html'), '<main />');
    const result = await publish({ dryRun: true, config: validPublishConfig(root) });
    expect(result.catalogEntry.refType).toBe('tag');
    expect(result.commands.some(command => command.includes('gh release create'))).toBe(true);
  });

  it('uses structured git and authenticated gh commands for a release', async () => {
    const root = await createPluginRoot();
    const commands: Array<{ command: string; args: string[] }> = [];
    const catalogWorkspace = path.join(root, 'marketplace');
    const executor: CommandExecutor = {
      async run(command) {
        commands.push(command);
        if (command.command === 'git' && command.args[0] === 'rev-parse') return { stdout: '0123456789abcdef0123456789abcdef01234567\n', stderr: '' };
        if (command.command === 'gh' && command.args[0] === 'repo' && command.args[1] === 'clone') {
          await fs.mkdir(catalogWorkspace, { recursive: true });
          await fs.writeFile(path.join(catalogWorkspace, 'catalog.json'), JSON.stringify({
            schemaVersion: '1.0', marketplaceId: 'sakurapole', name: 'Sakurapole', plugins: [{
              id: 'other.plugin', name: 'Other', version: '1.0.0', repository: 'https://github.com/example/other',
              ref: 'main', refType: 'branch', resolvedCommit: 'b'.repeat(40), permissions: [], capabilities: [],
            }],
          }));
        }
        if (command.command === 'gh' && command.args[0] === 'api') return { stdout: 'true\n', stderr: '' };
        return { stdout: '', stderr: '' };
      },
    };

    await publish({
      config: { ...validPublishConfig(root), catalogMode: 'direct', allowDirectPublish: true },
      executor,
      pack: async () => ({ archive: path.join(root, 'demo.plugin-1.2.3.zip'), sha256: 'a'.repeat(64) }),
      catalogWorkspace,
    });

    expect(commands).toEqual(expect.arrayContaining([
      { command: 'gh', args: ['auth', 'status'] },
      { command: 'git', args: ['rev-parse', 'HEAD'] },
      { command: 'git', args: ['tag', '-a', 'v1.2.3', '-m', 'Release v1.2.3'] },
      { command: 'git', args: ['push', 'origin', 'v1.2.3'] },
      { command: 'gh', args: ['release', 'create', 'v1.2.3', path.join(root, 'demo.plugin-1.2.3.zip'), '--title', 'v1.2.3'] },
      { command: 'gh', args: ['repo', 'clone', 'Sakurapole/guyantools-plugin-marketplace', catalogWorkspace, '--', '--branch', 'main', '--single-branch'] },
      { command: 'gh', args: ['api', 'repos/Sakurapole/guyantools-plugin-marketplace', '--jq', '.permissions.push'] },
    ].map(expected => expect.objectContaining(expected))));
    const catalog = JSON.parse(await fs.readFile(path.join(catalogWorkspace, 'catalog.json'), 'utf8'));
    expect(catalog.plugins.map((entry: { id: string }) => entry.id)).toEqual(['other.plugin', 'demo.plugin']);
    expect(catalog.plugins[0].version).toBe('1.0.0');
    expect(catalog.plugins[0].refType).toBe('branch');
  });

  it('refuses direct catalog publication without explicit acknowledgement', async () => {
    const root = await createPluginRoot();
    await expect(publish({
      dryRun: true,
      config: { ...validPublishConfig(root), catalogMode: 'direct' },
    })).rejects.toThrow('PLUGIN_PUBLISH_DIRECT_CONFIRMATION_REQUIRED');
  });

  it('fails before tagging when neither GH_TOKEN nor an authenticated gh session is available', async () => {
    const root = await createPluginRoot();
    const executor: CommandExecutor = {
      async run(command) {
        if (command.command === 'gh' && command.args[0] === 'auth') throw new Error('not logged in');
        return { stdout: '', stderr: '' };
      },
    };

    await expect(publish({
      config: validPublishConfig(root),
      executor,
      pack: async () => ({ archive: path.join(root, 'demo.plugin-1.2.3.zip'), sha256: 'a'.repeat(64) }),
    })).rejects.toThrow('PLUGIN_PUBLISH_CREDENTIALS_MISSING');
  });

  it('rejects a catalog whose marketplace ID differs from the publish configuration', async () => {
    const root = await createPluginRoot();
    const catalogWorkspace = path.join(root, 'marketplace');
    const executor: CommandExecutor = {
      async run(command) {
        if (command.command === 'git' && command.args[0] === 'rev-parse') return { stdout: '0'.repeat(40), stderr: '' };
        if (command.command === 'gh' && command.args[0] === 'repo') {
          await fs.mkdir(catalogWorkspace, { recursive: true });
          await fs.writeFile(path.join(catalogWorkspace, 'catalog.json'), JSON.stringify({ schemaVersion: '1.0', marketplaceId: 'other', name: 'Other', plugins: [] }));
        }
        return { stdout: '', stderr: '' };
      },
    };

    await expect(publish({
      config: validPublishConfig(root), executor, catalogWorkspace,
      pack: async () => ({ archive: path.join(root, 'demo.plugin-1.2.3.zip'), sha256: 'a'.repeat(64) }),
    })).rejects.toThrow('PLUGIN_PUBLISH_CATALOG_MISMATCH');
  });

  it('does not plan remote release or catalog mutation with --no-push', async () => {
    const root = await createPluginRoot();
    const result = await publish({
      dryRun: true,
      noPush: true,
      config: validPublishConfig(root),
      pack: async () => ({ archive: path.join(root, 'demo.plugin-1.2.3.zip'), sha256: 'a'.repeat(64) }),
    });

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toContain('git tag -a v1.2.3');
  });
});

async function createPluginRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-publish-'));
  await fs.writeFile(path.join(root, 'guyantools.plugin.json'), JSON.stringify({
    schemaVersion: '1.1', id: 'demo.plugin', name: 'demo', displayName: 'Demo Plugin', version: '1.2.3',
    description: 'Demo plugin', hostVersionRange: '>=1.0.0', trustLevel: 'sandboxed',
    entry: { ui: 'index.html' }, permissions: ['ui.contribute'], capabilities: [],
  }));
  await fs.writeFile(path.join(root, 'index.html'), '<main />');
  return root;
}
