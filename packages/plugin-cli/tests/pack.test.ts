import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packPlugin } from '../src/commands/pack';

describe('plugin pack', () => {
  it('creates a hashable archive without development session files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-pack-'));
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>');
    await fs.writeFile(path.join(root, 'src/main.ts'), 'document.body.textContent = "demo";');
    await fs.writeFile(path.join(root, 'guyantools.plugin.json'), JSON.stringify({ schemaVersion: '1.1', id: 'demo.plugin', version: '1.0.0', entry: { ui: 'index.html' }, permissions: [], capabilities: [] }));
    const result = await packPlugin(root);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await fs.stat(result.archive)).toBeTruthy();
    expect(JSON.parse(await fs.readFile(path.join(root, 'catalog-entry.json'), 'utf8')).id).toBe('demo.plugin');
  });
});
