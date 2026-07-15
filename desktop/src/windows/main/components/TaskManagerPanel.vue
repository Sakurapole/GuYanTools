<script lang="ts" setup>
import type { ProcessInfo, GpuInfoSummary } from '@/contracts/process_manager';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  panelStyle?: Record<string, string>;
}>();

const emit = defineEmits<{
  close: [];
}>();

const processes = ref<ProcessInfo[]>([]);
const gpuInfo = ref<GpuInfoSummary | null>(null);
const loading = ref(false);
const sortBy = ref<'cpu' | 'memory' | 'name' | 'pid'>('memory');
const sortDesc = ref(true);
const killingPid = ref<number | null>(null);
let refreshTimer: ReturnType<typeof setInterval> | undefined;

// 不允许 kill 的进程类型（会导致应用崩溃）
const PROTECTED_TYPES = new Set(['Browser', 'GPU', 'Zygote']);

const sortedProcesses = computed(() => {
  const list = [...processes.value];
  const dir = sortDesc.value ? -1 : 1;
  return list.sort((a, b) => {
    switch (sortBy.value) {
      case 'cpu':
        return (a.cpuPercent - b.cpuPercent) * dir;
      case 'memory':
        return (a.memoryWorkingSet - b.memoryWorkingSet) * dir;
      case 'pid':
        return (a.pid - b.pid) * dir;
      case 'name':
        return a.name.localeCompare(b.name) * dir;
      default:
        return 0;
    }
  });
});

const totalCpu = computed(() =>
  processes.value.reduce((sum, p) => sum + p.cpuPercent, 0),
);
const totalMemory = computed(() =>
  processes.value.reduce((sum, p) => sum + p.memoryWorkingSet, 0),
);
const processCount = computed(() => processes.value.length);

function formatMemory(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

function formatCpu(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    Browser: '主进程',
    Tab: '渲染进程',
    Utility: '服务',
    GPU: 'GPU',
    Zygote: 'Zygote',
    'Sandbox helper': '沙箱',
    Unknown: '未知',
  };
  return labels[type] ?? type;
}

function typeColor(type: string): string {
  const colors: Record<string, string> = {
    Browser: 'var(--ui-status-success-text)',
    Tab: 'var(--primary-color)',
    Utility: 'var(--ui-text-muted)',
    GPU: 'var(--ui-status-warning-text)',
    Zygote: 'var(--ui-text-muted)',
  };
  return colors[type] ?? 'var(--ui-text-muted)';
}

function canKill(proc: ProcessInfo): boolean {
  return !PROTECTED_TYPES.has(proc.type);
}

function toggleSort(column: 'cpu' | 'memory' | 'name' | 'pid') {
  if (sortBy.value === column) {
    sortDesc.value = !sortDesc.value;
  } else {
    sortBy.value = column;
    sortDesc.value = column === 'name' ? false : true;
  }
}

async function refresh() {
  loading.value = true;
  try {
    processes.value = await window.processManagerApi.getProcessList();
  } catch {
    // 忽略刷新错误
  } finally {
    loading.value = false;
  }
}

async function loadGpuInfo() {
  try {
    gpuInfo.value = await window.processManagerApi.getGpuInfo();
  } catch {
    gpuInfo.value = null;
  }
}

async function handleKill(proc: ProcessInfo) {
  killingPid.value = proc.pid;
  try {
    const result = await window.processManagerApi.killProcess(proc.pid);
    if (result.ok) {
      await refresh();
    }
  } catch {
    // 忽略 kill 错误
  } finally {
    killingPid.value = null;
  }
}

onMounted(() => {
  void refresh();
  void loadGpuInfo();
  refreshTimer = setInterval(refresh, 1500);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <div class="task-manager-panel" :style="props.panelStyle" role="dialog" aria-label="任务管理器">
    <!-- 头部 -->
    <div class="tm-header">
      <div class="tm-header__info">
        <span class="tm-header__title">任务管理器</span>
        <span class="tm-header__stats">
          {{ processCount }} 个进程 · CPU {{ formatCpu(totalCpu) }} · 内存 {{ formatMemory(totalMemory) }}
        </span>
      </div>
      <button class="tm-header__close" title="关闭" @click="emit('close')">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- GPU 信息 -->
    <div v-if="gpuInfo" class="tm-gpu-bar">
      <span class="tm-gpu-bar__label">GPU</span>
      <span class="tm-gpu-bar__value">{{ gpuInfo.vendor }} {{ gpuInfo.device }}</span>
      <span class="tm-gpu-bar__sep">·</span>
      <span class="tm-gpu-bar__driver">驱动 {{ gpuInfo.driverVersion }}</span>
    </div>

    <!-- 进程列表表头 -->
    <div class="tm-table-head">
      <button class="tm-th tm-th--name" @click="toggleSort('name')">
        名称
        <span v-if="sortBy === 'name'" class="tm-sort-arrow" :class="{ desc: sortDesc }">▾</span>
      </button>
      <button class="tm-th tm-th--type">类型</button>
      <button class="tm-th tm-th--pid" @click="toggleSort('pid')">
        PID
        <span v-if="sortBy === 'pid'" class="tm-sort-arrow" :class="{ desc: sortDesc }">▾</span>
      </button>
      <button class="tm-th tm-th--cpu" @click="toggleSort('cpu')">
        CPU
        <span v-if="sortBy === 'cpu'" class="tm-sort-arrow" :class="{ desc: sortDesc }">▾</span>
      </button>
      <button class="tm-th tm-th--mem" @click="toggleSort('memory')">
        内存
        <span v-if="sortBy === 'memory'" class="tm-sort-arrow" :class="{ desc: sortDesc }">▾</span>
      </button>
      <button class="tm-th tm-th--action">操作</button>
    </div>

    <!-- 进程列表 -->
    <div class="tm-table-body">
      <div
        v-for="proc in sortedProcesses"
        :key="proc.pid"
        class="tm-row"
        :class="{ 'tm-row--protected': !canKill(proc) }"
      >
        <div class="tm-cell tm-cell--name" :title="proc.windowTitle || proc.name">
          <span class="tm-cell__name">{{ proc.windowTitle || proc.name }}</span>
          <span v-if="proc.windowUrl" class="tm-cell__url">{{ proc.windowUrl }}</span>
        </div>
        <div class="tm-cell tm-cell--type">
          <span class="tm-type-badge" :style="{ color: typeColor(proc.type) }">
            {{ typeLabel(proc.type) }}
          </span>
        </div>
        <div class="tm-cell tm-cell--pid">{{ proc.pid }}</div>
        <div class="tm-cell tm-cell--cpu">
          <span class="tm-cpu-bar" :style="{ '--cpu-val': Math.min(proc.cpuPercent, 100) + '%' }">
            {{ formatCpu(proc.cpuPercent) }}
          </span>
        </div>
        <div class="tm-cell tm-cell--mem">{{ formatMemory(proc.memoryWorkingSet) }}</div>
        <div class="tm-cell tm-cell--action">
          <button
            v-if="canKill(proc)"
            class="tm-kill-btn"
            :disabled="killingPid === proc.pid"
            title="结束进程"
            @click="handleKill(proc)"
          >
            {{ killingPid === proc.pid ? '…' : '结束' }}
          </button>
          <span v-else class="tm-protected-tag" title="系统关键进程，不可结束">系统</span>
        </div>
      </div>
      <div v-if="sortedProcesses.length === 0" class="tm-empty">
        {{ loading ? '加载中…' : '暂无进程数据' }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.task-manager-panel {
  position: fixed;
  z-index: var(--ui-z-topbar);
  display: flex;
  flex-direction: column;
  width: 680px;
  max-width: calc(100vw - 32px);
  max-height: 520px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-glass-strong);
  box-shadow: var(--ui-shadow-xl);
  color: var(--ui-text-primary);
  -webkit-app-region: no-drag;
  overflow: hidden;
}

.tm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.tm-header__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tm-header__title {
  font-size: 15px;
  font-weight: 700;
}

.tm-header__stats {
  font-size: 12px;
  color: var(--ui-text-muted);
}

.tm-header__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--ui-icon-button-hover-bg);
    color: var(--ui-text-primary);
  }
}

.tm-gpu-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 11px;
  color: var(--ui-text-muted);
  background: var(--ui-surface-panel-muted);
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.tm-gpu-bar__label {
  font-weight: 600;
  color: var(--ui-status-warning-text);
}

.tm-gpu-bar__sep {
  opacity: 0.4;
}

.tm-table-head {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 64px 56px 64px 72px 52px;
  gap: 4px;
  padding: 6px 14px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-panel-muted);
}

.tm-th {
  display: flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: var(--ui-text-primary);
  }
}

.tm-th--type,
.tm-th--action {
  cursor: default;
}

.tm-sort-arrow {
  font-size: 10px;
  transition: transform 0.15s ease;

  &.desc {
    transform: rotate(180deg);
  }
}

.tm-table-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }
  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: var(--ui-radius-full);
  }
}

.tm-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 64px 56px 64px 72px 52px;
  gap: 4px;
  padding: 5px 14px;
  align-items: center;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle) 50%, transparent);
  transition: background-color 0.12s ease;

  &:hover {
    background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  }

  &.tm-row--protected {
    opacity: 0.75;
  }
}

.tm-cell {
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-cell--name {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.tm-cell__name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tm-cell__url {
  font-size: 10px;
  color: var(--ui-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}

.tm-type-badge {
  font-size: 10px;
  font-weight: 600;
}

.tm-cell--pid {
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}

.tm-cell--cpu {
  font-variant-numeric: tabular-nums;
}

.tm-cpu-bar {
  position: relative;
  display: inline-block;
  padding: 1px 5px;
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--primary-color) calc(var(--cpu-val, 0%) * 0.3), transparent);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.tm-cell--mem {
  font-variant-numeric: tabular-nums;
}

.tm-kill-btn {
  border: none;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-icon-button-danger-hover-bg);
  color: var(--ui-icon-button-danger-hover-text);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  cursor: pointer;
  transition: opacity 0.15s ease;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    cursor: wait;
    opacity: 0.5;
  }
}

.tm-protected-tag {
  font-size: 10px;
  color: var(--ui-text-muted);
  padding: 2px 6px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-panel-muted);
}

.tm-empty {
  padding: 24px 14px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 13px;
}

/* 面板进入/退出动画 */
.task-manager-panel {
  transform-origin: top right;
}
</style>
