<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { TransferTask } from '@/contracts/ftp';
import { baseName } from '../utils/ftpPaths';
import { taskDirectionLabel } from '../utils/ftpSort';
import FtpTransferTreeNode from './FtpTransferTreeNode.vue';

type RawTransferTreeNode = {
  name: string;
  relativePath: string;
  kind: 'directory' | 'file' | string;
  size: number;
  children?: RawTransferTreeNode[];
};

type FtpTransferTreeNodeView = {
  name: string;
  relativePath: string;
  kind: 'directory' | 'file' | string;
  size: number;
  transferredSize: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed' | string;
  children: FtpTransferTreeNodeView[];
};

defineProps<{
  collapsed: boolean;
  activeTaskCount: number;
  pausedTaskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  tasks: TransferTask[];
  isTaskExpanded: (taskId: string) => boolean;
  taskPriorityLabel: (priority: string) => string;
  taskStatusLabel: (status: string) => string;
  canPauseTask: (task: TransferTask) => boolean;
  canResumeTask: (task: TransferTask) => boolean;
  canRetryTask: (task: TransferTask) => boolean;
  formatSize: (size: number) => string;
  formatEta: (task: TransferTask) => string;
}>();

const emit = defineEmits<{
  'toggle-task-expanded': [taskId: string];
  'update-task-priority': [payload: { taskId: string; priority: string }];
  'pause-task': [taskId: string];
  'resume-task': [taskId: string];
  'retry-task': [taskId: string];
  'delete-task': [taskId: string];
}>();

function parseTransferTree(task: TransferTask): RawTransferTreeNode[] {
  if (!task.transferTreeJson) return [];
  try {
    const parsed = JSON.parse(task.transferTreeJson) as RawTransferTreeNode[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function transferTreeRootsForTask(task: TransferTask): RawTransferTreeNode[] {
  const children = parseTransferTree(task);
  const rootName = task.fileName || baseName(task.direction === 'download' ? task.remotePath : task.localPath) || '传输目录';
  const rootSize = children.reduce((total, child) => total + Math.max(0, Number(child.size) || 0), 0);
  return [{
    name: rootName,
    relativePath: '',
    kind: 'directory',
    size: rootSize,
    children,
  }];
}

function transferTreeForTask(task: TransferTask): FtpTransferTreeNodeView[] {
  if (task.transferMethod === 'archive') {
    const archiveStatus = task.status === 'completed'
      ? 'completed'
      : task.status === 'failed'
        ? 'failed'
        : ['pending', 'retrying', 'paused'].includes(task.status)
          ? 'pending'
          : 'transferring';
    const decorateArchive = (node: RawTransferTreeNode): FtpTransferTreeNodeView => {
      const children = (node.children ?? []).map(decorateArchive);
      const size = Math.max(0, Number(node.size) || 0);
      return {
        ...node,
        size,
        transferredSize: archiveStatus === 'completed' ? size : 0,
        status: archiveStatus,
        children,
      };
    };
    return transferTreeRootsForTask(task).map(decorateArchive);
  }

  let remaining = Math.max(0, task.transferredSize || 0);
  const currentRelativePath = task.currentRelativePath ?? '';
  const decorate = (node: RawTransferTreeNode): FtpTransferTreeNodeView => {
    const children = (node.children ?? []).map(decorate);
    const size = Math.max(0, Number(node.size) || 0);
    if (node.kind === 'directory') {
      const transferredSize = children.reduce((total, child) => total + child.transferredSize, 0);
      const childStatuses = children.map((child) => child.status);
      const status = task.status === 'completed' || (children.length > 0 && childStatuses.every((item) => item === 'completed'))
        ? 'completed'
        : task.status === 'failed' && currentRelativePath.startsWith(node.relativePath)
          ? 'failed'
          : childStatuses.some((item) => item === 'transferring' || item === 'failed' || item === 'completed')
            ? 'transferring'
            : 'pending';
      return { ...node, size, transferredSize, status, children };
    }

    const transferredSize = task.status === 'completed'
      ? size
      : Math.max(0, Math.min(size, remaining));
    remaining = Math.max(0, remaining - size);
    const status = task.status === 'completed' || transferredSize >= size
      ? 'completed'
      : task.status === 'failed' && currentRelativePath === node.relativePath
        ? 'failed'
        : transferredSize > 0 || currentRelativePath === node.relativePath
          ? 'transferring'
          : 'pending';
    return { ...node, size, transferredSize, status, children: [] };
  };
  return transferTreeRootsForTask(task).map(decorate);
}

function hasTransferTree(task: TransferTask) {
  return Boolean(task.transferTreeJson);
}
</script>

<template>
  <section class="ftp-tasks" :class="{ 'ftp-tasks--collapsed': collapsed }">
    <div v-if="!collapsed" class="ftp-tasks__overview">
      <div class="ftp-tasks__overview-item">
        <span>进行中</span>
        <strong>{{ activeTaskCount }}</strong>
      </div>
      <div class="ftp-tasks__overview-item">
        <span>已暂停</span>
        <strong>{{ pausedTaskCount }}</strong>
      </div>
      <div class="ftp-tasks__overview-item">
        <span>已完成</span>
        <strong>{{ completedTaskCount }}</strong>
      </div>
      <div class="ftp-tasks__overview-item">
        <span>失败</span>
        <strong>{{ failedTaskCount }}</strong>
      </div>
    </div>

    <UiScrollbar v-show="!collapsed" class="ftp-task-scroll" :x="false" :size="6">
      <div class="ftp-task-list">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="ftp-task-item"
          :class="{ 'ftp-task-item--expanded': isTaskExpanded(task.id) }"
        >
          <button class="ftp-task-item__summary" type="button" @click="$emit('toggle-task-expanded', task.id)">
            <span
              class="ftp-task-item__direction"
              :class="{
                'ftp-task-item__direction--upload': task.direction === 'upload',
                'ftp-task-item__direction--download': task.direction === 'download',
                'ftp-task-item__direction--fxp': task.direction === 'fxp',
              }"
            >
              {{ taskDirectionLabel(task.direction) }}
            </span>

            <div class="ftp-task-item__summary-main">
              <div class="ftp-task-item__summary-top">
                <div class="ftp-task-item__title">{{ task.fileName || baseName(task.localPath || task.remotePath) }}</div>
                <div class="ftp-task-item__status">{{ taskStatusLabel(task.status) }}</div>
              </div>
              <div class="ftp-task-item__meta">
                {{ formatSize(task.transferredSize) }} / {{ formatSize(task.fileSize) }}
                <span class="ftp-task-item__meta-separator">|</span>
                {{ formatSize(task.speedBytesPerSec) }}/s
                <template v-if="formatEta(task)">
                  <span class="ftp-task-item__meta-separator">|</span>
                  剩余 {{ formatEta(task) }}
                </template>
                <span class="ftp-task-item__meta-separator">|</span>
                优先级 {{ taskPriorityLabel(task.priority) }}
                <template v-if="task.retryCount > 0">
                  <span class="ftp-task-item__meta-separator">|</span>
                  已重试 {{ task.retryCount }} 次
                </template>
              </div>
              <div class="ftp-task-item__progress">
                <span class="ftp-task-item__percent">{{ Math.round(task.progress) }}%</span>
                <div class="ftp-task-item__bar">
                  <div class="ftp-task-item__bar-fill" :style="{ width: `${Math.max(0, Math.min(100, task.progress))}%` }" />
                </div>
              </div>
            </div>

            <span class="ftp-task-item__chevron" :class="{ 'ftp-task-item__chevron--expanded': isTaskExpanded(task.id) }">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.5 6l3.5 3.5L11.5 6" />
              </svg>
            </span>
          </button>

          <div v-if="isTaskExpanded(task.id)" class="ftp-task-item__details">
            <div class="ftp-task-item__path">{{ task.localPath }} -> {{ task.remotePath }}</div>
            <div v-if="task.transferMethod === 'archive'" class="ftp-task-item__method">打包传输：先生成临时压缩包，传输后解压并清理两端临时文件。</div>
            <div v-if="hasTransferTree(task)" class="ftp-task-tree">
              <FtpTransferTreeNode
                v-for="node in transferTreeForTask(task)"
                :key="node.relativePath || task.id"
                :node="node"
                :format-size="formatSize"
              />
            </div>
            <div class="ftp-task-item__actions">
              <UiSelect
                size="sm"
                :model-value="task.priority || 'medium'"
                :disabled="!['pending', 'retrying', 'transferring', 'paused'].includes(task.status)"
                :options="[
                  { label: '高优先级', value: 'high' },
                  { label: '中优先级', value: 'medium' },
                  { label: '低优先级', value: 'low' },
                ]"
                @change="$emit('update-task-priority', { taskId: task.id, priority: String($event) })"
              />

              <UiButton v-if="canPauseTask(task)" size="sm" variant="ghost" @click.stop="$emit('pause-task', task.id)">暂停</UiButton>
              <UiButton v-else-if="canResumeTask(task)" size="sm" variant="ghost" @click.stop="$emit('resume-task', task.id)">恢复</UiButton>
              <UiButton v-else-if="canRetryTask(task)" size="sm" variant="ghost" @click.stop="$emit('retry-task', task.id)">续传</UiButton>
              <UiButton size="sm" variant="danger" @click.stop="$emit('delete-task', task.id)">删除</UiButton>
            </div>
            <div v-if="task.errorMessage" class="ftp-task-item__error">{{ task.errorMessage }}</div>
          </div>
        </div>

        <div v-if="!tasks.length" class="ftp-empty-state">还没有传输记录。</div>
      </div>
    </UiScrollbar>
  </section>
</template>
