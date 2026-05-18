<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiPopupSurface from '@/windows/main/components/ui/UiPopupSurface.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { SyncActionKind, SyncConflictPolicy, SyncDifferenceKind, SyncDirection, SyncPreviewItem } from '../types';

defineProps<{
  modelValue: boolean;
  activeSession: boolean;
  syncDirection: SyncDirection;
  syncDirectionOptions: Array<{ label: string; value: string }>;
  syncConflictPolicy: SyncConflictPolicy;
  syncConflictPolicyOptions: Array<{ label: string; value: string }>;
  recursiveCompareEnabled: boolean;
  checksumCompareEnabled: boolean;
  syncExecutableCount: number;
  syncExecuting: boolean;
  checksumCompareRunning: boolean;
  syncExecutionSummary: string;
  syncCancelRequested: boolean;
  syncComparisonExpanded: boolean;
  syncSummary: {
    localOnly: number;
    remoteOnly: number;
    different: number;
    same: number;
    transferSize: number;
    checksumVerified: number;
    checksumDifferent: number;
  };
  syncPreviewSummary: {
    counts: Record<SyncActionKind, number>;
    transferSize: number;
  };
  syncPreviewItems: SyncPreviewItem[];
  selectedPreviewKeys: string[];
  formatSize: (size: number) => string;
  syncStatusLabel: (status: SyncPreviewItem['status']) => string;
  syncActionLabel: (action: SyncActionKind) => string;
  syncDifferenceLabel: (kind: SyncDifferenceKind) => string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:syncDirection': [value: SyncDirection];
  'update:syncConflictPolicy': [value: SyncConflictPolicy];
  'update:recursiveCompareEnabled': [value: boolean];
  'update:checksumCompareEnabled': [value: boolean];
  compare: [];
  execute: [];
  cancel: [];
  'toggle-preview-item': [key: string];
  'set-all-preview-items': [selected: boolean];
}>();

function closePanel() {
  emit('update:modelValue', false);
}
</script>

<template>
  <UiPopupSurface
    :model-value="modelValue"
    variant="dialog"
    :teleported="false"
    :fixed="false"
    overlay-class="ftp-inline-overlay ftp-inline-overlay--center"
    :panel-class="['ftp-sync-panel', 'ftp-inner-card']"
    width="min(980px, 100%)"
    height="min(720px, 100%)"
    :z-index="20"
    aria-label="目录比较与同步"
    @close="closePanel"
  >
        <div class="ftp-sync-panel__header">
          <div class="ftp-sync-panel__header-copy">
            <div class="ftp-sync-panel__title">目录比较与同步</div>
            <div class="ftp-sync-panel__caption">在弹出面板中比较当前本地与远程目录，确认后再执行同步。</div>
          </div>
          <UiIconButton
            size="sm"
            variant="ghost"
            title="关闭目录比较与同步"
            aria-label="关闭目录比较与同步"
            @click="closePanel"
          >
            ✕
          </UiIconButton>
        </div>

        <div class="ftp-sync-panel__toolbar">
          <UiSelect size="sm" :model-value="syncDirection" :options="syncDirectionOptions" @change="emit('update:syncDirection', String($event) as SyncDirection)" />
          <UiSelect size="sm" :model-value="syncConflictPolicy" :options="syncConflictPolicyOptions" @change="emit('update:syncConflictPolicy', String($event) as SyncConflictPolicy)" />
          <UiButton
            size="sm"
            variant="secondary"
            :active="recursiveCompareEnabled"
            @click="emit('update:recursiveCompareEnabled', !recursiveCompareEnabled)"
          >
            {{ recursiveCompareEnabled ? '递归比较' : '仅当前目录' }}
          </UiButton>
          <UiButton
            size="sm"
            variant="secondary"
            :active="checksumCompareEnabled"
            @click="emit('update:checksumCompareEnabled', !checksumCompareEnabled)"
          >
            {{ checksumCompareEnabled ? '内容校验已开启' : '启用内容校验' }}
          </UiButton>
          <UiButton size="sm" variant="secondary" :disabled="!activeSession" @click="emit('compare')">比较当前目录</UiButton>
          <UiButton size="sm" variant="primary" :disabled="!activeSession || !syncExecutableCount || syncExecuting" @click="emit('execute')">
            {{ syncExecuting ? '同步中...' : '执行同步' }}
          </UiButton>
          <UiButton size="sm" variant="ghost" :disabled="!syncExecuting || syncCancelRequested" @click="emit('cancel')">
            {{ syncCancelRequested ? '正在停止...' : '取消同步' }}
          </UiButton>
        </div>

        <UiScrollbar class="ftp-sync-panel__scroll" :x="false" :size="6">
          <div class="ftp-sync-panel__body">
            <template v-if="syncComparisonExpanded">
              <div class="ftp-sync__summary">
                <span class="ftp-badge">{{ syncSummary.localOnly }} 仅本地</span>
                <span class="ftp-badge">{{ syncSummary.remoteOnly }} 仅远程</span>
                <span class="ftp-badge ftp-badge--accent">{{ syncSummary.different }} 差异</span>
                <span class="ftp-badge">{{ syncSummary.same }} 相同</span>
                <span class="ftp-badge">预计处理 {{ formatSize(syncSummary.transferSize) }}</span>
                <span v-if="checksumCompareEnabled" class="ftp-badge ftp-badge--accent">
                  {{ checksumCompareRunning ? '内容校验中...' : `已校验 ${syncSummary.checksumVerified} 项` }}
                </span>
                <span v-if="checksumCompareEnabled && !checksumCompareRunning" class="ftp-badge">
                  {{ syncSummary.checksumDifferent }} 项内容不同
                </span>
              </div>

              <div class="ftp-sync__summary ftp-sync__summary--preview">
                <span class="ftp-badge ftp-badge--accent">{{ syncPreviewSummary.counts.upload + syncPreviewSummary.counts.replaceRemote }} 上传侧</span>
                <span class="ftp-badge ftp-badge--accent">{{ syncPreviewSummary.counts.download + syncPreviewSummary.counts.replaceLocal }} 下载侧</span>
                <span class="ftp-badge">{{ syncPreviewSummary.counts.deleteRemote + syncPreviewSummary.counts.deleteLocal }} 删除</span>
                <span class="ftp-badge">{{ syncPreviewSummary.counts.skip }} 跳过</span>
                <span class="ftp-badge ftp-badge--accent">已选择 {{ selectedPreviewKeys.length }} 项</span>
                <span class="ftp-badge">预估传输 {{ formatSize(syncPreviewSummary.transferSize) }}</span>
                <span v-if="syncExecutionSummary" class="ftp-badge ftp-badge--accent">{{ syncExecutionSummary }}</span>
              </div>

              <div class="ftp-sync__selection-actions">
                <UiButton size="sm" variant="ghost" @click="emit('set-all-preview-items', true)">全选可执行项</UiButton>
                <UiButton size="sm" variant="ghost" @click="emit('set-all-preview-items', false)">全部取消</UiButton>
              </div>

              <div class="ftp-sync__list">
                <div
                  v-for="item in syncPreviewItems"
                  :key="item.key"
                  class="ftp-sync__item"
                  :class="`ftp-sync__item--${item.status}`"
                >
                  <UiCheckbox
                    size="sm"
                    :checked="selectedPreviewKeys.includes(item.key)"
                    :disabled="item.action === 'skip'"
                    @change="emit('toggle-preview-item', item.key)"
                  />
                  <div class="ftp-sync__item-main">
                    <div class="ftp-sync__item-name">{{ item.name }}</div>
                    <div v-if="item.relativePath !== item.name" class="ftp-sync__item-path">{{ item.relativePath }}</div>
                    <div class="ftp-sync__item-meta">
                      本地: {{ item.localEntry ? (item.localEntry.isDir ? '目录' : formatSize(item.localEntry.size)) : '--' }}
                      <span class="ftp-sync__item-separator">|</span>
                      远程: {{ item.remoteEntry ? (item.remoteEntry.isDir ? '目录' : formatSize(item.remoteEntry.size)) : '--' }}
                    </div>
                    <div v-if="item.differenceKinds.length || item.contentVerification === 'same'" class="ftp-sync__item-reasons">
                      <span v-for="kind in item.differenceKinds" :key="`${item.key}-${kind}`" class="ftp-badge">
                        {{ syncDifferenceLabel(kind) }}
                      </span>
                      <span v-if="item.contentVerification === 'same'" class="ftp-badge">内容校验一致</span>
                    </div>
                  </div>
                  <div class="ftp-sync__item-side">
                    <div class="ftp-sync__item-status">{{ syncStatusLabel(item.status) }}</div>
                    <div class="ftp-sync__item-action">{{ syncActionLabel(item.action) }}</div>
                  </div>
                </div>
              </div>
            </template>

            <div v-else class="ftp-sync-panel__empty">
              <div class="ftp-sync-panel__empty-title">{{ activeSession ? '点击上方按钮开始比较当前目录' : '连接远程目录后可使用目录比较与同步' }}</div>
              <div class="ftp-sync-panel__empty-hint">
                {{ activeSession ? '面板会展示差异摘要、同步动作预览和预计传输量。' : '当前面板不会再压缩目录浏览区域。' }}
              </div>
            </div>
          </div>
        </UiScrollbar>
  </UiPopupSurface>
</template>
