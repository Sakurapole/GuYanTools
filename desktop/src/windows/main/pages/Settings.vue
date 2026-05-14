<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { AppBottomBarTabId, AppLanguage, AppTheme, LocalNetworkInterfaceOption } from '@/contracts/app_config';
import type { FtpWindowsContextMenuStatus } from '@/contracts/ftp';
import type { MultiDeviceClipboardDeviceStatus } from '@/contracts/multi_device_clipboard';
import type {
  LocalTerminalProfileConfig,
  TerminalBackgroundConfig,
  TerminalProfile,
  TerminalRendererMode,
} from '@/contracts/terminal';
import type { WebScriptRule } from '@/contracts/webview';
import type { InstalledPluginRecord, PluginHostSummary } from '@/contracts/plugin_host';
import UiButton from '../components/ui/UiButton.vue';
import UiField from '../components/ui/UiField.vue';
import UiInput from '../components/ui/UiInput.vue';
import ShortcutRecorder from '../components/ui/ShortcutRecorder.vue';
import UiSelect from '../components/ui/UiSelect.vue';
import UiScrollbar from '../components/ui/UiScrollbar.vue';
import UiTabs, { type UiTabItem } from '../components/ui/UiTabs.vue';
import UiTransferBox from '../components/ui/UiTransferBox.vue';
import { useTheme } from '../composables/theme';
import { notifyError } from '../composables/useInAppNotification';
import { useConfirmDialog } from '../composables/useConfirmDialog';
import { useAppConfigStore } from '../stores/app_config_store';
import { useFtpStore } from '../stores/ftp_store';
import { useGlobalStore } from '../stores/global_store';
import { useSettingStore, type SettingsTabKey } from '../stores/settings_store';
import { useSshStore } from '../stores/ssh_store';
import { useUpdaterStore } from '../stores/updater_store';
import {
  APP_INTERNAL_FUNCTIONS,
  APP_BOTTOM_BAR_REQUIRED_TAB_IDS,
  createDefaultAppConfig,
} from '@/contracts/app_config';

const settingsStore = useSettingStore();
const appConfigStore = useAppConfigStore();
const globalStore = useGlobalStore();
const updaterStore = useUpdaterStore();
const ftpStore = useFtpStore();
const sshStore = useSshStore();
const { show: showConfirm } = useConfirmDialog();
const { setTheme } = useTheme();
const defaultShortcuts = createDefaultAppConfig().shortcuts;

type FtpPanelLayoutMode = 'columns' | 'stacked';
type FtpSidebarDockSide = 'left' | 'right';
type FtpAuxiliaryDockSide = 'bottom' | 'right';
type TransferBoxItem = {
  key: string;
  label: string;
  description?: string;
  locked?: boolean;
};

const FTP_LAYOUT_STORAGE_KEY = 'guyantools.ftp.layout';
const FTP_PREFERENCES_STORAGE_KEY = 'guyantools.ftp.preferences';
const FTP_THUMBNAIL_STORAGE_KEY = 'guyantools.ftp.thumbnail-preferences';

const hostSummary = ref<PluginHostSummary | null>(null);
const installedPlugins = ref<InstalledPluginRecord[]>([]);
const pluginLoadError = ref('');
const baseFontSizeInput = ref(String(appConfigStore.config.appearance.baseFontSize));
const unloadAfterMinutesInput = ref(String(appConfigStore.config.plugins.unloadAfterMinutes));
const ffmpegPathInput = ref(appConfigStore.config.tools?.ffmpegPath || '');
const ffmpegStatus = ref<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
const ffmpegVersion = ref('');
const ffmpegError = ref('');
const pluginConfigDrafts = ref<Record<string, string>>({});
const pluginConfigErrors = ref<Record<string, string>>({});
const terminalProfiles = ref<TerminalProfile[]>([]);
const terminalDefaultCwdInput = ref(appConfigStore.config.features.terminal.defaultCwd || '');
const multiDeviceClipboardDeviceNameInput = ref(appConfigStore.config.features.multiDeviceClipboard.deviceName || '');
const multiDeviceClipboardMaxSyncMbInput = ref(String(Math.round(appConfigStore.config.features.multiDeviceClipboard.maxSyncBytes / 1024 / 1024)));
const multiDeviceClipboardHistoryLimitInput = ref(String(appConfigStore.config.features.multiDeviceClipboard.historyLimit));
const localNetworkInterfaces = ref<LocalNetworkInterfaceOption[]>([]);
const networkInterfacesLoading = ref(false);
const draggedNetworkInterfaceKey = ref('');
const multiDeviceClipboardDevices = ref<MultiDeviceClipboardDeviceStatus[]>([]);
const multiDeviceClipboardDevicesLoading = ref(false);
const localTerminalBaseProfileId = ref('');
const localTerminalEditingId = ref('');
const localTerminalProfileError = ref('');
const localTerminalProfileForm = ref({
  label: '',
  command: '',
  argsText: '',
  cwd: '',
  envText: '{}',
  configFilePath: '',
});
const sshReconnectMaxAttemptsInput = ref(String(appConfigStore.config.features.terminal.sshReconnectMaxAttempts || 3));
const githubTokenInput = ref('');
const updaterAuthMessage = ref('');
const updaterAuthSaving = ref(false);
const ftpLinkNavigationEnabled = ref(false);
const ftpPanelLayoutMode = ref<FtpPanelLayoutMode>('columns');
const ftpSidebarDockSide = ref<FtpSidebarDockSide>('left');
const ftpAuxiliaryDockSide = ref<FtpAuxiliaryDockSide>('bottom');
const ftpAuxiliaryDockSize = ref('260');
const ftpShowSidebarPanel = ref(true);
const ftpShowLocalPanel = ref(true);
const ftpShowRemotePanel = ref(true);
const ftpAuxiliaryDockCollapsed = ref(false);
const ftpDualRemoteMode = ref(false);
const ftpSecondaryRemoteProfileId = ref('');
const ftpSecondaryTabGroupProfileIds = ref<string[]>([]);
const ftpThumbnailsEnabled = ref(true);
const ftpThumbnailMaxBytesKb = ref('256');
const ftpThumbnailPrefetchLimit = ref('18');
const ftpExternalEditorPath = ref('');
const ftpCleanupExternalDraftsOnClose = ref(false);
const ftpRetryMaxRetries = ref('3');
const ftpRetryBaseDelaySecs = ref('5');
const ftpKnownHostsLoading = ref(false);
const ftpWindowsContextMenuStatus = ref<FtpWindowsContextMenuStatus>({
  installed: false,
  command: '',
});
const ftpWindowsContextMenuLoading = ref(false);
const ftpWindowsContextMenuError = ref('');
const ftpSettingsLoaded = ref(false);

const settingsTabs: UiTabItem[] = [
  { key: 'general', label: '基础设置' },
  { key: 'file-transfer', label: '文件传输' },
  { key: 'web-security', label: 'WebView' },
  { key: 'ai-agent', label: 'Agent' },
  { key: 'plugins', label: '插件配置' },
  { key: 'terminal', label: '终端' },
  { key: 'multi-device-clipboard', label: '多设备剪贴板' },
  { key: 'shortcuts', label: '快捷键' },
];
const settingsTabOrder = settingsTabs.map(tab => tab.key) as SettingsTabKey[];
const settingsTabTransition = ref('ui-tab-forward');
const loadedSettingsTabs = new Set<SettingsTabKey>();

const themeOptions = [
  { label: '浅色主题', value: 'light' },
  { label: '深色主题', value: 'dark' },
];

const bottomBarTabOptions = computed(() => APP_INTERNAL_FUNCTIONS
  .filter(item => !item.devOnly || import.meta.env.DEV)
  .map(item => ({
    id: item.id,
    label: item.label,
    description: item.description,
    locked: APP_BOTTOM_BAR_REQUIRED_TAB_IDS.includes(item.id),
  })));

const bottomBarTransferItems = computed<TransferBoxItem[]>(() => bottomBarTabOptions.value.map(item => ({
  key: item.id,
  label: item.label,
  description: item.description,
  locked: item.locked,
})));

const bottomBarVisibleTabIds = computed(() => {
  const validIds = new Set(bottomBarTabOptions.value.map(item => item.id));
  const seen = new Set<AppBottomBarTabId>();
  const result: AppBottomBarTabId[] = [];

  for (const tabId of appConfigStore.config.bottomBar.defaultVisibleTabIds) {
    if (validIds.has(tabId) && !seen.has(tabId)) {
      seen.add(tabId);
      result.push(tabId);
    }
  }

  for (const tabId of APP_BOTTOM_BAR_REQUIRED_TAB_IDS) {
    if (validIds.has(tabId) && !seen.has(tabId)) {
      seen.add(tabId);
      result.push(tabId);
    }
  }

  return result;
});

const bottomBarVisibleSummary = computed(() => {
  const labelMap = new Map(bottomBarTabOptions.value.map(tab => [tab.id, tab.label]));
  const labels = bottomBarVisibleTabIds.value
    .map(tabId => labelMap.get(tabId))
    .filter((label): label is string => Boolean(label));
  return labels.length ? `默认显示：${labels.join('、')}` : '默认显示：首页、设置';
});

const orderedNetworkInterfaces = computed(() => {
  const priority = appConfigStore.config.features.multiDeviceClipboard.networkInterfacePriority ?? [];
  return [...localNetworkInterfaces.value].sort((a, b) => {
    const aIndex = networkInterfacePriorityIndex(a, priority);
    const bIndex = networkInterfacePriorityIndex(b, priority);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.name.localeCompare(b.name) || a.address.localeCompare(b.address);
  });
});

const activeNetworkInterface = computed(() => orderedNetworkInterfaces.value.find(item => !item.internal));
const pairedMultiDeviceClipboardDevices = computed(() =>
  multiDeviceClipboardDevices.value.filter(device => device.trusted && !device.isSelf));

const languageOptions = [
  { label: '简体中文', value: 'zh' },
  { label: 'English', value: 'en' },
];

const terminalRendererOptions = [
  { label: '自动', value: 'auto' },
  { label: '标准', value: 'standard' },
  { label: 'WebGL', value: 'webgl' },
];

const updateStatusLabels: Record<string, string> = {
  idle: '空闲',
  unsupported: '当前环境不支持自动更新',
  checking: '正在检查更新',
  available: '发现可用更新',
  downloading: '正在下载更新',
  downloaded: '更新已下载，等待安装',
  'not-available': '当前已是最新版本',
  error: '更新失败',
};

const pluginTabs = computed<UiTabItem[]>(() => installedPlugins.value.map((plugin) => ({
  key: plugin.manifest.id,
  label: plugin.manifest.displayName,
})));
const customTerminalProfiles = computed(() => appConfigStore.config.features.terminal.localProfiles ?? []);
const terminalProfileOptions = computed(() => [
  ...terminalProfiles.value.map((profile) => ({
    label: profile.label,
    value: profile.id,
  })),
  ...customTerminalProfiles.value.map((profile) => ({
    label: `${profile.label}（自定义）`,
    value: profile.id,
  })),
]);
const ftpSecondaryRemoteSessionOptions = computed(() => [
  { label: '自动选择第二标签组会话', value: '' },
  ...ftpStore.sessions.map((session) => ({
    label: `${session.profileLabel} · ${session.protocol.toUpperCase()} · ${session.username}@${session.host}:${session.port}`,
    value: session.profileId,
  })),
]);
const ftpLinkNavigationSummary = computed(() => {
  if (!ftpLinkNavigationEnabled.value) return '联动导航已关闭';
  return ftpDualRemoteMode.value ? '主标签组和第二标签组联动已开启' : '本地和远程联动已开启';
});
const ftpDualRemoteSummary = computed(() => {
  if (!ftpDualRemoteMode.value) return '当前为单标签组工作区';
  if (!ftpStore.sessions.length) return '并行标签组已开启，返回传输页后会在连接可用时生效';
  const selectedSession = ftpStore.sessions.find((session) => session.profileId === ftpSecondaryRemoteProfileId.value);
  return selectedSession
    ? `并行标签组已开启 · 第二组当前为 ${selectedSession.profileLabel}`
    : '并行标签组已开启 · 自动选择第二组会话';
});
const ftpThumbnailSummary = computed(() => (
  ftpThumbnailsEnabled.value
    ? `图片缩略图已开启 · 单张最多 ${ftpThumbnailMaxBytesKb.value} KB · 每侧预加载 ${ftpThumbnailPrefetchLimit.value} 张`
    : '图片缩略图已关闭'
));
const ftpPanelLayoutSummary = computed(() => (
  ftpPanelLayoutMode.value === 'columns' ? '当前为水平双栏布局' : '当前为纵向堆叠布局'
));
const ftpSidebarDockSummary = computed(() => (
  `会话侧栏停靠在${ftpSidebarDockSide.value === 'left' ? '左侧' : '右侧'}`
));
const ftpAuxiliaryDockSummary = computed(() => {
  const positionLabel = ftpAuxiliaryDockSide.value === 'bottom' ? '底部停靠区' : '右侧停靠区';
  const sizeLabel = ftpAuxiliaryDockSide.value === 'bottom' ? `高度 ${ftpAuxiliaryDockSize.value}px` : `宽度 ${ftpAuxiliaryDockSize.value}px`;
  return `${positionLabel} · ${sizeLabel}`;
});
const ftpBrowserPanelSummary = computed(() => {
  if (ftpDualRemoteMode.value && ftpShowLocalPanel.value && ftpShowRemotePanel.value) return '本地、主远程与第二标签组面板均显示';
  if (ftpDualRemoteMode.value && ftpShowRemotePanel.value) return ftpShowLocalPanel.value ? '本地、主远程与第二标签组并行显示' : '当前显示主远程与第二标签组';
  if (ftpDualRemoteMode.value && ftpShowLocalPanel.value) return '当前显示本地与第二标签组';
  if (ftpDualRemoteMode.value) return '当前仅显示第二标签组';
  if (ftpShowLocalPanel.value && ftpShowRemotePanel.value) return '本地与远程面板均显示';
  if (ftpShowLocalPanel.value) return '当前仅显示本地面板';
  if (ftpShowRemotePanel.value) return '当前仅显示远程面板';
  return '至少需要保留一个文件面板';
});
const ftpExternalEditorSummary = computed(() => (
  ftpExternalEditorPath.value
    ? `自定义编辑器：${ftpExternalEditorPath.value}${ftpCleanupExternalDraftsOnClose.value ? ' · 关闭后清理临时文件' : ''}`
    : '当前使用系统默认编辑器'
));
const ftpKnownHostSummary = computed(() => {
  if (ftpKnownHostsLoading.value) return '正在加载已信任主机指纹';
  if (!sshStore.knownHosts.length) return '当前没有已信任的主机指纹';
  return `已信任 ${sshStore.knownHosts.length} 条主机指纹`;
});
const ftpRetryPolicySummary = computed(() => `失败后最多自动重试 ${ftpRetryMaxRetries.value} 次，基础等待 ${ftpRetryBaseDelaySecs.value} 秒`);
const ftpWindowsContextMenuSummary = computed(() => (
  ftpWindowsContextMenuStatus.value.installed
    ? '已安装到 Windows 资源管理器右键菜单'
    : '尚未安装 Windows 资源管理器右键菜单'
));
const ftpWindowsContextMenuCommandSummary = computed(() => (
  ftpWindowsContextMenuStatus.value.command || '暂无可用命令'
));
const ftpVisibleBrowserPanelCount = computed(() =>
  Number(ftpShowLocalPanel.value) + Number(ftpShowRemotePanel.value) + Number(ftpDualRemoteMode.value),
);
const updateStatusLabel = computed(() => updateStatusLabels[updaterStore.status] ?? updaterStore.status);
const updateProgressPercent = computed(() => Math.round(updaterStore.progress?.percent ?? 0));
const updateReleaseDateText = computed(() => {
  if (!updaterStore.info.releaseDate) {
    return '未提供';
  }

  const releaseDate = new Date(updaterStore.info.releaseDate);
  if (Number.isNaN(releaseDate.getTime())) {
    return updaterStore.info.releaseDate;
  }

  return releaseDate.toLocaleString();
});
const canCheckUpdate = computed(() => !updaterStore.isBusy && updaterStore.status !== 'downloaded');
const canDownloadUpdate = computed(() => updaterStore.status === 'available' && !updaterStore.isBusy);
const canInstallUpdate = computed(() => updaterStore.status === 'downloaded');
const updaterAuthSourceText = computed(() => {
  if (!updaterStore.auth.hasToken) return '未配置';
  return updaterStore.auth.source === 'environment' ? '环境变量' : '本机安全存储';
});
const canSaveGithubToken = computed(() => Boolean(githubTokenInput.value.trim()) && !updaterAuthSaving.value);

const activePlugin = computed(() => installedPlugins.value.find(
  (plugin) => plugin.manifest.id === settingsStore.activePluginConfigId,
) ?? null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function syncPluginDraft(pluginId: string) {
  pluginConfigDrafts.value[pluginId] = JSON.stringify(appConfigStore.config.plugins.items[pluginId] ?? {}, null, 2);
  pluginConfigErrors.value[pluginId] = '';
}

async function loadPluginContext() {
  if (!window.pluginHostApi) {
    pluginLoadError.value = 'pluginHostApi 不可用';
    return;
  }

  try {
    hostSummary.value = await window.pluginHostApi.getHostSummary();
    installedPlugins.value = await window.pluginHostApi.listPlugins();

    if (!installedPlugins.value.length) {
      settingsStore.setActivePluginConfigId('');
      pluginLoadError.value = '';
      return;
    }

    const hasActivePlugin = installedPlugins.value.some((plugin) => plugin.manifest.id === settingsStore.activePluginConfigId);
    if (!hasActivePlugin) {
      settingsStore.setActivePluginConfigId(installedPlugins.value[0].manifest.id);
    }

    for (const plugin of installedPlugins.value) {
      syncPluginDraft(plugin.manifest.id);
    }

    pluginLoadError.value = '';
  } catch (error) {
    pluginLoadError.value = error instanceof Error ? error.message : '插件配置读取失败';
    notifyError(error, '插件配置读取失败');
  }
}

async function handleThemeChange(value: string) {
  await setTheme(value as AppTheme);
}

async function handleLanguageChange(value: string) {
  await appConfigStore.updateConfig({
    appearance: {
      language: value as AppLanguage,
    },
  });
}

async function handleBottomBarVisibleTabsChange(value: string[]) {
  const validIds = new Set(bottomBarTabOptions.value.map(tab => tab.id));
  const seen = new Set<AppBottomBarTabId>();
  const nextIds: AppBottomBarTabId[] = [];
  let candidateIds = value;
  for (const requiredId of APP_BOTTOM_BAR_REQUIRED_TAB_IDS) {
    if (validIds.has(requiredId) && !candidateIds.includes(requiredId)) {
      candidateIds = [...candidateIds, requiredId];
    }
  }

  for (const id of candidateIds) {
    if (!validIds.has(id as AppBottomBarTabId) || seen.has(id as AppBottomBarTabId)) {
      continue;
    }

    const tabId = id as AppBottomBarTabId;
    seen.add(tabId);
    nextIds.push(tabId);
  }

  await appConfigStore.updateConfig({
    bottomBar: {
      defaultVisibleTabIds: nextIds,
    },
  });
}

function handleSettingsTabChange(value: string) {
  const nextTab = value as SettingsTabKey;
  const currentIndex = settingsTabOrder.indexOf(settingsStore.activeSettingsTab);
  const nextIndex = settingsTabOrder.indexOf(nextTab);

  settingsTabTransition.value = nextIndex >= currentIndex ? 'ui-tab-forward' : 'ui-tab-back';
  settingsStore.setActiveSettingsTab(nextTab);
  scheduleSettingsTabLoad(nextTab);
}

function runSettingsIdleTask(task: () => void) {
  window.setTimeout(() => {
    window.requestAnimationFrame(task);
  }, 0);
}

function scheduleSettingsTabLoad(tab: SettingsTabKey, force = false) {
  if (!force && loadedSettingsTabs.has(tab)) {
    return;
  }

  loadedSettingsTabs.add(tab);
  runSettingsIdleTask(() => {
    switch (tab) {
      case 'general':
        if (appConfigStore.fontOptions.length === 0) {
          void appConfigStore.loadLocalFonts();
        }
        break;
      case 'file-transfer':
        loadFtpSettingsDraft();
        void ftpStore.initialize();
        void sshStore.initialize();
        void loadFtpRetryPolicy();
        void refreshFtpWindowsContextMenuStatus();
        void refreshFtpKnownHosts();
        break;
      case 'terminal':
        void sshStore.initialize();
        void loadTerminalProfiles();
        break;
      case 'multi-device-clipboard':
        void loadNetworkInterfaces();
        void loadMultiDeviceClipboardDevices();
        break;
      case 'plugins':
        void loadPluginContext();
        break;
      case 'web-security':
        void loadExtensions();
        break;
      case 'ai-agent':
      case 'shortcuts':
        break;
      default:
        break;
    }
  });
}

function normalizeFtpPanelSize(value: string | undefined, min: number, max: number, fallback: string) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return String(Math.min(max, Math.max(min, parsed)));
}

function loadFtpSettingsDraft() {
  try {
    const rawLayout = window.localStorage.getItem(FTP_LAYOUT_STORAGE_KEY);
    if (rawLayout) {
      const parsed = JSON.parse(rawLayout) as Partial<{
        mode: FtpPanelLayoutMode;
        sidebarDockSide: FtpSidebarDockSide;
        auxiliaryDockSide: FtpAuxiliaryDockSide;
        auxiliaryDockSize: string;
        showSidebar: boolean;
        showLocal: boolean;
        showRemote: boolean;
        auxCollapsed: boolean;
      }>;
      ftpPanelLayoutMode.value = parsed.mode === 'stacked' ? 'stacked' : 'columns';
      ftpSidebarDockSide.value = parsed.sidebarDockSide === 'right' ? 'right' : 'left';
      ftpAuxiliaryDockSide.value = parsed.auxiliaryDockSide === 'right' ? 'right' : 'bottom';
      ftpAuxiliaryDockSize.value = normalizeFtpPanelSize(parsed.auxiliaryDockSize, 180, 1200, '260');
      ftpShowSidebarPanel.value = parsed.showSidebar ?? true;
      ftpShowLocalPanel.value = parsed.showLocal ?? true;
      ftpShowRemotePanel.value = parsed.showRemote ?? true;
      ftpAuxiliaryDockCollapsed.value = parsed.auxCollapsed ?? false;
    }

    const rawPreferences = window.localStorage.getItem(FTP_PREFERENCES_STORAGE_KEY);
    if (rawPreferences) {
      const parsed = JSON.parse(rawPreferences) as Partial<{
        externalEditorPath: string;
        cleanupExternalDraftsOnClose: boolean;
        linkNavigationEnabled: boolean;
        dualRemoteMode: boolean;
        secondaryTabGroupProfileIds: string[];
        secondaryRemoteProfileId: string;
      }>;
      ftpExternalEditorPath.value = typeof parsed.externalEditorPath === 'string' ? parsed.externalEditorPath : '';
      ftpCleanupExternalDraftsOnClose.value = Boolean(parsed.cleanupExternalDraftsOnClose);
      ftpLinkNavigationEnabled.value = Boolean(parsed.linkNavigationEnabled);
      ftpDualRemoteMode.value = Boolean(parsed.dualRemoteMode);
      ftpSecondaryTabGroupProfileIds.value = Array.isArray(parsed.secondaryTabGroupProfileIds)
        ? parsed.secondaryTabGroupProfileIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : [];
      ftpSecondaryRemoteProfileId.value = typeof parsed.secondaryRemoteProfileId === 'string' ? parsed.secondaryRemoteProfileId : '';
    }

    const rawThumbnail = window.localStorage.getItem(FTP_THUMBNAIL_STORAGE_KEY);
    if (rawThumbnail) {
      const parsed = JSON.parse(rawThumbnail) as Partial<{
        enabled: boolean;
        maxBytesKb: string;
        prefetchLimit: string;
      }>;
      ftpThumbnailsEnabled.value = parsed.enabled !== false;
      ftpThumbnailMaxBytesKb.value = typeof parsed.maxBytesKb === 'string' ? parsed.maxBytesKb : '256';
      ftpThumbnailPrefetchLimit.value = typeof parsed.prefetchLimit === 'string' ? parsed.prefetchLimit : '18';
    }
  } catch {
    ftpLinkNavigationEnabled.value = false;
    ftpPanelLayoutMode.value = 'columns';
    ftpSidebarDockSide.value = 'left';
    ftpAuxiliaryDockSide.value = 'bottom';
    ftpAuxiliaryDockSize.value = '260';
    ftpShowSidebarPanel.value = true;
    ftpShowLocalPanel.value = true;
    ftpShowRemotePanel.value = true;
    ftpAuxiliaryDockCollapsed.value = false;
    ftpDualRemoteMode.value = false;
    ftpSecondaryRemoteProfileId.value = '';
    ftpSecondaryTabGroupProfileIds.value = [];
    ftpThumbnailsEnabled.value = true;
    ftpThumbnailMaxBytesKb.value = '256';
    ftpThumbnailPrefetchLimit.value = '18';
    ftpExternalEditorPath.value = '';
    ftpCleanupExternalDraftsOnClose.value = false;
  } finally {
    ftpSettingsLoaded.value = true;
  }
}

function persistFtpLayoutSettings() {
  if (!ftpSettingsLoaded.value) return;
  window.localStorage.setItem(FTP_LAYOUT_STORAGE_KEY, JSON.stringify({
    mode: ftpPanelLayoutMode.value,
    sidebarDockSide: ftpSidebarDockSide.value,
    auxiliaryDockSide: ftpAuxiliaryDockSide.value,
    auxiliaryDockSize: ftpAuxiliaryDockSize.value,
    showSidebar: ftpShowSidebarPanel.value,
    showLocal: ftpShowLocalPanel.value,
    showRemote: ftpShowRemotePanel.value,
    auxCollapsed: ftpAuxiliaryDockCollapsed.value,
  }));
}

function persistFtpPreferenceSettings() {
  if (!ftpSettingsLoaded.value) return;
  const secondaryTabGroupProfileIds = ftpDualRemoteMode.value && ftpSecondaryRemoteProfileId.value
    ? Array.from(new Set([...ftpSecondaryTabGroupProfileIds.value, ftpSecondaryRemoteProfileId.value]))
    : ftpSecondaryTabGroupProfileIds.value;
  window.localStorage.setItem(FTP_PREFERENCES_STORAGE_KEY, JSON.stringify({
    externalEditorPath: ftpExternalEditorPath.value,
    cleanupExternalDraftsOnClose: ftpCleanupExternalDraftsOnClose.value,
    linkNavigationEnabled: ftpLinkNavigationEnabled.value,
    dualRemoteMode: ftpDualRemoteMode.value,
    secondaryTabGroupProfileIds,
    secondaryRemoteProfileId: ftpSecondaryRemoteProfileId.value,
  }));
}

function persistFtpThumbnailSettings() {
  if (!ftpSettingsLoaded.value) return;
  window.localStorage.setItem(FTP_THUMBNAIL_STORAGE_KEY, JSON.stringify({
    enabled: ftpThumbnailsEnabled.value,
    maxBytesKb: ftpThumbnailMaxBytesKb.value,
    prefetchLimit: ftpThumbnailPrefetchLimit.value,
  }));
}

function setFtpPanelLayoutMode(mode: FtpPanelLayoutMode) {
  ftpPanelLayoutMode.value = mode;
}

function setFtpSidebarDockSide(side: FtpSidebarDockSide) {
  ftpSidebarDockSide.value = side;
}

function setFtpAuxiliaryDockSide(side: FtpAuxiliaryDockSide) {
  ftpAuxiliaryDockSide.value = side;
}

function setFtpAuxiliaryDockSize(value: string) {
  ftpAuxiliaryDockSize.value = normalizeFtpPanelSize(value, 180, 420, ftpAuxiliaryDockSize.value);
}

function toggleFtpLocalPanel() {
  if (ftpShowLocalPanel.value && ftpVisibleBrowserPanelCount.value <= 1) return;
  ftpShowLocalPanel.value = !ftpShowLocalPanel.value;
}

function toggleFtpRemotePanel() {
  if (ftpShowRemotePanel.value && ftpVisibleBrowserPanelCount.value <= 1) return;
  ftpShowRemotePanel.value = !ftpShowRemotePanel.value;
}

function setFtpThumbnailMaxBytesKb(value: string) {
  ftpThumbnailMaxBytesKb.value = String(Math.max(1, Number(value.replace(/\D/g, '')) || 256));
}

function setFtpThumbnailPrefetchLimit(value: string) {
  ftpThumbnailPrefetchLimit.value = String(Math.max(1, Number(value.replace(/\D/g, '')) || 18));
}

function setFtpRetryMaxRetries(value: string) {
  ftpRetryMaxRetries.value = String(Math.max(0, Number(value.replace(/\D/g, '')) || 0));
}

function setFtpRetryBaseDelaySecs(value: string) {
  ftpRetryBaseDelaySecs.value = String(Math.max(1, Number(value.replace(/\D/g, '')) || 1));
}

async function loadFtpRetryPolicy() {
  try {
    const policy = await window.ftpApi.getRetryPolicy();
    ftpRetryMaxRetries.value = String(policy.maxRetries);
    ftpRetryBaseDelaySecs.value = String(policy.baseDelaySecs);
  } catch {
    ftpRetryMaxRetries.value = '3';
    ftpRetryBaseDelaySecs.value = '5';
  }
}

async function applyFtpRetryPolicy() {
  const policy = await window.ftpApi.updateRetryPolicy({
    maxRetries: Math.max(0, Number(ftpRetryMaxRetries.value) || 0),
    baseDelaySecs: Math.max(1, Number(ftpRetryBaseDelaySecs.value) || 1),
  });
  ftpRetryMaxRetries.value = String(policy.maxRetries);
  ftpRetryBaseDelaySecs.value = String(policy.baseDelaySecs);
}

async function refreshFtpWindowsContextMenuStatus() {
  try {
    ftpWindowsContextMenuLoading.value = true;
    ftpWindowsContextMenuError.value = '';
    ftpWindowsContextMenuStatus.value = await window.ftpApi.getWindowsContextMenuStatus();
  } catch (error) {
    ftpWindowsContextMenuError.value = error instanceof Error ? error.message : String(error);
    notifyError(error, 'FTP 右键菜单状态读取失败');
  } finally {
    ftpWindowsContextMenuLoading.value = false;
  }
}

async function installFtpWindowsContextMenu() {
  try {
    ftpWindowsContextMenuLoading.value = true;
    ftpWindowsContextMenuError.value = '';
    ftpWindowsContextMenuStatus.value = await window.ftpApi.installWindowsContextMenu();
  } catch (error) {
    ftpWindowsContextMenuError.value = error instanceof Error ? error.message : String(error);
    notifyError(error, 'FTP 右键菜单安装失败');
  } finally {
    ftpWindowsContextMenuLoading.value = false;
  }
}

async function uninstallFtpWindowsContextMenu() {
  try {
    ftpWindowsContextMenuLoading.value = true;
    ftpWindowsContextMenuError.value = '';
    ftpWindowsContextMenuStatus.value = await window.ftpApi.uninstallWindowsContextMenu();
  } catch (error) {
    ftpWindowsContextMenuError.value = error instanceof Error ? error.message : String(error);
    notifyError(error, 'FTP 右键菜单卸载失败');
  } finally {
    ftpWindowsContextMenuLoading.value = false;
  }
}

async function pickFtpExternalEditor() {
  const selected = await window.shellApi.selectFile({
    title: '选择外部编辑器',
    filters: [
      { name: '应用程序', extensions: ['exe', 'cmd', 'bat'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    defaultPath: ftpExternalEditorPath.value || undefined,
  });
  if (!selected) return;
  ftpExternalEditorPath.value = selected;
}

async function refreshFtpKnownHosts() {
  try {
    ftpKnownHostsLoading.value = true;
    await sshStore.refreshKnownHosts();
  } finally {
    ftpKnownHostsLoading.value = false;
  }
}

async function deleteFtpKnownHost(id: string) {
  const knownHost = sshStore.knownHosts.find((item) => item.id === id);
  const targetLabel = knownHost ? `${knownHost.host}:${knownHost.port}` : '这条主机指纹';
  const confirmed = await showConfirm({
    title: '删除已信任主机指纹',
    message: `删除 ${targetLabel} 的已信任指纹后，下次连接将重新要求确认主机密钥。是否继续？`,
    confirmText: '删除指纹',
    danger: true,
  });
  if (!confirmed) return;
  await sshStore.deleteKnownHost(id);
}

async function handleFontChange(value: string) {
  await appConfigStore.updateConfig({
    appearance: {
      fontFamily: value,
    },
  });
}

async function loadTerminalProfiles() {
  terminalProfiles.value = await window.terminalApi.listProfiles();
  if (!localTerminalBaseProfileId.value && terminalProfiles.value.length > 0) {
    localTerminalBaseProfileId.value = terminalProfiles.value[0].id;
    fillLocalTerminalProfileFromBase(localTerminalBaseProfileId.value);
  }
}

async function handleTerminalProfileChange(value: string) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        defaultProfileId: value,
      },
    },
  });
}

async function handleTerminalRendererChange(value: string | number) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        rendererMode: value as TerminalRendererMode,
      },
    },
  });
}

async function commitTerminalDefaultCwd() {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        defaultCwd: terminalDefaultCwdInput.value.trim(),
      },
    },
  });
}

function fillLocalTerminalProfileFromBase(profileId: string) {
  localTerminalBaseProfileId.value = profileId;
  if (localTerminalEditingId.value) {
    return;
  }

  const profile = terminalProfiles.value.find((item) => item.id === profileId);
  if (!profile) {
    return;
  }

  localTerminalProfileForm.value = {
    ...localTerminalProfileForm.value,
    label: `${profile.label} 自定义`,
    command: profile.command,
    argsText: profile.args.join(' '),
  };
}

function createDefaultTerminalBackground(): TerminalBackgroundConfig {
  return {
    type: appConfigStore.config.features.terminal.viewportBgType ?? 'color',
    color: appConfigStore.config.features.terminal.viewportBgColor ?? '',
    image: appConfigStore.config.features.terminal.viewportBgImage ?? '',
    video: appConfigStore.config.features.terminal.viewportBgVideo ?? '',
    style: appConfigStore.config.features.terminal.viewportBgStyle ?? {},
  };
}

function resetLocalTerminalProfileForm() {
  localTerminalEditingId.value = '';
  localTerminalProfileError.value = '';
  const profile = terminalProfiles.value.find((item) => item.id === localTerminalBaseProfileId.value)
    ?? terminalProfiles.value[0];
  localTerminalProfileForm.value = {
    label: profile ? `${profile.label} 自定义` : '',
    command: profile?.command ?? '',
    argsText: profile?.args.join(' ') ?? '',
    cwd: '',
    envText: '{}',
    configFilePath: '',
  };
}

function parseTerminalArgs(value: string) {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | '' = '';
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (quote && char === '\\') {
      escaping = true;
      continue;
    }

    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += '\\';
  }
  if (current) {
    args.push(current);
  }

  return args;
}

function parseTerminalEnv(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('环境变量必须是 JSON 对象');
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[0].trim().length > 0),
  );
}

async function saveLocalTerminalProfile() {
  const label = localTerminalProfileForm.value.label.trim();
  const command = localTerminalProfileForm.value.command.trim();
  if (!label || !command) {
    localTerminalProfileError.value = '名称和命令不能为空。';
    return;
  }

  let env: Record<string, string>;
  try {
    env = parseTerminalEnv(localTerminalProfileForm.value.envText);
  } catch (error) {
    localTerminalProfileError.value = error instanceof Error ? error.message : '环境变量格式不正确。';
    return;
  }

  const id = localTerminalEditingId.value || `local:${Date.now().toString(36)}`;
  const nextProfile: LocalTerminalProfileConfig = {
    id,
    label,
    command,
    args: parseTerminalArgs(localTerminalProfileForm.value.argsText),
    cwd: localTerminalProfileForm.value.cwd.trim(),
    env,
    configFilePath: localTerminalProfileForm.value.configFilePath.trim(),
    background: localTerminalEditingId.value
      ? customTerminalProfiles.value.find((profile) => profile.id === localTerminalEditingId.value)?.background ?? createDefaultTerminalBackground()
      : createDefaultTerminalBackground(),
  };
  const nextProfiles = localTerminalEditingId.value
    ? customTerminalProfiles.value.map((profile) => profile.id === localTerminalEditingId.value ? nextProfile : profile)
    : [...customTerminalProfiles.value, nextProfile];

  await appConfigStore.updateConfig({
    features: {
      terminal: {
        localProfiles: nextProfiles,
      },
    },
  });
  resetLocalTerminalProfileForm();
}

function editLocalTerminalProfile(profile: LocalTerminalProfileConfig) {
  localTerminalEditingId.value = profile.id;
  localTerminalProfileError.value = '';
  localTerminalProfileForm.value = {
    label: profile.label,
    command: profile.command,
    argsText: profile.args.join(' '),
    cwd: profile.cwd ?? '',
    envText: JSON.stringify(profile.env ?? {}, null, 2),
    configFilePath: profile.configFilePath ?? '',
  };
}

async function deleteLocalTerminalProfile(profile: LocalTerminalProfileConfig) {
  const confirmed = await showConfirm({
    title: '删除本地终端类型',
    message: `删除 ${profile.label} 后，新建会话列表中将不再显示这个类型。是否继续？`,
    confirmText: '删除',
    danger: true,
  });
  if (!confirmed) return;

  const nextProfiles = customTerminalProfiles.value.filter((item) => item.id !== profile.id);
  const fallbackProfileId = appConfigStore.config.features.terminal.defaultProfileId === profile.id
    ? terminalProfiles.value[0]?.id ?? ''
    : appConfigStore.config.features.terminal.defaultProfileId;
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        localProfiles: nextProfiles,
        defaultProfileId: fallbackProfileId,
      },
    },
  });
  if (localTerminalEditingId.value === profile.id) {
    resetLocalTerminalProfileForm();
  }
}

async function handleTerminalSixelChange(event: Event) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        enableSixel: (event.target as HTMLInputElement).checked,
      },
    },
  });
}

async function handleTerminalBellChange(event: Event) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        enableBell: (event.target as HTMLInputElement).checked,
      },
    },
  });
}

async function handleTerminalDetachChange(event: Event) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        detachToWindowByDefault: (event.target as HTMLInputElement).checked,
      },
    },
  });
}

async function commitSshReconnectMaxAttempts() {
  const numeric = Number(sshReconnectMaxAttemptsInput.value);
  const nextValue = Number.isFinite(numeric)
    ? Math.max(1, Math.min(20, Math.round(numeric)))
    : 3;
  sshReconnectMaxAttemptsInput.value = String(nextValue);
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        sshReconnectMaxAttempts: nextValue,
      },
    },
  });
}

async function handleMultiDeviceClipboardEnabledChange(event: Event) {
  await appConfigStore.updateConfig({
    features: {
      multiDeviceClipboard: {
        enabled: (event.target as HTMLInputElement).checked,
      },
    },
  });
}

async function commitMultiDeviceClipboardDeviceName() {
  await appConfigStore.updateConfig({
    features: {
      multiDeviceClipboard: {
        deviceName: multiDeviceClipboardDeviceNameInput.value.trim(),
      },
    },
  });
}

async function commitMultiDeviceClipboardMaxSyncMb() {
  const numeric = Number(multiDeviceClipboardMaxSyncMbInput.value);
  const mb = Number.isFinite(numeric)
    ? Math.max(1, Math.min(1024, Math.round(numeric)))
    : 100;
  multiDeviceClipboardMaxSyncMbInput.value = String(mb);
  await appConfigStore.updateConfig({
    features: {
      multiDeviceClipboard: {
        maxSyncBytes: mb * 1024 * 1024,
      },
    },
  });
}

async function commitMultiDeviceClipboardHistoryLimit() {
  const numeric = Number(multiDeviceClipboardHistoryLimitInput.value);
  const limit = Number.isFinite(numeric)
    ? Math.max(1, Math.min(5000, Math.round(numeric)))
    : 200;
  multiDeviceClipboardHistoryLimitInput.value = String(limit);
  await appConfigStore.updateConfig({
    features: {
      multiDeviceClipboard: {
        historyLimit: limit,
      },
    },
  });
}

async function loadNetworkInterfaces() {
  if (!window.appConfigApi?.listNetworkInterfaces) return;
  networkInterfacesLoading.value = true;
  try {
    localNetworkInterfaces.value = await window.appConfigApi.listNetworkInterfaces();
  } finally {
    networkInterfacesLoading.value = false;
  }
}

function networkInterfacePriorityIndex(
  item: LocalNetworkInterfaceOption,
  priority: string[],
) {
  const index = priority.findIndex(value => value === item.key || value === item.address);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

async function saveNetworkInterfacePriority(keys: string[]) {
  await appConfigStore.updateConfig({
    features: {
      multiDeviceClipboard: {
        networkInterfacePriority: keys,
      },
    },
  });
}

async function moveNetworkInterface(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return;
  const items = orderedNetworkInterfaces.value;
  if (!items[fromIndex] || !items[toIndex]) return;
  const keys = items.map(item => item.key);
  const [moved] = keys.splice(fromIndex, 1);
  keys.splice(toIndex, 0, moved);
  await saveNetworkInterfacePriority(keys);
}

function handleNetworkInterfaceDragStart(key: string, event: DragEvent) {
  draggedNetworkInterfaceKey.value = key;
  event.dataTransfer?.setData('text/plain', key);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

async function handleNetworkInterfaceDrop(targetKey: string, event: DragEvent) {
  event.preventDefault();
  const sourceKey = draggedNetworkInterfaceKey.value || event.dataTransfer?.getData('text/plain') || '';
  draggedNetworkInterfaceKey.value = '';
  if (!sourceKey || sourceKey === targetKey) return;
  const items = orderedNetworkInterfaces.value;
  const fromIndex = items.findIndex(item => item.key === sourceKey);
  const toIndex = items.findIndex(item => item.key === targetKey);
  await moveNetworkInterface(fromIndex, toIndex);
}

async function resetNetworkInterfacePriority() {
  await saveNetworkInterfacePriority([]);
}

async function loadMultiDeviceClipboardDevices() {
  if (!window.multiDeviceClipboardApi?.listDeviceStatuses) return;
  multiDeviceClipboardDevicesLoading.value = true;
  try {
    multiDeviceClipboardDevices.value = await window.multiDeviceClipboardApi.listDeviceStatuses(60);
  } finally {
    multiDeviceClipboardDevicesLoading.value = false;
  }
}

async function forgetMultiDeviceClipboardDevice(device: MultiDeviceClipboardDeviceStatus) {
  if (!window.multiDeviceClipboardApi?.forgetDevice) return;
  const confirmed = await showConfirm({
    title: '移除已配对设备',
    message: `确定移除「${device.name}」吗？移除后该设备不能继续同步剪贴板，需要重新配对。`,
    confirmText: '移除',
    cancelText: '取消',
    danger: true,
  });
  if (!confirmed) return;
  await window.multiDeviceClipboardApi.forgetDevice(device.deviceId);
  await loadMultiDeviceClipboardDevices();
}

function multiDeviceClipboardDeviceStatusLabel(device: MultiDeviceClipboardDeviceStatus) {
  if (device.state === 'trustedOnline') return '在线';
  if (device.state === 'trustedOffline') return '离线';
  if (device.state === 'available') return '可配对';
  return '未知';
}

function multiDeviceClipboardDeviceMeta(device: MultiDeviceClipboardDeviceStatus) {
  const endpoint = device.lastAddress ? `${device.lastAddress}${device.lastPort ? `:${device.lastPort}` : ''}` : '';
  const seen = device.secondsSinceSeen == null
    ? ''
    : device.secondsSinceSeen < 60
      ? `${Math.round(device.secondsSinceSeen)} 秒前`
      : `${Math.round(device.secondsSinceSeen / 60)} 分钟前`;
  return [
    multiDeviceClipboardDeviceStatusLabel(device),
    device.platform || 'unknown',
    endpoint,
    seen ? `上次发现 ${seen}` : '',
  ].filter(Boolean).join(' · ');
}

async function commitBaseFontSize() {
  const numeric = Number(baseFontSizeInput.value);
  await appConfigStore.updateConfig({
    appearance: {
      baseFontSize: numeric,
    },
  });
}

async function updateInternalShortcut(
  key: keyof typeof defaultShortcuts.internal,
  value: string,
) {
  await appConfigStore.updateConfig({
    shortcuts: {
      internal: {
        [key]: value,
      },
    },
  });
}

async function updateSystemShortcut(
  key: keyof typeof defaultShortcuts.system,
  value: string,
) {
  await appConfigStore.updateConfig({
    shortcuts: {
      system: {
        [key]: value,
      },
    },
  });
}

async function selectFfmpegPath() {
  const filePath = await window.shellApi.selectFile({
    title: '选择 FFmpeg 可执行文件',
    filters: [
      { name: '可执行文件', extensions: ['exe'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (!filePath) return;

  ffmpegPathInput.value = filePath;
  await commitAndVerifyFfmpeg();
}

async function clearFfmpegPath() {
  ffmpegPathInput.value = '';
  ffmpegStatus.value = 'idle';
  ffmpegVersion.value = '';
  ffmpegError.value = '';
  await appConfigStore.updateConfig({ tools: { ffmpegPath: '' } });
}

async function commitAndVerifyFfmpeg() {
  const path = ffmpegPathInput.value.trim();
  if (!path) {
    ffmpegStatus.value = 'idle';
    return;
  }

  // 先保存路径
  await appConfigStore.updateConfig({ tools: { ffmpegPath: path } });

  // 然后验证
  ffmpegStatus.value = 'checking';
  ffmpegVersion.value = '';
  ffmpegError.value = '';

  try {
    const result = await window.mediaApi.checkFfmpeg();
    if (result.available) {
      ffmpegStatus.value = 'valid';
      ffmpegVersion.value = result.version || '';
    } else {
      ffmpegStatus.value = 'invalid';
      ffmpegError.value = result.error || '无法执行 FFmpeg';
    }
  } catch (error: any) {
    ffmpegStatus.value = 'invalid';
    ffmpegError.value = error.message || '验证失败';
  }
}

async function saveGithubToken() {
  if (!canSaveGithubToken.value) return;

  updaterAuthSaving.value = true;
  updaterAuthMessage.value = '';
  try {
    await updaterStore.saveGithubToken(githubTokenInput.value);
    githubTokenInput.value = '';
    updaterAuthMessage.value = 'GitHub Token 已保存。';
  } catch (error: any) {
    updaterAuthMessage.value = error?.message || 'GitHub Token 保存失败';
  } finally {
    updaterAuthSaving.value = false;
  }
}

async function clearGithubToken() {
  updaterAuthSaving.value = true;
  updaterAuthMessage.value = '';
  try {
    await updaterStore.clearGithubToken();
    githubTokenInput.value = '';
    updaterAuthMessage.value = '本机保存的 GitHub Token 已清除。';
  } catch (error: any) {
    updaterAuthMessage.value = error?.message || 'GitHub Token 清除失败';
  } finally {
    updaterAuthSaving.value = false;
  }
}

async function commitUnloadAfterMinutes() {
  const numeric = Number(unloadAfterMinutesInput.value);
  await appConfigStore.updateConfig({
    plugins: {
      unloadAfterMinutes: numeric,
    },
  });
}

async function savePluginConfig(pluginId: string) {
  try {
    const parsed = JSON.parse(pluginConfigDrafts.value[pluginId] || '{}');
    if (!isRecord(parsed)) {
      throw new Error('插件配置必须是 JSON 对象');
    }

    await appConfigStore.updateConfig({
      plugins: {
        items: {
          [pluginId]: parsed,
        },
      },
    });
    syncPluginDraft(pluginId);
  } catch (error) {
    pluginConfigErrors.value[pluginId] = error instanceof Error ? error.message : '插件配置保存失败';
    notifyError(error, '插件配置保存失败');
  }
}

function resetPluginConfig(pluginId: string) {
  syncPluginDraft(pluginId);
}

watch(() => appConfigStore.config.appearance.baseFontSize, (value) => {
  baseFontSizeInput.value = String(value);
}, { immediate: true });

watch(() => appConfigStore.config.plugins.unloadAfterMinutes, (value) => {
  unloadAfterMinutesInput.value = String(value);
}, { immediate: true });

watch(() => appConfigStore.config.plugins.items, (items) => {
  for (const plugin of installedPlugins.value) {
    pluginConfigDrafts.value[plugin.manifest.id] = JSON.stringify(items[plugin.manifest.id] ?? {}, null, 2);
  }
}, { deep: true });

watch(() => appConfigStore.config.features.terminal.defaultCwd, (value) => {
  terminalDefaultCwdInput.value = value || '';
}, { immediate: true });

watch(() => appConfigStore.config.features.terminal.sshReconnectMaxAttempts, (value) => {
  sshReconnectMaxAttemptsInput.value = String(value || 3);
}, { immediate: true });

watch(() => appConfigStore.config.features.multiDeviceClipboard.deviceName, (value) => {
  multiDeviceClipboardDeviceNameInput.value = value || '';
}, { immediate: true });

watch(() => appConfigStore.config.features.multiDeviceClipboard.maxSyncBytes, (value) => {
  multiDeviceClipboardMaxSyncMbInput.value = String(Math.round((value || 0) / 1024 / 1024));
}, { immediate: true });

watch(() => appConfigStore.config.features.multiDeviceClipboard.historyLimit, (value) => {
  multiDeviceClipboardHistoryLimitInput.value = String(value || 200);
}, { immediate: true });

watch(
  [
    ftpPanelLayoutMode,
    ftpSidebarDockSide,
    ftpAuxiliaryDockSide,
    ftpAuxiliaryDockSize,
    ftpAuxiliaryDockCollapsed,
    ftpShowSidebarPanel,
    ftpShowLocalPanel,
    ftpShowRemotePanel,
  ],
  () => {
    if (!ftpShowLocalPanel.value && !ftpShowRemotePanel.value && !ftpDualRemoteMode.value) {
      ftpShowRemotePanel.value = true;
      return;
    }
    persistFtpLayoutSettings();
  },
  { immediate: false },
);

watch(
  [
    ftpExternalEditorPath,
    ftpCleanupExternalDraftsOnClose,
    ftpLinkNavigationEnabled,
    ftpDualRemoteMode,
    ftpSecondaryRemoteProfileId,
    ftpSecondaryTabGroupProfileIds,
  ],
  persistFtpPreferenceSettings,
  { immediate: false },
);

watch(
  [
    ftpThumbnailsEnabled,
    ftpThumbnailMaxBytesKb,
    ftpThumbnailPrefetchLimit,
  ],
  persistFtpThumbnailSettings,
  { immediate: false },
);

onMounted(() => {
  globalStore.setTopbarColor('');
  scheduleSettingsTabLoad(settingsStore.activeSettingsTab);
});

// ─── 网页安全配置 ───
const newWhiteDomain = ref('');
const newBlackDomain = ref('');
const newScriptName = ref('');
const newScriptDomain = ref('');
const newScriptType = ref<'js' | 'css' | 'html'>('js');
const newScriptContent = ref('');
const showAddScript = ref(false);

const scriptTypeOptions = [
  { label: 'JavaScript', value: 'js' },
  { label: 'CSS', value: 'css' },
  { label: 'HTML', value: 'html' },
];

const scriptRunAtOptions = [
  { label: '页面加载后 (document-end)', value: 'document-end' },
  { label: '尽早注入 (document-start)', value: 'document-start' },
  { label: '页面空闲时 (document-idle)', value: 'document-idle' },
];

const newScriptRunAt = ref<'document-start' | 'document-end' | 'document-idle'>('document-end');
const newScriptPermissions = ref<string[]>([]);

const webWhitelist = computed(() => appConfigStore.config.web?.security?.whitelist ?? []);
const webBlacklist = computed(() => appConfigStore.config.web?.security?.blacklist ?? []);
const webScripts = computed(() => appConfigStore.config.web?.scripts ?? []);
const webKeepAliveDomains = computed(() => appConfigStore.config.web?.keepAliveDomains ?? []);
const newKeepAliveDomain = ref('');

// ─── Chrome 扩展管理 ───
import type { ChromeExtensionRecord } from '@/contracts/webview';
const chromeExtensions = ref<ChromeExtensionRecord[]>([]);
const extensionInstalling = ref(false);

async function loadExtensions() {
  if (!window.webviewApi?.getExtensions) {
    chromeExtensions.value = [];
    return;
  }

  try {
    chromeExtensions.value = await window.webviewApi.getExtensions();
  } catch (err) {
    console.error('Failed to load extensions:', err);
    notifyError(err, '扩展列表加载失败');
  }
}

async function installExtension() {
  if (extensionInstalling.value) return;
  extensionInstalling.value = true;
  try {
    // 使用 Electron dialog 选择解压后的扩展目录
    const dirPath = await window.shellApi.selectDirectory('选择 Chrome 扩展目录');
    if (!dirPath) return;
    await window.webviewApi.installExtension(dirPath);
    await loadExtensions();
  } catch (err: any) {
    console.error('Install extension failed:', err);
    notifyError(err, '扩展安装失败');
  } finally {
    extensionInstalling.value = false;
  }
}

async function removeExtension(id: string) {
  try {
    await window.webviewApi.removeExtension(id);
    await loadExtensions();
  } catch (err) {
    console.error('Remove extension failed:', err);
    notifyError(err, '扩展移除失败');
  }
}

async function toggleExtension(id: string, enabled: boolean) {
  try {
    await window.webviewApi.toggleExtension(id, enabled);
    await loadExtensions();
  } catch (err) {
    console.error('Toggle extension failed:', err);
    notifyError(err, '扩展状态切换失败');
  }
}

async function addWhiteDomain() {
  const d = newWhiteDomain.value.trim();
  if (!d) return;
  const list = [...webWhitelist.value, d];
  await appConfigStore.updateConfig({ web: { security: { whitelist: list, blacklist: webBlacklist.value } } });
  newWhiteDomain.value = '';
}

async function removeWhiteDomain(domain: string) {
  const list = webWhitelist.value.filter(d => d !== domain);
  await appConfigStore.updateConfig({ web: { security: { whitelist: list, blacklist: webBlacklist.value } } });
}

async function addBlackDomain() {
  const d = newBlackDomain.value.trim();
  if (!d) return;
  const list = [...webBlacklist.value, d];
  await appConfigStore.updateConfig({ web: { security: { whitelist: webWhitelist.value, blacklist: list } } });
  newBlackDomain.value = '';
}

async function removeBlackDomain(domain: string) {
  const list = webBlacklist.value.filter(d => d !== domain);
  await appConfigStore.updateConfig({ web: { security: { whitelist: webWhitelist.value, blacklist: list } } });
}

async function addKeepAliveDomain() {
  const d = newKeepAliveDomain.value.trim();
  if (!d) return;
  const list = [...webKeepAliveDomains.value, d];
  await appConfigStore.updateConfig({ web: { keepAliveDomains: list } });
  newKeepAliveDomain.value = '';
}

async function removeKeepAliveDomain(domain: string) {
  const list = webKeepAliveDomains.value.filter(d => d !== domain);
  await appConfigStore.updateConfig({ web: { keepAliveDomains: list } });
}

async function toggleScript(scriptId: string) {
  const scripts = webScripts.value.map(s =>
    s.id === scriptId ? { ...s, enabled: !s.enabled } : { ...s },
  );
  await appConfigStore.updateConfig({ web: { scripts } });
}

async function removeScript(scriptId: string) {
  const scripts = webScripts.value.filter(s => s.id !== scriptId);
  await appConfigStore.updateConfig({ web: { scripts } });
}

async function addScript() {
  const name = newScriptName.value.trim();
  const domainPattern = newScriptDomain.value.trim();
  const content = newScriptContent.value.trim();
  if (!name || !domainPattern || !content) return;

  const newRule: WebScriptRule = {
    id: `script-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    domainPattern,
    type: newScriptType.value,
    content,
    enabled: true,
    builtin: false,
    runAt: newScriptRunAt.value,
    permissions: newScriptPermissions.value.length > 0 ? [...newScriptPermissions.value] as any : undefined,
  };

  const scripts = [...webScripts.value, newRule];
  await appConfigStore.updateConfig({ web: { scripts } });
  newScriptName.value = '';
  newScriptDomain.value = '';
  newScriptContent.value = '';
  newScriptRunAt.value = 'document-end';
  newScriptPermissions.value = [];
  showAddScript.value = false;
}

function scriptTypeLabel(type: string) {
  switch (type) {
    case 'js': return 'JS';
    case 'css': return 'CSS';
    case 'html': return 'HTML';
    default: return type;
  }
}
</script>

<template>
  <UiScrollbar class="settings-page" :x="false" :y="true" :size="8">
    <header class="page-header">
      <div class="page-title-row">
        <h1>设置</h1>
        <div class="settings-search" role="search">
          <span class="settings-search__icon" aria-hidden="true" />
          <input type="search" placeholder="搜索设置" aria-label="搜索设置" />
        </div>
      </div>
      <nav
        class="settings-nav"
        aria-label="设置分类"
      >
        <UiTabs
          :model-value="settingsStore.activeSettingsTab"
          :items="settingsTabs"
          variant="line"
          size="md"
          @update:modelValue="handleSettingsTabChange"
        />
      </nav>
    </header>

    <div class="page-body">
      <Transition :name="settingsTabTransition" mode="out-in">
      <section v-if="settingsStore.activeSettingsTab === 'general'" key="general" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>基础设置</h2>
          <p>配置应用外观、字体、系统依赖路径和更新策略。</p>
        </div>

        <div class="settings-form">
          <section class="settings-group">
            <h3>常规</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>应用语言</span>
                <small>当前支持中文和英文。</small>
              </div>
              <div class="settings-row__control">
                <UiSelect :model-value="appConfigStore.config.appearance.language" :options="languageOptions"
                  @update:modelValue="handleLanguageChange" />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>主题模式</span>
                <small>修改后立即同步到桌面应用外观。</small>
              </div>
              <div class="settings-row__control">
                <UiSelect :model-value="appConfigStore.config.appearance.theme" :options="themeOptions"
                  @update:modelValue="handleThemeChange" />
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>底栏默认标签</span>
                <small>控制应用底栏启动后默认显示的固定标签。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <UiTransferBox
                  :model-value="bottomBarVisibleTabIds"
                  :items="bottomBarTransferItems"
                  source-title="所有内部功能"
                  target-title="固定显示"
                  target-empty-text="至少保留首页和设置"
                  @update:modelValue="handleBottomBarVisibleTabsChange"
                />
                <div class="settings-inline-badges settings-inline-badges--mt">
                  <span class="settings-badge settings-badge--accent">{{ bottomBarVisibleSummary }}</span>
                  <span class="settings-badge">右侧上下顺序同步为底栏显示顺序</span>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>编辑器</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>界面字体</span>
                <small>优先显示本地可枚举字体。</small>
              </div>
              <div class="settings-row__control">
                <UiSelect :model-value="appConfigStore.config.appearance.fontFamily" :options="appConfigStore.fontOptions"
                  @update:modelValue="handleFontChange" />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>基础字号</span>
                <small>全局 rem 基线，推荐 12-24。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput v-model="baseFontSizeInput" type="number" :min="12" :max="24"
                  @blur="commitBaseFontSize" @change="commitBaseFontSize"
                  @keydown.enter.prevent="commitBaseFontSize" />
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>系统路径</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>FFmpeg 路径</span>
                <small>视频/图片压缩处理依赖 FFmpeg。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="ffmpeg-path-row">
                  <div class="ffmpeg-path-display" :class="{ 'ffmpeg-path-display--empty': !ffmpegPathInput }">
                    {{ ffmpegPathInput || '未配置' }}
                  </div>
                  <UiButton variant="secondary" size="sm" @click="selectFfmpegPath">选择</UiButton>
                  <UiButton v-if="ffmpegPathInput" variant="danger" size="sm" @click="clearFfmpegPath">清除</UiButton>
                </div>
                <div v-if="ffmpegStatus === 'checking'" class="ffmpeg-status ffmpeg-status--checking">
                  正在验证 FFmpeg...
                </div>
                <div v-else-if="ffmpegStatus === 'valid'" class="ffmpeg-status ffmpeg-status--valid">
                  FFmpeg 可用 (版本: {{ ffmpegVersion }})
                </div>
                <div v-else-if="ffmpegStatus === 'invalid'" class="ffmpeg-status ffmpeg-status--invalid">
                  FFmpeg 无效: {{ ffmpegError }}
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>更新</h3>
            <div class="settings-row settings-row--wide update-version-row">
              <div class="settings-row__label">
                <span>版本状态</span>
                <small>正式发布包使用 GitHub Release 检查和下载新版本。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide update-version-panel">
                <div class="update-summary-grid">
                  <div class="meta-item ui-soft-surface">
                    <span>当前版本</span>
                    <strong>v{{ updaterStore.info.currentVersion }}</strong>
                  </div>
                  <div class="meta-item ui-soft-surface">
                    <span>最新版本</span>
                    <strong>{{ updaterStore.info.latestVersion ? `v${updaterStore.info.latestVersion}` : '未知' }}</strong>
                  </div>
                  <div class="meta-item ui-soft-surface">
                    <span>发布时间</span>
                    <strong>{{ updateReleaseDateText }}</strong>
                  </div>
                </div>
                <div class="update-status" :class="`update-status--${updaterStore.status}`">
                  <strong>{{ updateStatusLabel }}</strong>
                  <span v-if="updaterStore.info.error">{{ updaterStore.info.error }}</span>
                </div>
              </div>
            </div>

            <div v-if="updaterStore.status === 'downloading' && updaterStore.progress" class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>下载进度</span>
                <small>当前更新包下载状态。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="update-progress">
                  <div class="update-progress__head">
                    <span>下载进度</span>
                    <strong>{{ updateProgressPercent }}%</strong>
                  </div>
                  <div class="update-progress__bar">
                    <div class="update-progress__bar-fill" :style="{ width: `${updateProgressPercent}%` }" />
                  </div>
                  <div class="update-progress__meta">
                    <span>{{ (updaterStore.progress.transferred / 1024 / 1024).toFixed(1) }} MB / {{ (updaterStore.progress.total / 1024 / 1024).toFixed(1) }} MB</span>
                    <span>{{ (updaterStore.progress.bytesPerSecond / 1024 / 1024).toFixed(2) }} MB/s</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>更新说明</span>
                <small>展示最新发布附带的摘要。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <UiScrollbar class="update-release-notes" :x="false" :y="true" :size="6">
                  {{ updaterStore.releaseNotesSummary }}
                </UiScrollbar>
              </div>
            </div>

            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>私有仓库 Token</span>
                <small>用于读取私有 GitHub Release，不会回显已保存的 Token。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="update-auth">
                  <div class="update-auth__status">
                    <span>认证状态</span>
                    <strong>{{ updaterAuthSourceText }}</strong>
                  </div>
                  <div class="update-auth__controls">
                    <UiInput
                      v-model="githubTokenInput"
                      type="password"
                      placeholder="GitHub fine-grained token 或 classic PAT"
                      size="sm"
                      :disabled="updaterAuthSaving || updaterStore.auth.source === 'environment'"
                      @keydown.enter.prevent="saveGithubToken"
                    />
                    <UiButton
                      variant="primary"
                      size="sm"
                      :disabled="!canSaveGithubToken || updaterStore.auth.source === 'environment'"
                      @click="saveGithubToken"
                    >
                      保存
                    </UiButton>
                    <UiButton
                      variant="danger"
                      size="sm"
                      :disabled="updaterAuthSaving || !updaterStore.auth.hasToken || updaterStore.auth.source === 'environment'"
                      @click="clearGithubToken"
                    >
                      清除
                    </UiButton>
                  </div>
                  <p v-if="updaterStore.auth.source === 'environment'" class="update-auth__hint">
                    当前使用环境变量中的 Token，不能从设置页清除。
                  </p>
                  <p v-else-if="updaterAuthMessage" class="update-auth__hint">{{ updaterAuthMessage }}</p>
                </div>
              </div>
            </div>

            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>更新操作</span>
                <small>检查、下载或打开发布页。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="update-actions">
                  <UiButton variant="secondary" size="sm" :disabled="!canCheckUpdate" @click="updaterStore.checkForUpdates">
                    检查更新
                  </UiButton>
                  <UiButton variant="primary" size="sm" :disabled="!canDownloadUpdate" @click="updaterStore.downloadUpdate">
                    下载更新
                  </UiButton>
                  <UiButton variant="primary" size="sm" :disabled="!canInstallUpdate" @click="updaterStore.installUpdate">
                    重启安装
                  </UiButton>
                  <UiButton variant="secondary" size="sm" @click="updaterStore.openReleasePage">
                    打开 Release 页
                  </UiButton>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="settingsStore.activeSettingsTab === 'file-transfer'" key="file-transfer" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>文件传输</h2>
          <p>配置传输页布局、浏览行为、缩略图、重试策略和主机信任。</p>
        </div>

        <div class="settings-form">
          <section class="settings-group">
            <h3>浏览行为</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>联动导航</span>
                <small>切换目录时同步本地与远程浏览节奏。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <label class="settings-switch">
                  <input v-model="ftpLinkNavigationEnabled" type="checkbox" />
                  <span aria-hidden="true" />
                </label>
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>联动状态</span>
                <small>传输页重新激活后会读取该偏好。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-inline-badges">
                  <span class="settings-badge" :class="{ 'settings-badge--accent': ftpLinkNavigationEnabled }">{{ ftpLinkNavigationSummary }}</span>
                </div>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row__label">
                <span>并行标签组</span>
                <small>允许主工作区外再显示第二个远程标签组。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <label class="settings-switch">
                  <input v-model="ftpDualRemoteMode" type="checkbox" />
                  <span aria-hidden="true" />
                </label>
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>第二标签组焦点</span>
                <small>可指定当前已连接会话，留空时自动选择。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <UiSelect
                  :model-value="ftpSecondaryRemoteProfileId"
                  :options="ftpSecondaryRemoteSessionOptions"
                  @update:modelValue="ftpSecondaryRemoteProfileId = String($event)"
                />
                <div class="settings-inline-badges settings-inline-badges--mt">
                  <span class="settings-badge" :class="{ 'settings-badge--accent': ftpDualRemoteMode }">{{ ftpDualRemoteSummary }}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>布局与面板</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>工作区拆分</span>
                <small>选择水平双栏或纵向堆叠。</small>
              </div>
              <div class="settings-row__control">
                <div class="segmented-actions">
                  <UiButton size="sm" variant="secondary" :active="ftpPanelLayoutMode === 'columns'" @click="setFtpPanelLayoutMode('columns')">水平双栏</UiButton>
                  <UiButton size="sm" variant="secondary" :active="ftpPanelLayoutMode === 'stacked'" @click="setFtpPanelLayoutMode('stacked')">纵向堆叠</UiButton>
                </div>
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>布局状态</span>
                <small>用于传输页主内容区。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-inline-badges">
                  <span class="settings-badge settings-badge--accent">{{ ftpPanelLayoutSummary }}</span>
                  <span class="settings-badge">{{ ftpBrowserPanelSummary }}</span>
                </div>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row__label">
                <span>会话侧栏停靠</span>
                <small>控制服务器列表在传输页的停靠位置。</small>
              </div>
              <div class="settings-row__control">
                <div class="segmented-actions">
                  <UiButton size="sm" variant="secondary" :active="ftpSidebarDockSide === 'left'" @click="setFtpSidebarDockSide('left')">左侧</UiButton>
                  <UiButton size="sm" variant="secondary" :active="ftpSidebarDockSide === 'right'" @click="setFtpSidebarDockSide('right')">右侧</UiButton>
                </div>
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>侧栏状态</span>
                <small>隐藏侧栏后仍保留当前工作区。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-inline-badges">
                  <span class="settings-badge">{{ ftpSidebarDockSummary }}</span>
                  <label class="settings-check">
                    <input v-model="ftpShowSidebarPanel" type="checkbox" />
                    <span>显示会话侧栏</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>文件面板</span>
                <small>至少保留一个浏览面板。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-inline-badges">
                  <UiButton size="sm" variant="secondary" :active="ftpShowLocalPanel" @click="toggleFtpLocalPanel">{{ ftpShowLocalPanel ? '隐藏本地' : '显示本地' }}</UiButton>
                  <UiButton size="sm" variant="secondary" :active="ftpShowRemotePanel" @click="toggleFtpRemotePanel">{{ ftpShowRemotePanel ? '隐藏远程' : '显示远程' }}</UiButton>
                </div>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row__label">
                <span>辅助停靠区</span>
                <small>传输队列和日志面板的位置。</small>
              </div>
              <div class="settings-row__control">
                <div class="segmented-actions">
                  <UiButton size="sm" variant="secondary" :active="ftpAuxiliaryDockSide === 'bottom'" @click="setFtpAuxiliaryDockSide('bottom')">底部</UiButton>
                  <UiButton size="sm" variant="secondary" :active="ftpAuxiliaryDockSide === 'right'" @click="setFtpAuxiliaryDockSide('right')">右侧</UiButton>
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>辅助区尺寸</span>
                <small>输入 180 到 420 像素。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  :model-value="ftpAuxiliaryDockSize"
                  type="number"
                  :min="180"
                  :max="420"
                  @update:modelValue="setFtpAuxiliaryDockSize(String($event))"
                />
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>辅助区状态</span>
                <small>影响传输页底部或右侧工作区。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-inline-badges">
                  <span class="settings-badge">{{ ftpAuxiliaryDockSummary }}</span>
                  <label class="settings-check">
                    <input v-model="ftpAuxiliaryDockCollapsed" type="checkbox" />
                    <span>默认折叠辅助区</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>预览与传输</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>图片缩略图</span>
                <small>控制文件列表中的图片预览加载。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <label class="settings-switch">
                  <input v-model="ftpThumbnailsEnabled" type="checkbox" />
                  <span aria-hidden="true" />
                </label>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>单张最大 KB</span>
                <small>避免大图片拖慢浏览。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  :model-value="ftpThumbnailMaxBytesKb"
                  type="number"
                  :min="1"
                  @update:modelValue="setFtpThumbnailMaxBytesKb(String($event))"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>每侧预加载数量</span>
                <small>限制本地和远程预取数量。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  :model-value="ftpThumbnailPrefetchLimit"
                  type="number"
                  :min="1"
                  @update:modelValue="setFtpThumbnailPrefetchLimit(String($event))"
                />
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>缩略图状态</span>
                <small>传输页文件列表会读取该偏好。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-inline-badges">
                  <span class="settings-badge" :class="{ 'settings-badge--accent': ftpThumbnailsEnabled }">{{ ftpThumbnailSummary }}</span>
                </div>
              </div>
            </div>

            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>Windows 右键菜单</span>
                <small>从资源管理器右键菜单发送文件或目录到传输页。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-inline-badges">
                  <span class="settings-badge" :class="{ 'settings-badge--accent': ftpWindowsContextMenuStatus.installed }">
                    {{ ftpWindowsContextMenuSummary }}
                  </span>
                  <UiButton
                    size="sm"
                    variant="secondary"
                    :disabled="ftpWindowsContextMenuLoading"
                    @click="ftpWindowsContextMenuStatus.installed ? uninstallFtpWindowsContextMenu() : installFtpWindowsContextMenu()"
                  >
                    {{ ftpWindowsContextMenuStatus.installed ? '移除右键菜单' : '安装右键菜单' }}
                  </UiButton>
                  <UiButton size="sm" variant="ghost" :disabled="ftpWindowsContextMenuLoading" @click="refreshFtpWindowsContextMenuStatus">
                    刷新状态
                  </UiButton>
                </div>
                <div class="settings-inline-badges settings-inline-badges--mt">
                  <span class="settings-badge settings-badge--code">{{ ftpWindowsContextMenuCommandSummary }}</span>
                  <span v-if="ftpWindowsContextMenuError" class="settings-badge settings-badge--danger">
                    {{ ftpWindowsContextMenuError }}
                  </span>
                </div>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row__label">
                <span>最大重试次数</span>
                <small>传输失败后的自动重试上限。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  :model-value="ftpRetryMaxRetries"
                  type="number"
                  :min="0"
                  :max="10"
                  @update:modelValue="setFtpRetryMaxRetries(String($event))"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>基础等待秒数</span>
                <small>指数退避的初始等待时间。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  :model-value="ftpRetryBaseDelaySecs"
                  type="number"
                  :min="1"
                  :max="300"
                  @update:modelValue="setFtpRetryBaseDelaySecs(String($event))"
                />
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>重试策略</span>
                <small>策略保存后立即作用于后续失败任务。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-inline-badges">
                  <span class="settings-badge settings-badge--accent">{{ ftpRetryPolicySummary }}</span>
                  <UiButton size="sm" variant="secondary" @click="applyFtpRetryPolicy">应用策略</UiButton>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>编辑器与安全</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>外部编辑器</span>
                <small>留空时使用系统默认关联程序。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-path-row">
                  <div class="settings-path-display" :class="{ 'settings-path-display--empty': !ftpExternalEditorPath }">
                    {{ ftpExternalEditorPath || '未配置' }}
                  </div>
                  <UiButton size="sm" variant="secondary" @click="pickFtpExternalEditor">选择</UiButton>
                  <UiButton size="sm" variant="ghost" :disabled="!ftpExternalEditorPath" @click="ftpExternalEditorPath = ''">清空</UiButton>
                </div>
                <div class="settings-inline-badges settings-inline-badges--mt">
                  <span class="settings-badge settings-badge--accent">{{ ftpExternalEditorSummary }}</span>
                  <label class="settings-check">
                    <input v-model="ftpCleanupExternalDraftsOnClose" type="checkbox" />
                    <span>关闭后清理临时文件</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>已信任主机指纹</span>
                <small>删除后下次连接会重新确认主机密钥。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="settings-inline-badges">
                  <span class="settings-badge" :class="{ 'settings-badge--accent': sshStore.knownHosts.length > 0 }">{{ ftpKnownHostSummary }}</span>
                  <UiButton size="sm" variant="secondary" :disabled="ftpKnownHostsLoading" @click="refreshFtpKnownHosts">
                    {{ ftpKnownHostsLoading ? '刷新中' : '刷新列表' }}
                  </UiButton>
                </div>
                <div v-if="sshStore.knownHosts.length" class="settings-known-hosts">
                  <div v-for="host in sshStore.knownHosts" :key="host.id" class="settings-known-host">
                    <div class="settings-known-host__main">
                      <div class="settings-known-host__title">{{ host.host }}:{{ host.port }}</div>
                      <div class="settings-known-host__meta">
                        算法 {{ host.algorithm }} · {{ host.trustMode === 'session' ? '仅本次会话信任' : '永久信任' }}
                      </div>
                      <div class="settings-known-host__fingerprint">{{ host.fingerprint }}</div>
                    </div>
                    <UiButton size="sm" variant="danger" @click="deleteFtpKnownHost(host.id)">删除</UiButton>
                  </div>
                </div>
                <div v-else class="settings-muted-empty">当前还没有已信任的主机指纹。</div>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="settingsStore.activeSettingsTab === 'terminal'" key="terminal" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>终端</h2>
          <p>配置终端默认会话、渲染器、工作目录与图像显示行为。</p>
        </div>

        <div class="settings-form">
          <section class="settings-group">
            <h3>会话</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>默认终端</span>
                <small>终端页面创建新会话时优先使用。</small>
              </div>
              <div class="settings-row__control">
                <UiSelect
                  :model-value="appConfigStore.config.features.terminal.defaultProfileId || terminalProfileOptions[0]?.value || ''"
                  :options="terminalProfileOptions"
                  placeholder="选择默认终端"
                  @update:modelValue="handleTerminalProfileChange(String($event))"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>渲染模式</span>
                <small>终端前端使用的渲染器。</small>
              </div>
              <div class="settings-row__control">
                <UiSelect
                  :model-value="appConfigStore.config.features.terminal.rendererMode"
                  :options="terminalRendererOptions"
                  @update:modelValue="handleTerminalRendererChange"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>默认工作目录</span>
                <small>为空时使用应用当前工作目录。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <UiInput
                  v-model="terminalDefaultCwdInput"
                  placeholder="例如：D:\\Projects"
                  @blur="commitTerminalDefaultCwd"
                  @keydown.enter.prevent="commitTerminalDefaultCwd"
                />
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>本地终端类型</span>
                <small>为不同本地终端保存独立命令、参数、工作目录、环境变量、启动配置文件和背景配置。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="terminal-profile-editor">
                  <div class="terminal-profile-editor__grid">
                    <UiSelect
                      :model-value="localTerminalBaseProfileId"
                      :options="terminalProfiles.map((profile) => ({ label: profile.label, value: profile.id }))"
                      placeholder="从系统终端复制"
                      @update:modelValue="fillLocalTerminalProfileFromBase(String($event))"
                    />
                    <UiInput v-model="localTerminalProfileForm.label" placeholder="类型名称，例如：项目 PowerShell" />
                    <UiInput v-model="localTerminalProfileForm.command" placeholder="命令，例如：pwsh.exe" />
                    <UiInput v-model="localTerminalProfileForm.argsText" placeholder="启动参数，例如：-NoLogo" />
                    <UiInput v-model="localTerminalProfileForm.cwd" placeholder="工作目录，可留空" />
                    <UiInput v-model="localTerminalProfileForm.configFilePath" placeholder="启动配置文件路径，例如：D:\\profiles\\project.ps1" />
                  </div>
                  <textarea
                    v-model="localTerminalProfileForm.envText"
                    class="terminal-profile-editor__env"
                    rows="4"
                    placeholder='环境变量 JSON，例如：{"NODE_ENV":"development"}'
                  />
                  <p v-if="localTerminalProfileError" class="settings-error">{{ localTerminalProfileError }}</p>
                  <div class="terminal-profile-editor__actions">
                    <UiButton size="sm" variant="primary" @click="saveLocalTerminalProfile">
                      {{ localTerminalEditingId ? '保存类型' : '添加类型' }}
                    </UiButton>
                    <UiButton size="sm" variant="ghost" @click="resetLocalTerminalProfileForm">重置</UiButton>
                  </div>
                </div>
                <div v-if="customTerminalProfiles.length" class="terminal-profile-list">
                  <div
                    v-for="profile in customTerminalProfiles"
                    :key="profile.id"
                    class="terminal-profile-list__item"
                  >
                    <div class="terminal-profile-list__main">
                      <strong>{{ profile.label }}</strong>
                      <span>{{ profile.command }} {{ profile.args.join(' ') }}</span>
                      <small v-if="profile.configFilePath">启动配置文件：{{ profile.configFilePath }}</small>
                      <small>背景：{{ profile.background.type === 'image' ? '图片' : profile.background.type === 'video' ? '视频' : '颜色' }}</small>
                    </div>
                    <div class="terminal-profile-list__actions">
                      <UiButton size="sm" variant="ghost" @click="handleTerminalProfileChange(profile.id)">设为默认</UiButton>
                      <UiButton size="sm" variant="ghost" @click="editLocalTerminalProfile(profile)">编辑</UiButton>
                      <UiButton size="sm" variant="danger" @click="deleteLocalTerminalProfile(profile)">删除</UiButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>行为偏好</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>终端提示音</span>
                <small>允许 BEL 提示音；关闭后保留终端输出但不播放滴声。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <label class="settings-switch">
                  <input
                    type="checkbox"
                    :checked="appConfigStore.config.features.terminal.enableBell"
                    @change="handleTerminalBellChange"
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>图像扩展</span>
                <small>启用 sixel/图像扩展。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <label class="settings-switch">
                  <input
                    type="checkbox"
                    :checked="appConfigStore.config.features.terminal.enableSixel"
                    @change="handleTerminalSixelChange"
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>默认独立窗口</span>
                <small>优先在新窗口中拆分会话。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <label class="settings-switch">
                  <input
                    type="checkbox"
                    :checked="appConfigStore.config.features.terminal.detachToWindowByDefault"
                    @change="handleTerminalDetachChange"
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>SSH 自动重连次数</span>
                <small>超过次数后暂停，并在终端等待任意键手动重连。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  v-model="sshReconnectMaxAttemptsInput"
                  type="number"
                  :min="1"
                  :max="20"
                  @blur="commitSshReconnectMaxAttempts"
                  @change="commitSshReconnectMaxAttempts"
                  @keydown.enter.prevent="commitSshReconnectMaxAttempts"
                />
              </div>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="settingsStore.activeSettingsTab === 'multi-device-clipboard'" key="multi-device-clipboard" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>多设备剪贴板</h2>
          <p>配置局域网发现、同步大小和历史记录。</p>
        </div>

        <div class="settings-form">
          <section class="settings-group">
            <h3>同步</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>启用多设备剪贴板</span>
                <small>启用后会通过 mDNS 在局域网发布和发现设备。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <label class="settings-switch">
                  <input
                    type="checkbox"
                    :checked="appConfigStore.config.features.multiDeviceClipboard.enabled"
                    @change="handleMultiDeviceClipboardEnabledChange"
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>设备名称</span>
                <small>为空时使用当前系统主机名。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <UiInput
                  v-model="multiDeviceClipboardDeviceNameInput"
                  placeholder="例如：工作笔记本"
                  @blur="commitMultiDeviceClipboardDeviceName"
                  @keydown.enter.prevent="commitMultiDeviceClipboardDeviceName"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>唤出快捷键</span>
                <small>系统级快捷键；如果 Alt+V 已被系统占用，可以改成其他组合。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.system.toggleMultiDeviceClipboard"
                  :default-value="defaultShortcuts.system.toggleMultiDeviceClipboard"
                  @update:modelValue="updateSystemShortcut('toggleMultiDeviceClipboard', $event)"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>最大同步大小</span>
                <small>单位 MB，最大 1024 MB；超限内容只保留本机历史。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  v-model="multiDeviceClipboardMaxSyncMbInput"
                  type="number"
                  :min="1"
                  :max="1024"
                  @blur="commitMultiDeviceClipboardMaxSyncMb"
                  @change="commitMultiDeviceClipboardMaxSyncMb"
                  @keydown.enter.prevent="commitMultiDeviceClipboardMaxSyncMb"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>历史记录数量</span>
                <small>最多保留 5000 条，多余记录会自动裁剪。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  v-model="multiDeviceClipboardHistoryLimitInput"
                  type="number"
                  :min="1"
                  :max="5000"
                  @blur="commitMultiDeviceClipboardHistoryLimit"
                  @change="commitMultiDeviceClipboardHistoryLimit"
                  @keydown.enter.prevent="commitMultiDeviceClipboardHistoryLimit"
                />
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>已配对设备</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>可信设备列表</span>
                <small>移除后会停止向该设备发送剪贴板，也会拒收它的同步内容。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="clipboard-device-panel">
                  <div class="clipboard-device-panel__actions">
                    <UiButton
                      size="sm"
                      variant="secondary"
                      :disabled="multiDeviceClipboardDevicesLoading"
                      @click="loadMultiDeviceClipboardDevices"
                    >
                      刷新设备
                    </UiButton>
                  </div>

                  <div v-if="pairedMultiDeviceClipboardDevices.length" class="clipboard-device-list">
                    <article
                      v-for="device in pairedMultiDeviceClipboardDevices"
                      :key="device.deviceId"
                      class="clipboard-device-item"
                    >
                      <div class="clipboard-device-item__body">
                        <strong>{{ device.name }}</strong>
                        <small>{{ multiDeviceClipboardDeviceMeta(device) }}</small>
                      </div>
                      <UiButton
                        size="sm"
                        variant="danger"
                        @click="forgetMultiDeviceClipboardDevice(device)"
                      >
                        移除
                      </UiButton>
                    </article>
                  </div>
                  <p v-else class="clipboard-device-empty">
                    {{ multiDeviceClipboardDevicesLoading ? '正在读取已配对设备...' : '暂无已配对设备' }}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>局域网网卡优先级</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>自动发现广播地址</span>
                <small>
                  拖动排序，排在最上方的可用 IPv4 会优先用于 mDNS 广播；当前首选：
                  {{ activeNetworkInterface ? `${activeNetworkInterface.name} · ${activeNetworkInterface.address}` : '未检测到可用网卡' }}
                </small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="network-priority-panel">
                  <div class="network-priority-panel__actions">
                    <UiButton size="sm" variant="secondary" :disabled="networkInterfacesLoading" @click="loadNetworkInterfaces">
                      刷新网卡
                    </UiButton>
                    <UiButton size="sm" variant="ghost" @click="resetNetworkInterfacePriority">
                      恢复自动
                    </UiButton>
                  </div>

                  <div v-if="orderedNetworkInterfaces.length" class="network-priority-list">
                    <article
                      v-for="(networkInterface, index) in orderedNetworkInterfaces"
                      :key="networkInterface.key"
                      class="network-priority-item"
                      :class="{ 'network-priority-item--active': index === 0 }"
                      draggable="true"
                      @dragstart="handleNetworkInterfaceDragStart(networkInterface.key, $event)"
                      @dragend="draggedNetworkInterfaceKey = ''"
                      @dragover.prevent
                      @drop="handleNetworkInterfaceDrop(networkInterface.key, $event)"
                    >
                      <span class="network-priority-item__handle" aria-hidden="true">⋮⋮</span>
                      <div class="network-priority-item__body">
                        <strong>{{ networkInterface.name }}</strong>
                        <small>{{ networkInterface.address }} · {{ networkInterface.cidr || 'IPv4' }}</small>
                      </div>
                      <div class="network-priority-item__actions">
                        <UiButton size="sm" variant="ghost" :disabled="index === 0" @click="moveNetworkInterface(index, index - 1)">上移</UiButton>
                        <UiButton size="sm" variant="ghost" :disabled="index === orderedNetworkInterfaces.length - 1" @click="moveNetworkInterface(index, index + 1)">下移</UiButton>
                      </div>
                    </article>
                  </div>
                  <p v-else class="network-priority-empty">
                    {{ networkInterfacesLoading ? '正在读取本机网卡...' : '未检测到 IPv4 网卡' }}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="settingsStore.activeSettingsTab === 'shortcuts'" key="shortcuts" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>快捷键</h2>
          <p>配置终端内快捷键和系统级显示隐藏快捷键。</p>
        </div>

        <div class="settings-form">
          <section class="settings-group">
            <h3>终端</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>终端复制</span>
                <small>终端聚焦时生效，默认 Ctrl+Shift+C。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.internal.terminalCopy"
                  :default-value="defaultShortcuts.internal.terminalCopy"
                  @update:modelValue="updateInternalShortcut('terminalCopy', $event)"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>终端粘贴</span>
                <small>终端聚焦时生效，默认 Ctrl+Shift+V。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.internal.terminalPaste"
                  :default-value="defaultShortcuts.internal.terminalPaste"
                  @update:modelValue="updateInternalShortcut('terminalPaste', $event)"
                />
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>系统</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>显示/隐藏应用</span>
                <small>系统级快捷键，保存到 SQLite 后立即重新注册。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.system.toggleAppVisibility"
                  :default-value="defaultShortcuts.system.toggleAppVisibility"
                  @update:modelValue="updateSystemShortcut('toggleAppVisibility', $event)"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>多设备剪贴板</span>
                <small>系统级快捷键，默认 Alt+V 唤出右下角窗口。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.system.toggleMultiDeviceClipboard"
                  :default-value="defaultShortcuts.system.toggleMultiDeviceClipboard"
                  @update:modelValue="updateSystemShortcut('toggleMultiDeviceClipboard', $event)"
                />
              </div>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="settingsStore.activeSettingsTab === 'ai-agent'" key="ai-agent" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>AI Agent</h2>
          <p>AI 推理策略与上下文配置。</p>
        </div>

        <div class="cards-grid cards-grid--3col">
          <div class="settings-card settings-card--placeholder ui-glass-surface ui-glass-surface--strong">
            <div class="settings-card__head">
              <span class="settings-card__icon">🧠</span>
              <h3>模型与推理</h3>
            </div>
            <p class="settings-card__desc">预留到 features.aiAgent 容器</p>
          </div>
          <div class="settings-card settings-card--placeholder ui-glass-surface ui-glass-surface--strong">
            <div class="settings-card__head">
              <span class="settings-card__icon">🔐</span>
              <h3>工具权限</h3>
            </div>
            <p class="settings-card__desc">后续接入 AI Agent 能力策略</p>
          </div>
          <div class="settings-card settings-card--placeholder ui-glass-surface ui-glass-surface--strong">
            <div class="settings-card__head">
              <span class="settings-card__icon">💬</span>
              <h3>会话记忆</h3>
            </div>
            <p class="settings-card__desc">后续接入独立持久化配置</p>
          </div>
        </div>
      </section>

      <section v-else-if="settingsStore.activeSettingsTab === 'plugins'" key="plugins" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>插件配置</h2>
          <p>插件策略和每个插件的独立 JSON 配置。</p>
        </div>

        <div class="cards-grid cards-grid--1col">
          <!-- 插件通用策略 -->
          <div class="settings-card ui-glass-surface ui-glass-surface--strong">
            <div class="settings-card__head">
              <span class="settings-card__icon">⚙️</span>
              <h3>通用策略</h3>
              <div v-if="hostSummary" class="plugin-dir-badge">
                <span>📂 {{ hostSummary.pluginDirectory }}</span>
              </div>
            </div>
            <div class="settings-card__fields settings-card__fields--inline">
              <UiField label="闲置自动卸载" hint="单位为分钟，0 表示关闭。">
                <UiInput v-model="unloadAfterMinutesInput" type="number" :min="0"
                  @blur="commitUnloadAfterMinutes" @change="commitUnloadAfterMinutes"
                  @keydown.enter.prevent="commitUnloadAfterMinutes" />
              </UiField>
            </div>
          </div>

          <div v-if="pluginLoadError" class="error-banner ui-status-banner ui-status-banner--danger">
            {{ pluginLoadError }}
          </div>

          <div v-else-if="!installedPlugins.length" class="settings-card settings-card--placeholder ui-glass-surface ui-glass-surface--strong">
            <div class="settings-card__head">
              <span class="settings-card__icon">📦</span>
              <h3>暂无插件</h3>
            </div>
            <p class="settings-card__desc">当前没有已安装插件。</p>
          </div>

          <template v-else>
            <UiTabs v-model="settingsStore.activePluginConfigId" :items="pluginTabs" variant="line" size="md" />

            <div v-if="activePlugin" class="settings-card ui-glass-surface ui-glass-surface--strong">
              <div class="settings-card__head">
                <span class="settings-card__icon">🔌</span>
                <h3>{{ activePlugin.manifest.displayName }}</h3>
                <div class="plugin-dir-badge">
                  <span>{{ activePlugin.status }} · {{ activePlugin.manifest.runtime }}</span>
                </div>
              </div>
              <p class="settings-card__desc">{{ activePlugin.manifest.description || '该插件尚未提供描述。' }}</p>

              <div class="plugin-meta-grid">
                <div class="meta-item ui-soft-surface">
                  <span>版本</span>
                  <strong>{{ activePlugin.manifest.version }}</strong>
                </div>
                <div class="meta-item ui-soft-surface">
                  <span>信任级别</span>
                  <strong>{{ activePlugin.manifest.trustLevel }}</strong>
                </div>
                <div class="meta-item ui-soft-surface">
                  <span>权限</span>
                  <strong>{{ activePlugin.manifest.permissions.join(', ') || '无' }}</strong>
                </div>
              </div>

              <UiField label="插件 JSON 配置" :error="pluginConfigErrors[activePlugin.manifest.id]"
                hint="宿主直接维护每个插件的 JSON 对象。">
                <textarea v-model="pluginConfigDrafts[activePlugin.manifest.id]" class="plugin-json-editor"
                  spellcheck="false" />
              </UiField>

              <div class="plugin-actions">
                <UiButton variant="primary" size="sm" @click="savePluginConfig(activePlugin.manifest.id)">
                  保存配置
                </UiButton>
                <UiButton variant="secondary" size="sm" @click="resetPluginConfig(activePlugin.manifest.id)">
                  重置
                </UiButton>
              </div>
            </div>
          </template>
        </div>
      </section>

      <section v-else-if="settingsStore.activeSettingsTab === 'web-security'" key="web-security" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>外部网页配置</h2>
          <p>管理域名策略、保活规则、Chrome 扩展和增强脚本。</p>
        </div>

        <div class="settings-form">
          <section class="settings-group">
            <h3>域名策略</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>信任域名</span>
                <small>直接加载，不显示风险提示。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="web-domain-section">
                  <div class="web-domain-list">
                    <div v-for="domain in webWhitelist" :key="domain" class="web-domain-item">
                      <span>{{ domain }}</span>
                      <UiButton variant="danger" size="sm" @click="removeWhiteDomain(domain)">移除</UiButton>
                    </div>
                    <div v-if="webWhitelist.length === 0" class="web-domain-empty">暂无信任域名</div>
                  </div>
                  <div class="web-domain-add">
                    <UiInput v-model="newWhiteDomain" placeholder="*.google.com" size="sm"
                      @keydown.enter.prevent="addWhiteDomain" />
                    <UiButton variant="primary" size="sm" :disabled="!newWhiteDomain.trim()" @click="addWhiteDomain">添加</UiButton>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>禁止域名</span>
                <small>禁止访问的域名。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="web-domain-section">
                  <div class="web-domain-list">
                    <div v-for="domain in webBlacklist" :key="domain" class="web-domain-item">
                      <span>{{ domain }}</span>
                      <UiButton variant="danger" size="sm" @click="removeBlackDomain(domain)">移除</UiButton>
                    </div>
                    <div v-if="webBlacklist.length === 0" class="web-domain-empty">暂无禁止域名</div>
                  </div>
                  <div class="web-domain-add">
                    <UiInput v-model="newBlackDomain" placeholder="evil.com" size="sm"
                      @keydown.enter.prevent="addBlackDomain" />
                    <UiButton variant="primary" size="sm" :disabled="!newBlackDomain.trim()" @click="addBlackDomain">添加</UiButton>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>保活规则</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>保活域名</span>
                <small>匹配的网页切换页面时保留状态不销毁，再次打开时恢复。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="web-domain-section">
                  <div class="web-domain-list">
                    <div v-for="domain in webKeepAliveDomains" :key="domain" class="web-domain-item">
                      <span>{{ domain }}</span>
                      <UiButton variant="danger" size="sm" @click="removeKeepAliveDomain(domain)">移除</UiButton>
                    </div>
                    <div v-if="webKeepAliveDomains.length === 0" class="web-domain-empty">暂无保活域名</div>
                  </div>
                  <div class="web-domain-add">
                    <UiInput v-model="newKeepAliveDomain" placeholder="*.google.com" size="sm"
                      @keydown.enter.prevent="addKeepAliveDomain" />
                    <UiButton variant="primary" size="sm" :disabled="!newKeepAliveDomain.trim()" @click="addKeepAliveDomain">添加</UiButton>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>Chrome 扩展</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>扩展管理</span>
                <small>安装解压后的 Chrome 扩展，扩展会应用到所有网页。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="web-extensions-list">
                  <div v-for="ext in chromeExtensions" :key="ext.id" class="web-extension-item">
                    <div class="web-extension-item__info">
                      <div class="web-extension-item__name">{{ ext.name }}</div>
                      <div class="web-extension-item__meta">v{{ ext.version }}</div>
                      <div v-if="ext.description" class="web-extension-item__desc">{{ ext.description }}</div>
                    </div>
                    <div class="web-extension-item__actions">
                      <label class="web-extension-item__toggle">
                        <input type="checkbox" :checked="ext.enabled" @change="toggleExtension(ext.id, !ext.enabled)" />
                        <span>{{ ext.enabled ? '已启用' : '已禁用' }}</span>
                      </label>
                      <UiButton variant="danger" size="sm" @click="removeExtension(ext.id)">卸载</UiButton>
                    </div>
                  </div>
                  <div v-if="chromeExtensions.length === 0" class="web-domain-empty">暂无已安装的扩展</div>
                </div>
                <UiButton variant="secondary" size="sm" :disabled="extensionInstalling" @click="installExtension">
                  {{ extensionInstalling ? '安装中...' : '安装扩展' }}
                </UiButton>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>增强脚本</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>脚本列表</span>
                <small>注入 JS/CSS/HTML 到匹配域名的网页。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="web-scripts-list">
                  <div v-for="script in webScripts" :key="script.id" class="web-script-item">
                    <div class="web-script-item__head">
                      <span class="web-script-item__name">{{ script.name }}</span>
                      <span class="web-script-item__type" :class="`web-script-item__type--${script.type}`">
                        {{ scriptTypeLabel(script.type) }}
                      </span>
                      <span class="web-script-item__pattern">{{ script.domainPattern }}</span>
                      <label class="web-script-item__toggle">
                        <input type="checkbox" :checked="script.enabled" @change="toggleScript(script.id)" />
                        <span>{{ script.enabled ? '已启用' : '已禁用' }}</span>
                      </label>
                      <UiButton v-if="!script.builtin" variant="danger" size="sm" @click="removeScript(script.id)">删除</UiButton>
                    </div>
                  </div>
                  <div v-if="webScripts.length === 0" class="web-domain-empty">暂无注入脚本</div>
                </div>

                <UiButton v-if="!showAddScript" variant="secondary" size="sm" @click="showAddScript = true">添加脚本</UiButton>

                <div v-if="showAddScript" class="web-add-script-form">
                  <div class="web-add-script-form__row">
                    <UiField label="脚本名称">
                      <UiInput v-model="newScriptName" placeholder="例如：暗色模式" size="sm" />
                    </UiField>
                    <UiField label="匹配域名">
                      <UiInput v-model="newScriptDomain" placeholder="例如：*.bilibili.com" size="sm" />
                    </UiField>
                    <UiField label="类型">
                      <UiSelect v-model="newScriptType" :options="scriptTypeOptions" size="sm" />
                    </UiField>
                  </div>
                  <div class="web-add-script-form__row">
                    <UiField label="注入时机">
                      <UiSelect v-model="newScriptRunAt" :options="scriptRunAtOptions" size="sm" />
                    </UiField>
                    <UiField v-if="newScriptType === 'js'" label="脚本权限" style="grid-column: span 2">
                      <div class="web-add-script-form__perms">
                        <label v-for="perm in ['network', 'storage', 'clipboard']" :key="perm" class="web-add-script-form__perm-label">
                          <input type="checkbox" :value="perm" v-model="newScriptPermissions" />
                          <span>{{ perm === 'network' ? '网络请求' : perm === 'storage' ? '本地存储' : '剪贴板' }}</span>
                        </label>
                      </div>
                    </UiField>
                  </div>
                  <UiField label="内容">
                    <textarea v-model="newScriptContent" class="web-script-editor" rows="6"
                      :placeholder="newScriptType === 'css' ? 'body { background: #1a1a2e !important; }' : newScriptType === 'html' ? '&lt;div class=&quot;my-widget&quot;&gt;...&lt;/div&gt;' : 'console.log(&quot;injected!&quot;);'"
                      spellcheck="false" />
                  </UiField>
                  <div class="web-add-script-form__actions">
                    <UiButton variant="secondary" size="sm" @click="showAddScript = false">取消</UiButton>
                    <UiButton variant="primary" size="sm" :disabled="!newScriptName.trim() || !newScriptDomain.trim() || !newScriptContent.trim()" @click="addScript">保存</UiButton>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
      </Transition>
    </div>
  </UiScrollbar>
</template>

<style lang="scss" scoped>
.settings-page {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  color: var(--ui-text-primary);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--background-color) 90%, #ffffff 10%) 0%, var(--background-color) 100%);
  overflow: hidden;
}

.page-header {
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  backdrop-filter: var(--ui-backdrop-blur-lg);
  background: color-mix(in srgb, var(--background-color) 88%, transparent);
  padding: 26px 28px 0;
  box-sizing: border-box;
}

.page-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;

  h1 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 30px;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: 0;
  }
}

.settings-search {
  position: relative;
  width: min(320px, 38vw);
  flex: 0 1 auto;

  input {
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    padding: 0 16px 0 46px;
    border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 70%, rgba(80, 96, 118, 0.25));
    border-radius: 6px;
    background: color-mix(in srgb, var(--ui-input-bg) 88%, transparent);
    color: var(--ui-input-text);
    font: inherit;
    font-size: 14px;
    outline: none;
    transition: border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;

    &:focus {
      border-color: var(--ui-input-focus-border);
      box-shadow: var(--ui-focus-ring);
    }

    &::placeholder {
      color: var(--ui-input-placeholder);
    }
  }
}

.settings-search__icon {
  position: absolute;
  left: 18px;
  top: 50%;
  width: 14px;
  height: 14px;
  border: 2px solid var(--ui-text-muted);
  border-radius: 50%;
  transform: translateY(-58%);
  pointer-events: none;

  &::after {
    content: "";
    position: absolute;
    right: -6px;
    bottom: -5px;
    width: 7px;
    height: 2px;
    border-radius: 2px;
    background: var(--ui-text-muted);
    transform: rotate(45deg);
  }
}

.settings-nav {
  width: 100%;
  max-width: 1440px;
  margin: 20px auto 0;
  border-bottom: 1px solid var(--ui-border-subtle);

  :deep(.ui-tabs) {
    display: flex;
    gap: 18px;
    border-bottom: 0;
  }

  :deep(.ui-tabs__item) {
    min-height: 44px;
    padding: 0 10px;
    color: color-mix(in srgb, var(--ui-text-primary) 70%, transparent);
    font-size: 15px;
    font-weight: 500;
    transition:
      color 0.18s ease,
      background-color 0.18s ease;
  }

  :deep(.ui-tabs__item.is-active) {
    color: #0b67d8;
    font-weight: 700;
  }

  :deep(.ui-tabs--line .ui-tabs__item.is-active) {
    background: transparent;
  }

  :deep(.ui-tabs--line .ui-tabs__active-indicator) {
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: #0b67d8;
  }
}

.page-body {
  display: block;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 18px 28px 42px;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* ─── Section ─── */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 20px;
}

.section-head--standalone {
  display: none;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 0;

  :deep(.ui-input),
  :deep(.ui-input-number-wrapper),
  :deep(.ui-select-trigger),
  :deep(.shortcut-recorder__display),
  :deep(.shortcut-recorder__action) {
    border-radius: 6px;
  }

  :deep(.ui-input),
  :deep(.ui-input-number-wrapper),
  :deep(.ui-select-trigger) {
    min-height: 36px;
    background: color-mix(in srgb, var(--ui-input-bg) 94%, transparent);
  }

  :deep(.shortcut-recorder__display),
  :deep(.shortcut-recorder__action) {
    min-height: 36px;
  }
}

.settings-group {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 0 28px;
  padding: 16px 10px 16px 10px;
  border-bottom: 1px solid var(--ui-border-subtle);
  box-sizing: border-box;

  h3 {
    grid-row: 1 / span 20;
    align-self: start;
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 17px;
    font-weight: 700;
    line-height: 1.45;
    letter-spacing: 0;
  }
}

.settings-row {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(260px, 360px);
  align-items: center;
  gap: 18px;
  min-height: 46px;
  padding: 5px 0;
  box-sizing: border-box;
}

.settings-row--wide {
  grid-template-columns: minmax(180px, 260px) minmax(360px, 1fr);
}

.settings-row__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  span {
    color: var(--ui-text-primary);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.35;
  }

  small {
    color: var(--ui-text-muted);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.35;
  }
}

.settings-row__control {
  min-width: 0;
  width: 100%;
}

.clipboard-device-panel,
.network-priority-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.clipboard-device-panel__actions,
.network-priority-panel__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.clipboard-device-list,
.network-priority-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clipboard-device-item,
.network-priority-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 8px 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-panel-bg) 92%, transparent);
}

.clipboard-device-item {
  grid-template-columns: minmax(0, 1fr) auto;
}

.network-priority-item--active {
  border-color: color-mix(in srgb, #0b67d8 46%, var(--ui-border-subtle));
  background: color-mix(in srgb, #0b67d8 8%, var(--ui-panel-bg));
}

.network-priority-item__handle {
  color: var(--ui-text-muted);
  cursor: grab;
  letter-spacing: -2px;
  user-select: none;
}

.clipboard-device-item__body,
.network-priority-item__body {
  display: flex;
  flex-direction: column;
  min-width: 0;

  strong {
    overflow: hidden;
    color: var(--ui-text-primary);
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--ui-text-muted);
    font-size: 12px;
  }
}

.network-priority-item__actions {
  display: flex;
  gap: 6px;
}

.clipboard-device-empty,
.network-priority-empty {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.settings-row__control--compact {
  max-width: 220px;
}

.settings-row__control--wide {
  max-width: 760px;
}

.settings-row__control--switch {
  display: flex;
  justify-content: flex-end;
  max-width: 360px;
}

.settings-error {
  margin: 0;
  color: var(--ui-danger-color, #dc2626);
  font-size: 12px;
  line-height: 1.45;
}

.terminal-profile-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.terminal-profile-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.terminal-profile-editor__env {
  width: 100%;
  min-height: 92px;
  padding: 10px 12px;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: 6px;
  background: var(--ui-input-bg);
  color: var(--ui-input-text);
  resize: vertical;
  box-sizing: border-box;
  font: inherit;
  line-height: 1.5;
}

.terminal-profile-editor__env:focus {
  outline: none;
  border-color: var(--ui-input-focus-border);
  box-shadow: var(--ui-focus-ring);
}

.terminal-profile-editor__actions,
.terminal-profile-list__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.terminal-profile-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.terminal-profile-list__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-surface-muted, var(--ui-input-bg)) 70%, transparent);
}

.terminal-profile-list__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  strong,
  span,
  small {
    overflow-wrap: anywhere;
  }

  strong {
    color: var(--ui-text-primary);
    font-size: 13px;
  }

  span,
  small {
    color: var(--ui-text-muted);
    font-size: 12px;
  }
}

.settings-switch {
  display: inline-flex;
  align-items: center;
  cursor: pointer;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  span {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 22px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ui-text-muted) 30%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-border-subtle) 80%, transparent);
    transition: background-color 0.18s ease, box-shadow 0.18s ease;

    &::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.22);
      transition: transform 0.18s ease;
    }
  }

  input:checked + span {
    background: #0b67d8;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #0b67d8 70%, transparent);

    &::after {
      transform: translateX(20px);
    }
  }

  input:focus-visible + span {
    box-shadow: var(--ui-focus-ring), inset 0 0 0 1px var(--ui-input-focus-border);
  }
}

/* ─── Cards Grid ─── */
.cards-grid {
  display: grid;
  gap: 16px;
}

.cards-grid--2col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cards-grid--3col {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cards-grid--1col {
  grid-template-columns: 1fr;
}

/* ─── Settings Card ─── */
.settings-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 8px;
  transition: box-shadow 0.2s ease;
}

.settings-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.settings-card--placeholder {
  opacity: 0.7;
  min-height: 100px;
  justify-content: center;
}

.settings-card__head {
  display: flex;
  align-items: center;
  gap: 10px;

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
}

.settings-card__icon {
  font-size: 18px;
  flex-shrink: 0;
}

.settings-card__desc {
  margin: -4px 0 0;
  color: var(--ui-text-muted);
  font-size: 12.5px;
  line-height: 1.5;
}

.settings-card__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.settings-card__fields--inline {
  grid-template-columns: 1fr;
  max-width: 360px;
}

.settings-card__divider {
  height: 1px;
  background: var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
  margin: 4px 0;
}

/* ─── Plugin extras ─── */
.plugin-dir-badge {
  margin-left: auto;
  font-size: 11px;
  color: var(--ui-text-muted);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.06));
  padding: 4px 10px;
  border-radius: var(--ui-radius-sm, 4px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

.plugin-meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.meta-item {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: var(--ui-radius-md, 6px);

  span { color: var(--ui-text-muted); font-size: 12px; }
  strong { word-break: break-word; font-size: 13px; }
}

.error-banner {
  margin: 0;
}

.plugin-json-editor {
  width: 100%;
  min-height: 280px;
  padding: 14px 16px;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-input-bg);
  color: var(--ui-input-text);
  resize: vertical;
  box-sizing: border-box;
  font: inherit;
  line-height: 1.6;
}

.plugin-json-editor:focus {
  outline: none;
  border-color: var(--ui-input-focus-border);
  box-shadow: var(--ui-focus-ring);
}

.plugin-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ─── Responsive ─── */
@media (max-width: 1080px) {
  .settings-group {
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 0 20px;
  }

  .settings-row,
  .settings-row--wide {
    grid-template-columns: minmax(150px, 220px) minmax(240px, 1fr);
  }

  .update-version-row {
    grid-template-columns: minmax(170px, 220px) minmax(280px, 1fr);
    gap: 22px;
  }

  .cards-grid--2col,
  .cards-grid--3col {
    grid-template-columns: 1fr;
  }

  .settings-card__fields {
    grid-template-columns: 1fr;
  }

  .plugin-meta-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .page-header {
    padding: 20px 16px 0;
  }

  .page-title-row {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }

  .settings-search {
    width: 100%;
  }

  .settings-nav {
    margin-top: 14px;
    overflow-x: auto;
  }

  .page-body {
    padding: 14px 16px 28px;
  }

  .settings-group {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 16px 0;
  }

  .settings-group h3 {
    grid-row: auto;
  }

  .settings-row,
  .settings-row--wide {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .update-version-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .settings-row__control,
  .settings-row__control--wide,
  .settings-row__control--compact {
    max-width: none;
  }

  .settings-row__control--switch {
    justify-content: flex-start;
  }

  .update-auth__controls {
    grid-template-columns: 1fr;
  }
}

.ffmpeg-path-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ffmpeg-path-display {
  flex: 1;
  padding: 8px 12px;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-input-bg);
  color: var(--ui-text-primary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;

  &--empty {
    color: var(--ui-text-muted);
    font-style: italic;
  }
}

.segmented-actions,
.settings-inline-badges,
.settings-path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.settings-inline-badges--mt {
  margin-top: 8px;
}

.settings-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 88%, transparent);
  color: var(--ui-text-primary);
  font-size: 12px;
  font-weight: 600;
}

.settings-badge--accent {
  border-color: color-mix(in srgb, var(--primary-color) 34%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--primary-color) 12%, var(--ui-surface-panel));
  color: var(--primary-color);
}

.settings-badge--danger {
  border-color: color-mix(in srgb, #ef4444 40%, var(--ui-border-subtle));
  background: color-mix(in srgb, #ef4444 10%, var(--ui-surface-panel));
  color: #dc2626;
}

.settings-badge--code {
  max-width: min(100%, 720px);
  border-radius: var(--ui-radius-sm);
  font-family: var(--ui-font-family-mono);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.settings-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ui-text-primary);
  font-size: 13px;
  cursor: pointer;

  input {
    width: 14px;
    height: 14px;
    accent-color: var(--primary-color);
  }
}

.settings-path-display {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-input-bg);
  color: var(--ui-text-primary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--empty {
    color: var(--ui-text-muted);
    font-style: italic;
  }
}

.settings-muted-empty {
  margin-top: 10px;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.settings-known-hosts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.settings-known-host {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 88%, transparent);
}

.settings-known-host__main {
  min-width: 0;
  flex: 1;
}

.settings-known-host__title {
  color: var(--ui-text-primary);
  font-size: 13px;
  font-weight: 700;
}

.settings-known-host__meta,
.settings-known-host__fingerprint {
  margin-top: 3px;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.settings-known-host__fingerprint {
  overflow-wrap: anywhere;
  font-family: var(--ui-font-mono, monospace);
}

.ffmpeg-status {
  margin-top: 6px;
  font-size: 12px;
  padding: 4px 0;

  &--checking {
    color: var(--ui-text-muted);
  }

  &--valid {
    color: var(--ui-success-color, #67c23a);
  }

  &--invalid {
    color: var(--ui-danger-color, #f56c6c);
  }
}

.update-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.update-version-row {
  grid-template-columns: minmax(220px, 300px) minmax(420px, 1fr);
  gap: 32px;
  align-items: start;
}

.update-version-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.update-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
  padding: 12px 14px;
  border-radius: var(--ui-radius-md, 6px);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.06));
  border: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.1));

  strong {
    font-size: 13px;
  }

  span {
    color: var(--ui-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
}

.update-status--error {
  border-color: color-mix(in srgb, var(--ui-danger-color, #f56c6c) 40%, transparent);
}

.update-status--downloaded {
  border-color: color-mix(in srgb, var(--ui-success-color, #67c23a) 40%, transparent);
}

.update-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.update-progress__head,
.update-progress__meta,
.update-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.update-progress__head,
.update-progress__meta {
  font-size: 12px;
  color: var(--ui-text-muted);
}

.update-progress__bar {
  position: relative;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.1));
}

.update-progress__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4f8cff 0%, #78c3ff 100%);
}

.update-release-notes {
  height: clamp(88px, 22vh, 180px);
  overflow: hidden;
  white-space: pre-wrap;
  padding: 12px 14px;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-input-bg);
  color: var(--ui-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.update-auth {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.update-auth__status {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-input-bg);
  font-size: 12px;

  span {
    color: var(--ui-text-muted);
  }
}

.update-auth__controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.update-auth__hint {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.update-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.terminal-settings-toggles {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.terminal-settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ui-text-secondary);
  font-size: 13px;
  cursor: pointer;

  input {
    cursor: pointer;
  }
}

/* ─── 网页安全 ─── */
.web-domain-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.web-domain-section__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-weight: 500;
  color: var(--ui-text-primary);
}

.web-domain-section__hint {
  font-size: 12px;
  color: var(--ui-text-muted);
  font-weight: 400;
}

.web-domain-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.web-domain-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: var(--ui-radius-md, 6px);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.06));
  border: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.1));
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.web-domain-empty {
  padding: 12px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.web-domain-add {
  display: flex;
  gap: 8px;
  align-items: center;

  .ui-input {
    flex: 1;
  }
}

.web-scripts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.web-script-item {
  padding: 10px 12px;
  border-radius: var(--ui-radius-md, 6px);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.06));
  border: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.1));
}

.web-script-item__head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.web-script-item__name {
  font-weight: 500;
  color: var(--ui-text-primary);
}

.web-script-item__type {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;

  &--js {
    background: rgba(250, 200, 50, 0.15);
    color: #e6a700;
  }

  &--css {
    background: rgba(100, 160, 255, 0.15);
    color: #4a90d9;
  }

  &--html {
    background: rgba(255, 120, 80, 0.15);
    color: #e06040;
  }
}

.web-script-item__pattern {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: var(--ui-text-muted);
  flex: 1;
}

.web-script-item__toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--ui-text-muted);
  cursor: pointer;

  input {
    cursor: pointer;
  }
}

.web-add-script-form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.web-add-script-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 12px;
}

.web-add-script-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.web-add-script-form__perms {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.web-add-script-form__perm-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--ui-text-secondary);
  cursor: pointer;

  input { cursor: pointer; }
}

.web-script-editor {
  width: 100%;
  padding: 10px 12px;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-input-bg);
  color: var(--ui-input-text);
  resize: vertical;
  box-sizing: border-box;
  font: 12px 'Courier New', Consolas, monospace;
  line-height: 1.5;
}

.web-script-editor:focus {
  outline: none;
  border-color: var(--ui-input-focus-border);
  box-shadow: var(--ui-focus-ring);
}

/* ─── Chrome 扩展列表 ─── */
.web-extensions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.web-extension-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--ui-radius-md, 6px);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.06));
  border: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.1));
}

.web-extension-item__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.web-extension-item__name {
  font-weight: 500;
  font-size: 13px;
  color: var(--ui-text-primary);
}

.web-extension-item__meta {
  font-size: 11px;
  color: var(--ui-text-muted);
}

.web-extension-item__desc {
  font-size: 12px;
  color: var(--ui-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.web-extension-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.web-extension-item__toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--ui-text-secondary);
  cursor: pointer;

  input { cursor: pointer; }
}

@media (max-width: 760px) {
  .terminal-profile-editor__grid,
  .terminal-profile-list__item {
    grid-template-columns: 1fr;
  }

  .terminal-profile-list__actions {
    justify-content: flex-start;
  }
}
</style>
