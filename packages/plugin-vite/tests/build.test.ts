import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGuYanPlugin } from '../src/build';

async function buildFixture(framework: 'vue' | 'react'): Promise<{ exitCode: number; outDir: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `guyantools-${framework}-`));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'index.html'), '<div id="app"></div><script type="module" src="/src/main.ts"></script>');
  await fs.writeFile(path.join(root, 'src/main.ts'), 'document.querySelector("#app")!.textContent = "plugin";');
  await fs.writeFile(path.join(root, 'src/worker.ts'), 'console.log("worker");');
  await fs.writeFile(path.join(root, 'guyantools.plugin.json'), JSON.stringify({ schemaVersion: '1.1', id: `${framework}.fixture`, version: '1.0.0', entry: { ui: 'index.html', worker: 'src/worker.ts' }, permissions: [], capabilities: [] }));
  const outDir = path.join(root, 'dist');
  return { ...(await buildGuYanPlugin({ framework, uiEntry: path.join(root, 'index.html'), workerEntry: path.join(root, 'src/worker.ts'), manifestPath: path.join(root, 'guyantools.plugin.json'), outDir })), outDir };
}

describe('plugin vite preset', () => {
  it.each(['vue', 'react'] as const)('builds %s UI and worker outputs', async framework => {
    const result = await buildFixture(framework);
    expect(result.exitCode).toBe(0);
    expect(await fs.stat(path.join(result.outDir, 'index.html'))).toBeTruthy();
    expect(await fs.stat(path.join(result.outDir, 'worker.js'))).toBeTruthy();
    const manifest = JSON.parse(await fs.readFile(path.join(result.outDir, 'guyantools.plugin.json'), 'utf8'));
    expect(manifest.entry.ui).toBe('dist/index.html');
    expect(manifest.entry.worker).toBe('dist/worker.js');
  });
});
