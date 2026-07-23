import fs from 'node:fs/promises';
import path from 'node:path';

const DEV_FIELDS = ['dev', 'devServer', 'uiUrl', 'workerUrl'] as const;

export function validateProductionManifest(manifest: unknown): asserts manifest is Record<string, any> {
  if (!manifest || typeof manifest !== 'object') throw new Error('PLUGIN_MANIFEST_INVALID: manifest must be an object');
  const value = manifest as Record<string, any>;
  for (const field of DEV_FIELDS) if (field in value) throw new Error(`PLUGIN_MANIFEST_DEV_FIELD: ${field} is not allowed in production`);
  if (!value.entry || typeof value.entry !== 'object') throw new Error('PLUGIN_ENTRY_INVALID: manifest entry is required');
  for (const [kind, entry] of Object.entries(value.entry)) {
    if (typeof entry !== 'string' || path.isAbsolute(entry) || entry.includes('..')) throw new Error(`PLUGIN_ENTRY_INVALID: entry.${kind} must be relative`);
  }
}

export async function copyProductionManifest(manifestPath: string | undefined, outDir: string, entries: { ui?: string; worker?: string }) {
  if (!manifestPath) return;
  const input = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, any>;
  validateProductionManifest(input);
  const output = { ...input, entry: { ...(input.entry ?? {}), ...(entries.ui ? { ui: entries.ui } : {}), ...(entries.worker ? { worker: entries.worker } : {}) } };
  await fs.writeFile(path.join(outDir, 'guyantools.plugin.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}
