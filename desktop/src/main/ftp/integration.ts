import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  FtpCliUsageError,
  resolveDefaultFtpProfile,
  runFtpSync,
  runFtpTransfer,
  type FtpRunnerDirection,
  type FtpRunnerSyncConflictPolicy,
  type FtpRunnerSyncDirection,
} from './runner';

const execFileAsync = promisify(execFile);

const REGISTRY_ROOTS = [
  'HKCU\\Software\\Classes\\*\\shell\\GuYanTools.Upload',
  'HKCU\\Software\\Classes\\Directory\\shell\\GuYanTools.Upload',
];

let pendingExternalPaths: string[] = [];

export type FtpCliInvocationResult = {
  route?: string;
  summary?: string;
  stdoutLines?: string[];
  stderrLines?: string[];
  taskId?: string;
  exitCode?: number;
};

export function addPendingExternalPaths(paths: string[]) {
  pendingExternalPaths = Array.from(new Set([
    ...pendingExternalPaths,
    ...paths.map((item) => item.trim()).filter(Boolean),
  ]));
}

export function getPendingExternalPaths() {
  return [...pendingExternalPaths];
}

export function clearPendingExternalPaths(paths?: string[]) {
  if (!paths?.length) {
    pendingExternalPaths = [];
    return;
  }
  const removeSet = new Set(paths);
  pendingExternalPaths = pendingExternalPaths.filter((item) => !removeSet.has(item));
}

export async function getWindowsContextMenuStatus() {
  try {
    await Promise.all(REGISTRY_ROOTS.map((key) => execFileAsync('reg', ['query', key])));
    return {
      installed: true,
      command: buildWindowsContextMenuCommand(),
    };
  } catch {
    return {
      installed: false,
      command: buildWindowsContextMenuCommand(),
    };
  }
}

export async function installWindowsContextMenu() {
  const command = buildWindowsContextMenuCommand();
  for (const key of REGISTRY_ROOTS) {
    await execFileAsync('reg', ['add', key, '/ve', '/d', '通过 GuYanTools 上传', '/f']);
    await execFileAsync('reg', ['add', key, '/v', 'Icon', '/d', process.execPath, '/f']);
    await execFileAsync('reg', ['add', key, '/v', 'MultiSelectModel', '/d', 'Player', '/f']);
    await execFileAsync('reg', ['add', `${key}\\command`, '/ve', '/d', command, '/f']);
  }
}

export async function uninstallWindowsContextMenu() {
  for (const key of REGISTRY_ROOTS) {
    try {
      await execFileAsync('reg', ['delete', key, '/f']);
    } catch {
      // Ignore missing registry keys so repeated uninstall stays idempotent.
    }
  }
}

export async function handleFtpCliArgs(argv: string[]): Promise<FtpCliInvocationResult | null> {
  const ftpIndex = argv.findIndex((item) => item === 'ftp');
  if (ftpIndex === -1 || argv.length <= ftpIndex + 1) {
    return null;
  }

  const command = argv[ftpIndex + 1];
  const commandArgs = argv.slice(ftpIndex + 2);
  const options = parseCliOptions(commandArgs);

  if (command === 'import-context') {
    const importPaths = collectImportPaths(options, commandArgs);
    if (!importPaths.length) {
      throw new Error('右键菜单启动缺少路径参数');
    }
    addPendingExternalPaths(importPaths);
    return {
      route: '/ftp?externalImports=1',
      summary: `已接收 ${importPaths.length} 个来自 Explorer 的路径`,
      stdoutLines: [`已接收 ${importPaths.length} 个来自 Explorer 的路径`],
      exitCode: 0,
    };
  }

  if (!['upload', 'download', 'sync'].includes(command)) {
    throw new FtpCliUsageError(`未知的 ftp 子命令：${command}`);
  }

  const profileLabel = options.get('session') ?? options.get('profile');
  const localPath = options.get('local') ?? '';
  const remotePath = options.get('remote') ?? '';
  if (!localPath || !remotePath) {
    throw new FtpCliUsageError('CLI 触发缺少本地或远程路径参数');
  }

  const profile = profileLabel
    ? { profileLabel }
    : { profileId: (await resolveDefaultFtpProfile()).id };

  if (command === 'sync') {
    const syncDirection = resolveCliSyncDirection(options.get('direction'));
    const conflictPolicy = resolveCliConflictPolicy(options.get('conflict-policy'));
    const verifyContent = resolveCliBoolean(options.get('checksum') ?? options.get('verify-content'));
    const recursive = resolveCliBoolean(options.get('recursive'), true);
    const result = await runFtpSync({
      ...profile,
      localPath,
      remotePath,
      direction: syncDirection,
      conflictPolicy,
      verifyContent,
      recursive,
    });
    const firstTaskId = result.summary.taskIds[0];
    const directionLabel = describeCliSyncDirection(syncDirection);
    const lines = [
      `同步已完成规划：${result.profile.label}`,
      `方向: ${directionLabel}`,
      `比较项: ${result.summary.comparedItemCount}`,
      `执行项: ${result.summary.executableItemCount}`,
      `上传/覆盖远程: ${result.summary.counts.upload + result.summary.counts.replaceRemote}`,
      `下载/覆盖本地: ${result.summary.counts.download + result.summary.counts.replaceLocal}`,
      `删除远程: ${result.summary.counts.deleteRemote}`,
      `删除本地: ${result.summary.counts.deleteLocal}`,
      `跳过: ${result.summary.counts.skip}`,
      `预计传输体积: ${formatCliSize(result.summary.transferSize)}`,
      `已入队任务数: ${result.summary.taskIds.length}`,
    ];
    return {
      route: firstTaskId ? `/ftp?taskId=${encodeURIComponent(firstTaskId)}` : '/ftp',
      summary: `同步任务已处理：${result.profile.label}`,
      stdoutLines: lines,
      exitCode: 0,
    };
  }

  const direction = resolveCliTransferDirection(command);
  const result = await runFtpTransfer({
    ...profile,
    direction,
    localPath,
    remotePath,
  });
  return {
    route: `/ftp?taskId=${encodeURIComponent(result.task.id)}`,
    summary: `${direction === 'upload' ? '上传' : '下载'}任务已入队：${result.profile.label}`,
    stdoutLines: [
      `${direction === 'upload' ? '上传' : '下载'}任务已入队：${result.profile.label}`,
      `任务 ID: ${result.task.id}`,
      `本地路径: ${localPath}`,
      `远程路径: ${remotePath}`,
    ],
    taskId: result.task.id,
    exitCode: 0,
  };
}

function buildWindowsContextMenuCommand() {
  const baseParts = app.isPackaged
    ? [`"${process.execPath}"`]
    : [`"${process.execPath}"`, `"${app.getAppPath()}"`];
  return `${baseParts.join(' ')} ftp import-context`;
}

function parseCliOptions(args: string[]) {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      options.set(key, 'true');
      continue;
    }
    options.set(key, next);
    index += 1;
  }
  return options;
}

function collectImportPaths(options: Map<string, string>, args: string[]) {
  const collected = [
    options.get('path'),
    options.get('paths'),
    ...extractPositionalArgs(args),
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[;\r\n]+/))
    .map((item) => item.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  return Array.from(new Set(collected));
}

function extractPositionalArgs(args: string[]) {
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current.startsWith('--')) {
      const next = args[index + 1];
      if (next && !next.startsWith('--')) {
        index += 1;
      }
      continue;
    }
    positional.push(current);
  }
  return positional;
}

export function resolveCliExitCode(error: unknown) {
  if (error instanceof FtpCliUsageError) {
    return 2;
  }
  return 3;
}

function resolveCliTransferDirection(command: string): FtpRunnerDirection {
  if (command === 'upload') return 'upload';
  if (command === 'download') return 'download';
  throw new FtpCliUsageError(`不支持的传输方向命令：${command}`);
}

function resolveCliSyncDirection(direction?: string): FtpRunnerSyncDirection {
  if (!direction || direction === 'bidirectional' || direction === 'sync' || direction === 'both') {
    return 'bidirectional';
  }
  if (direction === 'upload' || direction === 'localToRemote') {
    return 'localToRemote';
  }
  if (direction === 'download' || direction === 'remoteToLocal') {
    return 'remoteToLocal';
  }
  throw new FtpCliUsageError(`不支持的 sync 方向：${direction}`);
}

function resolveCliConflictPolicy(policy?: string): FtpRunnerSyncConflictPolicy {
  if (!policy || policy === 'keep-newer' || policy === 'keepNewer') {
    return 'keepNewer';
  }
  if (policy === 'prefer-local' || policy === 'preferLocal') {
    return 'preferLocal';
  }
  if (policy === 'prefer-remote' || policy === 'preferRemote') {
    return 'preferRemote';
  }
  if (policy === 'skip-conflicts' || policy === 'skipConflicts') {
    return 'skipConflicts';
  }
  throw new FtpCliUsageError(`不支持的冲突策略：${policy}`);
}

function resolveCliBoolean(value?: string, fallback = false) {
  if (value == null) return fallback;
  if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) return true;
  if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) return false;
  throw new FtpCliUsageError(`布尔参数值无效：${value}`);
}

function describeCliSyncDirection(direction: FtpRunnerSyncDirection) {
  if (direction === 'localToRemote') return '本地 -> 远程';
  if (direction === 'remoteToLocal') return '远程 -> 本地';
  return '双向同步';
}

function formatCliSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = size;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current >= 10 || index === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[index]}`;
}
