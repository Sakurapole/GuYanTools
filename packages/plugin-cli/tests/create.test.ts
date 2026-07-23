import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPlugin } from '../src/commands/create';

describe('plugin create', () => {
  it('creates a React project with a hybrid manifest', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-cli-'));
    const root = await createPlugin('demo', 'react', cwd);
    expect(await fs.stat(path.join(root, 'src/ui/main.tsx'))).toBeTruthy();
    expect(JSON.parse(await fs.readFile(path.join(root, 'guyantools.plugin.json'), 'utf8')).runtime).toBe('hybrid');
  });
});
