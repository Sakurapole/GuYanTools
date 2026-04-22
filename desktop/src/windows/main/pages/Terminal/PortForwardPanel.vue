<script setup lang="ts">
/**
 * Port Forward floating panel — hovers above the terminal viewport bottom,
 * does not occupy terminal space. Supports collapse/expand, shows real-time
 * forwarding rules and runtime status.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import type { SshPortForward, PortForwardStatus, PortForwardTrafficInfo } from '@/contracts/ssh';

const props = defineProps<{
  sessionId: string;
  profileId: string;
}>();

const emit = defineEmits<{
  close: [];
  addForward: [];
  editForward: [forward: SshPortForward];
}>();

const sshStore = useSshStore();
const collapsed = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const copiedId = ref('');

// Load and refresh status on mount
onMounted(async () => {
  loading.value = true;
  try {
    await sshStore.loadPortForwards(props.profileId);
    await sshStore.refreshForwardStatus(props.sessionId);
    await sshStore.refreshForwardTraffic(props.sessionId);
  } finally {
    loading.value = false;
  }
  // Start traffic polling interval (every 2 seconds)
  trafficInterval = window.setInterval(() => {
    if (statuses.value.length > 0) {
      sshStore.refreshForwardTraffic(props.sessionId);
    }
  }, 2000);
});

let trafficInterval: number | null = null;

onUnmounted(() => {
  if (trafficInterval !== null) {
    clearInterval(trafficInterval);
    trafficInterval = null;
  }
});

// Reload when profileId changes
watch(() => props.profileId, async (pid) => {
  if (pid) {
    await sshStore.loadPortForwards(pid);
    await sshStore.refreshForwardStatus(props.sessionId);
  }
});

const forwards = computed<SshPortForward[]>(
  () => sshStore.portForwards[props.profileId] ?? [],
);

const statuses = computed<PortForwardStatus[]>(
  () => sshStore.forwardStatuses[props.sessionId] ?? [],
);

const traffic = computed<PortForwardTrafficInfo[]>(
  () => sshStore.forwardTraffic[props.sessionId] ?? [],
);

const runningCount = computed(() => statuses.value.length);
const hasAnyRunning = computed(() => runningCount.value > 0);

function getStatus(forwardId: string): PortForwardStatus | undefined {
  return statuses.value.find((s) => s.forwardId === forwardId);
}

function isRunning(forwardId: string): boolean {
  return getStatus(forwardId)?.status === 'running';
}

function showError(msg: string) {
  errorMessage.value = msg;
  setTimeout(() => { errorMessage.value = ''; }, 5000);
}

async function toggleForward(forwardId: string) {
  try {
    if (isRunning(forwardId)) {
      await sshStore.stopPortForward(props.sessionId, forwardId);
    } else {
      await sshStore.startPortForward(props.sessionId, forwardId);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Extract user-friendly error message
    if (msg.includes('port may be in use') || msg.includes('failed to bind')) {
      showError(`端口已被占用，请更换其他端口`);
    } else {
      showError(`操作失败: ${msg}`);
    }
  }
  setTimeout(() => sshStore.refreshForwardStatus(props.sessionId), 300);
}

async function startAllForwards() {
  const stoppedRules = forwards.value.filter((f) => !isRunning(f.id) && f.enabled);
  for (const rule of stoppedRules) {
    try {
      await sshStore.startPortForward(props.sessionId, rule.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showError(`启动 "${rule.label || rule.id}" 失败: ${msg}`);
    }
  }
  setTimeout(() => sshStore.refreshForwardStatus(props.sessionId), 300);
}

async function stopAllForwards() {
  const runningRules = forwards.value.filter((f) => isRunning(f.id));
  for (const rule of runningRules) {
    try {
      await sshStore.stopPortForward(props.sessionId, rule.id);
    } catch { /* ignore stop errors */ }
  }
  setTimeout(() => sshStore.refreshForwardStatus(props.sessionId), 300);
}

async function deleteForward(fwd: SshPortForward) {
  try {
    if (isRunning(fwd.id)) {
      await sshStore.stopPortForward(props.sessionId, fwd.id);
    }
    await sshStore.deletePortForward(props.profileId, fwd.id);
  } catch (err: unknown) {
    showError(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Format the listening address (source of traffic) */
function formatListenAddress(fwd: SshPortForward): string {
  if (fwd.forwardType === 'local') {
    return `${fwd.localHost}:${fwd.localPort}`;
  } else {
    return `${fwd.remoteHost ?? ''}:${fwd.remotePort ?? ''}`;
  }
}

/** Format the target address (destination of traffic) */
function formatTargetAddress(fwd: SshPortForward): string {
  if (fwd.forwardType === 'local') {
    return `${fwd.remoteHost ?? ''}:${fwd.remotePort ?? ''}`;
  } else {
    return `${fwd.localHost}:${fwd.localPort}`;
  }
}

/** Get the copyable client-side address for the forward */
function getCopyableAddress(fwd: SshPortForward): string {
  return `${fwd.localHost}:${fwd.localPort}`;
}

async function copyAddress(fwd: SshPortForward) {
  const addr = getCopyableAddress(fwd);
  try {
    await navigator.clipboard.writeText(addr);
    copiedId.value = fwd.id;
    setTimeout(() => { copiedId.value = ''; }, 1500);
  } catch {
    showError('复制失败');
  }
}

function toggleCollapse() {
  collapsed.value = !collapsed.value;
}

/** Get traffic info for a forward */
function getTraffic(forwardId: string): PortForwardTrafficInfo | undefined {
  return traffic.value.find((t) => t.forwardId === forwardId);
}

/** Format bytes into human-readable size */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/** Format the listen address for dynamic (SOCKS5) type */
function formatListenAddressForDynamic(fwd: SshPortForward): string {
  return `${fwd.localHost}:${fwd.localPort}`;
}

/** Get short type label */
function getTypeBadge(fwd: SshPortForward): string {
  switch (fwd.forwardType) {
    case 'local': return 'L';
    case 'remote': return 'R';
    case 'dynamic': return 'D';
    default: return '?';
  }
}

/** Get type badge CSS class */
function getTypeBadgeClass(fwd: SshPortForward): string {
  switch (fwd.forwardType) {
    case 'local': return 'pfp__item-type-badge--local';
    case 'remote': return 'pfp__item-type-badge--remote';
    case 'dynamic': return 'pfp__item-type-badge--dynamic';
    default: return '';
  }
}

/** Get type tooltip text */
function getTypeTooltip(fwd: SshPortForward): string {
  switch (fwd.forwardType) {
    case 'local': return '本地转发 (-L)';
    case 'remote': return '远程转发 (-R)';
    case 'dynamic': return 'SOCKS5 动态代理 (-D)';
    default: return '';
  }
}

// ── Import / Export ─────────────────────────────────────────

async function handleExport() {
  try {
    const jsonData = await sshStore.exportPortForwards(props.profileId);
    // Use the clipboard to export (simple approach, could use file dialog later)
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `port-forwards-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err: unknown) {
    showError(`导出失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleImport() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const count = await sshStore.importPortForwards(props.profileId, text);
        showError(`成功导入 ${count} 条规则`); // reuse toast for success feedback
      } catch (err: unknown) {
        showError(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    input.click();
  } catch (err: unknown) {
    showError(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}
</script>

<template>
  <div class="pfp" :class="{ 'pfp--collapsed': collapsed }">
    <!-- Header bar (always visible) -->
    <div class="pfp__header" @click="toggleCollapse">
      <div class="pfp__header-left">
        <svg class="pfp__chevron" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor"
          stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2"
          fill="none" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="2"/>
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
        </svg>
        <span class="pfp__title"
          title="SSH 端口转发: 支持本地转发 (-L) 和远程转发 (-R)">端口转发</span>
        <span v-if="runningCount > 0" class="pfp__badge">{{ runningCount }} 活跃</span>
      </div>
      <div class="pfp__header-right" @click.stop>
        <!-- Bulk start/stop all -->
        <button v-if="forwards.length > 0 && !hasAnyRunning" class="pfp__action-btn pfp__action-btn--success"
          title="启动所有转发规则" @click="startAllForwards" id="pfp-start-all">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none">
            <polygon points="6,4 20,12 6,20"/>
          </svg>
        </button>
        <button v-if="hasAnyRunning" class="pfp__action-btn pfp__action-btn--danger"
          title="停止所有转发" @click="stopAllForwards" id="pfp-stop-all">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
          </svg>
        </button>
        <button class="pfp__action-btn" title="添加转发规则" @click="emit('addForward')"
          id="pfp-add-btn">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="pfp__action-btn" title="导入规则" @click="handleImport"
          id="pfp-import-btn">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button class="pfp__action-btn" title="导出规则" @click="handleExport"
          id="pfp-export-btn">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>
        <button class="pfp__action-btn" title="关闭面板" @click="emit('close')"
          id="pfp-close-btn">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Error toast -->
    <Transition name="toast-fade">
      <div v-if="errorMessage" class="pfp__toast" @click="errorMessage = ''">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2"
          fill="none" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {{ errorMessage }}
      </div>
    </Transition>

    <!-- Content area -->
    <Transition name="panel-slide">
      <div v-show="!collapsed" class="pfp__body">
        <div v-if="loading" class="pfp__empty">
          加载中...
        </div>

        <div v-else-if="forwards.length === 0" class="pfp__empty">
          <span>暂无端口转发规则</span>
          <button class="pfp__empty-add" @click="emit('addForward')">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2"
              fill="none" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            添加规则
          </button>
        </div>

        <div v-else class="pfp__list">
          <div
            v-for="fwd in forwards"
            :key="fwd.id"
            class="pfp__item"
            :class="{ 'pfp__item--running': isRunning(fwd.id) }"
          >
            <!-- Status indicator -->
            <div class="pfp__item-status"
              :title="isRunning(fwd.id) ? '运行中' : '已停止'">
              <span class="pfp__dot" :class="isRunning(fwd.id) ? 'pfp__dot--running' : 'pfp__dot--stopped'" />
            </div>

            <!-- Forward type badge + Info -->
            <div class="pfp__item-info" @click="emit('editForward', fwd)"
              title="点击编辑转发规则">
              <div class="pfp__item-top">
                <span class="pfp__item-type-badge"
                  :class="getTypeBadgeClass(fwd)"
                  :title="getTypeTooltip(fwd)">{{ getTypeBadge(fwd) }}</span>
                <span class="pfp__item-label">{{ fwd.label || '未命名' }}</span>
                <span v-if="fwd.autoStart" class="pfp__item-auto"
                  title="连接后自动启动此转发">A</span>
              </div>
              <div class="pfp__item-addrs">
                <template v-if="fwd.forwardType === 'dynamic'">
                  <span class="pfp__addr pfp__addr--local"
                    title="SOCKS5 代理地址">{{ formatListenAddressForDynamic(fwd) }}</span>
                  <span class="pfp__addr-socks-label">SOCKS5</span>
                </template>
                <template v-else>
                  <span class="pfp__addr pfp__addr--local"
                    :title="fwd.forwardType === 'local' ? '本地监听地址' : '远程监听地址'">{{ formatListenAddress(fwd) }}</span>
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2"
                    fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                  <span class="pfp__addr pfp__addr--remote"
                    :title="fwd.forwardType === 'local' ? '远程目标地址' : '本地目标地址'">{{ formatTargetAddress(fwd) }}</span>
                </template>
              </div>
              <div v-if="isRunning(fwd.id)" class="pfp__item-meta">
                <span class="pfp__item-conns">{{ getStatus(fwd.id)?.activeConnections ?? 0 }} 连接</span>
                <template v-if="getTraffic(fwd.id)">
                  <span class="pfp__item-traffic">
                    <span class="pfp__traffic-up" title="上行 (发送)">↑ {{ formatBytes(getTraffic(fwd.id)!.bytesSent) }}</span>
                    <span class="pfp__traffic-down" title="下行 (接收)">↓ {{ formatBytes(getTraffic(fwd.id)!.bytesReceived) }}</span>
                  </span>
                </template>
              </div>
            </div>

            <!-- Actions -->
            <div class="pfp__item-actions">
              <!-- Copy address button -->
              <button class="pfp__copy-btn"
                :title="copiedId === fwd.id ? '已复制!' : `复制地址 ${getCopyableAddress(fwd)}`"
                :class="{ 'pfp__copy-btn--copied': copiedId === fwd.id }"
                @click="copyAddress(fwd)">
                <svg v-if="copiedId !== fwd.id" viewBox="0 0 24 24" width="12" height="12"
                  stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="12" height="12"
                  stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <button
                class="pfp__toggle-btn"
                :class="isRunning(fwd.id) ? 'pfp__toggle-btn--stop' : 'pfp__toggle-btn--start'"
                :title="isRunning(fwd.id) ? '停止转发' : '启动转发'"
                @click="toggleForward(fwd.id)"
              >
                <svg v-if="!isRunning(fwd.id)" viewBox="0 0 24 24" width="13" height="13"
                  fill="currentColor" stroke="none">
                  <polygon points="6,4 20,12 6,20"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="13" height="13"
                  fill="currentColor" stroke="none">
                  <rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/>
                </svg>
              </button>
              <button class="pfp__del-btn" title="删除此转发规则" @click="deleteForward(fwd)">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2"
                  fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.pfp {
  position: absolute;
  bottom: 36px;
  left: 16px;
  right: 16px;
  z-index: 100;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface-panel);
  border: 1px solid var(--ui-border-subtle);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255,255,255,0.03);
  backdrop-filter: blur(16px);
  overflow: hidden;
  transition: box-shadow 0.2s;

  &--collapsed {
    .pfp__chevron {
      transform: rotate(180deg);
    }
  }
}

.pfp__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--ui-border-subtle);
  transition: background 0.15s;

  &:hover {
    background: var(--ui-surface-overlay);
  }
}

.pfp__header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-text-secondary);
}

.pfp__chevron {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.pfp__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-primary);
}

.pfp__badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.pfp__header-right {
  display: flex;
  gap: 2px;
}

.pfp__action-btn {
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
  transition: all 0.15s;

  &:hover {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
  }

  &--success {
    color: #22c55e;
    &:hover { background: rgba(34, 197, 94, 0.15); }
  }

  &--danger {
    color: #ef4444;
    &:hover { background: rgba(239, 68, 68, 0.15); }
  }
}

// Error toast
.pfp__toast {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: rgba(239, 68, 68, 0.12);
  border-bottom: 1px solid rgba(239, 68, 68, 0.25);
  font-size: 11px;
  color: #f87171;
  cursor: pointer;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.2s;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.pfp__body {
  max-height: 220px;
  overflow-y: auto;
}

.pfp__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px 12px;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.pfp__empty-add {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px dashed var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--ui-surface-overlay);
    border-color: var(--primary-color);
  }
}

.pfp__list {
  display: flex;
  flex-direction: column;
}

.pfp__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border-subtle);
  transition: background 0.15s;

  &:last-child { border-bottom: none; }
  &:hover { background: var(--ui-surface-overlay); }

  &--running {
    .pfp__item-label { color: var(--ui-text-primary); }
  }
}

.pfp__item-status {
  flex-shrink: 0;
}

.pfp__dot {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;

  &--running {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
  }

  &--stopped {
    background: var(--ui-text-subtle);
  }
}

.pfp__item-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pfp__item-top {
  display: flex;
  align-items: center;
  gap: 5px;
}

.pfp__item-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pfp__item-auto {
  font-size: 9px;
  font-weight: 800;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(var(--primary-rgb, 99 102 241), 0.15);
  color: var(--primary-color);
  line-height: 16px;
}

.pfp__item-type-badge {
  font-size: 9px;
  font-weight: 800;
  padding: 0 4px;
  border-radius: 4px;
  line-height: 16px;
  flex-shrink: 0;
  font-family: Consolas, 'Cascadia Mono', monospace;

  &--local {
    background: rgba(34, 197, 94, 0.12);
    color: #22c55e;
  }
  &--remote {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
  }
  &--dynamic {
    background: rgba(139, 92, 246, 0.15);
    color: #8b5cf6;
  }
}

.pfp__item-addrs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: Consolas, 'Cascadia Mono', monospace;
  font-size: 11px;
  color: var(--ui-text-muted);
}

.pfp__addr {
  &--local { color: var(--ui-text-secondary); }
  &--remote { color: var(--primary-color); }
}

.pfp__addr-socks-label {
  font-size: 9px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(139, 92, 246, 0.12);
  color: #8b5cf6;
  line-height: 15px;
}

.pfp__item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 1px;
}

.pfp__item-conns {
  font-size: 10px;
  color: #22c55e;
  font-weight: 500;
}

.pfp__item-traffic {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-family: Consolas, 'Cascadia Mono', monospace;
  font-weight: 500;
}

.pfp__traffic-up {
  color: #f59e0b;
}

.pfp__traffic-down {
  color: #3b82f6;
}

.pfp__item-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.pfp__copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-subtle);
  cursor: pointer;
  transition: all 0.15s;

  &:hover { background: var(--ui-button-ghost-hover-bg); color: var(--ui-text-primary); }
  &--copied { color: #22c55e; }
}

.pfp__toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--ui-radius-sm);
  cursor: pointer;
  transition: all 0.15s;

  &--start {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
    &:hover { background: rgba(34, 197, 94, 0.2); }
  }

  &--stop {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    &:hover { background: rgba(239, 68, 68, 0.2); }
  }
}

.pfp__del-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-subtle);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s;
  overflow: hidden;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  max-height: 0;
  opacity: 0;
}

.panel-slide-enter-to,
.panel-slide-leave-from {
  max-height: 220px;
  opacity: 1;
}
</style>
