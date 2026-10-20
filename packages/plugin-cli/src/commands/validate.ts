import fs from 'node:fs/promises';
import path from 'node:path';
import { validateProductionManifest } from '@guyantools/plugin-vite';

export async function validatePlugin(
  rootPath = process.cwd(),
  options: { checkEntryFiles?: boolean } = {}
) {
  const root = path.resolve(rootPath);
  const manifestPath = path.join(root, 'guyantools.plugin.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, any>;
  validateProductionManifest(manifest);
  for (const [kind, entry] of Object.entries(manifest.entry) as [string, unknown][]) {
    if (typeof entry !== 'string' || path.isAbsolute(entry))
      throw new Error('PLUGIN_ENTRY_INVALID');
    const resolved = path.resolve(root, entry);
    const relative = path.relative(root, resolved);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error(`PLUGIN_ENTRY_INVALID: entry.${kind} escapes the plugin root`);
    if (options.checkEntryFiles === false) continue;
    let current = root;
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      let stats;
      try {
        stats = await fs.lstat(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          throw new Error(`PLUGIN_ENTRY_MISSING: entry.${kind} ${entry}`);
        throw error;
      }
      if (stats.isSymbolicLink()) throw new Error(`PLUGIN_ENTRY_SYMLINK: entry.${kind} ${entry}`);
    }
    if (!(await fs.stat(resolved)).isFile())
      throw new Error(`PLUGIN_ENTRY_INVALID: entry.${kind} must be a file`);
  }
  return manifest;
}
