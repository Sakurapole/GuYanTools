import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import path from 'node:path';

export type EverythingSearchStatus =
  | 'ok'
  | 'missing-es'
  | 'not-running'
  | 'timeout'
  | 'error';

export type EverythingSearchResponse = {
  status: EverythingSearchStatus;
  esPath?: string;
  paths: string[];
  message?: string;
};

const EVERYTHING_TIMEOUT_MS = 1600;
const EVERYTHING_MAX_BUFFER = 512 * 1024;
let cachedEsPath: string | null | undefined;
let cachedAutoDiscovery = true;

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function splitPathDirectories() {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .map(item => item.trim())
    .filter(Boolean);
}

function candidateEsPaths(configuredPath?: string) {
  const candidates: string[] = [];
  const trimmedConfiguredPath = configuredPath?.trim();
  const envPath = process.env.EVERYTHING_ES_PATH;
  const scoop = process.env.SCOOP;
  const scoopGlobal = process.env.SCOOP_GLOBAL;
  const localAppData = process.env.LOCALAPPDATA;

  if (trimmedConfiguredPath) {
    return [path.resolve(trimmedConfiguredPath)];
  }

  if (envPath) {
    candidates.push(envPath);
  }

  for (const directory of splitPathDirectories()) {
    candidates.push(path.join(directory, 'es.exe'));
  }

  candidates.push(
    'C:\\Program Files\\Everything\\es.exe',
    'C:\\Program Files (x86)\\Everything\\es.exe',
  );

  if (localAppData) {
    candidates.push(path.join(localAppData, 'Programs', 'Everything', 'es.exe'));
  }

  for (const root of [scoop, scoopGlobal].filter((item): item is string => Boolean(item))) {
    candidates.push(
      path.join(root, 'shims', 'es.exe'),
      path.join(root, 'apps', 'everything', 'current', 'es.exe'),
      path.join(root, 'apps', 'es', 'current', 'es.exe'),
    );
  }

  return [...new Set(candidates.map(item => path.resolve(item)))];
}

export async function resolveEverythingEsPath(configuredPath?: string) {
  const autoDiscovery = !configuredPath?.trim();
  if (autoDiscovery && cachedAutoDiscovery && cachedEsPath !== undefined) {
    return cachedEsPath;
  }

  for (const candidate of candidateEsPaths(configuredPath)) {
    if (await fileExists(candidate)) {
      if (autoDiscovery) {
        cachedEsPath = candidate;
        cachedAutoDiscovery = true;
      }
      return candidate;
    }
  }

  if (autoDiscovery) {
    cachedEsPath = null;
    cachedAutoDiscovery = true;
  }
  return null;
}

export function resetEverythingEsPathCache() {
  cachedEsPath = undefined;
  cachedAutoDiscovery = true;
}

function execEverything(esPath: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }>((resolve) => {
    execFile(
      esPath,
      args,
      {
        encoding: 'buffer',
        maxBuffer: EVERYTHING_MAX_BUFFER,
        timeout: EVERYTHING_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const code = typeof (error as { code?: unknown } | null)?.code === 'number'
          ? (error as { code: number }).code
          : error ? 1 : 0;
        resolve({
          stdout: decodeEverythingOutput(stdout ?? Buffer.alloc(0)),
          stderr: decodeEverythingOutput(stderr ?? Buffer.alloc(0)),
          code,
          timedOut: Boolean((error as { killed?: boolean } | null)?.killed),
        });
      },
    );
  });
}

function decodeEverythingOutput(output: Buffer) {
  if (output.length === 0) {
    return '';
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(output);
  } catch {
    return new TextDecoder('gb18030').decode(output);
  }
}

export async function searchEverything(
  query: string,
  limit: number,
  configuredPath?: string,
): Promise<EverythingSearchResponse> {
  const esPath = await resolveEverythingEsPath(configuredPath);
  if (!esPath) {
    const message = configuredPath?.trim()
      ? `设置中的 es.exe 路径不存在：${configuredPath.trim()}`
      : '未找到 Everything ES 命令行工具 es.exe。';
    return { status: 'missing-es', paths: [], message };
  }

  const boundedLimit = Math.max(1, Math.min(50, Math.round(limit)));
  const response = await execEverything(esPath, ['-n', String(boundedLimit), query]);

  if (response.timedOut) {
    return { status: 'timeout', esPath, paths: [], message: 'Everything 查询超时。' };
  }

  if (response.code === 8) {
    return { status: 'not-running', esPath, paths: [], message: 'Everything 未运行或 IPC 不可用。' };
  }

  if (response.code !== 0) {
    return {
      status: 'error',
      esPath,
      paths: [],
      message: response.stderr.trim() || `Everything 查询失败，退出码 ${response.code}。`,
    };
  }

  const paths = response.stdout
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, boundedLimit);

  return { status: 'ok', esPath, paths };
}
