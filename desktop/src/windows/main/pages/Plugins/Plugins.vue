<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { registerPluginRoutes } from '../../routes/router';
import { useGlobalStore } from '../../stores/global_store';
import { bottombarHeight, topbarHeight } from '../../constants/layout';
import type {
  InstalledPluginRecord,
  MarketplaceCacheRecord,
  MarketplacePluginSummary,
  PluginInstallPhase,
  PluginInstallProgress,
  PluginPageDescriptor,
  PluginDevSession,
} from '@/contracts/plugin_host';
import type { JobRecord } from '@/contracts/plugin_media';
import UiButton from '../../components/ui/UiButton.vue';
import UiDrawer from '../../components/ui/UiDrawer.vue';
import UiInput from '../../components/ui/UiInput.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import UiSwitch from '../../components/ui/UiSwitch.vue';
import UiTabs from '../../components/ui/UiTabs.vue';
import UiDisclosure from '../../components/ui/UiDisclosure.vue';
import UiTagChip from '../../components/ui/UiTagChip.vue';
import UiScrollbar from '../../components/ui/UiScrollbar.vue';
import PluginPagination from './PluginPagination.vue';
import PluginActionIcon from './PluginActionIcon.vue';
import { notifyError } from '../../composables/useInAppNotification';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import PluginPermissionDialog from './PluginPermissionDialog.vue';
import { getPluginPageDescriptors } from './plugin_page_links';
import { useBarStore } from '../../stores/bar_store';
import { syncRouteToBottomBar } from '../../route_tab_sync';
import PluginJobPanel from './PluginJobPanel.vue';
import PluginDebugPanel from './PluginDebugPanel.vue';
import { serializeApprovedPermissions } from './plugin_install_serialization';

type PluginTab = 'installed' | 'marketplace';
type InstallMethod = 'npm' | 'local' | 'git';
type PluginViewMode = 'cards' | 'list';
type PluginStatusFilter = 'all' | 'enabled' | 'updatable' | 'disabled';
type PluginCategory = 'all' | 'devops' | 'productivity' | 'ai' | 'network';
type MarketplaceSort = 'catalog' | 'version' | 'name';
type PluginDetailTab = 'overview' | 'permissions' | 'changelog' | 'settings';

const DEFAULT_MARKETPLACE_ID = 'sakurapole';
const DEFAULT_MARKETPLACE_URL =
  'https://raw.githubusercontent.com/Sakurapole/guyantools-plugin-marketplace/main/catalog.json';
const DEFAULT_MARKETPLACE_REF = 'main';

const router = useRouter();
const globalStore = useGlobalStore();
const barStore = useBarStore();
const { show: showConfirmDialog } = useConfirmDialog();

const activeTab = ref<PluginTab>('installed');
const viewMode = ref<PluginViewMode>('cards');
const installedPage = ref(1);
const installedPageSize = ref(12);
const marketplacePage = ref(1);
const marketplacePageSize = ref(12);
const drawerOffsetStyle = {
  '--gt-drawer-top-offset': `${topbarHeight}px`,
  '--gt-drawer-bottom-offset': `${bottombarHeight}px`,
};
const statusFilter = ref<PluginStatusFilter>('all');
const categoryFilter = ref<PluginCategory>('all');
const marketplaceSort = ref<MarketplaceSort>('catalog');
const pluginDirectory = ref('');
const installedQuery = ref('');
const installDrawerVisible = ref(false);
const installMethod = ref<InstallMethod>('local');
const selectedPluginId = ref<string | null>(null);
const detailDrawerVisible = ref(false);
const detailTab = ref<PluginDetailTab>('overview');
const plugins = ref<InstalledPluginRecord[]>([]);
const pages = ref<PluginPageDescriptor[]>([]);
const marketplaces = ref<MarketplaceCacheRecord[]>([]);
const jobsByPlugin = ref<Record<string, JobRecord[]>>({});
const packageName = ref('');
const localPath = ref('');
const localDevPath = ref('');
const gitUrl = ref('');
const gitRef = ref('');
const gitRefType = ref<'branch' | 'tag' | 'commit'>('tag');
const marketplaceQuery = ref('');
const marketplaceId = ref(DEFAULT_MARKETPLACE_ID);
const marketplaceUrl = ref(DEFAULT_MARKETPLACE_URL);
const marketplaceRef = ref(DEFAULT_MARKETPLACE_REF);
const marketplaceLoaded = ref(false);
const isBusy = ref(false);
const isMarketplaceRefreshing = ref(false);
const errorMessage = ref('');
const pendingMarketplacePlugin = ref<MarketplacePluginSummary | null>(null);
const pendingPermissionPlugin = ref<InstalledPluginRecord | null>(null);
const _pendingLocalInstall = ref<{
  type: 'package' | 'local' | 'git';
  value: string;
  ref?: string;
  refType?: 'branch' | 'tag' | 'commit';
} | null>(null);
const _pendingDeclaredPermissions = ref<import('@/contracts/plugin_host').PluginPermission[]>([]);
const _pendingPermissionTitle = ref('');
const installProgress = ref<PluginInstallProgress | null>(null);
const devSessions = ref<PluginDevSession[]>([]);
const activeInstallPluginId = ref<string | null>(null);
const debugPluginId = ref<string | null>(null);
let removeInstallProgressListener: (() => void) | undefined;

const enabledCount = computed(() => plugins.value.filter((plugin) => plugin.enabled).length);
const runningCount = computed(
  () => plugins.value.filter((plugin) => plugin.status === 'enabled').length
);
const installProgressPercent = computed(() =>
  Math.round((installProgress.value?.progress ?? 0) * 100)
);
const installProgressLabel = computed(() =>
  installProgress.value ? installPhaseLabels[installProgress.value.phase] : ''
);
const marketplacePlugins = computed<MarketplacePluginSummary[]>(() => {
  const query = marketplaceQuery.value.trim().toLowerCase();
  return marketplaces.value
    .filter((item) => item.marketplaceId === marketplaceId.value)
    .flatMap((item) => item.catalog.plugins)
    .filter(
      (plugin) =>
        !query ||
        [plugin.id, plugin.name, plugin.description ?? ''].some((value) =>
          value.toLowerCase().includes(query)
        )
    );
});
const marketplaceStatus = computed(() =>
  marketplaces.value.find((item) => item.marketplaceId === marketplaceId.value)
);
const sortedMarketplacePlugins = computed(() => {
  const result = [...marketplacePlugins.value];
  if (marketplaceSort.value === 'version')
    result.sort((a, b) => comparePluginVersions(b.version, a.version));
  if (marketplaceSort.value === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
});
const availableUpdates = computed(() => {
  const versions = new Map(
    (marketplaceStatus.value?.catalog.plugins ?? []).map((plugin) => [plugin.id, plugin.version])
  );
  return plugins.value.filter((plugin) => {
    if (plugin.installSource.type !== 'marketplace') return false;
    const latest = versions.get(plugin.manifest.id);
    return latest && comparePluginVersions(latest, plugin.manifest.version) > 0;
  });
});
const availableUpdateIds = computed(
  () => new Set(availableUpdates.value.map((plugin) => plugin.manifest.id))
);
const filteredPlugins = computed(() => {
  const query = installedQuery.value.trim().toLowerCase();
  return plugins.value.filter(
    (plugin) =>
      (statusFilter.value === 'all' ||
        (statusFilter.value === 'updatable'
          ? availableUpdateIds.value.has(plugin.manifest.id)
          : plugin.enabled === (statusFilter.value === 'enabled'))) &&
      (categoryFilter.value === 'all' || getPluginCategory(plugin) === categoryFilter.value) &&
      (!query ||
        [plugin.manifest.id, plugin.manifest.displayName, plugin.manifest.description ?? ''].some(
          (value) => value.toLowerCase().includes(query)
        ))
  );
});
const paginatedPlugins = computed(() =>
  filteredPlugins.value.slice(
    (installedPage.value - 1) * installedPageSize.value,
    installedPage.value * installedPageSize.value
  )
);
const marketplaceGridPlugins = computed(() => sortedMarketplacePlugins.value.slice(1));
const paginatedMarketplacePlugins = computed(() =>
  marketplaceGridPlugins.value.slice(
    (marketplacePage.value - 1) * marketplacePageSize.value,
    marketplacePage.value * marketplacePageSize.value
  )
);
const mainTabs = computed(() => [
  { key: 'installed', label: `已安装插件 ${plugins.value.length}` },
  { key: 'marketplace', label: `插件市场浏览 ${marketplacePlugins.value.length}` },
]);
const categoryTabs = [
  { key: 'all', label: '全部' },
  { key: 'devops', label: '开发运维' },
  { key: 'productivity', label: '效率工具' },
  { key: 'ai', label: 'AI 增强' },
  { key: 'network', label: '网络数据' },
];
const installMethodTabs = [
  { key: 'local', label: '本地' },
  { key: 'npm', label: 'NPM' },
  { key: 'git', label: 'Git' },
];
const detailTabs = computed(() => [
  { key: 'overview', label: '详情说明' },
  {
    key: 'permissions',
    label: `沙盒权限 (${selectedPlugin.value?.manifest.permissions.length ?? 0})`,
  },
  { key: 'changelog', label: '更新日志' },
  { key: 'settings', label: '参数 Schema' },
]);
const statusOptions = computed(() => [
  { value: 'all', label: `全部状态 (${plugins.value.length})` },
  { value: 'enabled', label: `已启用 (${enabledCount.value})` },
  { value: 'updatable', label: `待更新 (${availableUpdates.value.length})` },
  { value: 'disabled', label: `已停用 (${plugins.value.length - enabledCount.value})` },
]);
const gitRefOptions = [
  { value: 'tag', label: 'tag' },
  { value: 'branch', label: 'branch' },
  { value: 'commit', label: 'commit' },
];

function installSourceLabel(plugin: InstalledPluginRecord): string {
  switch (plugin.installSource.type) {
    case 'local':
      return '本地安装';
    case 'npm':
      return 'NPM 安装';
    case 'git':
      return 'Git 安装';
    case 'marketplace':
      return '市场安装';
    case 'builtin':
      return '内置插件';
  }
}

function setActiveTab(value: string): void {
  activeTab.value = value as PluginTab;
}

function setCategory(value: string): void {
  categoryFilter.value = value as PluginCategory;
}

function setStatus(value: string | number): void {
  statusFilter.value = value as PluginStatusFilter;
}

function setInstallMethod(value: string): void {
  installMethod.value = value as InstallMethod;
}

function setDetailTab(value: string): void {
  detailTab.value = value as PluginDetailTab;
}

function setGitRefType(value: string | number): void {
  gitRefType.value = value as 'branch' | 'tag' | 'commit';
}

watch([installedQuery, statusFilter, categoryFilter], () => {
  installedPage.value = 1;
});
watch([marketplaceQuery, marketplaceSort], () => {
  marketplacePage.value = 1;
});
watch(filteredPlugins, () => {
  installedPage.value = Math.min(
    installedPage.value,
    Math.max(1, Math.ceil(filteredPlugins.value.length / installedPageSize.value))
  );
});
watch(marketplaceGridPlugins, () => {
  marketplacePage.value = Math.min(
    marketplacePage.value,
    Math.max(1, Math.ceil(marketplaceGridPlugins.value.length / marketplacePageSize.value))
  );
});
const selectedPlugin = computed(
  () => plugins.value.find((plugin) => plugin.manifest.id === selectedPluginId.value) ?? null
);

function comparePluginVersions(left: string, right: string): number {
  const parse = (version: string) =>
    version.replace(/^v/, '').split(/[.-]/).slice(0, 3).map(Number);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function getPluginCategory(plugin: InstalledPluginRecord): Exclude<PluginCategory, 'all'> {
  const permissions = plugin.manifest.permissions;
  if (permissions.some((permission) => permission.startsWith('models.'))) return 'ai';
  if (permissions.some((permission) => /^(network|downloads|media)\./.test(permission)))
    return 'network';
  if (permissions.some((permission) => /^(system|tools|files)\./.test(permission))) return 'devops';
  return 'productivity';
}

function categoryLabel(category: Exclude<PluginCategory, 'all'>): string {
  return { devops: '开发运维', productivity: '效率工具', ai: 'AI 增强', network: '网络数据' }[
    category
  ];
}

function pagesForPlugin(pluginId: string): PluginPageDescriptor[] {
  const plugin = plugins.value.find((item) => item.manifest.id === pluginId);
  if (!plugin || !plugin.enabled || plugin.status !== 'enabled') return [];
  return getPluginPageDescriptors(plugin, pages.value);
}

function availableVersion(pluginId: string): string | undefined {
  return marketplaceStatus.value?.catalog.plugins.find((plugin) => plugin.id === pluginId)?.version;
}

async function openPluginDirectory() {
  if (!pluginDirectory.value) return;
  try {
    const result = await window.shellApi.openPath(pluginDirectory.value);
    if (result) throw new Error(result);
  } catch (error) {
    notifyError(error, '打开插件目录失败');
  }
}

const installPhaseLabels: Record<PluginInstallPhase, string> = {
  'resolving-marketplace': '正在解析市场条目',
  cloning: '正在下载插件仓库',
  validating: '正在校验插件清单与入口文件',
  activating: '正在激活插件版本',
  registering: '正在登记插件信息',
  completed: '插件安装完成',
  failed: '插件安装失败',
};

async function refresh() {
  if (!window.pluginHostApi) {
    errorMessage.value = '插件服务不可用，请重启应用后重试';
    return;
  }

  plugins.value = await window.pluginHostApi.listPlugins();
  const registeredPages = await window.pluginHostApi.listPages();
  pages.value = plugins.value.flatMap((plugin) =>
    getPluginPageDescriptors(plugin, registeredPages)
  );
  marketplaces.value = await window.pluginHostApi.listMarketplaces();
  devSessions.value = await window.pluginHostApi.listDevSessions();
  const jobEntries = await Promise.all(
    plugins.value.map(
      async (plugin) =>
        [
          plugin.manifest.id,
          await window.pluginHostApi!.listPluginJobs(plugin.manifest.id),
        ] as const
    )
  );
  jobsByPlugin.value = Object.fromEntries(jobEntries);
  registerPluginRoutes(pages.value);
}

function devSessionFor(pluginId: string) {
  return devSessions.value.find((session) => session.pluginId === pluginId);
}

async function stopDevSession(pluginId: string) {
  if (!window.pluginHostApi) return;
  await runMutation(() => window.pluginHostApi!.disconnectDevSession(pluginId));
}

async function connectLocalDevSession() {
  const rootPath = localDevPath.value.trim();
  if (!rootPath || !window.pluginHostApi) return;
  await runMutation(async () => {
    await window.pluginHostApi!.connectDevSessionFromFile(rootPath);
    localDevPath.value = '';
  });
}

async function pickLocalPluginPath(target: 'install' | 'dev') {
  if (isBusy.value || !window.pluginHostApi) return;
  try {
    const selected = await window.pluginHostApi.pickLocalPluginPath();
    if (!selected) return;
    if (target === 'install') localPath.value = selected;
    else localDevPath.value = selected;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '打开文件选择器失败';
    notifyError(error, '打开文件选择器失败');
  }
}

async function reconnectLocalDevSession(plugin: InstalledPluginRecord) {
  if (!plugin.localPath || !window.pluginHostApi) return;
  await runMutation(async () => {
    await window.pluginHostApi!.connectDevSessionFromFile(plugin.localPath!);
  });
}

async function runMutation(task: () => Promise<void>) {
  errorMessage.value = '';
  isBusy.value = true;
  try {
    await task();
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '插件操作失败';
    notifyError(error, '插件操作失败');
  } finally {
    isBusy.value = false;
  }
}

async function runInstall(task: () => Promise<void>, pluginId?: string) {
  installProgress.value = null;
  activeInstallPluginId.value = pluginId ?? null;
  try {
    await runMutation(task);
  } finally {
    activeInstallPluginId.value = null;
  }
}

function openPluginPage(page: PluginPageDescriptor) {
  syncRouteToBottomBar(
    {
      fullPath: page.routePath,
      meta: { pluginId: page.pluginId, pageId: page.pageId, title: page.title, icon: page.icon },
    },
    barStore
  );
  void router.push(page.routePath);
}

function openInstallDrawer(method: InstallMethod = 'local') {
  installMethod.value = method;
  installDrawerVisible.value = true;
}

function openPluginDetails(plugin: InstalledPluginRecord) {
  selectedPluginId.value = plugin.manifest.id;
  detailDrawerVisible.value = true;
  detailTab.value = 'overview';
}

function closePluginDetails() {
  detailDrawerVisible.value = false;
}

function clearPluginDetails() {
  if (!detailDrawerVisible.value) selectedPluginId.value = null;
}

async function handleInstallPackage() {
  const value = packageName.value.trim();
  if (!value || !window.pluginHostApi) return;
  // Install with empty approval first so the dialog can confirm before enable.
  await runMutation(async () => {
    const record = await window.pluginHostApi!.installPluginFromPackage(value, []);
    packageName.value = '';
    pendingPermissionPlugin.value = record;
    installDrawerVisible.value = false;
  });
}

async function handleRegisterLocal() {
  const value = localPath.value.trim();
  if (!value || !window.pluginHostApi) return;
  await runMutation(async () => {
    const record = await window.pluginHostApi!.registerLocalPlugin(value, []);
    localPath.value = '';
    pendingPermissionPlugin.value = record;
    installDrawerVisible.value = false;
  });
}

async function handleInstallGit() {
  if (!gitUrl.value.trim() || !gitRef.value.trim() || !window.pluginHostApi) return;
  await runInstall(async () => {
    const record = await window.pluginHostApi!.installFromGit({
      url: gitUrl.value.trim(),
      ref: gitRef.value.trim(),
      refType: gitRefType.value,
      approvedPermissions: [],
    });
    gitUrl.value = '';
    gitRef.value = '';
    pendingPermissionPlugin.value = record;
    installDrawerVisible.value = false;
  });
}

function requestApprovePermissions(plugin: InstalledPluginRecord) {
  pendingPermissionPlugin.value = plugin;
}

function openDebugPanel(pluginId: string) {
  debugPluginId.value = pluginId;
}

function signatureBadgeClass(plugin: InstalledPluginRecord) {
  if (plugin.signatureVerified) return 'signature-badge--verified';
  if (plugin.signatureWarning) return 'signature-badge--warning';
  if (plugin.packageSha256) return 'signature-badge--unsigned';
  return 'signature-badge--na';
}

function signatureBadgeText(plugin: InstalledPluginRecord) {
  if (plugin.signatureVerified) return '已签名';
  if (plugin.signatureWarning) return '未签名';
  if (plugin.packageSha256) return '未签名';
  return '—';
}

function signatureBadgeTitle(plugin: InstalledPluginRecord) {
  if (plugin.signatureVerified) return '包签名已校验通过';
  if (plugin.signatureWarning) return plugin.signatureWarning;
  if (plugin.packageSha256) return '安装时未提供有效签名';
  return '本地/npm 安装通常无签名';
}

async function confirmApprovePermissions(
  approvedPermissions: import('@/contracts/plugin_host').PluginPermission[]
) {
  const plugin = pendingPermissionPlugin.value;
  if (!plugin || !window.pluginHostApi) return;
  pendingPermissionPlugin.value = null;
  await runMutation(async () => {
    await window.pluginHostApi!.approvePermissions(
      plugin.manifest.id,
      serializeApprovedPermissions(approvedPermissions)
    );
  });
}

async function handleRefreshMarketplace() {
  if (
    !marketplaceId.value.trim() ||
    !marketplaceUrl.value.trim() ||
    !marketplaceRef.value.trim() ||
    !window.pluginHostApi
  )
    return;
  errorMessage.value = '';
  isMarketplaceRefreshing.value = true;
  try {
    await window.pluginHostApi.refreshMarketplace({
      id: marketplaceId.value.trim(),
      url: marketplaceUrl.value.trim(),
      ref: marketplaceRef.value.trim(),
    });
    await refresh();
    marketplaceLoaded.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '市场仓库拉取失败';
    notifyError(error, '市场仓库拉取失败');
  } finally {
    isMarketplaceRefreshing.value = false;
  }
}

function requestMarketplaceInstall(plugin: MarketplacePluginSummary) {
  pendingMarketplacePlugin.value = plugin;
}

async function confirmMarketplaceInstall(
  approvedPermissions: import('@/contracts/plugin_host').PluginPermission[]
) {
  const plugin = pendingMarketplacePlugin.value;
  if (!plugin || !window.pluginHostApi) return;
  pendingMarketplacePlugin.value = null;
  const safePermissions = serializeApprovedPermissions(approvedPermissions);
  await runInstall(async () => {
    await window.pluginHostApi!.installFromMarketplace(
      marketplaceId.value,
      plugin.id,
      safePermissions
    );
  }, plugin.id);
}

async function updatePlugin(plugin: InstalledPluginRecord) {
  if (!window.pluginHostApi) return;
  await runInstall(async () => {
    await window.pluginHostApi!.updatePlugin(plugin.manifest.id);
  }, plugin.manifest.id);
}

async function rollbackPlugin(plugin: InstalledPluginRecord) {
  if (!window.pluginHostApi) return;
  await runMutation(async () => {
    await window.pluginHostApi!.rollbackPlugin(plugin.manifest.id);
  });
}

async function uninstallPlugin(plugin: InstalledPluginRecord) {
  if (!window.pluginHostApi) return;
  const reopenPluginId = selectedPluginId.value;
  closePluginDetails();
  const confirmed = await showConfirmDialog({
    title: '卸载插件',
    message: `确定卸载 ${plugin.manifest.displayName} 吗？`,
    confirmText: '卸载',
    danger: true,
  });
  if (!confirmed) {
    selectedPluginId.value = reopenPluginId;
    return;
  }
  await runMutation(() => window.pluginHostApi!.uninstallPlugin(plugin.manifest.id));
}

async function togglePlugin(plugin: InstalledPluginRecord) {
  if (!window.pluginHostApi) return;
  await runMutation(async () => {
    if (plugin.enabled) await window.pluginHostApi!.disablePlugin(plugin.manifest.id);
    else await window.pluginHostApi!.enablePlugin(plugin.manifest.id);
  });
}

watch(activeTab, (tab) => {
  if (tab === 'marketplace' && !marketplaceLoaded.value) void handleRefreshMarketplace();
});

onMounted(() => {
  globalStore.setTopbarColor('');
  removeInstallProgressListener = window.pluginHostApi?.onInstallProgress((progress) => {
    installProgress.value = progress;
  });
  void refresh();
  void window.pluginHostApi
    ?.getHostSummary()
    .then((summary) => {
      pluginDirectory.value = summary.pluginDirectory;
    })
    .catch(() => {
      pluginDirectory.value = '';
    });
});

onBeforeUnmount(() => removeInstallProgressListener?.());
</script>

<template>
  <div class="plugins-page">
    <header class="plugins-commandbar">
      <UiTabs
        :model-value="activeTab"
        :items="mainTabs"
        variant="segmented"
        size="sm"
        aria-label="插件视图"
        @update:model-value="setActiveTab"
      />
      <div class="plugin-search-shell">
        <UiInput
          v-if="activeTab === 'installed'"
          v-model="installedQuery"
          class="plugin-search"
          placeholder="搜索已安装插件、ID、指令、关键词…"
          aria-label="搜索已安装插件"
        />
        <UiInput
          v-else
          v-model="marketplaceQuery"
          class="plugin-search"
          placeholder="搜索插件市场…"
          aria-label="搜索插件市场"
        />
      </div>
      <div class="plugins-commandbar__actions">
        <UiButton
          variant="secondary"
          size="sm"
          :disabled="!pluginDirectory"
          @click="openPluginDirectory"
          ><template #prefix><PluginActionIcon name="folder" /></template>插件目录</UiButton
        >
        <UiButton
          variant="secondary"
          size="sm"
          :disabled="isMarketplaceRefreshing"
          @click="handleRefreshMarketplace"
          ><template #prefix><PluginActionIcon name="refresh" /></template
          >{{ isMarketplaceRefreshing ? '检查中…' : '检查更新' }}</UiButton
        >
        <UiButton variant="primary" size="sm" @click="openInstallDrawer('local')"
          ><template #prefix><PluginActionIcon name="download" /></template>安装本地插件</UiButton
        >
      </div>
    </header>

    <div v-if="errorMessage" class="plugins-error ui-status-banner ui-status-banner--danger">
      {{ errorMessage }}
    </div>
    <section
      v-if="installProgress"
      class="install-progress"
      :class="{ 'install-progress--failed': installProgress.phase === 'failed' }"
      aria-live="polite"
    >
      <div class="install-progress__head">
        <strong>{{ installProgressLabel }}</strong
        ><span>{{ installProgressPercent }}%</span>
      </div>
      <div
        class="install-progress__bar"
        role="progressbar"
        :aria-valuenow="installProgressPercent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="install-progress__bar-fill" :style="{ width: `${installProgressPercent}%` }" />
      </div>
      <p v-if="installProgress.error" class="install-progress__error">
        {{ installProgress.error }}
      </p>
    </section>

    <section class="plugins-filterbar" aria-label="插件筛选">
      <div v-if="activeTab === 'installed'" class="plugin-categories-shell">
        <UiScrollbar class="plugin-categories-scroll" :x="true" :y="false" aria-label="插件分类">
          <div class="plugin-categories" role="group">
            <UiButton
              v-for="category in categoryTabs"
              :key="category.key"
              variant="ghost"
              size="sm"
              :active="categoryFilter === category.key"
              :aria-pressed="categoryFilter === category.key"
              @click="setCategory(category.key)"
              ><template #prefix
                ><PluginActionIcon
                  :name="
                    (
                      {
                        all: 'grid',
                        devops: 'terminal',
                        productivity: 'check',
                        ai: 'sparkles',
                        network: 'network',
                      } as const
                    )[category.key as PluginCategory]
                  " /></template
              >{{ category.label }}</UiButton
            >
          </div>
        </UiScrollbar>
      </div>
      <div v-if="activeTab === 'installed'" class="plugins-filterbar__aside">
        <label class="plugin-status-filter"
          ><span>状态:</span
          ><UiSelect
            :model-value="statusFilter"
            :options="statusOptions"
            size="sm"
            aria-label="筛选插件状态"
            @update:model-value="setStatus"
        /></label>
        <div class="plugin-view-switch" role="group" aria-label="插件布局">
          <UiButton
            variant="ghost"
            size="sm"
            :active="viewMode === 'cards'"
            :aria-pressed="viewMode === 'cards'"
            aria-label="卡片布局"
            @click="viewMode = 'cards'"
            ><template #prefix><PluginActionIcon name="grid" /></template
          ></UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            :active="viewMode === 'list'"
            :aria-pressed="viewMode === 'list'"
            aria-label="列表布局"
            @click="viewMode = 'list'"
            ><template #prefix><PluginActionIcon name="list" /></template
          ></UiButton>
        </div>
      </div>
    </section>

    <main v-if="activeTab === 'installed'" class="plugin-view" role="tabpanel">
      <section class="plugin-metrics" aria-label="插件概览">
        <div class="plugin-metric">
          <div>
            <span>运行中插件</span
            ><strong
              >{{ runningCount }} <small>/ {{ plugins.length }}</small></strong
            >
          </div>
          <span class="plugin-metric__icon" aria-hidden="true"
            ><PluginActionIcon name="check"
          /></span>
        </div>
        <div class="plugin-metric">
          <div>
            <span>常驻内存消耗</span><strong>— <small>暂无采集</small></strong>
          </div>
          <span class="plugin-metric__icon" aria-hidden="true"
            ><PluginActionIcon name="memory"
          /></span>
        </div>
        <div class="plugin-metric">
          <div>
            <span>可用更新</span
            ><strong>{{ availableUpdates.length }} <small>项升级</small></strong>
          </div>
          <span class="plugin-metric__icon" aria-hidden="true"
            ><PluginActionIcon name="refresh"
          /></span>
        </div>
        <div class="plugin-metric">
          <div>
            <span>沙盒安全指标</span><strong>— <small>暂无采集</small></strong>
          </div>
          <span class="plugin-metric__icon" aria-hidden="true"
            ><PluginActionIcon name="shield"
          /></span>
        </div>
      </section>

      <UiScrollbar class="plugin-list-scroll" :x="true" :y="true" aria-label="已安装插件列表">
        <section v-if="plugins.length === 0" class="empty-state">
          <strong>本地还没有已安装插件</strong><span>可以从本地目录安装插件。</span
          ><UiButton variant="primary" size="sm" @click="openInstallDrawer('local')"
            ><template #prefix><PluginActionIcon name="download" /></template>安装本地插件</UiButton
          >
        </section>
        <section v-else-if="filteredPlugins.length === 0" class="empty-state">
          <strong>没有匹配插件</strong><span>试试其他名称或插件 ID。</span>
        </section>
        <section
          v-else-if="viewMode === 'cards'"
          class="installed-cards"
          aria-label="已安装插件卡片"
        >
          <article
            v-for="plugin in paginatedPlugins"
            :key="plugin.manifest.id"
            class="installed-card"
            :class="{ 'installed-card--disabled': !plugin.enabled }"
          >
            <div class="installed-card__top">
              <div class="plugin-avatar" aria-hidden="true">
                {{ plugin.manifest.displayName.slice(0, 1) }}
              </div>
              <div class="installed-card__identity">
                <div>
                  <h2>{{ plugin.manifest.displayName }}</h2>
                  <span>v{{ plugin.manifest.version }}</span>
                </div>
                <small>{{ plugin.manifest.id }}</small>
                <UiTagChip
                  :label="installSourceLabel(plugin)"
                  :color="plugin.installSource.type === 'marketplace' ? '#0284c7' : '#64748b'"
                  subtle
                />
              </div>
              <UiSwitch
                :model-value="plugin.enabled"
                :disabled="isBusy"
                :aria-label="`${plugin.manifest.displayName}${plugin.enabled ? '停用' : '启用'}`"
                @update:model-value="togglePlugin(plugin)"
              />
            </div>
            <p class="installed-card__description">
              {{ plugin.manifest.description || '暂无插件说明' }}
            </p>
            <div
              v-if="pagesForPlugin(plugin.manifest.id).length"
              class="plugin-page-links"
              aria-label="插件页面"
            >
              <UiButton
                v-for="page in pagesForPlugin(plugin.manifest.id)"
                :key="page.pageId"
                variant="secondary"
                size="sm"
                @click="openPluginPage(page)"
                ><template #prefix><PluginActionIcon name="external" /></template>
                {{ page.title }}
              </UiButton>
            </div>
            <div class="installed-card__footer">
              <div class="installed-card__signals">
                <span
                  class="signature-badge"
                  :class="signatureBadgeClass(plugin)"
                  :title="signatureBadgeTitle(plugin)"
                  >{{ signatureBadgeText(plugin) }}</span
                >
                <span v-if="availableUpdateIds.has(plugin.manifest.id)" class="plugin-update-badge"
                  >可更新至 v{{ availableVersion(plugin.manifest.id) }}</span
                >
                <span
                  v-else
                  class="plugin-state-badge"
                  :class="{ 'plugin-state-badge--off': plugin.status !== 'enabled' }"
                  >{{
                    plugin.status === 'errored'
                      ? '运行异常'
                      : plugin.status === 'enabled'
                        ? '运行中'
                        : '已停用'
                  }}</span
                >
                <span v-if="devSessionFor(plugin.manifest.id)"
                  >本地开发 · {{ devSessionFor(plugin.manifest.id)?.port }}</span
                >
              </div>
              <UiButton
                variant="ghost"
                size="sm"
                :disabled="isBusy"
                @click="openPluginDetails(plugin)"
                ><template #prefix><PluginActionIcon name="info" /></template>详情</UiButton
              >
            </div>
          </article>
        </section>
        <div v-else class="installed-table-wrap" aria-label="已安装插件列表">
          <table class="installed-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>插件标识 / 名称</th>
                <th>当前版本</th>
                <th>分类</th>
                <th>内存占用</th>
                <th>作者</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="plugin in paginatedPlugins" :key="plugin.manifest.id">
                <td>
                  <UiSwitch
                    :model-value="plugin.enabled"
                    :disabled="isBusy"
                    :aria-label="`${plugin.manifest.displayName}${plugin.enabled ? '停用' : '启用'}`"
                    @update:model-value="togglePlugin(plugin)"
                  />
                </td>
                <td>
                  <div class="installed-table__plugin">
                    <div class="plugin-avatar" aria-hidden="true">
                      {{ plugin.manifest.displayName.slice(0, 1) }}
                    </div>
                    <div>
                      <strong>{{ plugin.manifest.displayName }}</strong
                      ><small>{{ plugin.manifest.id }}</small>
                      <UiTagChip
                        :label="installSourceLabel(plugin)"
                        :color="plugin.installSource.type === 'marketplace' ? '#0284c7' : '#64748b'"
                        subtle
                      />
                      <div
                        v-if="pagesForPlugin(plugin.manifest.id).length"
                        class="plugin-page-links"
                      >
                        <UiButton
                          v-for="page in pagesForPlugin(plugin.manifest.id)"
                          :key="page.pageId"
                          variant="secondary"
                          size="sm"
                          @click="openPluginPage(page)"
                          ><template #prefix><PluginActionIcon name="external" /></template>
                          {{ page.title }}
                        </UiButton>
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span>v{{ plugin.manifest.version }}</span
                  ><span
                    v-if="availableUpdateIds.has(plugin.manifest.id)"
                    class="plugin-update-badge"
                    >↑ v{{ availableVersion(plugin.manifest.id) }}</span
                  >
                </td>
                <td>
                  <span class="plugin-category-label">{{
                    categoryLabel(getPluginCategory(plugin))
                  }}</span>
                </td>
                <td class="installed-table__muted">暂无采集</td>
                <td class="installed-table__muted">未提供</td>
                <td>
                  <UiButton
                    variant="ghost"
                    size="sm"
                    :disabled="isBusy"
                    @click="openPluginDetails(plugin)"
                    ><template #prefix><PluginActionIcon name="info" /></template>详情</UiButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiScrollbar>
      <PluginPagination
        v-if="filteredPlugins.length"
        v-model:page="installedPage"
        v-model:page-size="installedPageSize"
        :total="filteredPlugins.length"
      />
    </main>

    <main v-else class="plugin-view plugin-view--market" role="tabpanel">
      <div class="marketplace-heading">
        <div class="marketplace-heading__identity">
          <span aria-hidden="true">◉</span>
          <h2>远端插件市场探索 (Marketplace)</h2>
          <small>Registry: {{ marketplaceStatus?.catalog.name || marketplaceId }}</small>
        </div>
        <div class="marketplace-sorting" role="group" aria-label="市场排序">
          <span>排序:</span>
          <UiButton
            variant="ghost"
            size="sm"
            :active="marketplaceSort === 'catalog'"
            @click="marketplaceSort = 'catalog'"
            ><template #prefix><PluginActionIcon name="order" /></template>目录顺序</UiButton
          >
          <UiButton
            variant="ghost"
            size="sm"
            :active="marketplaceSort === 'version'"
            @click="marketplaceSort = 'version'"
            ><template #prefix><PluginActionIcon name="refresh" /></template>最新版本</UiButton
          >
          <UiButton
            variant="ghost"
            size="sm"
            :active="marketplaceSort === 'name'"
            @click="marketplaceSort = 'name'"
            ><template #prefix><PluginActionIcon name="order" /></template>名称</UiButton
          >
        </div>
      </div>
      <UiDisclosure title="市场来源设置" class="marketplace-settings">
        <div class="marketplace-settings__body">
          <UiInput v-model="marketplaceId" placeholder="市场 ID" /><UiInput
            v-model="marketplaceRef"
            placeholder="分支或标签"
          /><UiInput v-model="marketplaceUrl" placeholder="catalog.json HTTPS URL" />
        </div>
      </UiDisclosure>
      <div
        v-if="isMarketplaceRefreshing && sortedMarketplacePlugins.length === 0"
        class="marketplace-loading"
        aria-live="polite"
      >
        正在同步市场目录…
      </div>
      <div v-else-if="sortedMarketplacePlugins.length === 0" class="empty-state">
        <strong>暂无市场插件</strong><span>检查市场来源或调整搜索条件。</span>
      </div>
      <template v-else>
        <article v-if="sortedMarketplacePlugins[0]" class="marketplace-feature">
          <div class="marketplace-feature__content">
            <span class="marketplace-feature__eyebrow"
              >市场目录插件 · v{{ sortedMarketplacePlugins[0].version }}</span
            >
            <h3>{{ sortedMarketplacePlugins[0].name }}</h3>
            <UiTagChip label="远端市场" color="#0284c7" subtle />
            <p>{{ sortedMarketplacePlugins[0].description || sortedMarketplacePlugins[0].id }}</p>
            <div class="marketplace-feature__meta">
              <span>{{ sortedMarketplacePlugins[0].id }}</span
              ><span
                >运行时权限:
                {{ sortedMarketplacePlugins[0].permissions?.length || 0 }} 项需确认</span
              >
            </div>
          </div>
          <div class="marketplace-feature__action">
            <UiButton
              variant="primary"
              :disabled="isBusy"
              @click="requestMarketplaceInstall(sortedMarketplacePlugins[0])"
              ><template #prefix><PluginActionIcon name="download" /></template
              >{{
                isBusy && activeInstallPluginId === sortedMarketplacePlugins[0].id
                  ? installProgressLabel || '准备安装'
                  : '立即安装插件'
              }}</UiButton
            ><small
              >{{ sortedMarketplacePlugins[0].refType }} ·
              {{ sortedMarketplacePlugins[0].ref }}</small
            >
          </div>
        </article>
        <UiScrollbar class="plugin-list-scroll" :x="false" :y="true" aria-label="市场插件列表">
          <section class="marketplace-grid" aria-label="市场插件列表">
            <article
              v-for="plugin in paginatedMarketplacePlugins"
              :key="plugin.id"
              class="marketplace-card"
            >
              <div class="marketplace-card__top">
                <div class="plugin-avatar plugin-avatar--market" aria-hidden="true">
                  {{ plugin.name.slice(0, 1) }}
                </div>
                <span class="version-badge">v{{ plugin.version }}</span>
              </div>
              <h3>{{ plugin.name }}</h3>
              <small>{{ plugin.id }} · v{{ plugin.version }}</small>
              <UiTagChip label="远端市场" color="#0284c7" subtle />
              <p>{{ plugin.description || plugin.id }}</p>
              <div class="marketplace-card__footer">
                <span>{{ plugin.permissions?.length || 0 }} 项权限</span
                ><UiButton
                  variant="secondary"
                  size="sm"
                  :disabled="isBusy"
                  @click="requestMarketplaceInstall(plugin)"
                  ><template #prefix><PluginActionIcon name="download" /></template
                  >{{
                    isBusy && activeInstallPluginId === plugin.id
                      ? installProgressLabel || '准备安装'
                      : '安装'
                  }}</UiButton
                >
              </div>
            </article>
          </section>
        </UiScrollbar>
        <PluginPagination
          v-if="marketplaceGridPlugins.length"
          v-model:page="marketplacePage"
          v-model:page-size="marketplacePageSize"
          :total="marketplaceGridPlugins.length"
        />
      </template>
    </main>

    <UiDrawer
      :model-value="installDrawerVisible"
      width="min(480px, 100vw)"
      :style="drawerOffsetStyle"
      z-index="var(--ui-z-secure-modal)"
      aria-label="添加插件"
      @update:model-value="installDrawerVisible = $event"
    >
      <template #header>
        <div class="drawer-header-row">
          <div class="drawer-heading">
            <span class="drawer-kicker">PLUGIN INSTALL</span>
            <h2>添加插件</h2>
          </div>
          <UiButton
            variant="ghost"
            size="sm"
            aria-label="关闭添加插件"
            @click="installDrawerVisible = false"
            ><template #prefix><PluginActionIcon name="close" /></template>关闭</UiButton
          >
        </div>
      </template>
      <div class="drawer-body">
        <UiTabs
          :model-value="installMethod"
          :items="installMethodTabs"
          variant="segmented"
          size="sm"
          stretch
          aria-label="安装方式"
          @update:model-value="setInstallMethod"
        />
        <div v-if="installMethod === 'local'" class="drawer-form">
          <label class="field"
            ><span>插件目录或清单</span>
            <div class="field-row">
              <UiInput v-model="localPath" placeholder="选择插件目录或 plugin.json" /><UiButton
                variant="ghost"
                :disabled="isBusy"
                @click="pickLocalPluginPath('install')"
                ><template #prefix><PluginActionIcon name="folder" /></template>选择</UiButton
              >
            </div></label
          >
          <UiButton
            variant="primary"
            block
            :disabled="isBusy || !localPath.trim()"
            @click="handleRegisterLocal"
            ><template #prefix><PluginActionIcon name="plug" /></template>注册插件</UiButton
          >
          <div class="drawer-subsection">
            <div class="drawer-subsection__title">本地开发</div>
            <label class="field"
              ><span>开发目录</span>
              <div class="field-row">
                <UiInput v-model="localDevPath" placeholder="含 plugin.dev.json 的目录" /><UiButton
                  variant="ghost"
                  :disabled="isBusy"
                  @click="pickLocalPluginPath('dev')"
                  ><template #prefix><PluginActionIcon name="folder" /></template>选择</UiButton
                >
              </div></label
            ><UiButton
              variant="secondary"
              block
              :disabled="isBusy || !localDevPath.trim()"
              @click="connectLocalDevSession"
              ><template #prefix><PluginActionIcon name="plug" /></template>连接开发会话</UiButton
            >
          </div>
        </div>
        <div v-else-if="installMethod === 'npm'" class="drawer-form">
          <label class="field"
            ><span>NPM 包名</span
            ><UiInput v-model="packageName" placeholder="例如：guyantools-plugin-demo" /></label
          ><UiButton
            variant="primary"
            block
            :disabled="isBusy || !packageName.trim()"
            @click="handleInstallPackage"
            ><template #prefix><PluginActionIcon name="download" /></template>安装插件</UiButton
          >
        </div>
        <div v-else class="drawer-form">
          <label class="field"
            ><span>Git 仓库</span
            ><UiInput v-model="gitUrl" placeholder="https://github.com/owner/plugin"
          /></label>
          <div class="field-row field-row--git">
            <UiInput v-model="gitRef" placeholder="v1.0.0" /><UiSelect
              :model-value="gitRefType"
              :options="gitRefOptions"
              size="sm"
              aria-label="Git 引用类型"
              @update:model-value="setGitRefType"
            />
          </div>
          <UiButton
            variant="primary"
            block
            :disabled="isBusy || !gitUrl.trim() || !gitRef.trim()"
            @click="handleInstallGit"
            ><template #prefix><PluginActionIcon name="download" /></template>安装插件</UiButton
          >
        </div>
      </div>
    </UiDrawer>

    <UiDrawer
      :model-value="detailDrawerVisible"
      width="min(480px, 100vw)"
      :style="drawerOffsetStyle"
      z-index="var(--ui-z-secure-modal)"
      aria-label="插件详情"
      @update:model-value="detailDrawerVisible = $event"
      @after-close="clearPluginDetails"
    >
      <template v-if="selectedPlugin" #header>
        <div class="plugin-inspector">
          <div class="plugin-inspector__path">
            <span>PLUGIN INSPECTOR</span><span>/</span><code>{{ selectedPlugin.manifest.id }}</code
            ><UiButton
              variant="ghost"
              size="sm"
              aria-label="关闭插件详情"
              @click="closePluginDetails"
              ><template #prefix><PluginActionIcon name="close" /></template>关闭</UiButton
            >
          </div>
          <div class="plugin-inspector__identity">
            <div class="plugin-avatar" aria-hidden="true">
              {{ selectedPlugin.manifest.displayName.slice(0, 1) }}
            </div>
            <div>
              <h2>{{ selectedPlugin.manifest.displayName }}</h2>
              <p>v{{ selectedPlugin.manifest.version }}</p>
              <UiTagChip
                :label="installSourceLabel(selectedPlugin)"
                :color="selectedPlugin.installSource.type === 'marketplace' ? '#0284c7' : '#64748b'"
                subtle
              />
            </div>
            <span
              class="plugin-state-badge"
              :class="{ 'plugin-state-badge--off': selectedPlugin.status !== 'enabled' }"
              >{{
                selectedPlugin.status === 'errored'
                  ? '运行异常'
                  : selectedPlugin.status === 'enabled'
                    ? '运行中'
                    : '已停用'
              }}</span
            >
          </div>
          <div class="plugin-inspector__actions">
            <UiButton
              v-if="
                selectedPlugin.installSource.type === 'git' ||
                selectedPlugin.installSource.type === 'marketplace'
              "
              variant="primary"
              size="sm"
              :disabled="isBusy"
              @click="updatePlugin(selectedPlugin)"
              ><template #prefix><PluginActionIcon name="refresh" /></template>更新插件</UiButton
            >
            <UiButton
              variant="secondary"
              size="sm"
              :disabled="isBusy"
              @click="openDebugPanel(selectedPlugin.manifest.id)"
              ><template #prefix><PluginActionIcon name="settings" /></template>配置 /
              调试</UiButton
            >
            <UiButton
              variant="danger"
              size="sm"
              :disabled="isBusy"
              @click="uninstallPlugin(selectedPlugin)"
              ><template #prefix><PluginActionIcon name="trash" /></template>卸载</UiButton
            >
          </div>
          <UiTabs
            :model-value="detailTab"
            :items="detailTabs"
            variant="segmented"
            size="sm"
            aria-label="插件详情内容"
            @update:model-value="setDetailTab"
          />
        </div>
      </template>
      <div v-if="selectedPlugin" class="drawer-body plugin-details">
        <template v-if="detailTab === 'overview'">
          <div class="detail-status">
            <span>插件状态</span
            ><UiSwitch
              :model-value="selectedPlugin.enabled"
              :disabled="isBusy"
              aria-label="启用插件"
              @update:model-value="togglePlugin(selectedPlugin!)"
            />
          </div>
          <p class="detail-description">
            {{ selectedPlugin.manifest.description || '暂无描述' }}
          </p>
          <dl class="detail-facts">
            <div>
              <dt>来源</dt>
              <dd>{{ selectedPlugin.installSource.type }}</dd>
            </div>
            <div>
              <dt>来源值</dt>
              <dd>
                {{
                  selectedPlugin.installSource.value ||
                  selectedPlugin.installSource.url ||
                  selectedPlugin.installSource.marketplaceId ||
                  '内置'
                }}
              </dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{{ selectedPlugin.status }}</dd>
            </div>
            <div>
              <dt>权限</dt>
              <dd>
                {{ selectedPlugin.approvedPermissions.length }} /
                {{ selectedPlugin.manifest.permissions.length }}
              </dd>
            </div>
            <div>
              <dt>能力</dt>
              <dd>{{ selectedPlugin.manifest.capabilities.length }}</dd>
            </div>
            <div v-if="selectedPlugin.installSource.resolvedCommit">
              <dt>解析提交</dt>
              <dd>{{ selectedPlugin.installSource.resolvedCommit }}</dd>
            </div>
          </dl>
          <div v-if="pagesForPlugin(selectedPlugin.manifest.id).length" class="detail-section">
            <h3>插件页面</h3>
            <div class="plugin-page-links">
              <UiButton
                v-for="page in pagesForPlugin(selectedPlugin.manifest.id)"
                :key="page.pageId"
                variant="secondary"
                size="sm"
                @click="openPluginPage(page)"
                ><template #prefix><PluginActionIcon name="external" /></template>
                {{ page.title }}
              </UiButton>
            </div>
          </div>
          <div
            v-if="
              devSessionFor(selectedPlugin.manifest.id) ||
              selectedPlugin.installSource.type === 'local'
            "
            class="detail-section"
          >
            <h3>开发会话</h3>
            <p v-if="devSessionFor(selectedPlugin.manifest.id)" class="detail-note">
              已连接 · 127.0.0.1:{{ devSessionFor(selectedPlugin.manifest.id)?.port }}
            </p>
            <p v-else class="detail-note">当前未连接开发会话</p>
            <UiButton
              v-if="devSessionFor(selectedPlugin.manifest.id)"
              variant="secondary"
              size="sm"
              :disabled="isBusy"
              @click="stopDevSession(selectedPlugin.manifest.id)"
              ><template #prefix><PluginActionIcon name="unplug" /></template>断开开发会话</UiButton
            ><UiButton
              v-else
              variant="secondary"
              size="sm"
              :disabled="isBusy || !selectedPlugin.localPath"
              @click="reconnectLocalDevSession(selectedPlugin)"
              ><template #prefix><PluginActionIcon name="plug" /></template>重连开发会话</UiButton
            >
          </div>
          <div v-if="jobsByPlugin[selectedPlugin.manifest.id]?.length" class="detail-section">
            <h3>任务</h3>
            <PluginJobPanel :jobs="jobsByPlugin[selectedPlugin.manifest.id] || []" />
          </div>
          <UiButton
            v-if="
              selectedPlugin.installSource.type === 'git' ||
              selectedPlugin.installSource.type === 'marketplace'
            "
            variant="ghost"
            size="sm"
            :disabled="isBusy"
            @click="rollbackPlugin(selectedPlugin)"
            ><template #prefix><PluginActionIcon name="undo" /></template>回滚版本</UiButton
          >
        </template>
        <div v-else-if="detailTab === 'permissions'" class="detail-section">
          <p class="detail-note">
            此插件已声明 {{ selectedPlugin.manifest.permissions.length }} 项权限，其中
            {{ selectedPlugin.approvedPermissions.length }} 项已批准。
          </p>
          <div class="permission-list">
            <span
              v-for="permission in selectedPlugin.manifest.permissions"
              :key="permission"
              :class="{
                'permission-list__pending':
                  !selectedPlugin.approvedPermissions.includes(permission),
              }"
              >{{ permission }}</span
            >
          </div>
          <UiButton
            v-if="
              selectedPlugin.approvedPermissions.length < selectedPlugin.manifest.permissions.length
            "
            variant="primary"
            size="sm"
            :disabled="isBusy"
            @click="requestApprovePermissions(selectedPlugin)"
            ><template #prefix><PluginActionIcon name="check" /></template>确认权限</UiButton
          >
        </div>
        <div v-else-if="detailTab === 'changelog'" class="detail-section">
          <h3>更新日志</h3>
          <p class="detail-note">当前插件清单未提供更新日志。</p>
        </div>
        <div v-else class="detail-section">
          <h3>参数 Schema</h3>
          <div
            v-if="Object.keys(selectedPlugin.manifest.settings ?? {}).length"
            class="settings-schema"
          >
            <div
              v-for="[key, schema] in Object.entries(selectedPlugin.manifest.settings ?? {})"
              :key="key"
            >
              <strong>{{ schema.title }}</strong
              ><small>{{ key }} · {{ schema.type }}</small>
              <p>{{ schema.description || '暂无说明' }}</p>
            </div>
          </div>
          <p v-else class="detail-note">当前插件没有声明可配置参数。</p>
        </div>
      </div>
    </UiDrawer>

    <PluginPermissionDialog
      :plugin="pendingMarketplacePlugin"
      :visible="Boolean(pendingMarketplacePlugin)"
      mode="install"
      @cancel="pendingMarketplacePlugin = null"
      @confirm="confirmMarketplaceInstall"
    />
    <PluginPermissionDialog
      :plugin="pendingPermissionPlugin"
      :visible="Boolean(pendingPermissionPlugin)"
      mode="approve"
      @cancel="pendingPermissionPlugin = null"
      @confirm="confirmApprovePermissions"
    />
    <PluginDebugPanel
      :plugin-id="debugPluginId || ''"
      :visible="Boolean(debugPluginId)"
      @close="debugPluginId = null"
    />
  </div>
</template>

<style scoped lang="scss" src="./Plugins.stitch.scss"></style>
