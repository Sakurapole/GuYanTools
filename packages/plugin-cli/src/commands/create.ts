import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function createPlugin(name: string, framework: 'vue' | 'react', cwd = process.cwd()) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('PLUGIN_CREATE_INVALID_NAME');
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const bundledTemplates = path.resolve(moduleDirectory, '..', 'templates');
  const sourceRoot = await exists(bundledTemplates) ? bundledTemplates : path.resolve(moduleDirectory, '..', '..', 'src', 'templates');
  const targetRoot = path.join(cwd, name);
  await fs.cp(path.join(sourceRoot, 'shared'), targetRoot, { recursive: true });
  await fs.cp(path.join(sourceRoot, framework), targetRoot, { recursive: true, force: true });
  const manifestPath = path.join(targetRoot, 'guyantools.plugin.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, any>;
  manifest.id = name.replace(/[^a-z0-9-]/g, '-');
  manifest.name = name;
  manifest.displayName = name;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of ['package.json']) {
    const packagePath = path.join(targetRoot, file);
    const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8')) as Record<string, any>;
    pkg.name = name;
    await fs.writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return targetRoot;
}

async function exists(directory: string) { try { await fs.access(directory); return true; } catch { return false; } }
