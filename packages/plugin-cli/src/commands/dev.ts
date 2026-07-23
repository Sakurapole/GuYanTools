import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createSessionToken, removeSessionFile, writeSessionFile } from '../session_file.js';
import type { PluginDevSession } from '@guyantools/plugin-sdk';
import { attachToDevChannel, type PluginDevChannelEndpoint } from '../dev_channel.js';

export interface DevOptions {
  rootPath?: string;
  port?: number;
  command?: string;
  commandArgs?: string[];
  attach?: (session: PluginDevSession) => Promise<void>;
  channel?: PluginDevChannelEndpoint;
}

export async function devPlugin(options: DevOptions = {}) {
  const rootPath = path.resolve(options.rootPath ?? process.cwd());
  const command = options.command ?? 'vite';
  const port = options.port ?? 5173;
  const child = spawn(command, options.commandArgs ?? ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: rootPath, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  const actualPort = await waitForVitePort(child, port);
  const pluginId = (JSON.parse(await fs.readFile(path.join(rootPath, 'guyantools.plugin.json'), 'utf8')) as { id: string }).id;
  const session = { pluginId, uiUrl: `http://127.0.0.1:${actualPort}/index.html`, workerUrl: `http://127.0.0.1:${actualPort}/worker.js`, sessionToken: createSessionToken() };
  const devSession: PluginDevSession = { ...session, rootPath, host: '127.0.0.1', port: actualPort, startedAt: new Date().toISOString() };
  const sessionPath = await writeSessionFile(rootPath, session);
  const cleanup = async () => { if (!child.killed) child.kill(); await removeSessionFile(rootPath); };
  child.once('error', () => void cleanup());
  process.once('SIGINT', () => void cleanup());
  process.once('SIGTERM', () => void cleanup());
  try {
    if (options.attach) await options.attach(devSession);
    else if (options.channel) await attachToDevChannel(options.channel, devSession);
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { child, session, devSession, sessionPath, stop: cleanup };
}

function waitForVitePort(child: ReturnType<typeof spawn>, fallbackPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let output = '';
    const onData = (chunk: Buffer | string) => {
      output += chunk.toString();
      const match = output.match(/https?:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) finish(Number(match[1]));
    };
    const onExit = (code: number | null) => finish(fallbackPort, code === 0 ? undefined : new Error(`PLUGIN_DEV_SERVER_EXITED: ${code}`));
    const onError = (error: Error) => finish(fallbackPort, error);
    const finish = (port: number, error?: Error) => {
      child.stdout?.off('data', onData); child.stderr?.off('data', onData);
      child.off('exit', onExit); child.off('error', onError);
      error ? reject(error) : resolve(port);
    };
    child.stdout?.on('data', onData); child.stderr?.on('data', onData);
    child.once('exit', onExit); child.once('error', onError);
    setTimeout(() => finish(fallbackPort), 1_500).unref?.();
  });
}
