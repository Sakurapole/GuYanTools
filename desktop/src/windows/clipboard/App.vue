<script lang="ts" setup>
import type { AppConfig } from '@/contracts/app_config';
import type {
  MultiDeviceClipboardDeviceStatus,
  MultiDeviceClipboardEvent,
  MultiDeviceClipboardItem,
  MultiDeviceClipboardPairingRequest,
} from '@/contracts/multi_device_clipboard';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const api = window.multiDeviceClipboardApi;
const items = ref<MultiDeviceClipboardItem[]>([]);
const deviceStatuses = ref<MultiDeviceClipboardDeviceStatus[]>([]);
const pairingRequests = ref<MultiDeviceClipboardPairingRequest[]>([]);
const selectedItemId = ref('');
const busy = ref(false);
const manualEndpoint = ref('');
const manualPairingError = ref('');
const isPinned = ref(false);
const devicePanelExpanded = ref(true);
const isDevMode = import.meta.env.DEV;
type ClipboardWindowMode = 'expanded' | 'expanding' | 'docking' | 'docked';
const windowMode = ref<ClipboardWindowMode>('expanded');

let lastEscapeAt = 0;
let removeEventListener: (() => void) | undefined;
let removeConfigListener: (() => void) | undefined;
let removeWindowStateListener: (() => void) | undefined;
let dockTimer: ReturnType<typeof setTimeout> | undefined;
const DOCK_DELAY_MS = 220;

const trustedDeviceStatuses = computed(() => deviceStatuses.value.filter((device) =>
  device.state === 'trustedOnline' || device.state === 'trustedOffline'));
const availableDeviceStatuses = computed(() => deviceStatuses.value.filter((device) => device.state === 'available'));
const onlineTrustedDeviceCount = computed(() => trustedDeviceStatuses.value.filter((device) => device.online).length);
const offlineTrustedDeviceCount = computed(() => trustedDeviceStatuses.value.length - onlineTrustedDeviceCount.value);
const devicePanelSummary = computed(() =>
  `${onlineTrustedDeviceCount.value} 在线 · ${offlineTrustedDeviceCount.value} 离线 · ${availableDeviceStatuses.value.length} 可配对`);

async function refresh() {
  if (!api) return;
  const [nextItems, nextDeviceStatuses, nextPairingRequests] = await Promise.all([
    api.listItems(),
    api.listDeviceStatuses(60),
    api.listPairingRequests(),
  ]);
  items.value = nextItems;
  deviceStatuses.value = nextDeviceStatuses;
  pairingRequests.value = nextPairingRequests;
  if (!selectedItemId.value && nextItems[0]) {
    selectedItemId.value = nextItems[0].id;
  }
}

async function applyItem(item: MultiDeviceClipboardItem) {
  if (!api) return;
  selectedItemId.value = item.id;
  await api.applyItem(item.id);
}

async function deleteItem(item: MultiDeviceClipboardItem) {
  if (!api) return;
  await api.deleteItem(item.id);
  await refresh();
}

async function clearHistory() {
  if (!api || items.value.length === 0) return;
  await api.clearHistory();
  selectedItemId.value = '';
  await refresh();
}

async function startPairing(device: MultiDeviceClipboardDeviceStatus) {
  if (!api || busy.value) return;
  busy.value = true;
  try {
    await api.startPairing(device.deviceId);
    await refresh();
  } finally {
    busy.value = false;
  }
}

async function forgetDevice(device: MultiDeviceClipboardDeviceStatus) {
  if (!api || busy.value) return;
  busy.value = true;
  try {
    await api.forgetDevice(device.deviceId);
    await refresh();
  } finally {
    busy.value = false;
  }
}

async function startManualPairing() {
  if (!api || busy.value) return;
  const endpoint = manualEndpoint.value.trim();
  if (!endpoint) {
    manualPairingError.value = '请输入设备 IP，例如 192.168.0.50';
    return;
  }
  busy.value = true;
  manualPairingError.value = '';
  try {
    const request = await api.startPairingByAddress(endpoint);
    manualPairingError.value = `已发送配对请求，验证码 ${request.code}`;
    await refresh();
  } catch (error) {
    manualPairingError.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

async function approvePairing(request: MultiDeviceClipboardPairingRequest) {
  if (!api) return;
  await api.approvePairing(request.requestId);
  await refresh();
}

async function rejectPairing(request: MultiDeviceClipboardPairingRequest) {
  if (!api) return;
  await api.rejectPairing(request.requestId);
  await refresh();
}

function handleEvent(event: MultiDeviceClipboardEvent) {
  if (
    event.type === 'items-changed' ||
    event.type === 'devices-changed' ||
    event.type === 'discovered-devices-changed' ||
    event.type === 'pairing-request'
  ) {
    void refresh();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    const now = Date.now();
    if (now - lastEscapeAt < 520) {
      void closeWindow();
    }
    lastEscapeAt = now;
    return;
  }

  if (event.key === 'Enter') {
    const selected = items.value.find((item) => item.id === selectedItemId.value);
    if (selected) {
      void applyItem(selected);
    }
  }
}

async function closeWindow() {
  clearDockTimer();
  windowMode.value = 'expanded';
  await api?.closeWindow();
}

async function openDevTools() {
  await api?.openDevTools();
}

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function itemTitle(item: MultiDeviceClipboardItem) {
  if (item.contentType === 'text') return item.text || '文本';
  if (item.contentType === 'image') return item.fileName || '图片';
  return item.fileName || '文件';
}

function itemSummary(item: MultiDeviceClipboardItem) {
  if (item.localOnly) return '仅本机保存，超过同步大小或平台无法传输';
  if (item.contentType === 'text') return item.text || '';
  if (item.contentType === 'image') return 'PNG 图片';
  if (isImageFileItem(item)) return `${item.mimeType || '图片文件'} · ${formatSize(item.byteSize)}`;
  return `${item.mimeType || '文件'} · ${formatSize(item.byteSize)}`;
}

function isExpandableText(item: MultiDeviceClipboardItem) {
  if (item.contentType !== 'text') return false;
  const text = item.text ?? '';
  return text.length > 120 || text.split(/\r?\n/).length > 2;
}

async function showItemPreview(item: MultiDeviceClipboardItem) {
  if (!api || !isExpandableText(item)) return;
  selectedItemId.value = item.id;
  await api.showItemPreview(item.id);
}

function imageSrc(assetPath?: string) {
  if (!assetPath) return '';
  if (/^(https?|data|app):/i.test(assetPath)) return assetPath;
  return `app://multi-device-clipboard-assets/${encodeURIComponent(assetPath)}`;
}

function itemPreviewSrc(item: MultiDeviceClipboardItem) {
  if (item.contentType === 'image') return imageSrc(item.assetPath);
  if (!isImageFileItem(item)) return '';
  return imageSrc(item.previewPath || item.assetPath);
}

function isImageFileItem(item: MultiDeviceClipboardItem) {
  if (item.contentType !== 'file') return false;
  if (item.mimeType?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i.test(item.fileName ?? '');
}

function pairedDeviceMeta(device: MultiDeviceClipboardDeviceStatus) {
  const endpoint = device.lastAddress ? `${device.lastAddress}${device.lastPort ? `:${device.lastPort}` : ''}` : '';
  return [deviceStatusLabel(device), device.platform || 'unknown', endpoint, lastSeenLabel(device)].filter(Boolean).join(' · ');
}

function availableDeviceMeta(device: MultiDeviceClipboardDeviceStatus) {
  const endpoint = device.lastAddress ? `${device.lastAddress}${device.lastPort ? `:${device.lastPort}` : ''}` : '';
  return ['可配对', device.platform || 'unknown', endpoint].filter(Boolean).join(' · ');
}

function deviceStatusLabel(device: MultiDeviceClipboardDeviceStatus) {
  if (device.state === 'trustedOnline') return '在线';
  if (device.state === 'trustedOffline') return '离线';
  if (device.state === 'available') return '可配对';
  return '未知';
}

function lastSeenLabel(device: MultiDeviceClipboardDeviceStatus) {
  const seconds = device.secondsSinceSeen;
  if (seconds == null) return '';
  if (seconds <= 5) return '刚刚发现';
  if (seconds < 60) return `${Math.round(seconds)} 秒前`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`;
  return `${Math.round(seconds / 3600)} 小时前`;
}

function applyTheme(config: AppConfig) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(config.appearance.theme);
}

function clearDockTimer() {
  if (dockTimer) {
    clearTimeout(dockTimer);
    dockTimer = undefined;
  }
}

function scheduleDock() {
  if (isPinned.value) {
    clearDockTimer();
    return;
  }
  clearDockTimer();
  dockTimer = setTimeout(() => {
    windowMode.value = 'docking';
    void api?.dockWindow();
  }, DOCK_DELAY_MS);
}

function togglePinned() {
  isPinned.value = !isPinned.value;
  if (isPinned.value) {
    clearDockTimer();
    expandFromDock();
  }
}

function expandFromDock() {
  clearDockTimer();
  if (windowMode.value === 'expanded') {
    return;
  }

  windowMode.value = 'expanding';
  void api?.expandWindow();
}

onMounted(() => {
  removeEventListener = api?.onEvent(handleEvent);
  removeConfigListener = window.appConfigApi?.onDidChange(applyTheme);
  removeWindowStateListener = window.ipcRenderer?.on('multi-device-clipboard:window-state', (state: ClipboardWindowMode) => {
    windowMode.value = state;
    if (state === 'expanded') {
      clearDockTimer();
    }
  });
  void window.appConfigApi?.getConfig().then(applyTheme);
  window.ipcRenderer?.send('multi-device-clipboard:window-ready');
  window.addEventListener('keydown', handleKeydown);
  void refresh();
});

onBeforeUnmount(() => {
  clearDockTimer();
  removeEventListener?.();
  removeConfigListener?.();
  removeWindowStateListener?.();
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="clipboard-shell" :class="{
    'clipboard-shell--dock-visual': windowMode === 'docked',
    'clipboard-shell--pinned': isPinned,
  }"
    @mouseenter="expandFromDock" @mouseleave="scheduleDock">
    <div class="dock-strip" aria-hidden="true" />
    <header class="clipboard-header">
      <div>
        <h1>多设备剪贴板</h1>
        <p>{{ onlineTrustedDeviceCount }} 在线 · {{ offlineTrustedDeviceCount }} 离线</p>
      </div>
      <div class="clipboard-header__actions">
        <button v-if="isDevMode" type="button" class="icon-button devtools-button" title="打开 DevTools"
          aria-label="打开 DevTools" @click="openDevTools">
          <svg class="icon-button__svg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 9-4 3 4 3" />
            <path d="m16 9 4 3-4 3" />
            <path d="m14 5-4 14" />
          </svg>
        </button>
        <button type="button" class="icon-button pin-button" :class="{ 'pin-button--active': isPinned }"
          :title="isPinned ? '取消固定窗口' : '固定窗口'" :aria-label="isPinned ? '取消固定窗口' : '固定窗口'"
          @click="togglePinned">
          <svg class="pin-button__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v5" />
            <path d="M8 8h8" />
            <path d="m9.5 8 1 7h3l1-7" />
            <path d="M12 15v6" />
            <path d="M9.5 21h5" />
          </svg>
        </button>
        <button type="button" class="icon-button" title="关闭" @click="closeWindow">×</button>
      </div>
    </header>

    <section v-if="pairingRequests.length" class="pairing-panel">
      <article v-for="request in pairingRequests" :key="request.requestId" class="pairing-card">
        <div>
          <strong>{{ request.deviceName }}</strong>
          <span>配对码 {{ request.code }}</span>
        </div>
        <div class="pairing-card__actions">
          <button type="button" class="icon-button icon-button--inline" :title="`允许 ${request.deviceName} 配对`"
            :aria-label="`允许 ${request.deviceName} 配对`" @click="approvePairing(request)">
            <svg class="icon-button__svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          <button type="button" class="icon-button icon-button--inline device-row__action--danger"
            :title="`拒绝 ${request.deviceName} 配对`" :aria-label="`拒绝 ${request.deviceName} 配对`"
            @click="rejectPairing(request)">
            <svg class="icon-button__svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </article>
    </section>

    <section class="device-panel" :class="{ 'device-panel--collapsed': !devicePanelExpanded }">
      <button type="button" class="device-panel__header" :aria-expanded="devicePanelExpanded"
        aria-controls="clipboard-device-panel-body" @click="devicePanelExpanded = !devicePanelExpanded">
        <span>
          <strong>设备</strong>
          <small>{{ devicePanelSummary }}</small>
        </span>
        <svg class="device-panel__chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <Transition name="device-panel-collapse">
        <div v-show="devicePanelExpanded" id="clipboard-device-panel-body" class="device-panel__body">
          <div class="device-group">
            <div class="device-group__title">
              <span>已配对设备</span>
              <small>{{ trustedDeviceStatuses.length }}</small>
            </div>
            <div v-if="trustedDeviceStatuses.length" class="device-list" role="list">
              <article v-for="device in trustedDeviceStatuses" :key="device.deviceId" class="device-row" role="listitem">
                <div class="device-row__identity">
                  <span
                    class="device-row__badge"
                    :class="{ 'device-row__badge--offline': !device.online }"
                    aria-hidden="true"
                  >
                    {{ device.online ? 'ON' : 'OFF' }}
                  </span>
                  <div class="device-row__text">
                    <strong>{{ device.name }}</strong>
                    <small>{{ pairedDeviceMeta(device) || '等待同步连接' }}</small>
                  </div>
                </div>
                <button type="button" class="icon-button icon-button--inline device-row__action device-row__action--danger"
                  :disabled="busy" :title="`解除配对 ${device.name}`" :aria-label="`解除配对 ${device.name}`"
                  @click="forgetDevice(device)">
                  <svg class="icon-button__svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m18.5 5.5-13 13" />
                    <path d="M8.5 8.5 7 10a4 4 0 0 0 5.66 5.66L14 14.3" />
                    <path d="M15.5 15.5 17 14a4 4 0 0 0-5.66-5.66L10 9.7" />
                  </svg>
                </button>
              </article>
            </div>
            <p v-else class="device-group__empty">暂无已配对设备</p>
          </div>

          <div class="device-group">
            <div class="device-group__title">
              <span>可配对设备</span>
              <small>{{ availableDeviceStatuses.length }}</small>
            </div>
            <div v-if="availableDeviceStatuses.length" class="device-list" role="list">
              <article v-for="device in availableDeviceStatuses" :key="device.deviceId" class="device-row" role="listitem">
                <div class="device-row__identity">
                  <span class="device-row__badge device-row__badge--available" aria-hidden="true">N</span>
                  <div class="device-row__text">
                    <strong>{{ device.name }}</strong>
                    <small>{{ availableDeviceMeta(device) }}</small>
                  </div>
                </div>
                <button type="button" class="icon-button icon-button--inline device-row__action"
                  :disabled="busy" :title="`配对 ${device.name}`" :aria-label="`配对 ${device.name}`"
                  @click="startPairing(device)">
                  <svg class="icon-button__svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" />
                    <path d="M12 8v8" />
                    <path d="M8 12h8" />
                  </svg>
                </button>
              </article>
            </div>
            <p v-else class="device-group__empty">正在监听局域网设备</p>

            <form class="manual-pairing" @submit.prevent="startManualPairing">
              <input v-model="manualEndpoint" type="text" placeholder="手动输入 IP，如 192.168.0.50" />
              <button type="submit" :disabled="busy">配对</button>
              <span v-if="manualPairingError">{{ manualPairingError }}</span>
            </form>
          </div>
        </div>
      </Transition>
    </section>

    <UiScrollbar class="clipboard-list" :x="false" :y="true" :size="6"
      thumb-color="var(--clipboard-scrollbar-thumb)"
      thumb-hover-color="var(--clipboard-scrollbar-thumb-hover)"
      track-color="var(--clipboard-scrollbar-track)">
      <article v-for="item in items" :key="item.id" class="clipboard-item"
        :class="{
          'clipboard-item--selected': selectedItemId === item.id,
        }" @click="applyItem(item)">
        <div class="clipboard-item__media">
          <img v-if="itemPreviewSrc(item)" :src="itemPreviewSrc(item)" alt="" />
          <span v-else>{{ item.contentType === 'text' ? 'T' : item.contentType === 'image' ? 'I' : 'F' }}</span>
        </div>
        <div class="clipboard-item__body">
          <div class="clipboard-item__topline">
            <strong>{{ itemTitle(item) }}</strong>
            <time>{{ formatTime(item.createdAt) }}</time>
          </div>
          <p>{{ itemSummary(item) }}</p>
          <button v-if="isExpandableText(item)" type="button" class="clipboard-item__preview"
            @click.stop="showItemPreview(item)">
            查看全文
          </button>
          <div class="clipboard-item__meta">
            <span>{{ item.sourceDeviceName }}</span>
            <span>{{ formatSize(item.byteSize) }}</span>
            <span v-if="item.localOnly">本机</span>
          </div>
        </div>
        <button type="button" class="icon-button icon-button--inline" title="删除"
          @click.stop="deleteItem(item)">×</button>
      </article>

      <div v-if="!items.length" class="empty-state">
        <strong>暂无剪贴板内容</strong>
        <span>复制文本、图片或小文件后会出现在这里。</span>
      </div>
    </UiScrollbar>

    <footer class="clipboard-footer">
      <button type="button" @click="refresh">刷新</button>
      <button type="button" :disabled="!items.length" @click="clearHistory">清空</button>
    </footer>
  </div>
</template>

<style>
html,
body,
#multi-device-clipboard-app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
  font-family: "Geist Variable", "Microsoft YaHei", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}
</style>

<style scoped>
:global(:root) {
  --clipboard-text: rgba(30, 70, 90, 0.92);
  --clipboard-text-muted: rgba(30, 70, 90, 0.62);
  --clipboard-text-subtle: rgba(30, 70, 90, 0.46);
  --clipboard-surface: rgba(255, 255, 255, 0.94);
  --clipboard-surface-muted: rgba(247, 251, 255, 0.92);
  --clipboard-surface-hover: rgba(102, 204, 255, 0.12);
  --clipboard-border: rgba(15, 23, 42, 0.08);
  --clipboard-border-strong: rgba(102, 204, 255, 0.26);
  --clipboard-shadow: 0 18px 48px rgba(9, 38, 64, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.04);
  --clipboard-accent: #3f95d1;
  --clipboard-accent-soft: rgba(102, 204, 255, 0.16);
  --clipboard-button-bg: rgba(15, 23, 42, 0.04);
  --clipboard-button-hover-bg: rgba(102, 204, 255, 0.16);
  --clipboard-chip-bg: rgba(30, 70, 90, 0.07);
  --clipboard-media-bg: rgba(102, 204, 255, 0.12);
  --clipboard-scrollbar-thumb: rgba(30, 70, 90, 0.28);
  --clipboard-scrollbar-thumb-hover: rgba(30, 70, 90, 0.44);
  --clipboard-scrollbar-track: rgba(30, 70, 90, 0.08);
  --ui-radius-full: 999px;
}

:global(.light) {
  --clipboard-text: rgba(30, 70, 90, 0.92);
  --clipboard-text-muted: rgba(30, 70, 90, 0.62);
  --clipboard-text-subtle: rgba(30, 70, 90, 0.46);
  --clipboard-surface: rgba(255, 255, 255, 0.94);
  --clipboard-surface-muted: rgba(247, 251, 255, 0.92);
  --clipboard-surface-hover: rgba(102, 204, 255, 0.12);
  --clipboard-border: rgba(15, 23, 42, 0.08);
  --clipboard-border-strong: rgba(102, 204, 255, 0.26);
  --clipboard-shadow: 0 18px 48px rgba(9, 38, 64, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.04);
  --clipboard-accent: #3f95d1;
  --clipboard-accent-soft: rgba(102, 204, 255, 0.16);
  --clipboard-button-bg: rgba(15, 23, 42, 0.04);
  --clipboard-button-hover-bg: rgba(102, 204, 255, 0.16);
  --clipboard-chip-bg: rgba(30, 70, 90, 0.07);
  --clipboard-media-bg: rgba(102, 204, 255, 0.12);
  --clipboard-scrollbar-thumb: rgba(30, 70, 90, 0.28);
  --clipboard-scrollbar-thumb-hover: rgba(30, 70, 90, 0.44);
  --clipboard-scrollbar-track: rgba(30, 70, 90, 0.08);
}

:global(.dark) {
  --clipboard-text: rgba(220, 240, 255, 0.92);
  --clipboard-text-muted: rgba(220, 240, 255, 0.65);
  --clipboard-text-subtle: rgba(220, 240, 255, 0.46);
  --clipboard-surface: rgba(20, 35, 45, 0.94);
  --clipboard-surface-muted: rgba(26, 40, 52, 0.9);
  --clipboard-surface-hover: rgba(255, 255, 255, 0.07);
  --clipboard-border: rgba(255, 255, 255, 0.08);
  --clipboard-border-strong: rgba(102, 204, 255, 0.22);
  --clipboard-shadow: 0 18px 54px rgba(0, 0, 0, 0.42);
  --clipboard-accent: #66ccff;
  --clipboard-accent-soft: rgba(102, 204, 255, 0.18);
  --clipboard-button-bg: rgba(255, 255, 255, 0.08);
  --clipboard-button-hover-bg: rgba(102, 204, 255, 0.16);
  --clipboard-chip-bg: rgba(255, 255, 255, 0.08);
  --clipboard-media-bg: rgba(255, 255, 255, 0.09);
  --clipboard-scrollbar-thumb: rgba(220, 240, 255, 0.22);
  --clipboard-scrollbar-thumb-hover: rgba(220, 240, 255, 0.38);
  --clipboard-scrollbar-track: rgba(220, 240, 255, 0.08);
}

.clipboard-shell {
  position: relative;
  isolation: isolate;
  contain: paint;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  color: var(--clipboard-text);
  background: transparent;
  border: none;
  border-radius: 8px;
  box-shadow: var(--clipboard-shadow);
  -webkit-clip-path: inset(0 round 8px);
  clip-path: inset(0 round 8px);
  overflow: hidden;
  transform: translateZ(0);
}

.clipboard-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  box-sizing: border-box;
  border: 1px solid var(--clipboard-border);
  border-radius: inherit;
  background: var(--clipboard-surface);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  pointer-events: none;
}

.clipboard-shell> :not(.dock-strip) {
  position: relative;
  z-index: 1;
}

.clipboard-shell--dock-visual {
  cursor: pointer;
  border: none;
  /* border-radius: 7px 0 0 7px; */
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.clipboard-shell--dock-visual::before {
  display: none;
}

.clipboard-shell--dock-visual> :not(.dock-strip) {
  display: none;
  pointer-events: none;
}

.dock-strip {
  display: none;
}

.clipboard-shell--dock-visual .dock-strip {
  position: absolute;
  inset: 0;
  display: block;
  /* border-radius: 7px 0 0 7px; */
  background:
    linear-gradient(180deg,
      rgba(255, 255, 255, 0.34) 0%,
      rgba(255, 255, 255, 0) 42%,
      rgba(0, 0, 0, 0.16) 100%),
    linear-gradient(140deg,
      #28e6ff 0%,
      #66ccff 16%,
      #7c6dff 32%,
      #ff5fb7 48%,
      #ffb84c 64%,
      #62f28f 80%,
      #28e6ff 100%);
  background-size: 100% 100%, 260% 260%;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.18) inset,
    -3px 0 12px rgba(63, 149, 209, 0.28);
  animation: dock-rainbow-flow 7.5s linear infinite;
}

@keyframes dock-rainbow-flow {
  0% {
    background-position: 0 0, 0% 0%;
  }

  50% {
    background-position: 0 0, 100% 100%;
  }

  100% {
    background-position: 0 0, 0% 0%;
  }
}

.clipboard-header,
.clipboard-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--clipboard-border);
  background: color-mix(in srgb, var(--clipboard-surface-muted) 84%, transparent);
}

.clipboard-footer {
  border-top: 1px solid var(--clipboard-border);
  border-bottom: none;
}

h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

p {
  margin: 0;
}

.clipboard-header p {
  margin-top: 2px;
  font-size: 12px;
  color: var(--clipboard-text-muted);
}

.clipboard-header__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

button {
  border: 1px solid var(--clipboard-border);
  border-radius: 6px;
  background: var(--clipboard-button-bg);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

button:hover:not(:disabled) {
  background: var(--clipboard-button-hover-bg);
  border-color: var(--clipboard-border-strong);
}

button:disabled {
  cursor: default;
  opacity: 0.45;
}

.icon-button {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  font-size: 20px;
  line-height: 1;
}

.icon-button__svg {
  width: 15px;
  height: 15px;
  display: block;
  margin: auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-button--inline {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  font-size: 16px;
}

.pin-button {
  display: grid;
  place-items: center;
}

.pin-button__icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: rotate(34deg);
  transform-origin: center;
  transition: transform 180ms ease;
}

.pin-button--active {
  color: var(--clipboard-accent);
  background: var(--clipboard-accent-soft);
  border-color: var(--clipboard-border-strong);
}

.pin-button--active .pin-button__icon {
  transform: rotate(0deg);
}

.devtools-button {
  color: var(--clipboard-accent);
}

.pairing-panel {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  overflow-x: auto;
  border-bottom: 1px solid var(--clipboard-border);
}

.manual-pairing {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 2px 0 0;
}

.manual-pairing input {
  min-width: 0;
  height: 30px;
  padding: 0 9px;
  color: var(--clipboard-text);
  background: var(--clipboard-surface-subtle);
  border: 1px solid var(--clipboard-border);
  border-radius: 6px;
  outline: none;
}

.manual-pairing input:focus {
  border-color: var(--clipboard-border-strong);
}

.manual-pairing span {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--clipboard-text-subtle);
}

.pairing-panel {
  flex-direction: column;
}

.pairing-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  background: var(--clipboard-accent-soft);
  border: 1px solid var(--clipboard-border-strong);
}

.pairing-card span {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--clipboard-text-muted);
}

.pairing-card__actions {
  display: flex;
  gap: 6px;
}

.clipboard-footer button {
  padding: 6px 10px;
  font-size: 12px;
}

.device-panel {
  border-bottom: 1px solid var(--clipboard-border);
  background: color-mix(in srgb, var(--clipboard-surface-muted) 64%, transparent);
}

.device-panel__header {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
}

.device-panel__header span {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.device-panel__header strong {
  font-size: 13px;
}

.device-panel__header small,
.device-group__title small,
.device-row__text small,
.device-group__empty {
  font-size: 11px;
  color: var(--clipboard-text-subtle);
}

.device-panel__chevron {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 180ms ease;
}

.device-panel--collapsed .device-panel__chevron {
  transform: rotate(-90deg);
}

.device-panel__body {
  display: grid;
  gap: 10px;
  padding: 0 12px 10px;
  overflow: hidden;
}

.device-panel-collapse-enter-active,
.device-panel-collapse-leave-active {
  max-height: 320px;
  opacity: 1;
  transition:
    max-height 220ms ease,
    opacity 180ms ease,
    padding-top 220ms ease,
    padding-bottom 220ms ease;
}

.device-panel-collapse-enter-from,
.device-panel-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.device-group {
  display: grid;
  gap: 6px;
}

.device-group__title,
.device-row,
.device-row__identity {
  display: flex;
  align-items: center;
}

.device-group__title {
  justify-content: space-between;
  padding: 0 2px;
  color: var(--clipboard-text-muted);
  font-size: 12px;
}

.device-list {
  display: grid;
  gap: 6px;
}

.device-row {
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  padding: 6px 7px;
  border: 1px solid var(--clipboard-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--clipboard-surface) 74%, transparent);
}

.device-row__identity {
  min-width: 0;
  gap: 8px;
}

.device-row__badge {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--clipboard-accent-soft);
  color: var(--clipboard-accent);
  font-size: 11px;
  font-weight: 700;
}

.device-row__badge--available {
  background: var(--clipboard-chip-bg);
}

.device-row__badge--offline {
  background: color-mix(in srgb, var(--clipboard-text-muted) 14%, transparent);
  color: var(--clipboard-text-muted);
}

.device-row__text {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.device-row__text strong,
.device-row__text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-row__text strong {
  font-size: 12px;
}

.device-row__action {
  flex: 0 0 26px;
  color: var(--clipboard-accent);
}

.device-row__action--danger {
  color: #c64747;
}

:global(.dark) .device-row__action--danger {
  color: #ff9c9c;
}

.device-group__empty {
  padding: 8px 9px;
  border: 1px dashed var(--clipboard-border);
  border-radius: 7px;
}

.clipboard-list {
  flex: 1;
  min-height: 0;
}

.clipboard-list :deep(.ui-scrollbar__content) {
  padding: 8px;
}

.clipboard-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 78px;
  padding: 8px;
  border-radius: 7px;
  border: 1px solid transparent;
  cursor: default;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.clipboard-item:hover,
.clipboard-item--selected {
  background: var(--clipboard-surface-hover);
  border-color: var(--clipboard-border-strong);
}

.clipboard-item__media {
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--clipboard-media-bg);
  overflow: hidden;
  color: var(--clipboard-accent);
  font-size: 15px;
  font-weight: 700;
}

.clipboard-item__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clipboard-item__body {
  flex: 1;
  min-width: 0;
}

.clipboard-item__topline,
.clipboard-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clipboard-item__topline strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.clipboard-item__topline time {
  font-size: 11px;
  color: var(--clipboard-text-subtle);
}

.clipboard-item__body p {
  margin-top: 4px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 12px;
  line-height: 1.4;
  color: var(--clipboard-text-muted);
  word-break: break-word;
}

.clipboard-item__preview {
  margin-top: 6px;
  padding: 3px 7px;
  font-size: 11px;
  color: var(--clipboard-accent);
  background: var(--clipboard-accent-soft);
  border-color: transparent;
}

.clipboard-item__preview:hover {
  border-color: var(--clipboard-border-strong);
}

.clipboard-item__meta {
  margin-top: 6px;
}

.clipboard-item__meta span {
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--clipboard-chip-bg);
  font-size: 11px;
  color: var(--clipboard-text-muted);
}

.empty-state {
  height: 100%;
  display: grid;
  place-content: center;
  gap: 6px;
  text-align: center;
  color: var(--clipboard-text-subtle);
}

.empty-state strong {
  color: var(--clipboard-text);
}
</style>
