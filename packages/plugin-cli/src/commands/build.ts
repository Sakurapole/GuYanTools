import fs from 'node:fs/promises';
import path from 'node:path';
import { buildGuYanPlugin } from '@guyantools/plugin-vite';
import { validatePlugin } from './validate.js';

export async function buildPlugin(rootPath = process.cwd()) {
  const manifest = await validatePlugin(rootPath);
  const react = await exists(path.join(rootPath, 'src/ui/main.tsx'));
  return buildGuYanPlugin({ framework: react ? 'react' : 'vue', uiEntry: path.join(rootPath, 'index.html'), workerEntry: await exists(path.join(rootPath, 'src/worker.ts')) ? path.join(rootPath, 'src/worker.ts') : undefined, manifestPath: path.join(rootPath, 'guyantools.plugin.json'), outDir: path.join(rootPath, 'dist') }).then(result => ({ ...result, manifest }));
}

async function exists(filePath: string) { try { await fs.access(filePath); return true; } catch { return false; } }
