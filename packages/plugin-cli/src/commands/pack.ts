import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { buildPlugin } from './build.js';

export async function packPlugin(rootPath = process.cwd()) {
  const root = path.resolve(rootPath);
  const { manifest } = await buildPlugin(root);
  const staging = await fs.mkdtemp(path.join(root, '.guyantools-pack-'));
  const copy = async (name: string) => { const source = path.join(root, name); try { await fs.cp(source, path.join(staging, name), { recursive: true, filter: sourcePath => !sourcePath.includes('node_modules') && !sourcePath.endsWith('.map') }); } catch { /* optional README/LICENSE */ } };
  await copy('dist'); await copy('guyantools.plugin.json'); await copy('README.md'); await copy('LICENSE');
  const archive = path.join(root, `${path.basename(root)}.zip`);
  await runPowerShellArchive(staging, archive);
  const hash = crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex');
  await fs.writeFile(path.join(root, 'catalog-entry.json'), `${JSON.stringify({ id: manifest.id, version: manifest.version, permissions: manifest.permissions ?? [], capabilities: manifest.capabilities ?? [], archive: path.basename(archive), sha256: hash }, null, 2)}\n`);
  await fs.rm(staging, { recursive: true, force: true });
  return { archive, sha256: hash };
}

async function runPowerShellArchive(staging: string, archive: string) {
  await new Promise<void>((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -Path '${staging}\\*' -DestinationPath '${archive}' -Force`], { shell: false });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`PLUGIN_PACK_FAILED: ${code}`)));
  });
}
