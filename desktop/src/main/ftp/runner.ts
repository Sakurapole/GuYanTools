import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ftpHost } from './host';
import type { FileTransferEntry, FtpProfile, TransferTask } from '@/contracts/ftp';

export type FtpRunnerDirection = 'upload' | 'download';
export type FtpRunnerSyncDirection = 'localToRemote' | 'remoteToLocal' | 'bidirectional';
export type FtpRunnerSyncConflictPolicy = 'keepNewer' | 'preferLocal' | 'preferRemote' | 'skipConflicts';

export type RunFtpTransferInput = {
  profileId?: string;
  profileLabel?: string;
  direction: FtpRunnerDirection;
  localPath: string;
  remotePath: string;
};

export type RunFtpSyncInput = {
  profileId?: string;
  profileLabel?: string;
  localPath: string;
  remotePath: string;
  direction: FtpRunnerSyncDirection;
  conflictPolicy?: FtpRunnerSyncConflictPolicy;
  recursive?: boolean;
  verifyContent?: boolean;
};

export class FtpCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FtpCliUsageError';
  }
}

type SyncDiffStatus = 'localOnly' | 'remoteOnly' | 'different' | 'same';
type SyncDifferenceKind = 'type' | 'size' | 'modifiedAt' | 'content';
type SyncContentVerification = 'notCompared' | 'same' | 'different';
type SyncActionKind = 'upload' | 'download' | 'deleteRemote' | 'deleteLocal' | 'replaceRemote' | 'replaceLocal' | 'skip';

type SyncComparisonItem = {
  key: string;
  name: string;
  relativePath: string;
  depth: number;
  localEntry: FileTransferEntry | null;
  remoteEntry: FileTransferEntry | null;
  status: SyncDiffStatus;
  transferSize: number;
  differenceKinds: SyncDifferenceKind[];
  contentVerification: SyncContentVerification;
};

type SyncPreviewItem = SyncComparisonItem & {
  action: SyncActionKind;
};

type SyncExecutionSummary = {
  comparedItemCount: number;
  executableItemCount: number;
  counts: Record<SyncActionKind, number>;
  taskIds: string[];
  transferSize: number;
};

export async function resolveFtpProfile(input: { profileId?: string; profileLabel?: string }) {
  const profiles = await ftpHost.listProfiles();
  if (input.profileId) {
    const profile = profiles.find((item) => item.id === input.profileId);
    if (!profile) {
      throw new FtpCliUsageError(`未找到 FTP 配置：${input.profileId}`);
    }
    return profile;
  }

  if (input.profileLabel) {
    const profile = profiles.find((item) => item.label === input.profileLabel);
    if (!profile) {
      throw new FtpCliUsageError(`未找到 FTP 配置：${input.profileLabel}`);
    }
    return profile;
  }

  throw new FtpCliUsageError('缺少 FTP 配置标识');
}

export async function resolveDefaultFtpProfile(): Promise<FtpProfile> {
  const restoreStates = await ftpHost.listRestoreStates();
  if (restoreStates.length) {
    const profiles = await ftpHost.listProfiles();
    const restoreProfileId = [...restoreStates].sort((left, right) => left.tabOrder - right.tabOrder)[0]?.sessionId;
    const matched = profiles.find((item) => item.id === restoreProfileId);
    if (matched) {
      return matched;
    }
  }

  const profiles = await ftpHost.listProfiles();
  if (!profiles.length) {
    throw new FtpCliUsageError('当前没有可用的 FTP 配置');
  }
  return profiles[0];
}

export async function runFtpTransfer(input: RunFtpTransferInput): Promise<{
  profile: FtpProfile;
  sessionId: string;
  task: TransferTask;
}> {
  const profile = await resolveFtpProfile(input);
  const session = await ftpHost.connect({ profileId: profile.id });
  const task = input.direction === 'upload'
    ? await ftpHost.uploadFile(session.sessionId, input.localPath, input.remotePath)
    : await ftpHost.downloadFile(session.sessionId, input.remotePath, input.localPath);
  return {
    profile,
    sessionId: session.sessionId,
    task,
  };
}

export async function runFtpSync(input: RunFtpSyncInput): Promise<{
  profile: FtpProfile;
  sessionId: string;
  summary: SyncExecutionSummary;
}> {
  if (!input.localPath.trim() || !input.remotePath.trim()) {
    throw new FtpCliUsageError('CLI 同步缺少本地或远程路径参数');
  }
  const profile = await resolveFtpProfile(input);
  const session = await ftpHost.connect({ profileId: profile.id });
  const localRootPath = normalizeLocalPath(input.localPath);
  const remoteRootPath = normalizeRemotePath(input.remotePath);
  const recursive = input.recursive !== false;
  const verifyContent = Boolean(input.verifyContent);
  const conflictPolicy = input.conflictPolicy ?? 'keepNewer';

  let comparisonItems = recursive
    ? await buildRecursiveSyncComparisonItems(session.sessionId, localRootPath, remoteRootPath)
    : await buildShallowSyncComparisonItems(session.sessionId, localRootPath, remoteRootPath);
  if (verifyContent) {
    comparisonItems = await verifySyncComparisonContent(comparisonItems, session.sessionId);
  }
  const previewItems = comparisonItems.map((item) => ({
    ...item,
    action: determineSyncAction(item, input.direction, conflictPolicy),
  }));
  const executableItems = previewItems.filter((item) => item.action !== 'skip');

  const counts: Record<SyncActionKind, number> = {
    upload: 0,
    download: 0,
    deleteRemote: 0,
    deleteLocal: 0,
    replaceRemote: 0,
    replaceLocal: 0,
    skip: previewItems.length - executableItems.length,
  };
  const taskIds: string[] = [];
  let transferSize = 0;

  for (const item of previewItems) {
    counts[item.action] += item.action === 'skip' ? 0 : 1;
  }

  for (const item of executableItems) {
    if (!['deleteRemote', 'deleteLocal', 'skip'].includes(item.action)) {
      transferSize += item.transferSize;
    }
    const queuedTask = await executeSyncAction(session.sessionId, localRootPath, remoteRootPath, item);
    if (queuedTask?.id) {
      taskIds.push(queuedTask.id);
    }
  }

  return {
    profile,
    sessionId: session.sessionId,
    summary: {
      comparedItemCount: comparisonItems.length,
      executableItemCount: executableItems.length,
      counts,
      taskIds,
      transferSize,
    },
  };
}

async function executeSyncAction(
  sessionId: string,
  localRootPath: string,
  remoteRootPath: string,
  item: SyncPreviewItem,
) {
  const localTargetPath = item.relativePath ? path.join(localRootPath, ...item.relativePath.split('/')) : localRootPath;
  const remoteTargetPath = item.relativePath ? joinRemotePath(remoteRootPath, item.relativePath) : remoteRootPath;

  switch (item.action) {
    case 'upload':
    case 'replaceRemote':
      return ftpHost.uploadFile(sessionId, item.localEntry?.path || localTargetPath, remoteTargetPath);
    case 'download':
    case 'replaceLocal':
      return ftpHost.downloadFile(sessionId, item.remoteEntry?.path || remoteTargetPath, localTargetPath);
    case 'deleteRemote':
      await ftpHost.deleteRemotePath(sessionId, item.remoteEntry?.path || remoteTargetPath);
      return null;
    case 'deleteLocal':
      await ftpHost.deleteLocalPath(item.localEntry?.path || localTargetPath);
      return null;
    default:
      return null;
  }
}

async function buildShallowSyncComparisonItems(sessionId: string, localRootPath: string, remoteRootPath: string) {
  const localRootEntry = await getLocalRootEntry(localRootPath);
  const remoteRootEntry = await getRemoteRootEntry(sessionId, remoteRootPath);
  if (!localRootEntry?.isDir || !remoteRootEntry?.isDir) {
    return [buildRootComparisonItem(localRootEntry, remoteRootEntry)];
  }
  const [localEntries, remoteEntries] = await Promise.all([
    ftpHost.listLocalDirectory(localRootPath),
    ftpHost.listRemoteDirectory(sessionId, remoteRootPath),
  ]);
  return buildSyncComparisonItems(localEntries, remoteEntries);
}

async function buildRecursiveSyncComparisonItems(sessionId: string, localRootPath: string, remoteRootPath: string) {
  const localRootEntry = await getLocalRootEntry(localRootPath);
  const remoteRootEntry = await getRemoteRootEntry(sessionId, remoteRootPath);
  if (!localRootEntry?.isDir || !remoteRootEntry?.isDir) {
    return [buildRootComparisonItem(localRootEntry, remoteRootEntry)];
  }

  const items: SyncComparisonItem[] = [];
  async function walk(localPath: string, remotePath: string, parentRelativePath = '') {
    const [localEntries, remoteEntries] = await Promise.all([
      ftpHost.listLocalDirectory(localPath),
      ftpHost.listRemoteDirectory(sessionId, remotePath),
    ]);
    const currentItems = buildSyncComparisonItems(localEntries, remoteEntries, parentRelativePath);
    items.push(...currentItems);

    for (const item of currentItems) {
      if (item.localEntry?.isDir && item.remoteEntry?.isDir) {
        await walk(item.localEntry.path, item.remoteEntry.path, item.relativePath);
      }
    }
  }

  await walk(localRootPath, remoteRootPath);
  return items;
}

async function verifySyncComparisonContent(items: SyncComparisonItem[], sessionId: string) {
  const nextItems = items.map((item) => ({
    ...item,
    differenceKinds: [...item.differenceKinds],
  }));
  for (const item of nextItems) {
    if (!item.localEntry || !item.remoteEntry || item.localEntry.isDir || item.remoteEntry.isDir) {
      continue;
    }
    if (item.localEntry.size !== item.remoteEntry.size) {
      continue;
    }
    const [localHash, remoteHash] = await Promise.all([
      ftpHost.computeLocalFileSha256(item.localEntry.path),
      ftpHost.computeRemoteFileSha256(sessionId, item.remoteEntry.path),
    ]);
    item.contentVerification = localHash && remoteHash && localHash === remoteHash ? 'same' : 'different';
    item.differenceKinds = item.differenceKinds.filter((kind) => kind !== 'content');
    if (item.contentVerification === 'different') {
      item.differenceKinds.push('content');
    }
    item.status = syncStatusFromDifferences(item.localEntry, item.remoteEntry, item.differenceKinds);
  }
  return nextItems;
}

function buildSyncComparisonItems(localEntries: FileTransferEntry[], remoteEntries: FileTransferEntry[], parentRelativePath = '') {
  const allNames = Array.from(new Set([
    ...localEntries.map((entry) => entry.name),
    ...remoteEntries.map((entry) => entry.name),
  ])).sort((left, right) => left.localeCompare(right, 'zh-CN'));

  return allNames.map((name) => {
    const localEntry = localEntries.find((entry) => entry.name === name) ?? null;
    const remoteEntry = remoteEntries.find((entry) => entry.name === name) ?? null;
    const differenceKinds = determineSyncDifferenceKinds(localEntry, remoteEntry);
    const status = syncStatusFromDifferences(localEntry, remoteEntry, differenceKinds);
    return {
      key: parentRelativePath ? `${parentRelativePath}/${name}` : name,
      name,
      relativePath: parentRelativePath ? `${parentRelativePath}/${name}` : name,
      depth: parentRelativePath ? parentRelativePath.split('/').length : 0,
      localEntry,
      remoteEntry,
      status,
      transferSize: Math.max(localEntry?.size ?? 0, remoteEntry?.size ?? 0),
      differenceKinds,
      contentVerification: 'notCompared' as const,
    };
  });
}

function buildRootComparisonItem(localEntry: FileTransferEntry | null, remoteEntry: FileTransferEntry | null): SyncComparisonItem {
  const differenceKinds = determineSyncDifferenceKinds(localEntry, remoteEntry);
  return {
    key: '__root__',
    name: localEntry?.name || remoteEntry?.name || 'root',
    relativePath: '',
    depth: 0,
    localEntry,
    remoteEntry,
    status: syncStatusFromDifferences(localEntry, remoteEntry, differenceKinds),
    transferSize: Math.max(localEntry?.size ?? 0, remoteEntry?.size ?? 0),
    differenceKinds,
    contentVerification: 'notCompared',
  };
}

function determineSyncDifferenceKinds(localEntry: FileTransferEntry | null, remoteEntry: FileTransferEntry | null): SyncDifferenceKind[] {
  if (localEntry && !remoteEntry) return [];
  if (!localEntry && remoteEntry) return [];
  if (!localEntry || !remoteEntry) return [];
  if (localEntry.isDir !== remoteEntry.isDir) return ['type'];
  if (localEntry.isDir && remoteEntry.isDir) return [];
  const differences: SyncDifferenceKind[] = [];
  if (localEntry.size !== remoteEntry.size) {
    differences.push('size');
  }
  const modifiedGap = Math.abs((localEntry.modifiedAt ?? 0) - (remoteEntry.modifiedAt ?? 0));
  if (modifiedGap >= 1000) {
    differences.push('modifiedAt');
  }
  return differences;
}

function determineSyncAction(
  item: SyncComparisonItem,
  direction: FtpRunnerSyncDirection,
  conflictPolicy: FtpRunnerSyncConflictPolicy,
): SyncActionKind {
  if (item.status === 'same') return 'skip';
  if (item.status === 'localOnly') {
    return direction === 'remoteToLocal' ? 'deleteLocal' : 'upload';
  }
  if (item.status === 'remoteOnly') {
    return direction === 'localToRemote' ? 'deleteRemote' : 'download';
  }
  if (conflictPolicy === 'skipConflicts') return 'skip';
  if (conflictPolicy === 'preferLocal') return 'replaceRemote';
  if (conflictPolicy === 'preferRemote') return 'replaceLocal';
  if (direction === 'localToRemote') return 'replaceRemote';
  if (direction === 'remoteToLocal') return 'replaceLocal';

  const localModifiedAt = item.localEntry?.modifiedAt ?? 0;
  const remoteModifiedAt = item.remoteEntry?.modifiedAt ?? 0;
  return localModifiedAt >= remoteModifiedAt ? 'replaceRemote' : 'replaceLocal';
}

function syncStatusFromDifferences(
  localEntry: FileTransferEntry | null,
  remoteEntry: FileTransferEntry | null,
  differenceKinds: SyncDifferenceKind[],
): SyncDiffStatus {
  if (localEntry && !remoteEntry) return 'localOnly';
  if (!localEntry && remoteEntry) return 'remoteOnly';
  if (!localEntry || !remoteEntry) return 'same';
  return differenceKinds.length ? 'different' : 'same';
}

async function getLocalRootEntry(localRootPath: string): Promise<FileTransferEntry | null> {
  try {
    const stat = await fs.stat(localRootPath);
    return {
      name: path.basename(localRootPath) || localRootPath,
      path: localRootPath,
      isDir: stat.isDirectory(),
      size: stat.isDirectory() ? 0 : stat.size,
      modifiedAt: stat.mtimeMs,
      source: 'local',
    };
  } catch {
    return null;
  }
}

async function getRemoteRootEntry(sessionId: string, remoteRootPath: string): Promise<FileTransferEntry | null> {
  const normalizedPath = normalizeRemotePath(remoteRootPath);
  const parentPath = parentRemotePath(normalizedPath);
  const targetName = normalizedPath.split('/').filter(Boolean).pop() || normalizedPath;
  try {
    const siblings = await ftpHost.listRemoteDirectory(sessionId, parentPath);
    return siblings.find((entry) => entry.name === targetName) ?? null;
  } catch {
    try {
      await ftpHost.listRemoteDirectory(sessionId, normalizedPath);
      return {
        name: targetName,
        path: normalizedPath,
        isDir: true,
        size: 0,
        source: 'remote',
      };
    } catch {
      return null;
    }
  }
}

function normalizeLocalPath(input: string) {
  return path.resolve(input.trim());
}

function normalizeRemotePath(input: string) {
  const normalized = input.trim().replace(/\\/g, '/');
  if (!normalized) {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function joinRemotePath(basePath: string, relativePath: string) {
  const base = normalizeRemotePath(basePath).replace(/\/+$/, '');
  const suffix = relativePath.split('/').filter(Boolean).join('/');
  return suffix ? `${base}/${suffix}` : base || '/';
}

function parentRemotePath(targetPath: string) {
  const normalized = normalizeRemotePath(targetPath);
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return '/';
  }
  return `/${segments.slice(0, -1).join('/')}`;
}
