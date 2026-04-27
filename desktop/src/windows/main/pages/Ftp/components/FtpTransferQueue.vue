<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { TransferTask } from '@/contracts/ftp';
import { baseName } from '../utils/ftpPaths';
import { taskDirectionLabel } from '../utils/ftpSort';

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
