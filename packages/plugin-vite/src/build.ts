import fs from 'node:fs/promises';
import path from 'node:path';
import { build as viteBuild, type InlineConfig } from 'vite';
import { defineGuYanPluginConfig, type GuYanPluginViteOptions } from './config';
import { copyProductionManifest } from './manifest';

export async function buildGuYanPlugin(options: GuYanPluginViteOptions): Promise<{ exitCode: number; outDir: string }> {
  const outDir = path.resolve(options.outDir ?? path.join(path.dirname(path.resolve(options.uiEntry)), '..', 'dist'));
  const config = defineGuYanPluginConfig({ ...options, outDir });
  await viteBuild(config as InlineConfig);
  const uiPath = path.join(outDir, 'index.html');
  if (!await exists(uiPath)) throw new Error(`PLUGIN_BUILD_ENTRY_MISSING: ${uiPath}`);
  const workerPath = options.workerEntry ? path.join(outDir, 'worker.js') : undefined;
  if (workerPath && !await exists(workerPath)) throw new Error(`PLUGIN_BUILD_ENTRY_MISSING: ${workerPath}`);
  await copyProductionManifest(options.manifestPath, outDir, { ui: 'dist/index.html', worker: workerPath ? 'dist/worker.js' : undefined });
  return { exitCode: 0, outDir };
}

async function exists(filePath: string) {
  try { await fs.access(filePath); return true; } catch { return false; }
}
