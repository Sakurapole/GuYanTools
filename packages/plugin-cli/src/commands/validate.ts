import fs from 'node:fs/promises';
import path from 'node:path';
import { validateProductionManifest } from '@guyantools/plugin-vite';

export async function validatePlugin(rootPath = process.cwd()) {
  const manifestPath = path.join(rootPath, 'guyantools.plugin.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, any>;
  validateProductionManifest(manifest);
  for (const entry of Object.values(manifest.entry) as unknown[]) {
    if (typeof entry !== 'string' || path.isAbsolute(entry)) throw new Error('PLUGIN_ENTRY_INVALID');
  }
  return manifest;
}
