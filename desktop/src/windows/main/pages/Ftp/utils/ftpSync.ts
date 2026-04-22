import type { FileTransferEntry } from '@/contracts/ftp';
import type {
  SyncActionKind,
  SyncComparisonItem,
  SyncConflictPolicy,
  SyncContentVerification,
  SyncDifferenceKind,
  SyncDiffStatus,
  SyncDirection,
} from '../types';

type RecursiveSyncOptions = {
  sessionId: string;
  localRootPath: string;
  remoteRootPath: string;
};

export function buildSyncComparisonItems(
  localEntries: FileTransferEntry[],
  remoteEntries: FileTransferEntry[],
  parentRelativePath = '',
): SyncComparisonItem[] {
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
      contentVerification: 'notCompared',
    };
  });
}

export function determineSyncDiffStatus(
  localEntry: FileTransferEntry | null,
  remoteEntry: FileTransferEntry | null,
): SyncDiffStatus {
  return syncStatusFromDifferences(
    localEntry,
    remoteEntry,
    determineSyncDifferenceKinds(localEntry, remoteEntry),
  );
}

export function determineSyncDifferenceKinds(
  localEntry: FileTransferEntry | null,
  remoteEntry: FileTransferEntry | null,
): SyncDifferenceKind[] {
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

export function syncStatusLabel(status: SyncDiffStatus) {
  if (status === 'localOnly') return '仅本地';
  if (status === 'remoteOnly') return '仅远程';
  if (status === 'different') return '内容不同';
  return '相同';
}

export function syncDifferenceLabel(kind: SyncDifferenceKind) {
  if (kind === 'type') return '类型不同';
  if (kind === 'size') return '大小不同';
  if (kind === 'modifiedAt') return '时间不同';
  return '内容不同';
}

export function determineSyncAction(
  item: SyncComparisonItem,
  direction: SyncDirection,
  conflictPolicy: SyncConflictPolicy = 'keepNewer',
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
  if (localModifiedAt >= remoteModifiedAt) {
    return 'replaceRemote';
  }
  return 'replaceLocal';
}

export function syncActionLabel(action: SyncActionKind) {
  if (action === 'upload') return '上传';
  if (action === 'download') return '下载';
  if (action === 'deleteRemote') return '删除远程';
  if (action === 'deleteLocal') return '删除本地';
  if (action === 'replaceRemote') return '覆盖远程';
  if (action === 'replaceLocal') return '覆盖本地';
  return '跳过';
}

export async function buildRecursiveSyncComparisonItems(options: RecursiveSyncOptions) {
  const items: SyncComparisonItem[] = [];

  async function walk(localPath: string, remotePath: string, parentRelativePath = '') {
    const [localEntries, remoteEntries] = await Promise.all([
      window.ftpApi.listLocalDirectory(localPath),
      window.ftpApi.listRemoteDirectory(options.sessionId, remotePath),
    ]);
    const currentItems = buildSyncComparisonItems(localEntries, remoteEntries, parentRelativePath);
    items.push(...currentItems);

    for (const item of currentItems) {
      if (item.localEntry?.isDir && item.remoteEntry?.isDir) {
        await walk(item.localEntry.path, item.remoteEntry.path, item.relativePath);
      }
    }
  }

  await walk(options.localRootPath, options.remoteRootPath);
  return items;
}

export async function verifySyncComparisonContent(
  items: SyncComparisonItem[],
  sessionId: string,
  concurrency = 3,
) {
  const nextItems = items.map((item) => ({
    ...item,
    differenceKinds: [...item.differenceKinds],
  }));
  const comparableIndexes = nextItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      Boolean(item.localEntry)
      && Boolean(item.remoteEntry)
      && !item.localEntry?.isDir
      && !item.remoteEntry?.isDir
      && item.localEntry?.size === item.remoteEntry?.size,
    );

  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, comparableIndexes.length));

  async function worker() {
    while (cursor < comparableIndexes.length) {
      const current = comparableIndexes[cursor];
      cursor += 1;
      const localPath = current.item.localEntry?.path;
      const remotePath = current.item.remoteEntry?.path;
      if (!localPath || !remotePath) {
        continue;
      }
      const [localHash, remoteHash] = await Promise.all([
        window.ftpApi.computeLocalFileSha256(localPath),
        window.ftpApi.computeRemoteFileSha256(sessionId, remotePath),
      ]);
      const contentVerification: SyncContentVerification = localHash && remoteHash && localHash === remoteHash
        ? 'same'
        : 'different';
      current.item.contentVerification = contentVerification;
      current.item.differenceKinds = current.item.differenceKinds.filter((kind) => kind !== 'content');
      if (contentVerification === 'different') {
        current.item.differenceKinds.push('content');
      }
      current.item.status = syncStatusFromDifferences(
        current.item.localEntry,
        current.item.remoteEntry,
        current.item.differenceKinds,
      );
      nextItems[current.index] = current.item;
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return nextItems;
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
