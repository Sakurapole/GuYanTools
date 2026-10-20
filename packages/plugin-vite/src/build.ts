import fs from 'node:fs/promises';
import path from 'node:path';
import { build as viteBuild, type InlineConfig } from 'vite';
import { defineGuYanPluginConfig, type GuYanPluginViteOptions } from './config';
import { copyProductionManifest } from './manifest';

export async function buildGuYanPlugin(
  options: GuYanPluginViteOptions
): Promise<{ exitCode: number; outDir: string }> {
  const outDir = path.resolve(
    options.outDir ?? path.join(path.dirname(path.resolve(options.uiEntry)), '..', 'dist')
  );
  const config = defineGuYanPluginConfig({ ...options, outDir });
  await viteBuild(config as InlineConfig);
  const uiPath = path.join(outDir, 'index.html');
  if (!(await exists(uiPath))) throw new Error(`PLUGIN_BUILD_ENTRY_MISSING: ${uiPath}`);
  const workerPath = options.workerEntry ? path.join(outDir, 'worker.js') : undefined;
  if (workerPath && !(await exists(workerPath)))
    throw new Error(`PLUGIN_BUILD_ENTRY_MISSING: ${workerPath}`);
  if (workerPath) {
    await fs.writeFile(
      path.join(outDir, 'worker-bootstrap.js'),
      "import './worker.js';\nawait window.pluginAPI.lifecycle.ready();\n",
      'utf8'
    );
    await fs.writeFile(
      path.join(outDir, 'worker.html'),
      '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'self\'; img-src \'self\' data:"></head><body><script type="module" src="./worker-bootstrap.js"></script></body></html>\n',
      'utf8'
    );
  }
  await copyProductionManifest(options.manifestPath, outDir, {
    ui: 'dist/index.html',
    worker: workerPath ? 'dist/worker.html' : undefined,
  });
  return { exitCode: 0, outDir };
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
