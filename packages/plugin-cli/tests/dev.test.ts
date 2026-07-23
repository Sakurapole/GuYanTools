import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { devPlugin } from '../src/commands/dev';

describe('plugin dev', () => {
  it('writes a loopback-only session file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-dev-'));
    await fs.writeFile(path.join(root, 'guyantools.plugin.json'), JSON.stringify({ id: 'demo.plugin' }));
    const result = await devPlugin({ rootPath: root, command: process.execPath, port: 5189 });
    const session = JSON.parse(await fs.readFile(result.sessionPath, 'utf8'));
    expect(session.uiUrl).toBe('http://127.0.0.1:5189/index.html');
    expect(session.uiUrl).not.toContain('0.0.0.0');
    await result.stop();
  });
});
