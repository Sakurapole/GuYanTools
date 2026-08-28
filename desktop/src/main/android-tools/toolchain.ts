import { execFile as nodeExecFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AndroidToolName, AndroidToolchainStatus } from '@/contracts/android-tools';

const execFile = promisify(nodeExecFile);

export type { AndroidToolName, AndroidToolchainStatus } from '@/contracts/android-tools';

export interface AndroidToolchainOptions {
  rootPath?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  expectedSha256?: Partial<Record<AndroidToolName, string>>;
  execute?: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
}

const REQUIRED_TOOLS: AndroidToolName[] = ['adb', 'fastboot', 'scrcpy', 'scrcpy-server'];

function toolRelativePath(tool: AndroidToolName, platform: NodeJS.Platform) {
  const executableSuffix = platform === 'win32' ? '.exe' : '';
  if (tool === 'adb') return path.join('platform-tools', `adb${executableSuffix}`);
  if (tool === 'fastboot') return path.join('platform-tools', `fastboot${executableSuffix}`);
  if (tool === 'scrcpy') return path.join('scrcpy', `scrcpy${executableSuffix}`);
  return path.join('scrcpy', 'scrcpy-server');
}

function defaultRootPath(platform: NodeJS.Platform, arch: string) {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    return path.join(resourcesPath, 'android-tools', `${platform}-${arch}`);
  }

  return path.join(__dirname, 'resources', `${platform}-${arch}`);
}

function isInsideRoot(candidate: string, root: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function extractVersion(output: string, tool: AndroidToolName) {
  const pattern = tool === 'adb'
    ? /Android Debug Bridge version\s+([^\s\r\n]+)/i
    : tool === 'fastboot'
      ? /fastboot version\s+([^\s\r\n]+)/i
      : /scrcpy\s+([^\s\r\n]+)/i;
  return output.match(pattern)?.[1];
}

export class AndroidToolchainManager {
  private readonly rootPath: string;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly expectedSha256: Partial<Record<AndroidToolName, string>>;
  private readonly execute: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

  constructor(options: AndroidToolchainOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.rootPath = path.resolve(options.rootPath ?? defaultRootPath(this.platform, this.arch));
    this.expectedSha256 = options.expectedSha256 ?? {};
    this.execute = options.execute ?? (async (file, args) => execFile(file, args, {
      windowsHide: true,
      maxBuffer: 256 * 1024,
    }));
  }

  resolve() {
    return {
      platform: this.platform,
      architecture: this.arch,
      rootPath: this.rootPath,
      versions: {},
    } satisfies Pick<AndroidToolchainStatus, 'platform' | 'architecture' | 'rootPath' | 'versions'>;
  }

  getToolPath(tool: AndroidToolName) {
    const relativePath = toolRelativePath(tool, this.platform);
    const candidate = path.resolve(this.rootPath, relativePath);
    if (!isInsideRoot(candidate, this.rootPath)) {
      throw new Error('ANDROID_TOOL_UNAVAILABLE');
    }

    return candidate;
  }

  async verify(): Promise<AndroidToolchainStatus> {
    const status: AndroidToolchainStatus = {
      ...this.resolve(),
      available: false,
      versions: {},
      checksums: {},
    };

    for (const tool of REQUIRED_TOOLS) {
      const toolPath = this.getToolPath(tool);
      try {
        await fs.access(toolPath);
      } catch {
        status.errorCode = 'ANDROID_TOOL_UNAVAILABLE';
        status.errorMessage = `缺少 ${tool}：${toolPath}`;
        return status;
      }

      const expected = this.expectedSha256[tool];
      if (expected) {
        const checksum = await this.sha256(toolPath);
        status.checksums![tool] = checksum;
        if (checksum.toLowerCase() !== expected.toLowerCase()) {
          status.errorCode = 'ANDROID_TOOL_CHECKSUM_MISMATCH';
          status.errorMessage = `${tool} SHA-256 校验失败`;
          return status;
        }
      }
    }

    for (const [tool, args] of [
      ['adb', ['version']],
      ['fastboot', ['--version']],
      ['scrcpy', ['--version']],
    ] as Array<[Exclude<AndroidToolName, 'scrcpy-server'>, string[]]>) {
      try {
        const output = await this.execute(this.getToolPath(tool), args);
        const version = extractVersion(`${output.stdout}\n${output.stderr}`, tool);
        if (!version) {
          status.errorCode = 'ANDROID_TOOL_VERSION_MISMATCH';
          status.errorMessage = `无法解析 ${tool} 版本`;
          return status;
        }
        status.versions[tool] = version;
      } catch (error) {
        status.errorCode = 'ANDROID_TOOL_UNAVAILABLE';
        status.errorMessage = `无法执行 ${tool}：${error instanceof Error ? error.message : String(error)}`;
        return status;
      }
    }

    status.available = true;
    return status;
  }

  private async sha256(filePath: string) {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
