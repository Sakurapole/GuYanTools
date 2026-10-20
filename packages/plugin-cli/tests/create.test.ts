import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPlugin } from '../src/commands/create';
import { buildPlugin } from '../src/commands/build';
import { validatePlugin } from '../src/commands/validate';
import { packPlugin } from '../src/commands/pack';
import { execFileSync } from 'node:child_process';

describe('plugin create', () => {
  it('creates a React project with a hybrid manifest', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-cli-'));
    const root = await createPlugin('demo', 'react', cwd);
    expect(await fs.stat(path.join(root, 'src/ui/main.tsx'))).toBeTruthy();
    expect(
      JSON.parse(await fs.readFile(path.join(root, 'guyantools.plugin.json'), 'utf8')).runtime
    ).toBe('hybrid');
  });

  it.each(['vue', 'react'] as const)('declares the developer tools needed by a fresh %s project', async (framework) => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-cli-'));
    const root = await createPlugin('demo', framework, cwd);
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.devDependencies['@guyantools/plugin-cli']).toBe('^1.0.0');
    expect(pkg.devDependencies['@guyantools/plugin-sdk']).toBe('^1.0.0');
    expect(pkg.dependencies).not.toHaveProperty('@guyantools/plugin-ui');
  });

  it.each(['vue', 'react'] as const)('creates, builds, validates, and packs the %s template', async (framework) => {
    const parent = await fs.mkdtemp(path.join(process.cwd(), '.guyantools-cli-test-'));
    try {
      const root = await createPlugin(`${framework}-release`, framework, parent);
      await buildPlugin(root);
      const manifest = await validatePlugin(root);
      expect(manifest.entry).toEqual({ ui: 'dist/index.html', worker: 'dist/worker.html' });
      const packed = await packPlugin(root);
      const extracted = path.join(parent, 'extracted');
      await fs.mkdir(extracted);
      execFileSync('tar', ['-xf', packed.archive, '-C', extracted]);
      expect(await fs.readFile(path.join(extracted, 'dist/worker.html'), 'utf8')).toContain('worker-bootstrap.js');
      expect(await fs.readFile(path.join(extracted, 'dist/worker-bootstrap.js'), 'utf8')).toContain("import './worker.js'");
      expect((await validatePlugin(extracted)).runtime).toBe('hybrid');
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  });
});
