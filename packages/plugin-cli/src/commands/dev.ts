import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createSessionToken, removeSessionFile, writeSessionFile } from '../session_file.js';

export interface DevOptions { rootPath?: string; port?: number; command?: string; }

export async function devPlugin(options: DevOptions = {}) {
  const rootPath = path.resolve(options.rootPath ?? process.cwd());
  const command = options.command ?? 'vite';
  const port = options.port ?? 5173;
  const child = spawn(command, ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: rootPath, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  const session = { pluginId: (JSON.parse(await fs.readFile(path.join(rootPath, 'guyantools.plugin.json'), 'utf8')) as { id: string }).id, uiUrl: `http://127.0.0.1:${port}/index.html`, workerUrl: `http://127.0.0.1:${port}/worker.js`, sessionToken: createSessionToken() };
  const sessionPath = await writeSessionFile(rootPath, session);
  const cleanup = async () => { if (!child.killed) child.kill(); await removeSessionFile(rootPath); };
  child.once('error', () => void cleanup());
  process.once('SIGINT', () => void cleanup());
  process.once('SIGTERM', () => void cleanup());
  return { child, session, sessionPath, stop: cleanup };
}
