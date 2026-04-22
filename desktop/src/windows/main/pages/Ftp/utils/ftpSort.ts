import type { FileTransferEntry, TransferTask } from '@/contracts/ftp';
import type { EntrySortKey, TaskSortKey } from '../types';

export function compareEntryValues(
  left: FileTransferEntry,
  right: FileTransferEntry,
  sortKey: EntrySortKey,
  direction: 'asc' | 'desc',
) {
  if (left.isDir !== right.isDir) {
    return left.isDir ? -1 : 1;
  }

  let comparison = 0;
  if (sortKey === 'size') {
    comparison = left.size - right.size;
  } else if (sortKey === 'modifiedAt') {
    comparison = (left.modifiedAt ?? 0) - (right.modifiedAt ?? 0);
  } else if (sortKey === 'type') {
    comparison = String(left.isDir).localeCompare(String(right.isDir))
      || left.name.localeCompare(right.name, 'zh-CN');
  } else {
    comparison = left.name.localeCompare(right.name, 'zh-CN');
  }

  return direction === 'asc' ? comparison : -comparison;
}

export function sortEntries(
  entries: FileTransferEntry[],
  sortKey: EntrySortKey,
  direction: 'asc' | 'desc',
) {
  return [...entries].sort((left, right) => compareEntryValues(left, right, sortKey, direction));
}

export function compareTaskValues(
  left: Pick<TransferTask, 'createdAt' | 'fileName' | 'fileSize' | 'status' | 'priority'>,
  right: Pick<TransferTask, 'createdAt' | 'fileName' | 'fileSize' | 'status' | 'priority'>,
  sortKey: TaskSortKey,
  direction: 'asc' | 'desc',
) {
  let comparison = 0;
  if (sortKey === 'fileName') {
    comparison = left.fileName.localeCompare(right.fileName, 'zh-CN');
  } else if (sortKey === 'fileSize') {
    comparison = left.fileSize - right.fileSize;
  } else if (sortKey === 'priority') {
    comparison = taskPriorityRank(left.priority) - taskPriorityRank(right.priority);
  } else if (sortKey === 'status') {
    comparison = left.status.localeCompare(right.status, 'zh-CN');
  } else {
    comparison = left.createdAt - right.createdAt;
  }
  return direction === 'asc' ? comparison : -comparison;
}

export function taskPriorityRank(priority: string) {
  if (priority === 'high') return 3;
  if (priority === 'low') return 1;
  return 2;
}

export function taskPriorityLabel(priority: string) {
  if (priority === 'high') return '高';
  if (priority === 'low') return '低';
  return '中';
}

export function taskStatusLabel(status: string) {
  if (status === 'pending') return '等待中';
  if (status === 'retrying') return '重试中';
  if (status === 'transferring') return '传输中';
  if (status === 'paused') return '已暂停';
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  return status;
}

export function sessionStatusLabel(status: string) {
  if (status === 'connected') return '已连接';
  if (status === 'connecting') return '连接中';
  if (status === 'disconnected') return '已断开';
  return status;
}

export function canPauseTask(task: TransferTask) {
  if (task.direction === 'fxp' && task.status === 'transferring') return false;
  return ['pending', 'retrying', 'transferring'].includes(task.status);
}

export function canResumeTask(task: TransferTask) {
  return task.status === 'paused';
}

export function canRetryTask(task: TransferTask) {
  if (task.direction === 'fxp') return false;
  return task.status === 'failed';
}

export function taskDirectionLabel(direction: string) {
  if (direction === 'upload') return '上传';
  if (direction === 'download') return '下载';
  if (direction === 'fxp') return 'FXP';
  return direction;
}
