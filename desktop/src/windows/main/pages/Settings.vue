<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import type {
  AppBottomBarTabId,
  AppKnowledgeAssetStorageMode,
  AppConfigPatch,
  AppLanguage,
  AppSettingsTabId,
  AppSettingsTabPersonalizationConfig,
  AppTheme,
  LocalNetworkInterfaceOption,
} from '@/contracts/app_config';
import type { AiAgentMode, AiInteractionMode } from '@/contracts/ai';
import type { KnowledgeLibrary } from '@/contracts/knowledge';
import type { FtpWindowsContextMenuStatus } from '@/contracts/ftp';
import type { MultiDeviceClipboardDeviceStatus } from '@/contracts/multi_device_clipboard';
import type { QuickLaunchProviderId } from '@/contracts/quick_launch';
import type {
  AppSystemShortcutKey,
  ShortcutInspectionResult,
  ShortcutProbeStatus,
  SystemShortcutProbeResult,
} from '@/contracts/shortcuts';
import type {
  LocalTerminalProfileConfig,
  TerminalBackgroundConfig,
  TerminalProfile,
  TerminalRendererMode,
} from '@/contracts/terminal';
import type { WebScriptRule } from '@/contracts/webview';
import type { InstalledPluginRecord, PluginHostSummary } from '@/contracts/plugin_host';
import type { BackgroundConfirmPayload } from '@/contracts/background';
import { resolveThemeBackground, withThemeBackground } from '@/contracts/background';
import UiButton from '../components/ui/UiButton.vue';
import UiCheckbox from '../components/ui/UiCheckbox.vue';
import UiField from '../components/ui/UiField.vue';
import UiInput from '../components/ui/UiInput.vue';
import UiSliderField from '../components/ui/UiSliderField.vue';
import ShortcutRecorder from '../components/ui/ShortcutRecorder.vue';
import UiSelect from '../components/ui/UiSelect.vue';
import UiScrollbar from '../components/ui/UiScrollbar.vue';
import UiTabs, { type UiTabItem } from '../components/ui/UiTabs.vue';
import UiTextarea from '../components/ui/UiTextarea.vue';
import UiTransferBox from '../components/ui/UiTransferBox.vue';
import UiPersonalizationConfig from '../components/ui/UiPersonalizationConfig.vue';
import WebViewKeepAliveList from '../components/webview/WebViewKeepAliveList.vue';
import AiProviderDrawer from './AI/components/AiProviderDrawer.vue';
import AiSettingsPanel from './AI/components/AiSettingsPanel.vue';
import { useTheme } from '../composables/theme';
import { notifyError, notifySuccess } from '../composables/useInAppNotification';
import { useConfirmDialog } from '../composables/useConfirmDialog';
import { useAppConfigStore } from '../stores/app_config_store';
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
const sshStore = useSshStore();
const { show: showConfirm } = useConfirmDialog();
const { setTheme } = useTheme();
const defaultConfig = createDefaultAppConfig();
const defaultShortcuts = defaultConfig.shortcuts;
const defaultQuickLaunchConfig = defaultConfig.features.quickLaunch;

type TransferBoxItem = {
  key: string;
  label: string;
  description?: string;
  locked?: boolean;
};

const FTP_PREFERENCES_STORAGE_KEY = 'guyantools.ftp.preferences';
const FTP_THUMBNAIL_STORAGE_KEY = 'guyantools.ftp.thumbnail-preferences';
const SETTINGS_SEARCH_HIGHLIGHT_NAME = 'settings-search-match';

type CssHighlightConstructor = new (...ranges: Range[]) => unknown;
type CssHighlightRegistry = {
  delete(name: string): void;
  set(name: string, highlight: unknown): void;
};

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
const knowledgeLibraries = ref<KnowledgeLibrary[]>([]);
const knowledgeMaxImportFileSizeMbInput = ref(String(appConfigStore.config.features.knowledge.maxImportFileSizeMb));
const knowledgePreviewCacheTtlDaysInput = ref(String(appConfigStore.config.features.knowledge.previewCacheTtlDays));
const knowledgeLibreOfficePathInput = ref(appConfigStore.config.features.knowledge.libreOfficePath || '');
const knowledgeCustomAssetDirectoryInput = ref(appConfigStore.config.features.knowledge.customAssetDirectory || '');
const agentMaxStepsInput = ref(String(appConfigStore.config.features.aiAgent.agent.maxSteps || 5));
const aiProviderDrawerVisible = ref(false);
const editingAiProviderId = ref('');
const knowledgeClearingCache = ref(false);
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
const shortcutInspection = ref<ShortcutInspectionResult | null>(null);
const shortcutInspectionLoading = ref(false);
const shortcutRetryingKeys = ref<Partial<Record<AppSystemShortcutKey, boolean>>>({});
const shortcutValidationMessages = ref<Partial<Record<AppSystemShortcutKey, string>>>({});
const quickLaunchMaxResultsInput = ref(String(appConfigStore.config.features.quickLaunch.maxResults || 12));
const quickLaunchEverythingEsPathInput = ref(appConfigStore.config.features.quickLaunch.everythingEsPath || '');
const quickLaunchBackgroundPickerVisible = ref(false);
const quickLaunchWindowOpacityInput = ref(appConfigStore.config.features.quickLaunch.windowOpacity);
const quickLaunchSelectionColorInput = ref(appConfigStore.config.features.quickLaunch.selectionColor);
const quickLaunchSelectionOpacityInput = ref(appConfigStore.config.features.quickLaunch.selectionOpacity);
const quickLaunchResultTitleColorInput = ref(appConfigStore.config.features.quickLaunch.resultTitleColor);
const quickLaunchResultSubtitleColorInput = ref(appConfigStore.config.features.quickLaunch.resultSubtitleColor);

const settingsTabs: UiTabItem[] = [
  { key: 'general', label: '基础设置' },
  { key: 'file-transfer', label: '文件传输' },
  { key: 'web-security', label: 'WebView' },
  { key: 'ai-agent', label: 'AI' },
  { key: 'plugins', label: '插件配置' },
  { key: 'terminal', label: '终端' },
  { key: 'multi-device-clipboard', label: '多设备剪贴板' },
  { key: 'knowledge', label: '知识库' },
  { key: 'quick-launch', label: '快速启动' },
  { key: 'shortcuts', label: '快捷键' },
];
const settingsTabOrder = settingsTabs.map(tab => tab.key) as SettingsTabKey[];
const settingsTabTransition = ref('ui-tab-forward');
const loadedSettingsTabs = new Set<SettingsTabKey>();
const searchTabItem: UiTabItem = { key: 'search', label: '搜索' };
const settingsSearchQuery = ref('');
const settingsSearchHasMatches = ref(true);
const settingsBodyRef = ref<HTMLElement | null>(null);

const isSearchingSettings = computed(() => settingsSearchQuery.value.trim().length > 0);
const normalizedSettingsSearchQuery = computed(() => settingsSearchQuery.value.trim().toLocaleLowerCase());
const displayedSettingsTabs = computed<UiTabItem[]>(() => (isSearchingSettings.value ? [searchTabItem] : settingsTabs));
const activeSettingsTabForView = computed(() => (isSearchingSettings.value ? 'search' : settingsStore.activeSettingsTab));
const settingsContentKey = computed(() => (isSearchingSettings.value ? 'search' : settingsStore.activeSettingsTab));

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
const knowledgeLibraryOptions = computed(() => [
  { label: '使用默认知识库', value: '' },
  ...knowledgeLibraries.value.map((library) => ({
    label: library.isDefault ? `${library.name}（默认）` : library.name,
    value: library.id,
  })),
]);
const knowledgeAssetStorageOptions: Array<{ label: string; value: AppKnowledgeAssetStorageMode }> = [
  { label: '应用数据目录', value: 'app-data' },
  { label: '自定义目录', value: 'custom' },
];
const quickLaunchProviderOptions: Array<{ label: string; value: QuickLaunchProviderId }> = [
  { label: '应用功能', value: 'internal-route' },
  { label: '终端配置', value: 'terminal' },
  { label: 'SSH 连接', value: 'ssh' },
  { label: 'FTP/SFTP 连接', value: 'ftp' },
  { label: '待办任务', value: 'todo' },
  { label: '知识库', value: 'knowledge' },
  { label: '插件入口', value: 'plugin' },
  { label: '本机应用', value: 'app' },
  { label: '本机文件（Everything）', value: 'file' },
];
const quickLaunchWindowShortcutGroups: Array<{
  title: string;
  shortcuts: Array<{ label: string; keys: string }>;
}> = [
  {
    title: '结果操作',
    shortcuts: [
      { label: '打开选中结果', keys: 'Enter' },
      { label: '打开操作面板', keys: 'Ctrl+O / Shift+Enter / → / 右键' },
      { label: '打开所在位置 / 在资源管理器中打开', keys: 'Ctrl+Enter' },
      { label: '以管理员身份启动', keys: 'Ctrl+Shift+Enter' },
      { label: '复制结果', keys: 'Ctrl+C' },
      { label: '复制路径', keys: 'Ctrl+Shift+C' },
      { label: '刷新结果', keys: 'Ctrl+R / F5' },
    ],
  },
  {
    title: '导航与窗口',
    shortcuts: [
      { label: '切换选中结果', keys: '↑ / ↓ / Tab' },
      { label: '翻页选择', keys: 'PageUp / PageDown' },
      { label: '直接打开前十项', keys: 'Alt+1...0' },
      { label: '补全选中标题', keys: 'Ctrl+Tab' },
      { label: '显示结果预览', keys: 'F1' },
      { label: '搜索历史', keys: 'Ctrl+H' },
      { label: '调整结果数量', keys: 'Ctrl+Plus / Ctrl+Minus' },
      { label: '调整窗口宽度', keys: 'Ctrl+[ / Ctrl+]' },
      { label: '游戏模式', keys: 'Ctrl+F12' },
    ],
  },
];
const aiDefaultModeOptions: Array<{ label: string; value: AiInteractionMode }> = [
  { label: 'AI 问答', value: 'chat' },
  { label: '通用 Agent', value: 'general-agent' },
  { label: 'Code Agent', value: 'code-agent' },
];
const aiAgentModeOptions: Array<{ label: string; value: AiAgentMode }> = [
  { label: '通用 Agent', value: 'general-agent' },
  { label: 'Code Agent', value: 'code-agent' },
];
const knowledgeIndexingSummary = computed(() => (
  appConfigStore.config.features.knowledge.indexingEnabled
    ? '导入时会抽取文本并写入搜索索引'
    : '导入只保存文件和元数据，不抽取全文'
));
const knowledgePreviewCacheSummary = computed(() => {
  const days = appConfigStore.config.features.knowledge.previewCacheTtlDays;
  return days === 0 ? '缓存只手动清理' : `缓存保留 ${days} 天`;
});
const ftpLinkNavigationSummary = computed(() => {
  if (!ftpLinkNavigationEnabled.value) return '联动导航已关闭';
  return '当前工作区内的文件面板会联动导航';
});
const ftpThumbnailSummary = computed(() => (
  ftpThumbnailsEnabled.value
    ? `图片缩略图已开启 · 单张最多 ${ftpThumbnailMaxBytesKb.value} KB · 每侧预加载 ${ftpThumbnailPrefetchLimit.value} 张`
    : '图片缩略图已关闭'
));
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
const shortcutRegisteredCount = computed(() => shortcutInspection.value?.summary.registered ?? 0);
const shortcutConflictCount = computed(() => shortcutInspection.value?.summary.conflict ?? 0);
const shortcutAvailableCount = computed(() => shortcutInspection.value?.summary.available ?? 0);
const highlightedCommonShortcutProbes = computed(() => {
  const probes = shortcutInspection.value?.common ?? [];
  const conflicts = probes.filter((probe) => probe.status === 'conflict' || probe.status === 'invalid');
  return (conflicts.length ? conflicts : probes).slice(0, 8);
});

const detachedWindowShortcutRows: Array<{
  key: AppSystemShortcutKey;
  label: string;
  description: string;
}> = [
  { key: 'openDetachedTerminal', label: '独立窗口：终端', description: '系统级快捷键，打开终端页面独立窗口。' },
  { key: 'openDetachedFtp', label: '独立窗口：传输', description: '系统级快捷键，打开传输页面独立窗口。' },
  { key: 'openDetachedTodo', label: '独立窗口：待办', description: '系统级快捷键，打开待办页面独立窗口。' },
  { key: 'openDetachedAi', label: '独立窗口：AI', description: '系统级快捷键，打开 AI 页面独立窗口。' },
  { key: 'openDetachedKnowledge', label: '独立窗口：知识库', description: '系统级快捷键，打开知识库页面独立窗口。' },
];
const shortcutInspectionTimeText = computed(() => {
  if (!shortcutInspection.value) return '尚未检测';
  return new Date(shortcutInspection.value.checkedAt).toLocaleTimeString();
});

const activePlugin = computed(() => installedPlugins.value.find(
  (plugin) => plugin.manifest.id === settingsStore.activePluginConfigId,
) ?? null);
const activeSettingsTabPersonalization = computed(() => getSettingsTabPersonalization(settingsStore.activeSettingsTab));
const activeSettingsPageStyle = computed<CSSProperties>(() => buildSettingsTabBackgroundStyle(activeSettingsTabPersonalization.value));
const activeSettingsBackgroundVideo = computed(() => (
  activeSettingsTabPersonalization.value.type === 'video' ? activeSettingsTabPersonalization.value.video : ''
));
const activeQuickLaunchBackground = computed(() => {
  const config = appConfigStore.config.features.quickLaunch;
  return resolveThemeBackground({
    type: config.backgroundType,
    color: config.backgroundColor,
    image: config.backgroundImage,
    video: config.backgroundVideo,
    backgroundStyle: config.backgroundStyle,
  }, appConfigStore.config.appearance.theme);
});
const quickLaunchBackgroundSummary = computed(() => {
  const background = activeQuickLaunchBackground.value;
  if (background.type === 'image') {
    return background.image ? '图片背景' : '图片背景未选择文件';
  }
  if (background.type === 'video') {
    return background.video ? '视频背景' : '视频背景未选择文件';
  }
  return background.color ? '颜色背景' : '默认面板背景';
});
const quickLaunchBackgroundPreviewStyle = computed<CSSProperties>(() => {
  const background = activeQuickLaunchBackground.value;
  const style = background.backgroundStyle ?? {};
  const previewStyle: CSSProperties = {
    opacity: style.opacity ?? 1,
  };

  if (background.type === 'image' && background.image) {
    previewStyle.backgroundImage = `url(${background.image})`;
    previewStyle.backgroundSize = style.backgroundSize || 'cover';
    previewStyle.backgroundPosition = style.backgroundPosition || 'center';
    previewStyle.backgroundRepeat = style.backgroundRepeat || 'no-repeat';
  } else if (background.type === 'color' && background.color) {
    previewStyle.background = background.color;
  } else {
    previewStyle.background = 'rgba(250, 252, 255, 0.96)';
  }

  return previewStyle;
});
const quickLaunchWindowOpacityLabel = computed(() => `${Math.round(quickLaunchWindowOpacityInput.value * 100)}%`);
const quickLaunchSelectionOpacityLabel = computed(() => `${Math.round(quickLaunchSelectionOpacityInput.value * 100)}%`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getSettingsTabPersonalization(tab: AppSettingsTabId): AppSettingsTabPersonalizationConfig {
  const config = appConfigStore.config.features.settings.tabs[tab];
  const background = resolveThemeBackground({
    type: config.type,
    color: config.color,
    image: config.image,
    video: config.video,
    backgroundStyle: config.style,
  }, appConfigStore.config.appearance.theme);
  return {
    type: background.type,
    color: background.color,
    image: background.image,
    video: background.video,
    style: background.backgroundStyle,
  };
}

function buildSettingsTabBackgroundStyle(config: AppSettingsTabPersonalizationConfig): CSSProperties {
  const style: CSSProperties = {};

  if (config.type === 'image' && config.image) {
    style.backgroundImage = `url(${config.image})`;
    style.backgroundSize = config.style?.backgroundSize || 'cover';
    style.backgroundPosition = config.style?.backgroundPosition || 'center';
    style.backgroundRepeat = config.style?.backgroundRepeat || 'no-repeat';
  } else if (config.color) {
    style.background = config.color;
  }

  return style;
}

function isSettingsTabRendered(tab: SettingsTabKey) {
  return isSearchingSettings.value || settingsStore.activeSettingsTab === tab;
}

function isSearchContainerCard(element: HTMLElement) {
  return element.classList.contains('settings-card')
    && Boolean(element.querySelector('.settings-row, .ui-field'));
}

function getSearchableSettingItems(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('.settings-row, .ui-field, .settings-card'))
    .filter(item => !isSearchContainerCard(item));
}

function collectSettingSearchText(element: HTMLElement) {
  return (element.textContent ?? '').trim().replace(/\s+/g, ' ');
}

function getCssHighlightApi() {
  const highlightConstructor = (window as typeof window & { Highlight?: CssHighlightConstructor }).Highlight;
  const highlightRegistry = (CSS as typeof CSS & { highlights?: CssHighlightRegistry }).highlights;

  if (!highlightConstructor || !highlightRegistry) {
    return null;
  }

  return {
    Highlight: highlightConstructor,
    registry: highlightRegistry,
  };
}

function clearSettingsSearchHighlights() {
  getCssHighlightApi()?.registry.delete(SETTINGS_SEARCH_HIGHLIGHT_NAME);
}

function shouldHighlightSearchNode(node: Node) {
  const parentElement = node.parentElement;
  if (!parentElement) return false;

  return !parentElement.closest('input, textarea, select, option, button, script, style, .is-search-hidden');
}

function collectSettingHighlightRanges(element: HTMLElement, query: string) {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return shouldHighlightSearchNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    },
  );

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const text = textNode.textContent ?? '';
    const normalizedText = text.toLocaleLowerCase();
    let matchIndex = normalizedText.indexOf(query);

    while (matchIndex >= 0) {
      const range = document.createRange();
      range.setStart(textNode, matchIndex);
      range.setEnd(textNode, matchIndex + query.length);
      ranges.push(range);
      matchIndex = normalizedText.indexOf(query, matchIndex + query.length);
    }
  }

  return ranges;
}

function updateSettingsSearchHighlights(query: string, settingItems: HTMLElement[]) {
  const cssHighlightApi = getCssHighlightApi();
  if (!cssHighlightApi) return;

  cssHighlightApi.registry.delete(SETTINGS_SEARCH_HIGHLIGHT_NAME);
  if (!query) return;

  const ranges = settingItems
    .filter(item => !item.classList.contains('is-search-hidden'))
    .flatMap(item => collectSettingHighlightRanges(item, query));

  if (ranges.length) {
    cssHighlightApi.registry.set(SETTINGS_SEARCH_HIGHLIGHT_NAME, new cssHighlightApi.Highlight(...ranges));
  }
}

function applySettingsSearchFilter() {
  const root = settingsBodyRef.value;
  if (!root) {
    clearSettingsSearchHighlights();
    return;
  }

  const query = normalizedSettingsSearchQuery.value;
  const settingItems = getSearchableSettingItems(root);

  for (const item of settingItems) {
    const searchText = collectSettingSearchText(item).toLocaleLowerCase();
    item.classList.toggle('is-search-hidden', Boolean(query) && (!searchText || !searchText.includes(query)));
  }

  const containerCards = Array.from(root.querySelectorAll<HTMLElement>('.settings-card'))
    .filter(isSearchContainerCard);
  for (const card of containerCards) {
    const hasVisibleItem = Array.from(card.querySelectorAll<HTMLElement>('.settings-row, .ui-field'))
      .some(item => !item.classList.contains('is-search-hidden'));
    card.classList.toggle('is-search-hidden', Boolean(query) && !hasVisibleItem);
  }

  const groups = Array.from(root.querySelectorAll<HTMLElement>('.settings-group'));
  for (const group of groups) {
    const hasVisibleItem = getSearchableSettingItems(group)
      .some(item => !item.classList.contains('is-search-hidden'));
    group.classList.toggle('is-search-hidden', Boolean(query) && !hasVisibleItem);
  }

  const sections = Array.from(root.querySelectorAll<HTMLElement>('.settings-section'));
  let hasAnyVisibleSection = false;
  for (const section of sections) {
    const hasVisibleItem = getSearchableSettingItems(section)
      .some(item => !item.classList.contains('is-search-hidden'));
    section.classList.toggle('settings-section--search-empty', Boolean(query) && !hasVisibleItem);
    hasAnyVisibleSection ||= hasVisibleItem;
  }
  settingsSearchHasMatches.value = !query || hasAnyVisibleSection;
  updateSettingsSearchHighlights(query, settingItems);
}

function queueSettingsSearchFilter() {
  void nextTick(applySettingsSearchFilter);
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

type AiAgentFeaturePatch = NonNullable<NonNullable<AppConfigPatch['features']>['aiAgent']>;

async function updateAiAgentSettings(patch: AiAgentFeaturePatch) {
  await appConfigStore.updateConfig({
    features: {
      aiAgent: patch,
    },
  });
}

async function updateAiAgentReservedSettings(patch: Partial<typeof appConfigStore.config.features.aiAgent.agent>) {
  const current = appConfigStore.config.features.aiAgent.agent;
  await updateAiAgentSettings({
    agent: {
      ...current,
      ...patch,
      codex: {
        ...current.codex,
        ...(patch.codex ?? {}),
      },
      general: {
        ...current.general,
        ...(patch.general ?? {}),
      },
    },
  });
}

function openAiProviderDrawer(providerId = '') {
  editingAiProviderId.value = providerId;
  aiProviderDrawerVisible.value = true;
}

async function handleAiFeatureEnabledChange(enabled: boolean) {
  await updateAiAgentSettings({
    enabled,
    defaultMode: enabled ? appConfigStore.config.features.aiAgent.defaultMode : 'chat',
  });
}

async function handleAiDefaultModeChange(value: string) {
  await updateAiAgentSettings({
    defaultMode: value as AiInteractionMode,
  });
}

async function handleAiAgentDefaultModeChange(value: string) {
  await updateAiAgentReservedSettings({
    defaultAgentMode: value as AiAgentMode,
  });
}

async function commitAiAgentMaxSteps() {
  const value = Math.max(1, Math.min(32, Math.round(Number(agentMaxStepsInput.value) || 5)));
  agentMaxStepsInput.value = String(value);
  await updateAiAgentReservedSettings({
    maxSteps: value,
  });
}

function handleSettingsTabChange(value: string) {
  if (value === 'search') {
    return;
  }

  const nextTab = value as SettingsTabKey;
  const currentIndex = settingsTabOrder.indexOf(settingsStore.activeSettingsTab);
  const nextIndex = settingsTabOrder.indexOf(nextTab);

  settingsTabTransition.value = nextIndex >= currentIndex ? 'ui-tab-forward' : 'ui-tab-back';
  settingsStore.setActiveSettingsTab(nextTab);
  if (nextTab !== 'ai-agent') {
    aiProviderDrawerVisible.value = false;
    editingAiProviderId.value = '';
  }
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
      case 'knowledge':
        void loadKnowledgeLibraries();
        break;
      case 'plugins':
        void loadPluginContext();
        break;
      case 'web-security':
        void loadExtensions();
        break;
      case 'ai-agent':
        break;
      case 'shortcuts':
        void refreshSystemShortcutInspection();
        break;
      default:
        break;
    }
  });
}

function loadFtpSettingsDraft() {
  try {
    const rawPreferences = window.localStorage.getItem(FTP_PREFERENCES_STORAGE_KEY);
    if (rawPreferences) {
      const parsed = JSON.parse(rawPreferences) as unknown;
      if (isRecord(parsed)) {
        ftpExternalEditorPath.value = typeof parsed.externalEditorPath === 'string' ? parsed.externalEditorPath : '';
        ftpCleanupExternalDraftsOnClose.value = Boolean(parsed.cleanupExternalDraftsOnClose);
        ftpLinkNavigationEnabled.value = Boolean(parsed.linkNavigationEnabled);
      }
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
    ftpThumbnailsEnabled.value = true;
    ftpThumbnailMaxBytesKb.value = '256';
    ftpThumbnailPrefetchLimit.value = '18';
    ftpExternalEditorPath.value = '';
    ftpCleanupExternalDraftsOnClose.value = false;
  } finally {
    ftpSettingsLoaded.value = true;
  }
}

function persistFtpPreferenceSettings() {
  if (!ftpSettingsLoaded.value) return;
  let existingPreferences: Record<string, unknown> = {};
  try {
    const rawPreferences = window.localStorage.getItem(FTP_PREFERENCES_STORAGE_KEY);
    const parsed = rawPreferences ? JSON.parse(rawPreferences) as unknown : {};
    existingPreferences = isRecord(parsed) ? parsed : {};
  } catch {
    existingPreferences = {};
  }
  window.localStorage.setItem(FTP_PREFERENCES_STORAGE_KEY, JSON.stringify({
    ...existingPreferences,
    externalEditorPath: ftpExternalEditorPath.value,
    cleanupExternalDraftsOnClose: ftpCleanupExternalDraftsOnClose.value,
    linkNavigationEnabled: ftpLinkNavigationEnabled.value,
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
  const background = resolveThemeBackground({
    type: appConfigStore.config.features.terminal.viewportBgType ?? 'color',
    color: appConfigStore.config.features.terminal.viewportBgColor ?? '',
    image: appConfigStore.config.features.terminal.viewportBgImage ?? '',
    video: appConfigStore.config.features.terminal.viewportBgVideo ?? '',
    backgroundStyle: appConfigStore.config.features.terminal.viewportBgStyle ?? {},
  }, appConfigStore.config.appearance.theme);
  return {
    type: background.type,
    color: background.color,
    image: background.image,
    video: background.video,
    style: background.backgroundStyle,
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

async function handleTerminalSixelChange(enabled: boolean) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        enableSixel: enabled,
      },
    },
  });
}

async function handleTerminalBellChange(enabled: boolean) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        enableBell: enabled,
      },
    },
  });
}

async function handleTerminalDetachChange(enabled: boolean) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        detachToWindowByDefault: enabled,
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

async function handleMultiDeviceClipboardEnabledChange(enabled: boolean) {
  await appConfigStore.updateConfig({
    features: {
      multiDeviceClipboard: {
        enabled,
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

async function refreshSystemShortcutInspection() {
  if (!window.shortcutsApi) {
    shortcutInspection.value = null;
    return;
  }

  shortcutInspectionLoading.value = true;
  try {
    shortcutInspection.value = await window.shortcutsApi.inspectSystemShortcuts();
  } catch (error) {
    notifyError(error, '快捷键占用检测失败');
  } finally {
    shortcutInspectionLoading.value = false;
  }
}

function getSystemShortcutProbe(key: AppSystemShortcutKey) {
  return shortcutInspection.value?.actions.find((probe) => probe.actionKey === key) ?? null;
}

function getSystemShortcutMessage(key: AppSystemShortcutKey) {
  return shortcutValidationMessages.value[key] || getSystemShortcutProbe(key)?.message || '';
}

function getSystemShortcutStatus(key: AppSystemShortcutKey): ShortcutProbeStatus | '' {
  return shortcutValidationMessages.value[key] ? 'conflict' : getSystemShortcutProbe(key)?.status ?? '';
}

function shortcutStatusText(status: ShortcutProbeStatus | '') {
  switch (status) {
    case 'registered':
      return '已注册';
    case 'available':
      return '可注册';
    case 'conflict':
      return '冲突';
    case 'invalid':
      return '无效';
    case 'empty':
      return '未设置';
    default:
      return '待检测';
  }
}

function canRetrySystemShortcut(key: AppSystemShortcutKey) {
  const status = getSystemShortcutStatus(key);
  return status === 'available' || status === 'conflict';
}

async function retrySystemShortcut(key: AppSystemShortcutKey) {
  if (!window.shortcutsApi || shortcutRetryingKeys.value[key]) {
    return;
  }

  shortcutRetryingKeys.value = {
    ...shortcutRetryingKeys.value,
    [key]: true,
  };

  try {
    const result = await window.shortcutsApi.retrySystemShortcut({ actionKey: key });
    shortcutValidationMessages.value = {
      ...shortcutValidationMessages.value,
      [key]: result.ok ? '' : result.probe.message,
    };

    if (result.ok) {
      notifySuccess('快捷键已重新注册');
    } else {
      notifyError(new Error(result.probe.message), '快捷键重新注册失败');
    }
    await refreshSystemShortcutInspection();
  } catch (error) {
    notifyError(error, '快捷键重新注册失败');
    await refreshSystemShortcutInspection();
  } finally {
    shortcutRetryingKeys.value = {
      ...shortcutRetryingKeys.value,
      [key]: false,
    };
  }
}

async function updateSystemShortcut(
  key: keyof typeof defaultShortcuts.system,
  value: string,
) {
  if (window.shortcutsApi) {
    try {
      const validation = await window.shortcutsApi.validateSystemShortcut({
        actionKey: key,
        accelerator: value,
      });
      if (!validation.ok) {
        shortcutValidationMessages.value = {
          ...shortcutValidationMessages.value,
          [key]: validation.probe.message,
        };
        notifyError(new Error(validation.probe.message), '快捷键冲突');
        await refreshSystemShortcutInspection();
        return;
      }
    } catch (error) {
      notifyError(error, '快捷键冲突检测失败');
      await refreshSystemShortcutInspection();
      return;
    }
  }

  shortcutValidationMessages.value = {
    ...shortcutValidationMessages.value,
    [key]: '',
  };
  await appConfigStore.updateConfig({
    shortcuts: {
      system: {
        [key]: value,
      },
    },
  });
  await refreshSystemShortcutInspection();
}

async function toggleQuickLaunchProvider(providerId: QuickLaunchProviderId, enabled: boolean) {
  const current = appConfigStore.config.features.quickLaunch.enabledProviders ?? [];
  const next = enabled
    ? Array.from(new Set([...current, providerId]))
    : current.filter((item) => item !== providerId);

  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        enabledProviders: next.length ? next : ['internal-route'],
      },
    },
  });
}

async function toggleQuickLaunchEnabled(enabled: boolean) {
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        enabled,
      },
    },
  });
}

async function toggleQuickLaunchHideOnBlur(hideOnBlur: boolean) {
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        hideOnBlur,
      },
    },
  });
}

function normalizeQuickLaunchOpacityInput(value: number, fallback: number, min = 0) {
  return Number.isFinite(value)
    ? Number(Math.max(min, Math.min(1, value)).toFixed(2))
    : fallback;
}

function normalizeQuickLaunchColorInput(value: string, fallback = defaultQuickLaunchConfig.selectionColor) {
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed)
    ? trimmed
    : fallback;
}

async function commitQuickLaunchWindowOpacity(value = quickLaunchWindowOpacityInput.value) {
  const windowOpacity = normalizeQuickLaunchOpacityInput(
    value,
    defaultQuickLaunchConfig.windowOpacity,
    0.2,
  );
  quickLaunchWindowOpacityInput.value = windowOpacity;
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        windowOpacity,
      },
    },
  });
}

async function commitQuickLaunchSelectionColor() {
  const selectionColor = normalizeQuickLaunchColorInput(quickLaunchSelectionColorInput.value);
  quickLaunchSelectionColorInput.value = selectionColor;
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        selectionColor,
      },
    },
  });
}

async function commitQuickLaunchSelectionOpacity(value = quickLaunchSelectionOpacityInput.value) {
  const selectionOpacity = normalizeQuickLaunchOpacityInput(
    value,
    defaultQuickLaunchConfig.selectionOpacity,
  );
  quickLaunchSelectionOpacityInput.value = selectionOpacity;
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        selectionOpacity,
      },
    },
  });
}

async function commitQuickLaunchResultTitleColor() {
  const resultTitleColor = normalizeQuickLaunchColorInput(
    quickLaunchResultTitleColorInput.value,
    defaultQuickLaunchConfig.resultTitleColor,
  );
  quickLaunchResultTitleColorInput.value = resultTitleColor;
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        resultTitleColor,
      },
    },
  });
}

async function commitQuickLaunchResultSubtitleColor() {
  const resultSubtitleColor = normalizeQuickLaunchColorInput(
    quickLaunchResultSubtitleColorInput.value,
    defaultQuickLaunchConfig.resultSubtitleColor,
  );
  quickLaunchResultSubtitleColorInput.value = resultSubtitleColor;
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        resultSubtitleColor,
      },
    },
  });
}

async function commitQuickLaunchMaxResults() {
  const value = Number(quickLaunchMaxResultsInput.value);
  const maxResults = Number.isFinite(value)
    ? Math.max(4, Math.min(50, Math.round(value)))
    : 12;
  quickLaunchMaxResultsInput.value = String(maxResults);
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        maxResults,
      },
    },
  });
}

async function commitQuickLaunchEverythingEsPath() {
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        everythingEsPath: quickLaunchEverythingEsPathInput.value.trim(),
      },
    },
  });
}

async function selectQuickLaunchEverythingEsPath() {
  const filePath = await window.shellApi.selectFile({
    title: '选择 Everything ES 命令行工具',
    filters: [
      { name: 'Everything ES (es.exe)', extensions: ['exe'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    defaultPath: quickLaunchEverythingEsPathInput.value || undefined,
  });
  if (!filePath) return;
  quickLaunchEverythingEsPathInput.value = filePath;
  await commitQuickLaunchEverythingEsPath();
}

async function clearQuickLaunchEverythingEsPath() {
  quickLaunchEverythingEsPathInput.value = '';
  await commitQuickLaunchEverythingEsPath();
}

async function handleQuickLaunchBackgroundConfirm(payload: BackgroundConfirmPayload) {
  const current = appConfigStore.config.features.quickLaunch;
  const nextBackground = withThemeBackground({
    type: current.backgroundType,
    color: current.backgroundColor,
    image: current.backgroundImage,
    video: current.backgroundVideo,
    backgroundStyle: current.backgroundStyle,
  }, appConfigStore.config.appearance.theme, {
    type: payload.type,
    color: payload.color,
    image: payload.image,
    video: payload.video,
    backgroundStyle: payload.backgroundStyle,
  });

  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        backgroundType: nextBackground.type,
        backgroundColor: nextBackground.color,
        backgroundImage: nextBackground.image,
        backgroundVideo: nextBackground.video,
        backgroundStyle: nextBackground.backgroundStyle,
      },
    },
  });
  quickLaunchBackgroundPickerVisible.value = false;
}

async function resetQuickLaunchBackground() {
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        backgroundType: defaultQuickLaunchConfig.backgroundType,
        backgroundColor: defaultQuickLaunchConfig.backgroundColor,
        backgroundImage: defaultQuickLaunchConfig.backgroundImage,
        backgroundVideo: defaultQuickLaunchConfig.backgroundVideo,
        backgroundStyle: { ...defaultQuickLaunchConfig.backgroundStyle },
      },
    },
  });
  quickLaunchBackgroundPickerVisible.value = false;
}

async function loadKnowledgeLibraries() {
  try {
    knowledgeLibraries.value = await window.knowledgeApi?.listLibraries() ?? [];
  } catch (error) {
    notifyError(error, '知识库列表加载失败');
    knowledgeLibraries.value = [];
  }
}

async function updateKnowledgeDefaultLibrary(value: string) {
  await appConfigStore.updateConfig({
    features: {
      knowledge: {
        defaultLibraryId: value,
      },
    },
  });
}

async function updateKnowledgeAssetStorageMode(value: string) {
  await appConfigStore.updateConfig({
    features: {
      knowledge: {
        assetStorageMode: value === 'custom' ? 'custom' : 'app-data',
      },
    },
  });
}

async function selectKnowledgeAssetDirectory() {
  const directory = await window.shellApi.selectDirectory('选择知识库附件目录');
  if (!directory) return;
  knowledgeCustomAssetDirectoryInput.value = directory;
  await appConfigStore.updateConfig({
    features: {
      knowledge: {
        assetStorageMode: 'custom',
        customAssetDirectory: directory,
      },
    },
  });
}

async function clearKnowledgeAssetDirectory() {
  knowledgeCustomAssetDirectoryInput.value = '';
  await appConfigStore.updateConfig({
    features: {
      knowledge: {
        assetStorageMode: 'app-data',
        customAssetDirectory: '',
      },
    },
  });
}

async function selectKnowledgeLibreOfficePath() {
  const filePath = await window.shellApi.selectFile({
    title: '选择 LibreOffice 可执行文件',
    filters: [
      { name: '可执行文件', extensions: ['exe'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (!filePath) return;
  knowledgeLibreOfficePathInput.value = filePath;
  await commitKnowledgeLibreOfficePath();
}

async function clearKnowledgeLibreOfficePath() {
  knowledgeLibreOfficePathInput.value = '';
  await commitKnowledgeLibreOfficePath();
}

async function commitKnowledgeLibreOfficePath() {
  await appConfigStore.updateConfig({
    features: {
      knowledge: {
        libreOfficePath: knowledgeLibreOfficePathInput.value.trim(),
      },
    },
  });
}

async function toggleKnowledgeIndexing(enabled: boolean) {
  await appConfigStore.updateConfig({
    features: {
      knowledge: {
        indexingEnabled: enabled,
      },
    },
  });
}

async function commitKnowledgeMaxImportSize() {
  const numeric = Number(knowledgeMaxImportFileSizeMbInput.value);
  await appConfigStore.updateConfig({
    features: {
      knowledge: {
        maxImportFileSizeMb: Number.isFinite(numeric) ? numeric : createDefaultAppConfig().features.knowledge.maxImportFileSizeMb,
      },
    },
  });
}

async function commitKnowledgePreviewCacheTtl() {
  const numeric = Number(knowledgePreviewCacheTtlDaysInput.value);
  await appConfigStore.updateConfig({
    features: {
      knowledge: {
        previewCacheTtlDays: Number.isFinite(numeric) ? numeric : createDefaultAppConfig().features.knowledge.previewCacheTtlDays,
      },
    },
  });
}

async function clearKnowledgePreviewCache() {
  if (!window.knowledgeApi) return;
  knowledgeClearingCache.value = true;
  try {
    const result = await window.knowledgeApi.clearPreviewCache();
    notifySuccess(
      `已清理 ${result.removedFiles} 个缓存文件，释放 ${Math.round(result.removedBytes / 1024)} KB`,
      '知识库缓存',
    );
  } catch (error) {
    notifyError(error, '预览缓存清理失败');
  } finally {
    knowledgeClearingCache.value = false;
  }
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

watch(() => appConfigStore.config.features.knowledge.maxImportFileSizeMb, (value) => {
  knowledgeMaxImportFileSizeMbInput.value = String(value || 200);
}, { immediate: true });

watch(() => appConfigStore.config.features.knowledge.previewCacheTtlDays, (value) => {
  knowledgePreviewCacheTtlDaysInput.value = String(value ?? 30);
}, { immediate: true });

watch(() => appConfigStore.config.features.knowledge.libreOfficePath, (value) => {
  knowledgeLibreOfficePathInput.value = value || '';
}, { immediate: true });

watch(() => appConfigStore.config.features.knowledge.customAssetDirectory, (value) => {
  knowledgeCustomAssetDirectoryInput.value = value || '';
}, { immediate: true });

watch(() => appConfigStore.config.features.quickLaunch.maxResults, (value) => {
  quickLaunchMaxResultsInput.value = String(value || 12);
}, { immediate: true });

watch(() => appConfigStore.config.features.quickLaunch.everythingEsPath, (value) => {
  quickLaunchEverythingEsPathInput.value = value || '';
}, { immediate: true });

watch(() => appConfigStore.config.features.quickLaunch.windowOpacity, (value) => {
  quickLaunchWindowOpacityInput.value = normalizeQuickLaunchOpacityInput(
    value,
    defaultQuickLaunchConfig.windowOpacity,
    0.2,
  );
}, { immediate: true });

watch(() => appConfigStore.config.features.quickLaunch.selectionColor, (value) => {
  quickLaunchSelectionColorInput.value = normalizeQuickLaunchColorInput(value || defaultQuickLaunchConfig.selectionColor);
}, { immediate: true });

watch(() => appConfigStore.config.features.quickLaunch.selectionOpacity, (value) => {
  quickLaunchSelectionOpacityInput.value = normalizeQuickLaunchOpacityInput(
    value,
    defaultQuickLaunchConfig.selectionOpacity,
  );
}, { immediate: true });

watch(() => appConfigStore.config.features.quickLaunch.resultTitleColor, (value) => {
  quickLaunchResultTitleColorInput.value = normalizeQuickLaunchColorInput(
    value || defaultQuickLaunchConfig.resultTitleColor,
    defaultQuickLaunchConfig.resultTitleColor,
  );
}, { immediate: true });

watch(() => appConfigStore.config.features.quickLaunch.resultSubtitleColor, (value) => {
  quickLaunchResultSubtitleColorInput.value = normalizeQuickLaunchColorInput(
    value || defaultQuickLaunchConfig.resultSubtitleColor,
    defaultQuickLaunchConfig.resultSubtitleColor,
  );
}, { immediate: true });

watch(() => appConfigStore.config.features.aiAgent.agent.maxSteps, (value) => {
  agentMaxStepsInput.value = String(value || 5);
}, { immediate: true });

watch(
  [
    ftpExternalEditorPath,
    ftpCleanupExternalDraftsOnClose,
    ftpLinkNavigationEnabled,
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

watch(settingsSearchQuery, () => {
  if (isSearchingSettings.value) {
    for (const tab of settingsTabOrder) {
      scheduleSettingsTabLoad(tab);
    }
  }
  queueSettingsSearchFilter();
});

watch(
  [
    () => settingsStore.activeSettingsTab,
    () => installedPlugins.value.length,
    () => hostSummary.value,
    () => pluginLoadError.value,
  ],
  queueSettingsSearchFilter,
);

onMounted(() => {
  globalStore.setTopbarColor('');
  scheduleSettingsTabLoad(settingsStore.activeSettingsTab);
  queueSettingsSearchFilter();
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

function toggleNewScriptPermission(permission: string, enabled: boolean) {
  newScriptPermissions.value = enabled
    ? Array.from(new Set([...newScriptPermissions.value, permission]))
    : newScriptPermissions.value.filter(item => item !== permission);
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
  <UiScrollbar class="settings-page" :style="activeSettingsPageStyle" :x="false" :y="true" :size="8">
    <video
      v-if="activeSettingsBackgroundVideo && !isSearchingSettings"
      class="settings-page__background-video"
      :src="activeSettingsBackgroundVideo"
      autoplay
      muted
      loop
      playsinline
    />
    <header class="page-header">
      <div class="page-title-row">
        <h1>设置</h1>
        <div class="settings-search" role="search">
          <UiInput v-model="settingsSearchQuery" class="settings-search__input" type="search" placeholder="搜索设置" aria-label="搜索设置">
            <template #prefix>
              <span class="settings-search__icon" aria-hidden="true" />
            </template>
          </UiInput>
        </div>
      </div>
      <nav
        class="settings-nav"
        aria-label="设置分类"
      >
        <UiTabs
          :model-value="activeSettingsTabForView"
          :items="displayedSettingsTabs"
          variant="line"
          size="md"
          @update:modelValue="handleSettingsTabChange"
        />
      </nav>
    </header>

    <div class="page-body">
      <Transition :name="settingsTabTransition" mode="out-in" @after-enter="queueSettingsSearchFilter">
      <div
        :key="settingsContentKey"
        ref="settingsBodyRef"
        class="settings-content-stack"
        :class="{ 'settings-content-stack--search': isSearchingSettings }"
      >
      <section v-if="isSettingsTabRendered('general')" key="general" class="settings-section">
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

      <section v-if="isSettingsTabRendered('file-transfer')" key="file-transfer" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>文件传输</h2>
          <p>配置传输页浏览行为、缩略图、重试策略和主机信任。</p>
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
                <UiCheckbox v-model="ftpLinkNavigationEnabled" size="sm" />
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
          </section>

          <section class="settings-group">
            <h3>预览与传输</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>图片缩略图</span>
                <small>控制文件列表中的图片预览加载。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <UiCheckbox v-model="ftpThumbnailsEnabled" size="sm" />
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
                  <UiCheckbox v-model="ftpCleanupExternalDraftsOnClose" class="settings-check" size="sm">
                    关闭后清理临时文件
                  </UiCheckbox>
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

      <section v-if="isSettingsTabRendered('terminal')" key="terminal" class="settings-section">
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
                  <UiTextarea
                    v-model="localTerminalProfileForm.envText"
                    class="terminal-profile-editor__env"
                    :rows="4"
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
                <UiCheckbox
                  size="sm"
                  :checked="appConfigStore.config.features.terminal.enableBell"
                  @change="handleTerminalBellChange"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>图像扩展</span>
                <small>启用 sixel/图像扩展。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <UiCheckbox
                  size="sm"
                  :checked="appConfigStore.config.features.terminal.enableSixel"
                  @change="handleTerminalSixelChange"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>默认独立窗口</span>
                <small>优先在新窗口中拆分会话。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <UiCheckbox
                  size="sm"
                  :checked="appConfigStore.config.features.terminal.detachToWindowByDefault"
                  @change="handleTerminalDetachChange"
                />
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

      <section v-if="isSettingsTabRendered('multi-device-clipboard')" key="multi-device-clipboard" class="settings-section">
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
                <UiCheckbox
                  size="sm"
                  :checked="appConfigStore.config.features.multiDeviceClipboard.enabled"
                  @change="handleMultiDeviceClipboardEnabledChange"
                />
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

      <section v-if="isSettingsTabRendered('knowledge')" key="knowledge" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>知识库</h2>
          <p>配置默认库、附件保存策略、索引和预览缓存。</p>
        </div>

        <div class="settings-form">
          <section class="settings-group">
            <h3>默认行为</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>默认知识库</span>
                <small>未指定库的导入、粘贴附件会优先写入这里。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <UiSelect
                  :model-value="appConfigStore.config.features.knowledge.defaultLibraryId"
                  :options="knowledgeLibraryOptions"
                  @update:modelValue="updateKnowledgeDefaultLibrary"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>全文索引</span>
                <small>{{ knowledgeIndexingSummary }}</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <UiCheckbox
                  size="sm"
                  :checked="appConfigStore.config.features.knowledge.indexingEnabled"
                  @change="toggleKnowledgeIndexing"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>单文件导入上限</span>
                <small>超过上限的文件会被跳过，避免抽取或复制拖慢应用。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  v-model="knowledgeMaxImportFileSizeMbInput"
                  type="number"
                  :min="1"
                  :max="10240"
                  @blur="commitKnowledgeMaxImportSize"
                  @change="commitKnowledgeMaxImportSize"
                  @keydown.enter.prevent="commitKnowledgeMaxImportSize"
                />
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>附件目录</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>目录策略</span>
                <small>默认使用应用数据目录，自定义目录适合大体积资料库。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <UiSelect
                  :model-value="appConfigStore.config.features.knowledge.assetStorageMode"
                  :options="knowledgeAssetStorageOptions"
                  @update:modelValue="updateKnowledgeAssetStorageMode"
                />
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>自定义附件目录</span>
                <small>只影响后续新导入资产，已入库文件不会自动迁移。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="ffmpeg-path-row">
                  <div class="ffmpeg-path-display" :class="{ 'ffmpeg-path-display--empty': !knowledgeCustomAssetDirectoryInput }">
                    {{ knowledgeCustomAssetDirectoryInput || '未配置' }}
                  </div>
                  <UiButton variant="secondary" size="sm" @click="selectKnowledgeAssetDirectory">选择</UiButton>
                  <UiButton v-if="knowledgeCustomAssetDirectoryInput" variant="danger" size="sm" @click="clearKnowledgeAssetDirectory">清除</UiButton>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>预览与外部工具</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>LibreOffice 路径</span>
                <small>预留给后续 Office 高保真转换；当前轻量抽取不强制依赖。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="ffmpeg-path-row">
                  <div class="ffmpeg-path-display" :class="{ 'ffmpeg-path-display--empty': !knowledgeLibreOfficePathInput }">
                    {{ knowledgeLibreOfficePathInput || '未配置' }}
                  </div>
                  <UiButton variant="secondary" size="sm" @click="selectKnowledgeLibreOfficePath">选择</UiButton>
                  <UiButton v-if="knowledgeLibreOfficePathInput" variant="danger" size="sm" @click="clearKnowledgeLibreOfficePath">清除</UiButton>
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>预览缓存保留</span>
                <small>{{ knowledgePreviewCacheSummary }}</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  v-model="knowledgePreviewCacheTtlDaysInput"
                  type="number"
                  :min="0"
                  :max="3650"
                  @blur="commitKnowledgePreviewCacheTtl"
                  @change="commitKnowledgePreviewCacheTtl"
                  @keydown.enter.prevent="commitKnowledgePreviewCacheTtl"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>清理预览缓存</span>
                <small>只清理知识库预览缓存，不删除原始附件。</small>
              </div>
              <div class="settings-row__control">
                <UiButton variant="secondary" size="sm" :disabled="knowledgeClearingCache" @click="clearKnowledgePreviewCache">
                  {{ knowledgeClearingCache ? '清理中' : '立即清理' }}
                </UiButton>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section v-if="isSettingsTabRendered('quick-launch')" key="quick-launch" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>快速启动</h2>
          <p>配置全局唤起、显示行为、搜索结果数量、搜索源和 Everything 文件搜索。</p>
        </div>

        <div class="settings-form">
          <section class="settings-group">
            <h3>行为</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>启用快速启动</span>
                <small>关闭后全局快捷键不会唤出快速启动窗口。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <UiCheckbox
                  :checked="appConfigStore.config.features.quickLaunch.enabled"
                  @change="toggleQuickLaunchEnabled"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>失焦后隐藏</span>
                <small>窗口失去焦点时自动隐藏，适合命令面板式操作。</small>
              </div>
              <div class="settings-row__control settings-row__control--switch">
                <UiCheckbox
                  :checked="appConfigStore.config.features.quickLaunch.hideOnBlur"
                  @change="toggleQuickLaunchHideOnBlur"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>最大结果数</span>
                <small>限制每次搜索展示的总结果数量，范围 4-50。</small>
              </div>
              <div class="settings-row__control settings-row__control--compact">
                <UiInput
                  v-model="quickLaunchMaxResultsInput"
                  type="number"
                  :min="4"
                  :max="50"
                  size="sm"
                  @blur="commitQuickLaunchMaxResults"
                  @change="commitQuickLaunchMaxResults"
                  @keydown.enter.prevent="commitQuickLaunchMaxResults"
                />
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>外观</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>窗口背景</span>
                <small>使用通用背景组件配置快速启动窗口的颜色、图片或视频背景。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="quick-launch-background-control">
                  <span class="quick-launch-background-preview">
                    <span class="quick-launch-background-preview__fill" :style="quickLaunchBackgroundPreviewStyle" />
                  </span>
                  <span class="quick-launch-background-control__meta">
                    <strong>{{ quickLaunchBackgroundSummary }}</strong>
                    <small>{{ appConfigStore.config.appearance.theme === 'dark' ? '暗色主题配置' : '亮色主题配置' }}</small>
                  </span>
                  <UiButton type="button" variant="secondary" size="sm" @click="quickLaunchBackgroundPickerVisible = true">
                    配置
                  </UiButton>
                  <UiButton type="button" variant="ghost" size="sm" @click="resetQuickLaunchBackground">
                    重置
                  </UiButton>
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>窗口透明度</span>
                <small>调整快速启动窗口表面的透明度，不影响背景图片或视频自身透明度。</small>
              </div>
              <div class="settings-row__control">
                <UiSliderField
                  v-model="quickLaunchWindowOpacityInput"
                  :min="0.2"
                  :max="1"
                  :step="0.01"
                  :value-text="quickLaunchWindowOpacityLabel"
                  aria-label="快速启动窗口透明度"
                  @change="commitQuickLaunchWindowOpacity"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>选中状态颜色</span>
                <small>控制键盘或鼠标选中结果时的高亮基色。</small>
              </div>
              <div class="settings-row__control">
                <div class="quick-launch-color-control">
                  <input
                    v-model="quickLaunchSelectionColorInput"
                    class="quick-launch-color-input"
                    type="color"
                    aria-label="快速启动选中状态颜色"
                    @change="commitQuickLaunchSelectionColor"
                  >
                  <UiInput
                    v-model="quickLaunchSelectionColorInput"
                    size="sm"
                    spellcheck="false"
                    @blur="commitQuickLaunchSelectionColor"
                    @keydown.enter.prevent="commitQuickLaunchSelectionColor"
                  />
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>选中状态透明度</span>
                <small>控制结果高亮的覆盖强度，默认是轻量透明蓝。</small>
              </div>
              <div class="settings-row__control">
                <UiSliderField
                  v-model="quickLaunchSelectionOpacityInput"
                  :min="0"
                  :max="1"
                  :step="0.01"
                  :value-text="quickLaunchSelectionOpacityLabel"
                  aria-label="快速启动选中状态透明度"
                  @change="commitQuickLaunchSelectionOpacity"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>结果标题颜色</span>
                <small>控制搜索结果主标题文字颜色。</small>
              </div>
              <div class="settings-row__control">
                <div class="quick-launch-color-control">
                  <input
                    v-model="quickLaunchResultTitleColorInput"
                    class="quick-launch-color-input"
                    type="color"
                    aria-label="快速启动结果标题颜色"
                    @change="commitQuickLaunchResultTitleColor"
                  >
                  <UiInput
                    v-model="quickLaunchResultTitleColorInput"
                    size="sm"
                    spellcheck="false"
                    @blur="commitQuickLaunchResultTitleColor"
                    @keydown.enter.prevent="commitQuickLaunchResultTitleColor"
                  />
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>结果副标题颜色</span>
                <small>控制路径、来源和说明等辅助文字颜色。</small>
              </div>
              <div class="settings-row__control">
                <div class="quick-launch-color-control">
                  <input
                    v-model="quickLaunchResultSubtitleColorInput"
                    class="quick-launch-color-input"
                    type="color"
                    aria-label="快速启动结果副标题颜色"
                    @change="commitQuickLaunchResultSubtitleColor"
                  >
                  <UiInput
                    v-model="quickLaunchResultSubtitleColorInput"
                    size="sm"
                    spellcheck="false"
                    @blur="commitQuickLaunchResultSubtitleColor"
                    @keydown.enter.prevent="commitQuickLaunchResultSubtitleColor"
                  />
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>搜索源</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>启用的来源</span>
                <small>关闭不常用来源可以减少噪声，至少保留一个应用功能入口。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="quick-launch-provider-list">
                  <label
                    v-for="provider in quickLaunchProviderOptions"
                    :key="provider.value"
                    class="quick-launch-provider-item"
                  >
                    <UiCheckbox
                      size="sm"
                      :checked="appConfigStore.config.features.quickLaunch.enabledProviders.includes(provider.value)"
                      @change="toggleQuickLaunchProvider(provider.value, $event)"
                    />
                    <span>{{ provider.label }}</span>
                  </label>
                </div>
              </div>
            </div>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>Everything ES 路径</span>
                <small>文件搜索需要安装 Everything 主程序并配置 ES 命令行工具。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="quick-launch-es-path">
                  <UiInput
                    v-model="quickLaunchEverythingEsPathInput"
                    size="sm"
                    placeholder="留空自动探测 PATH 或常见安装目录中的 es.exe"
                    @blur="commitQuickLaunchEverythingEsPath"
                    @change="commitQuickLaunchEverythingEsPath"
                    @keydown.enter.prevent="commitQuickLaunchEverythingEsPath"
                  />
                  <UiButton type="button" variant="secondary" size="sm" @click="selectQuickLaunchEverythingEsPath">
                    选择
                  </UiButton>
                  <UiButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="!quickLaunchEverythingEsPathInput"
                    @click="clearQuickLaunchEverythingEsPath"
                  >
                    清除
                  </UiButton>
                </div>
                <p class="quick-launch-es-path__hint">
                  缺失时 QuickLaunch 会提示确认是否已安装 Everything 应用和命令行 ES；配置后按 Ctrl+R 可刷新快速启动索引。
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section v-if="isSettingsTabRendered('shortcuts')" key="shortcuts" class="settings-section">
        <div class="section-head section-head--standalone">
          <h2>快捷键</h2>
          <p>配置终端、速记窗口和系统级显示隐藏快捷键。</p>
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
            <h3>速记窗口</h3>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>保存速记</span>
                <small>速记窗口聚焦时生效，默认 Ctrl+S。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.internal.quickNoteSave"
                  :default-value="defaultShortcuts.internal.quickNoteSave"
                  @update:modelValue="updateInternalShortcut('quickNoteSave', $event)"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>新建速记</span>
                <small>清空当前草稿并开始新记录，默认 Ctrl+N。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.internal.quickNoteNew"
                  :default-value="defaultShortcuts.internal.quickNoteNew"
                  @update:modelValue="updateInternalShortcut('quickNoteNew', $event)"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>收起/展开</span>
                <small>在编辑窗口和标题条之间切换，默认 Ctrl+M。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.internal.quickNoteCollapse"
                  :default-value="defaultShortcuts.internal.quickNoteCollapse"
                  @update:modelValue="updateInternalShortcut('quickNoteCollapse', $event)"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>关闭窗口</span>
                <small>隐藏速记窗口，默认 Escape。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.internal.quickNoteClose"
                  :default-value="defaultShortcuts.internal.quickNoteClose"
                  @update:modelValue="updateInternalShortcut('quickNoteClose', $event)"
                />
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>快速启动窗口快捷键</h3>
            <div class="settings-row settings-row--wide">
              <div class="settings-row__label">
                <span>固定操作</span>
                <small>只在快速启动窗口聚焦时生效，当前版本不支持修改。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <div class="quick-launch-shortcut-map" aria-label="快速启动窗口快捷键">
                  <section
                    v-for="group in quickLaunchWindowShortcutGroups"
                    :key="group.title"
                    class="quick-launch-shortcut-map__group"
                  >
                    <h4 class="quick-launch-shortcut-map__title">{{ group.title }}</h4>
                    <div class="quick-launch-shortcut-map__list">
                      <div
                        v-for="shortcut in group.shortcuts"
                        :key="`${group.title}:${shortcut.label}`"
                        class="quick-launch-shortcut-map__row"
                      >
                        <span class="quick-launch-shortcut-map__label">{{ shortcut.label }}</span>
                        <kbd class="quick-launch-shortcut-map__keys">{{ shortcut.keys }}</kbd>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>系统</h3>
            <div class="shortcut-detection-panel">
              <div class="shortcut-detection-panel__head">
                <div>
                  <strong>系统快捷键占用检测</strong>
                  <small>检测本应用注册状态，并探测当前平台常见全局快捷键占用。</small>
                </div>
                <UiButton
                  variant="secondary"
                  size="sm"
                  :disabled="shortcutInspectionLoading"
                  @click="refreshSystemShortcutInspection"
                >
                  {{ shortcutInspectionLoading ? '检测中' : '重新检测' }}
                </UiButton>
              </div>
              <div class="shortcut-detection-panel__summary">
                <span>已注册 {{ shortcutRegisteredCount }}</span>
                <span>冲突 {{ shortcutConflictCount }}</span>
                <span>可注册 {{ shortcutAvailableCount }}</span>
                <span>{{ shortcutInspectionTimeText }}</span>
              </div>
              <div v-if="highlightedCommonShortcutProbes.length" class="shortcut-probe-list">
                <span
                  v-for="probe in highlightedCommonShortcutProbes"
                  :key="probe.id"
                  class="shortcut-probe-chip"
                  :class="`shortcut-probe-chip--${probe.status}`"
                  :title="probe.message"
                >
                  {{ probe.label }} · {{ probe.normalizedAccelerator || probe.accelerator }} · {{ shortcutStatusText(probe.status) }}
                </span>
              </div>
            </div>
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
                <div class="shortcut-status-row">
                  <p
                    class="shortcut-status"
                    :class="`shortcut-status--${getSystemShortcutStatus('toggleAppVisibility') || 'pending'}`"
                  >
                    {{ shortcutStatusText(getSystemShortcutStatus('toggleAppVisibility')) }}：{{ getSystemShortcutMessage('toggleAppVisibility') || '等待检测结果。' }}
                  </p>
                  <UiButton
                    v-if="canRetrySystemShortcut('toggleAppVisibility')"
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="Boolean(shortcutRetryingKeys.toggleAppVisibility)"
                    @click="retrySystemShortcut('toggleAppVisibility')"
                  >
                    {{ shortcutRetryingKeys.toggleAppVisibility ? '正在注册' : '重新注册' }}
                  </UiButton>
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>快速启动</span>
                <small>系统级快捷键，默认 Alt+Space 唤出搜索面板。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.system.toggleQuickLaunch"
                  :default-value="defaultShortcuts.system.toggleQuickLaunch"
                  @update:modelValue="updateSystemShortcut('toggleQuickLaunch', $event)"
                />
                <div class="shortcut-status-row">
                  <p
                    class="shortcut-status"
                    :class="`shortcut-status--${getSystemShortcutStatus('toggleQuickLaunch') || 'pending'}`"
                  >
                    {{ shortcutStatusText(getSystemShortcutStatus('toggleQuickLaunch')) }}：{{ getSystemShortcutMessage('toggleQuickLaunch') || '等待检测结果。' }}
                  </p>
                  <UiButton
                    v-if="canRetrySystemShortcut('toggleQuickLaunch')"
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="Boolean(shortcutRetryingKeys.toggleQuickLaunch)"
                    @click="retrySystemShortcut('toggleQuickLaunch')"
                  >
                    {{ shortcutRetryingKeys.toggleQuickLaunch ? '正在注册' : '重新注册' }}
                  </UiButton>
                </div>
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
                <div class="shortcut-status-row">
                  <p
                    class="shortcut-status"
                    :class="`shortcut-status--${getSystemShortcutStatus('toggleMultiDeviceClipboard') || 'pending'}`"
                  >
                    {{ shortcutStatusText(getSystemShortcutStatus('toggleMultiDeviceClipboard')) }}：{{ getSystemShortcutMessage('toggleMultiDeviceClipboard') || '等待检测结果。' }}
                  </p>
                  <UiButton
                    v-if="canRetrySystemShortcut('toggleMultiDeviceClipboard')"
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="Boolean(shortcutRetryingKeys.toggleMultiDeviceClipboard)"
                    @click="retrySystemShortcut('toggleMultiDeviceClipboard')"
                  >
                    {{ shortcutRetryingKeys.toggleMultiDeviceClipboard ? '正在注册' : '重新注册' }}
                  </UiButton>
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>知识库速记</span>
                <small>系统级快捷键，默认 Ctrl+Alt+N 唤出速记窗口。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.system.toggleQuickNote"
                  :default-value="defaultShortcuts.system.toggleQuickNote"
                  @update:modelValue="updateSystemShortcut('toggleQuickNote', $event)"
                />
                <div class="shortcut-status-row">
                  <p
                    class="shortcut-status"
                    :class="`shortcut-status--${getSystemShortcutStatus('toggleQuickNote') || 'pending'}`"
                  >
                    {{ shortcutStatusText(getSystemShortcutStatus('toggleQuickNote')) }}：{{ getSystemShortcutMessage('toggleQuickNote') || '等待检测结果。' }}
                  </p>
                  <UiButton
                    v-if="canRetrySystemShortcut('toggleQuickNote')"
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="Boolean(shortcutRetryingKeys.toggleQuickNote)"
                    @click="retrySystemShortcut('toggleQuickNote')"
                  >
                    {{ shortcutRetryingKeys.toggleQuickNote ? '正在注册' : '重新注册' }}
                  </UiButton>
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__label">
                <span>剪贴板转速记</span>
                <small>系统级快捷键，默认 Ctrl+Alt+Shift+N 捕获当前剪贴板文本。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.system.captureClipboardToQuickNote"
                  :default-value="defaultShortcuts.system.captureClipboardToQuickNote"
                  @update:modelValue="updateSystemShortcut('captureClipboardToQuickNote', $event)"
                />
                <div class="shortcut-status-row">
                  <p
                    class="shortcut-status"
                    :class="`shortcut-status--${getSystemShortcutStatus('captureClipboardToQuickNote') || 'pending'}`"
                  >
                    {{ shortcutStatusText(getSystemShortcutStatus('captureClipboardToQuickNote')) }}：{{ getSystemShortcutMessage('captureClipboardToQuickNote') || '等待检测结果。' }}
                  </p>
                  <UiButton
                    v-if="canRetrySystemShortcut('captureClipboardToQuickNote')"
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="Boolean(shortcutRetryingKeys.captureClipboardToQuickNote)"
                    @click="retrySystemShortcut('captureClipboardToQuickNote')"
                  >
                    {{ shortcutRetryingKeys.captureClipboardToQuickNote ? '正在注册' : '重新注册' }}
                  </UiButton>
                </div>
              </div>
            </div>
            <div
              v-for="row in detachedWindowShortcutRows"
              :key="row.key"
              class="settings-row"
            >
              <div class="settings-row__label">
                <span>{{ row.label }}</span>
                <small>{{ row.description }}</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <ShortcutRecorder
                  :model-value="appConfigStore.config.shortcuts.system[row.key]"
                  :default-value="defaultShortcuts.system[row.key]"
                  @update:modelValue="updateSystemShortcut(row.key, $event)"
                />
                <div class="shortcut-status-row">
                  <p
                    class="shortcut-status"
                    :class="`shortcut-status--${getSystemShortcutStatus(row.key) || 'pending'}`"
                  >
                    {{ shortcutStatusText(getSystemShortcutStatus(row.key)) }}：{{ getSystemShortcutMessage(row.key) || '等待检测结果。' }}
                  </p>
                  <UiButton
                    v-if="canRetrySystemShortcut(row.key)"
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="Boolean(shortcutRetryingKeys[row.key])"
                    @click="retrySystemShortcut(row.key)"
                  >
                    {{ shortcutRetryingKeys[row.key] ? '正在注册' : '重新注册' }}
                  </UiButton>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section v-if="isSettingsTabRendered('ai-agent')" key="ai-agent" class="settings-section settings-section--ai">
        <div class="section-head section-head--standalone">
          <h2>AI</h2>
          <p>模型接入、问答默认参数、知识检索和 Agent 预留策略。</p>
        </div>

        <AiSettingsPanel class="settings-ai-panel" @open-provider-drawer="openAiProviderDrawer" />

        <div class="cards-grid cards-grid--1col">
          <div class="settings-card ui-glass-surface ui-glass-surface--strong">
            <div class="settings-card__head">
              <span class="settings-card__icon">🤖</span>
              <h3>入口策略</h3>
            </div>
            <div class="settings-card__fields">
              <div class="settings-row">
                <div class="settings-row__label">
                  <span>启用 AI 功能</span>
                  <small>控制 AI 问答和后续 Agent 入口是否可用。</small>
                </div>
                <div class="settings-row__control settings-row__control--switch">
                  <UiCheckbox
                    size="sm"
                    :checked="appConfigStore.config.features.aiAgent.enabled"
                    @change="handleAiFeatureEnabledChange"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span>默认入口</span>
                  <small>打开 AI 模块时优先使用的交互模式。</small>
                </div>
                <div class="settings-row__control">
                  <UiSelect
                    :model-value="appConfigStore.config.features.aiAgent.defaultMode"
                    :options="aiDefaultModeOptions"
                    @change="handleAiDefaultModeChange"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card ui-glass-surface ui-glass-surface--strong">
            <div class="settings-card__head">
              <span class="settings-card__icon">🔐</span>
              <h3>工具权限</h3>
            </div>
            <div class="settings-card__fields">
              <div class="settings-row">
                <div class="settings-row__label">
                  <span>开放 Agent 入口</span>
                  <small>开启后 AI 页面显示 Agent 预留工作区；本版本仍不执行工具。</small>
                </div>
                <div class="settings-row__control settings-row__control--switch">
                  <UiCheckbox
                    size="sm"
                    :checked="appConfigStore.config.features.aiAgent.agent.enabled"
                    @change="updateAiAgentReservedSettings({ enabled: $event })"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span>默认 Agent 类型</span>
                  <small>后续进入 Agent 模式时默认选中的执行器。</small>
                </div>
                <div class="settings-row__control">
                  <UiSelect
                    :model-value="appConfigStore.config.features.aiAgent.agent.defaultAgentMode"
                    :options="aiAgentModeOptions"
                    @change="handleAiAgentDefaultModeChange"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span>最大步骤</span>
                  <small>限制 Agent 循环步数，当前保存为预留策略。</small>
                </div>
                <div class="settings-row__control settings-row__control--compact">
                  <UiInput
                    v-model="agentMaxStepsInput"
                    type="number"
                    :min="1"
                    :max="32"
                    @blur="commitAiAgentMaxSteps"
                    @change="commitAiAgentMaxSteps"
                    @keydown.enter.prevent="commitAiAgentMaxSteps"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span>写入类工具确认</span>
                  <small>后续文件写入、命令执行等工具默认需要确认。</small>
                </div>
                <div class="settings-row__control settings-row__control--switch">
                  <UiCheckbox
                    size="sm"
                    :checked="appConfigStore.config.features.aiAgent.agent.requireApprovalForWriteTools"
                    @change="updateAiAgentReservedSettings({ requireApprovalForWriteTools: $event })"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card ui-glass-surface ui-glass-surface--strong">
            <div class="settings-card__head">
              <span class="settings-card__icon">🧩</span>
              <h3>Agent 执行器预留</h3>
            </div>
            <div class="settings-card__fields">
              <div class="settings-row">
                <div class="settings-row__label">
                  <span>通用 Agent</span>
                  <small>预留给自定义提示词、工具集合和任务模板。</small>
                </div>
                <div class="settings-row__control settings-row__control--switch">
                  <UiCheckbox
                    size="sm"
                    :checked="appConfigStore.config.features.aiAgent.agent.general.enabled"
                    @change="updateAiAgentReservedSettings({
                      general: {
                        ...appConfigStore.config.features.aiAgent.agent.general,
                        enabled: $event,
                      },
                    })"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span>Code Agent</span>
                  <small>预留给后续 Codex SDK，不在本版本执行代码或命令。</small>
                </div>
                <div class="settings-row__control settings-row__control--switch">
                  <UiCheckbox
                    size="sm"
                    :checked="appConfigStore.config.features.aiAgent.agent.codex.enabled"
                    @change="updateAiAgentReservedSettings({
                      codex: {
                        ...appConfigStore.config.features.aiAgent.agent.codex,
                        enabled: $event,
                      },
                    })"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__label">
                  <span>Git 仓库检查</span>
                  <small>关闭时 Code Agent 运行前需要确认工作目录是 Git 仓库。</small>
                </div>
                <div class="settings-row__control settings-row__control--switch">
                  <UiCheckbox
                    size="sm"
                    :checked="appConfigStore.config.features.aiAgent.agent.codex.skipGitRepoCheck"
                    @change="updateAiAgentReservedSettings({
                      codex: {
                        ...appConfigStore.config.features.aiAgent.agent.codex,
                        skipGitRepoCheck: $event,
                      },
                    })"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="isSettingsTabRendered('plugins')" key="plugins" class="settings-section">
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
                <UiTextarea v-model="pluginConfigDrafts[activePlugin.manifest.id]" class="plugin-json-editor"
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

      <section v-if="isSettingsTabRendered('web-security')" key="web-security" class="settings-section">
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
                <span>运行中的保活页面</span>
                <small>显示当前仍保留 WebView 状态的页面，可恢复或关闭释放。</small>
              </div>
              <div class="settings-row__control settings-row__control--wide">
                <WebViewKeepAliveList />
              </div>
            </div>
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
                      <UiCheckbox
                        class="web-extension-item__toggle"
                        size="sm"
                        :checked="ext.enabled"
                        @change="toggleExtension(ext.id, !ext.enabled)"
                      >
                        {{ ext.enabled ? '已启用' : '已禁用' }}
                      </UiCheckbox>
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
                      <UiCheckbox
                        class="web-script-item__toggle"
                        size="sm"
                        :checked="script.enabled"
                        @change="toggleScript(script.id)"
                      >
                        {{ script.enabled ? '已启用' : '已禁用' }}
                      </UiCheckbox>
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
                        <UiCheckbox
                          v-for="perm in ['network', 'storage', 'clipboard']"
                          :key="perm"
                          class="web-add-script-form__perm-label"
                          size="sm"
                          :checked="newScriptPermissions.includes(perm)"
                          @change="toggleNewScriptPermission(perm, $event)"
                        >
                          {{ perm === 'network' ? '网络请求' : perm === 'storage' ? '本地存储' : '剪贴板' }}
                        </UiCheckbox>
                      </div>
                    </UiField>
                  </div>
                  <UiField label="内容">
                    <UiTextarea v-model="newScriptContent" class="web-script-editor" :rows="6"
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
      <div v-if="isSearchingSettings && !settingsSearchHasMatches" class="settings-search-empty">
        未找到匹配的设置项
      </div>
      </div>
      </Transition>
    </div>

    <UiPersonalizationConfig
      :visible="quickLaunchBackgroundPickerVisible"
      title="快速启动窗口背景"
      :current-background="activeQuickLaunchBackground.type === 'color' ? activeQuickLaunchBackground.color : ''"
      :current-background-image="activeQuickLaunchBackground.type === 'image' ? activeQuickLaunchBackground.image : ''"
      :current-background-video="activeQuickLaunchBackground.type === 'video' ? activeQuickLaunchBackground.video : ''"
      :current-background-style="activeQuickLaunchBackground.backgroundStyle"
      :enabled-features="['color', 'image', 'video', 'opacity', 'blur', 'textColor']"
      :show-reset="true"
      :preview-width="720"
      :preview-height="460"
      :fill-viewport="true"
      reset-text="恢复默认背景"
      @close="quickLaunchBackgroundPickerVisible = false"
      @confirm="handleQuickLaunchBackgroundConfirm"
      @reset="resetQuickLaunchBackground"
    />

    <AiProviderDrawer
      v-if="activeSettingsTabForView === 'ai-agent' && !isSearchingSettings"
      v-model="aiProviderDrawerVisible"
      v-model:provider-id="editingAiProviderId"
      :teleported="false"
      :fixed="false"
    />

  </UiScrollbar>
</template>

<style lang="scss" scoped>
.settings-page {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  color: var(--ui-text-primary);
  background: var(--background-color);
  overflow: hidden;
}

.settings-page::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 18% -10%, color-mix(in srgb, #66CCFF 22%, transparent) 0%, transparent 36%),
    radial-gradient(circle at 86% 8%, color-mix(in srgb, #66CCFF 10%, transparent) 0%, transparent 30%),
    linear-gradient(180deg, color-mix(in srgb, var(--background-color) 92%, #66CCFF 8%) 0%, var(--background-color) 72%);
}

.settings-page__background-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  z-index: 0;
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
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--background-color) 68%, #66CCFF 7%) 0%, color-mix(in srgb, var(--background-color) 72%, transparent) 100%);
  padding: 12px 24px 0;
  box-sizing: border-box;
}

.page-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;

  h1 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-2xl);
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: 0;
  }
}

.settings-search {
  position: relative;
  width: min(300px, 36vw);
  flex: 0 1 auto;

  :deep(.settings-search__input) {
    width: 100%;
    min-height: 36px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 70%, rgba(80, 96, 118, 0.25));
    border-radius: 6px;
    background: color-mix(in srgb, var(--ui-input-bg) 88%, transparent);
    color: var(--ui-input-text);
    font: inherit;
    font-size: var(--ui-font-size-md);
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

  :deep(.settings-search__input .ui-input) {
    font-size: var(--ui-font-size-md);
  }
}

.settings-search__icon {
  position: relative;
  width: 14px;
  height: 14px;
  border: 2px solid var(--ui-text-muted);
  border-radius: 50%;
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
  margin: 8px auto 0;
  border-bottom: 1px solid var(--ui-border-subtle);

  :deep(.ui-tabs) {
    display: flex;
    gap: 10px;
    border-bottom: 0;
  }

  :deep(.ui-tabs__item) {
    min-height: 34px;
    padding: 0 8px;
    color: color-mix(in srgb, var(--ui-text-primary) 70%, transparent);
    font-size: var(--ui-font-size-md);
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
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 12px 28px 42px;
  box-sizing: border-box;
  overflow-x: hidden;
}

.settings-content-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-content-stack--search {
  gap: 24px;
}

.is-search-hidden,
.settings-section--search-empty {
  display: none !important;
}

:global(::highlight(settings-search-match)) {
  color: var(--ui-text-primary);
  background: color-mix(in srgb, #facc15 42%, transparent);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, #f59e0b 62%, transparent);
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}

.settings-search-empty {
  padding: 34px 18px;
  border: 1px dashed var(--ui-border-subtle);
  border-radius: 8px;
  color: var(--ui-text-muted);
  text-align: center;
  background: color-mix(in srgb, var(--ui-surface-panel) 74%, transparent);
}

/* ─── Section ─── */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-ai-panel {
  min-width: 0;
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
    font-size: var(--ui-font-size-xl);
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
    font-size: var(--ui-font-size-md);
    font-weight: 500;
    line-height: 1.35;
  }

  small {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
    font-weight: 400;
    line-height: 1.35;
  }
}

.settings-row__control {
  min-width: 0;
  width: 100%;
}

.clipboard-device-panel,
.quick-launch-provider-list,
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

.quick-launch-provider-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.quick-launch-provider-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-panel-bg) 92%, transparent);
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-size-sm);
}

.quick-launch-background-control {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
}

.quick-launch-background-preview {
  display: block;
  width: 58px;
  height: 38px;
  padding: 3px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  background:
    linear-gradient(45deg, rgba(148, 163, 184, 0.18) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(148, 163, 184, 0.18) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.18) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.18) 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
  box-sizing: border-box;
}

.quick-launch-background-preview__fill {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background: rgba(250, 252, 255, 0.96);
}

.quick-launch-background-control__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-sm);
    font-weight: 600;
    line-height: 1.35;
  }

  small {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
    line-height: 1.35;
  }
}

.quick-launch-color-control {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  width: 100%;
}

.quick-launch-color-input {
  width: 42px;
  height: var(--ui-control-height-sm);
  padding: 3px;
  border: 1px solid var(--ui-input-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-input-bg);
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }
}

.quick-launch-es-path {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.quick-launch-es-path__hint {
  margin: 8px 0 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;
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
    font-size: var(--ui-font-size-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-xs);
  line-height: 1.45;
}

.quick-launch-shortcut-map {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}

.quick-launch-shortcut-map__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.quick-launch-shortcut-map__title {
  margin: 0;
  color: var(--ui-text-primary);
  font-size: var(--ui-font-size-sm);
  font-weight: 700;
  line-height: 1.35;
}

.quick-launch-shortcut-map__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.quick-launch-shortcut-map__row {
  display: grid;
  grid-template-columns: minmax(96px, 0.72fr) minmax(150px, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-input-bg) 92%, transparent);
  box-sizing: border-box;
}

.quick-launch-shortcut-map__label {
  min-width: 0;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-size-xs);
  line-height: 1.35;
}

.quick-launch-shortcut-map__keys {
  justify-self: end;
  max-width: 100%;
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 84%, var(--ui-text-muted) 16%);
  border-radius: 5px;
  background: color-mix(in srgb, var(--ui-panel-bg) 94%, transparent);
  color: var(--ui-text-primary);
  font-family: var(--ui-font-family-mono, "Geist Mono", Consolas, monospace);
  font-size: var(--ui-font-size-xs);
  font-weight: 600;
  line-height: 1.4;
  text-align: right;
  white-space: normal;
  overflow-wrap: anywhere;
}

.shortcut-detection-panel {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  margin-bottom: 6px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-panel-bg) 92%, transparent);
}

.shortcut-detection-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  strong {
    display: block;
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-sm);
    font-weight: 700;
    line-height: 1.35;
  }

  small {
    display: block;
    margin-top: 2px;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
    line-height: 1.45;
  }
}

.shortcut-detection-panel__summary,
.shortcut-probe-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.shortcut-detection-panel__summary span,
.shortcut-probe-chip {
  min-height: 22px;
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-input-bg) 92%, transparent);
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-size-xs);
  line-height: 1.45;
  box-sizing: border-box;
}

.shortcut-probe-chip {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut-probe-chip--registered,
.shortcut-status--registered {
  color: var(--ui-success-color, #16a34a);
}

.shortcut-probe-chip--available,
.shortcut-status--available {
  color: color-mix(in srgb, #0b67d8 84%, var(--ui-text-primary));
}

.shortcut-probe-chip--conflict,
.shortcut-probe-chip--invalid,
.shortcut-status--conflict,
.shortcut-status--invalid {
  color: var(--ui-danger-color, #dc2626);
}

.shortcut-probe-chip--empty,
.shortcut-status--empty,
.shortcut-status--pending {
  color: var(--ui-text-muted);
}

.shortcut-status {
  margin: 6px 0 0;
  font-size: var(--ui-font-size-xs);
  line-height: 1.45;
}

.shortcut-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  margin-top: 6px;

  .shortcut-status {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
  }
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
    font-size: var(--ui-font-size-sm);
  }

  span,
  small {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
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
    font-size: var(--ui-font-size-lg);
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
  font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-xs);
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

  span { color: var(--ui-text-muted); font-size: var(--ui-font-size-xs); }
  strong { word-break: break-word; font-size: var(--ui-font-size-sm); }
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
    padding: 10px 16px 0;
  }

  .page-title-row {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;

    h1 {
      font-size: var(--ui-font-size-xl);
    }
  }

  .settings-search {
    width: 100%;
  }

  .settings-nav {
    margin-top: 8px;
    overflow-x: auto;
  }

  .page-body {
    padding: 10px 16px 28px;
  }

  .settings-group {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 16px 0;
  }

  .shortcut-detection-panel {
    grid-column: 1;
  }

  .quick-launch-shortcut-map {
    grid-template-columns: 1fr;
  }

  .quick-launch-shortcut-map__row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .quick-launch-shortcut-map__keys {
    justify-self: start;
    text-align: left;
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
  font-size: var(--ui-font-size-sm);
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
  font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-sm);

  :deep(.ui-checkbox__label) {
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-sm);
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
  font-size: var(--ui-font-size-sm);
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
  font-size: var(--ui-font-size-sm);
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
  font-size: var(--ui-font-size-sm);
  font-weight: 700;
}

.settings-known-host__meta,
.settings-known-host__fingerprint {
  margin-top: 3px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.settings-known-host__fingerprint {
  overflow-wrap: anywhere;
  font-family: var(--ui-font-family-mono);
}

.ffmpeg-status {
  margin-top: 6px;
  font-size: var(--ui-font-size-xs);
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
    font-size: var(--ui-font-size-sm);
  }

  span {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-xs);

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
  font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-sm);
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
  font-size: var(--ui-font-size-xs);
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
  font-family: var(--ui-font-family-mono);
  font-size: var(--ui-font-size-sm);
}

.web-domain-empty {
  padding: 12px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-sm);
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
  font-size: var(--ui-font-size-xs);
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
  font-family: var(--ui-font-family-mono);
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-muted);
  flex: 1;
}

.web-script-item__toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-muted);

  :deep(.ui-checkbox__label) {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-secondary);

  :deep(.ui-checkbox__label) {
    color: var(--ui-text-secondary);
    font-size: var(--ui-font-size-xs);
  }
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
  font-size: var(--ui-font-size-xs);
  font-weight: 400;
  font-style: normal;
  font-variant: normal;
  font-family: var(--ui-font-family-mono);
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
  font-size: var(--ui-font-size-sm);
  color: var(--ui-text-primary);
}

.web-extension-item__meta {
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-muted);
}

.web-extension-item__desc {
  font-size: var(--ui-font-size-xs);
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
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-secondary);

  :deep(.ui-checkbox__label) {
    color: var(--ui-text-secondary);
    font-size: var(--ui-font-size-xs);
  }
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
