import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface PluginDevSessionFile { pluginId: string; uiUrl: string; workerUrl?: string; sessionToken: string; }

export async function writeSessionFile(rootPath: string, session: PluginDevSessionFile) {
  const directory = path.join(rootPath, '.guyantools');
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, 'plugin.dev.json');
  await fs.writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

export async function removeSessionFile(rootPath: string) {
  await fs.rm(path.join(rootPath, '.guyantools', 'plugin.dev.json'), { force: true });
}

export function createSessionToken() { return crypto.randomBytes(32).toString('base64url'); }
