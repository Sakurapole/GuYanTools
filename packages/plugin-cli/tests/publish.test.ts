import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { publish } from '../src/commands/publish';
import type { PublishConfig } from '../src/publish/publish_config';

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
});
