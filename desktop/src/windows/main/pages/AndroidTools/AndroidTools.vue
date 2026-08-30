<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import IconRenderer from '../../components/ui/IconRenderer.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import UiIconButton from '../../components/ui/UiIconButton.vue';
import UiStateCard from '../../components/ui/UiStateCard.vue';
import type {
  AndroidDevice,
  AndroidDeviceState,
  AndroidSession,
  AndroidSessionEvent,
  AndroidToolchainDownloadProgress,
  AndroidToolchainStatus,
} from '@/contracts/android-tools';

const toolchain = ref<AndroidToolchainStatus | null>(null);
const devices = ref<AndroidDevice[]>([]);
const sessions = ref<AndroidSession[]>([]);
const selectedSerial = ref('');
const keyboardMode = ref<'uhid' | 'sdk'>('uhid');
const mouseMode = ref<'uhid' | 'sdk'>('uhid');
const duplicateOnDevice = ref(false);
const loading = ref(true);
const refreshing = ref(false);
const busyAction = ref<'mirror' | 'audio' | 'otg' | string | null>(null);
const loadError = ref('');
const actionError = ref('');
const toolchainDownloadProgress = ref<AndroidToolchainDownloadProgress>({ phase: 'idle', percent: 0 });
const toolchainDownloadBusy = ref(false);
const toolchainDownloadError = ref('');

let removeDevicesChanged: (() => void) | undefined;
let removeSessionEvent: (() => void) | undefined;
let removeToolchainDownloadProgress: (() => void) | undefined;

const selectedDevice = computed(() => devices.value.find(device => device.serial === selectedSerial.value) ?? null);
const hasToolchain = computed(() => toolchain.value?.available === true);
const isSelectedDeviceReady = computed(() => selectedDevice.value?.state === 'device');
const audioSupported = computed(() => {
  const sdkLevel = selectedDevice.value?.sdkLevel;
  return sdkLevel === undefined || sdkLevel >= 30;
});
const duplicateSupported = computed(() => (selectedDevice.value?.sdkLevel ?? 0) >= 33);
const otgSupported = computed(() => selectedDevice.value?.usb === true && selectedDevice.value?.transport === 'adb-usb');
const hasActiveSession = computed(() => sessions.value.some(session => (
  session.status === 'starting' || session.status === 'running' || session.status === 'stopping'
)));

const stateLabels: Record<AndroidDeviceState, string> = {
  device: '已连接',
  unauthorized: '未授权',
  offline: '离线',
  bootloader: 'Bootloader',
  'no-permissions': '无权限',
  unknown: '未知状态',
};

const transportLabels: Record<AndroidDevice['transport'], string> = {
  'adb-usb': 'USB',
  'adb-tcpip': 'TCP/IP',
  'fastboot-usb': 'Fastboot USB',
};

const sessionModeLabels: Record<AndroidSession['mode'], string> = {
  'mirror-control': '镜像控制',
  'audio-only': '音频回传',
  otg: 'OTG 键鼠',
};

const sessionStatusLabels: Record<AndroidSession['status'], string> = {
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  exited: '已退出',
  failed: '启动失败',
};

const errorLabels: Record<string, string> = {
  ANDROID_DEVICE_NOT_FOUND: '未找到所选设备，请刷新设备列表。',
  ANDROID_DEVICE_UNAUTHORIZED: '设备尚未授权，请在设备上允许 USB 调试。',
  ANDROID_DEVICE_OFFLINE: '设备当前离线，请重新连接 USB。',
  ANDROID_DEVICE_BUSY: '设备正被其他会话占用，请先停止冲突会话。',
  ANDROID_USB_CONFLICT: 'OTG 需要独占 USB，请先停止占用该设备的 ADB 会话。',
  ANDROID_AUDIO_UNSUPPORTED: '该设备不支持音频回传，需要 Android 11 或更高版本。',
  ANDROID_AUDIO_CAPTURE_FAILED: '音频采集失败，请确认设备已解锁并允许音频采集。',
  ANDROID_SESSION_START_FAILED: 'scrcpy 会话启动失败，请检查工具链和设备状态。',
  ANDROID_SESSION_EXITED: 'scrcpy 会话已异常退出，请检查 USB 连接。',
  ANDROID_SESSION_NOT_FOUND: '找不到该会话，可能已经退出。',
  ANDROID_TOOL_UNAVAILABLE: 'Android 工具链不可用，请检查应用安装资源。',
  ANDROID_PLATFORM_UNSUPPORTED: '当前平台暂不支持自动下载，请在设置中选择已有的 Windows x64 工具链。',
  ANDROID_TOOLCHAIN_BUSY: '请先停止正在运行的 Android 会话，再更新工具链。',
  ANDROID_DOWNLOAD_REDIRECT_LIMIT: '下载地址重定向次数过多，已停止下载。',
  ANDROID_DOWNLOAD_URL_INVALID: '下载地址不安全，必须使用 HTTPS。',
  ANDROID_DOWNLOAD_TOO_LARGE: '下载文件超过大小限制，已停止下载。',
  ANDROID_DOWNLOAD_TIMEOUT: '下载超时，请检查网络后重试。',
  ANDROID_DOWNLOAD_HTTP: '官方资源下载失败，请检查网络后重试。',
  ANDROID_DOWNLOAD_HASH_MISMATCH: '下载文件校验失败，请重试。',
  ANDROID_DOWNLOAD_MISSING: '下载包缺少必要文件，请重试或检查发行资源。',
};

function getErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (rawMessage) {
    const exactLabel = errorLabels[rawMessage];
    if (exactLabel) return exactLabel;
    const prefixLabel = Object.entries(errorLabels).find(([code]) => rawMessage.startsWith(`${code}_`))?.[1];
    return prefixLabel ?? rawMessage;
  }
  return '操作失败，请检查设备连接和工具链状态。';
}

function bindDeviceEvents(api: NonNullable<typeof window.androidApi>) {
  removeDevicesChanged?.();
  removeDevicesChanged = api.onDevicesChanged(handleDevicesChanged);
}

function selectFirstReadyDevice(nextDevices: AndroidDevice[]) {
  const selectedStillExists = nextDevices.some(device => device.serial === selectedSerial.value);
  if (selectedStillExists) return;
  selectedSerial.value = nextDevices.find(device => device.state === 'device')?.serial ?? nextDevices[0]?.serial ?? '';
}

function applyDevices(nextDevices: AndroidDevice[]) {
  devices.value = nextDevices;
  selectFirstReadyDevice(nextDevices);
}

function mergeSession(nextSession: AndroidSession) {
  const index = sessions.value.findIndex(session => session.sessionId === nextSession.sessionId);
  if (index === -1) {
    sessions.value = [...sessions.value, nextSession];
    return;
  }
  sessions.value = sessions.value.map((session, sessionIndex) => (
    sessionIndex === index ? nextSession : session
  ));
}

function handleSessionEvent(event: AndroidSessionEvent) {
  mergeSession(event.session);
}

async function loadState() {
  const api = window.androidApi;
  if (!api) {
    loadError.value = 'Android 工具接口不可用，请重启应用后重试。';
    loading.value = false;
    return;
  }

  try {
    const nextToolchain = await api.getToolchainStatus();
    toolchain.value = nextToolchain;
    if (!nextToolchain.available) {
      removeDevicesChanged?.();
      removeDevicesChanged = undefined;
      applyDevices([]);
      sessions.value = [];
      loadError.value = '';
      return;
    }
    bindDeviceEvents(api);
    const [nextDevices, nextSessions] = await Promise.all([api.listDevices(), api.listSessions()]);
    applyDevices(nextDevices);
    sessions.value = nextSessions;
    loadError.value = '';
  } catch (error) {
    loadError.value = getErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

async function downloadToolchain() {
  const api = window.androidApi;
  if (!api || toolchainDownloadBusy.value) return;
  toolchainDownloadBusy.value = true;
  toolchainDownloadError.value = '';
  actionError.value = '';
  try {
    toolchain.value = await api.downloadToolchain();
    toolchainDownloadProgress.value = { phase: 'completed', percent: 100, current: 'Android 工具链已安装' };
    await loadState();
  } catch (error) {
    toolchainDownloadError.value = getErrorMessage(error);
    toolchainDownloadProgress.value = {
      phase: 'failed',
      percent: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    toolchainDownloadBusy.value = false;
  }
}

async function refresh() {
  if (refreshing.value) return;
  const api = window.androidApi;
  if (!api) return;
  refreshing.value = true;
  actionError.value = '';
  try {
    const nextToolchain = await api.getToolchainStatus();
    toolchain.value = nextToolchain;
    if (!nextToolchain.available) {
      removeDevicesChanged?.();
      removeDevicesChanged = undefined;
      applyDevices([]);
      sessions.value = [];
      loadError.value = '';
      return;
    }
    bindDeviceEvents(api);
    const [nextDevices, nextSessions] = await Promise.all([api.listDevices(), api.listSessions()]);
    applyDevices(nextDevices);
    sessions.value = nextSessions;
    loadError.value = '';
  } catch (error) {
    loadError.value = getErrorMessage(error);
  } finally {
    refreshing.value = false;
  }
}

function canStart(kind: 'mirror' | 'audio' | 'otg') {
  if (!hasToolchain.value || !isSelectedDeviceReady.value || busyAction.value !== null) return false;
  if (kind === 'audio' && !audioSupported.value) return false;
  if (kind === 'otg' && !otgSupported.value) return false;
  return true;
}

async function startMirror() {
  const api = window.androidApi;
  const deviceSerial = selectedSerial.value;
  if (!api || !canStart('mirror') || !deviceSerial) return;
  busyAction.value = 'mirror';
  actionError.value = '';
  try {
    mergeSession(await api.startMirror({ deviceSerial, keyboard: keyboardMode.value, mouse: mouseMode.value }));
  } catch (error) {
    actionError.value = getErrorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

async function startAudio() {
  const api = window.androidApi;
  const deviceSerial = selectedSerial.value;
  if (!api || !canStart('audio') || !deviceSerial) return;
  busyAction.value = 'audio';
  actionError.value = '';
  try {
    mergeSession(await api.startAudio({ deviceSerial, duplicateOnDevice: duplicateOnDevice.value }));
  } catch (error) {
    actionError.value = getErrorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

async function startOtg() {
  const api = window.androidApi;
  const deviceSerial = selectedSerial.value;
  if (!api || !canStart('otg') || !deviceSerial) return;
  busyAction.value = 'otg';
  actionError.value = '';
  try {
    mergeSession(await api.startOtg({ deviceSerial, keyboard: true, mouse: true }));
  } catch (error) {
    actionError.value = getErrorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

async function stopSession(sessionId: string) {
  const api = window.androidApi;
  if (!api || busyAction.value !== null) return;
  busyAction.value = `stop:${sessionId}`;
  actionError.value = '';
  try {
    await api.stopSession(sessionId);
    sessions.value = sessions.value.map(session => (
      session.sessionId === sessionId ? { ...session, status: 'exited' } : session
    ));
  } catch (error) {
    actionError.value = getErrorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

function handleDevicesChanged(event: { devices: AndroidDevice[] }) {
  applyDevices(event.devices);
}

onMounted(() => {
  const api = window.androidApi;
  if (api) {
    removeSessionEvent = api.onSessionEvent(handleSessionEvent);
    removeToolchainDownloadProgress = api.onToolchainDownloadProgress((progress) => {
      toolchainDownloadProgress.value = progress;
      if (progress.phase === 'failed') {
        toolchainDownloadError.value = getErrorMessage(progress.errorMessage);
      }
    });
    void api.getToolchainDownloadStatus().then((progress) => {
      toolchainDownloadProgress.value = progress;
      if (progress.phase === 'failed') {
        toolchainDownloadError.value = getErrorMessage(progress.errorMessage);
      }
    }).catch(() => undefined);
  }
  void loadState();
});

onUnmounted(() => {
  removeDevicesChanged?.();
  removeSessionEvent?.();
  removeToolchainDownloadProgress?.();
});
</script>

<template>
  <main class="android-tools-page">
    <header class="android-tools-page__header">
      <div>
        <p class="android-tools-page__eyebrow">ANDROID TOOLBOX</p>
        <h1>Android 工具箱</h1>
        <p class="android-tools-page__intro">通过有线连接管理设备，启动镜像、键鼠共享或音频回传。</p>
      </div>
      <UiIconButton
        variant="secondary"
        size="md"
        title="刷新工具链和设备"
        :disabled="refreshing"
        @click="refresh"
      >
        <IconRenderer icon="iconify:lucide:refresh-cw" :size="17" />
      </UiIconButton>
    </header>

    <div v-if="loading" class="android-tools-page__loading" role="status">正在检查 Android 工具链和设备…</div>

    <UiStateCard
      v-else-if="loadError"
      state="error"
      title="无法读取 Android 状态"
      :description="loadError"
      class="android-tools-page__state"
    >
      <template #icon><IconRenderer icon="iconify:lucide:triangle-alert" :size="22" /></template>
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="refresh">重新检查</UiButton>
      </template>
    </UiStateCard>

    <div v-else class="android-tools-page__content">
      <UiCard class="android-tools-panel android-tools-panel--toolchain" padding="lg" radius="md">
        <div class="android-tools-panel__heading">
          <div>
            <h2>工具链</h2>
            <p>应用内置 ADB、scrcpy 和 fastboot，不依赖系统 PATH。</p>
          </div>
          <span class="android-tools-status" :class="{ 'android-tools-status--ok': hasToolchain, 'android-tools-status--error': !hasToolchain }">
            <span class="android-tools-status__dot" />
            {{ hasToolchain ? '可用' : '不可用' }}
          </span>
        </div>
        <div v-if="!hasToolchain" data-testid="android-toolchain-error" class="android-tools-alert android-tools-alert--error" role="alert">
          <strong>工具链不可用</strong>
          <span>{{ toolchain?.errorMessage || '请检查应用安装包中的 Android 工具资源。' }}</span>
          <div class="android-toolchain-recovery">
            <UiButton data-testid="download-android-toolchain" variant="primary" size="sm" :disabled="toolchainDownloadBusy" @click="downloadToolchain">
              <template #prefix><IconRenderer icon="iconify:lucide:download" :size="16" /></template>
              {{ toolchainDownloadBusy ? '下载中…' : '应用内下载并安装' }}
            </UiButton>
            <span>也可在设置的“系统路径”中选择已有工具链目录。</span>
          </div>
          <div v-if="toolchainDownloadBusy || toolchainDownloadProgress.phase === 'downloading' || toolchainDownloadProgress.phase === 'extracting' || toolchainDownloadProgress.phase === 'verifying'" class="android-toolchain-progress" data-testid="android-toolchain-progress">
            <div class="android-toolchain-progress__head">
              <span>{{ toolchainDownloadProgress.current || '正在准备下载' }}</span>
              <strong>{{ toolchainDownloadProgress.percent }}%</strong>
            </div>
            <div class="android-toolchain-progress__bar"><span :style="{ width: `${toolchainDownloadProgress.percent}%` }" /></div>
          </div>
          <span v-if="toolchainDownloadError" class="android-toolchain-download-error">{{ toolchainDownloadError }}</span>
        </div>
        <div v-else class="android-tools-versions">
          <div><span>ADB</span><code>{{ toolchain?.versions.adb || '未读取' }}</code></div>
          <div><span>scrcpy</span><code>{{ toolchain?.versions.scrcpy || '未读取' }}</code></div>
          <div><span>fastboot</span><code>{{ toolchain?.versions.fastboot || '未读取' }}</code></div>
        </div>
      </UiCard>

      <div class="android-tools-grid">
        <UiCard class="android-tools-panel android-tools-panel--devices" padding="lg" radius="md">
          <div class="android-tools-panel__heading">
            <div>
              <h2>设备</h2>
              <p>选择一个已授权的 ADB 设备开始操作。</p>
            </div>
            <span class="android-tools-count">{{ devices.length }}</span>
          </div>

          <div v-if="devices.length" class="android-device-list" role="listbox" aria-label="Android 设备">
            <button
              v-for="device in devices"
              :key="device.serial"
              class="android-device-row"
              :class="{ 'android-device-row--selected': device.serial === selectedSerial }"
              type="button"
              role="option"
              :aria-selected="device.serial === selectedSerial"
              :data-testid="`device-${device.serial}`"
              @click="selectedSerial = device.serial"
            >
              <span class="android-device-row__state" :class="`android-device-row__state--${device.state}`" />
              <span class="android-device-row__main">
                <strong>{{ device.model || device.serial }}</strong>
                <small>{{ device.serial }}</small>
              </span>
              <span class="android-device-row__meta">
                <span>{{ stateLabels[device.state] }}</span>
                <span>{{ transportLabels[device.transport] }}</span>
              </span>
            </button>
          </div>
          <UiStateCard
            v-else
            state="empty"
            title="未发现 Android 设备"
            description="连接 USB 并开启 USB 调试后，点击右上角刷新。"
            compact
          >
            <template #icon><IconRenderer icon="iconify:lucide:smartphone" :size="22" /></template>
          </UiStateCard>

          <div v-if="selectedDevice?.state === 'unauthorized'" class="android-tools-alert android-tools-alert--warning" role="status">
            <strong>需要设备授权</strong>
            <span>请在设备上允许 USB 调试授权，然后重新刷新设备列表。</span>
          </div>
          <div v-else-if="selectedDevice?.state === 'offline'" class="android-tools-alert android-tools-alert--warning" role="status">
            <strong>设备当前离线</strong>
            <span>重新插拔 USB 线或确认设备没有被其他 ADB 客户端占用。</span>
          </div>
          <div v-else-if="selectedDevice?.state !== 'device' && selectedDevice" class="android-tools-alert android-tools-alert--warning" role="status">
            <strong>设备状态不可用</strong>
            <span>当前状态为 {{ stateLabels[selectedDevice.state] }}，暂时不能启动会话。</span>
          </div>
        </UiCard>

        <UiCard class="android-tools-panel android-tools-panel--actions" padding="lg" radius="md">
          <div class="android-tools-panel__heading">
            <div>
              <h2>连接方式</h2>
              <p>{{ selectedDevice ? `当前设备：${selectedDevice.model || selectedDevice.serial}` : '先选择一个设备' }}</p>
            </div>
          </div>

          <div class="android-tools-options">
            <label>
              <span>键盘</span>
              <select v-model="keyboardMode" :disabled="!isSelectedDeviceReady || !hasToolchain">
                <option value="uhid">UHID（推荐）</option>
                <option value="sdk">SDK 兼容模式</option>
              </select>
            </label>
            <label>
              <span>鼠标</span>
              <select v-model="mouseMode" :disabled="!isSelectedDeviceReady || !hasToolchain">
                <option value="uhid">UHID（推荐）</option>
                <option value="sdk">SDK 兼容模式</option>
              </select>
            </label>
          </div>

          <div class="android-tools-actions">
            <UiButton data-testid="start-mirror" variant="primary" :disabled="!canStart('mirror')" @click="startMirror">
              <template #prefix><IconRenderer icon="iconify:lucide:monitor-play" :size="16" /></template>
              {{ busyAction === 'mirror' ? '启动中…' : '启动镜像' }}
            </UiButton>
            <UiButton data-testid="start-audio" variant="secondary" :disabled="!canStart('audio')" @click="startAudio">
              <template #prefix><IconRenderer icon="iconify:lucide:volume-2" :size="16" /></template>
              {{ busyAction === 'audio' ? '启动中…' : '音频回传' }}
            </UiButton>
            <UiButton data-testid="start-otg" variant="secondary" :disabled="!canStart('otg')" @click="startOtg">
              <template #prefix><IconRenderer icon="iconify:lucide:mouse-pointer-2" :size="16" /></template>
              {{ busyAction === 'otg' ? '启动中…' : 'OTG 键鼠' }}
            </UiButton>
          </div>

          <label v-if="duplicateSupported" class="android-tools-checkbox">
            <input v-model="duplicateOnDevice" type="checkbox" :disabled="!canStart('audio')">
            <span>在设备端保留播放（audio-dup）</span>
          </label>
          <p v-if="selectedDevice && !audioSupported" class="android-tools-help" data-testid="audio-unsupported">
            Android 11 及以上才支持音频回传。
          </p>
          <p v-else-if="selectedDevice?.sdkLevel === 30" class="android-tools-help">
            Android 11 设备需要在启动音频回传时保持解锁。
          </p>
          <p v-else-if="selectedDevice && audioSupported && selectedDevice.sdkLevel === undefined" class="android-tools-help">
            未读取到 Android 版本，音频能力将在启动时由 scrcpy 校验。
          </p>
          <p v-if="selectedDevice && !otgSupported" class="android-tools-help">
            OTG 仅支持 USB 连接；如果 ADB 占用设备，请先停止其他 ADB 会话。
          </p>
          <p class="android-tools-help">UHID 失败时可改用 SDK 兼容模式；部分设备需要开启“USB 调试（安全设置）”。</p>

          <div v-if="actionError" class="android-tools-alert android-tools-alert--error" role="alert">
            {{ actionError }}
          </div>
        </UiCard>
      </div>

      <UiCard class="android-tools-panel android-tools-panel--sessions" padding="lg" radius="md">
        <div class="android-tools-panel__heading">
          <div>
            <h2>运行中的会话</h2>
            <p>scrcpy 使用独立窗口播放镜像或音频，关闭页面不会自动停止会话。</p>
          </div>
          <span v-if="hasActiveSession" class="android-tools-live-indicator"><span />{{ sessions.filter(session => session.status === 'running').length }} 个运行中</span>
        </div>
        <div v-if="sessions.length" class="android-session-list">
          <div v-for="session in sessions" :key="session.sessionId" class="android-session-row">
            <span class="android-session-row__icon"><IconRenderer :icon="session.mode === 'audio-only' ? 'iconify:lucide:volume-2' : session.mode === 'otg' ? 'iconify:lucide:mouse-pointer-2' : 'iconify:lucide:monitor-play'" :size="17" /></span>
            <div class="android-session-row__main">
              <strong>{{ sessionModeLabels[session.mode] }}</strong>
              <span>{{ session.deviceSerial }}</span>
            </div>
            <span class="android-session-row__status" :class="`android-session-row__status--${session.status}`">{{ sessionStatusLabels[session.status] }}</span>
            <UiButton
              v-if="session.status === 'starting' || session.status === 'running' || session.status === 'stopping'"
              :data-testid="`stop-${session.sessionId}`"
              variant="danger"
              size="sm"
              :disabled="busyAction !== null"
              @click="stopSession(session.sessionId)"
            >
              {{ busyAction === `stop:${session.sessionId}` ? '停止中…' : '停止' }}
            </UiButton>
          </div>
        </div>
        <p v-else class="android-tools-sessions-empty">暂无会话。选择设备后，从上方启动一种连接方式。</p>
      </UiCard>
    </div>
  </main>
</template>

<style lang="scss" scoped>
@use './android-tools.scss';
</style>
