<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { registerPluginRoutes } from '../../routes/router';
import { useGlobalStore } from '../../stores/global_store';
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
import { UiButton, UiInput } from '@guyantools/ui-vue';
import { notifyError } from '../../composables/useInAppNotification';
import PluginPermissionDialog from './PluginPermissionDialog.vue';
import PluginJobPanel from './PluginJobPanel.vue';
import { serializeApprovedPermissions } from './plugin_install_serialization';

type PluginTab = 'installed' | 'marketplace';

const DEFAULT_MARKETPLACE_ID = 'sakurapole';
const DEFAULT_MARKETPLACE_URL = 'https://raw.githubusercontent.com/Sakurapole/guyantools-plugin-marketplace/main/catalog.json';
const DEFAULT_MARKETPLACE_REF = 'main';

const router = useRouter();
const globalStore = useGlobalStore();

const activeTab = ref<PluginTab>('installed');
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
const installProgress = ref<PluginInstallProgress | null>(null);
const devSessions = ref<PluginDevSession[]>([]);
const activeInstallPluginId = ref<string | null>(null);
let removeInstallProgressListener: (() => void) | undefined;

const enabledCount = computed(() => plugins.value.filter(plugin => plugin.enabled).length);
const installProgressPercent = computed(() => Math.round((installProgress.value?.progress ?? 0) * 100));
const installProgressLabel = computed(() => installProgress.value ? installPhaseLabels[installProgress.value.phase] : '');
const marketplacePlugins = computed<MarketplacePluginSummary[]>(() => {
  const query = marketplaceQuery.value.trim().toLowerCase();
  return marketplaces.value.flatMap(item => item.catalog.plugins).filter(plugin =>
    !query || [plugin.id, plugin.name, plugin.description ?? ''].some(value => value.toLowerCase().includes(query)),
  );
});
const marketplaceStatus = computed(() => marketplaces.value.find(item => item.marketplaceId === marketplaceId.value));

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
  pages.value = await window.pluginHostApi.listPages();
  marketplaces.value = await window.pluginHostApi.listMarketplaces();
  devSessions.value = await window.pluginHostApi.listDevSessions();
  const jobEntries = await Promise.all(
    plugins.value.map(async plugin => [plugin.manifest.id, await window.pluginHostApi!.listPluginJobs(plugin.manifest.id)] as const),
  );
  jobsByPlugin.value = Object.fromEntries(jobEntries);
  registerPluginRoutes(pages.value);
}

function devSessionFor(pluginId: string) { return devSessions.value.find(session => session.pluginId === pluginId); }

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

async function reconnectLocalDevSession(plugin: InstalledPluginRecord) {
  if (!plugin.localPath || !window.pluginHostApi) return;
  await runMutation(() => window.pluginHostApi!.connectDevSessionFromFile(plugin.localPath).then(() => undefined));
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
  void router.push(page.routePath);
}

async function handleInstallPackage() {
  const value = packageName.value.trim();
  if (!value || !window.pluginHostApi) return;
  await runMutation(async () => {
    await window.pluginHostApi!.installPluginFromPackage(value);
    packageName.value = '';
  });
}

async function handleRegisterLocal() {
  const value = localPath.value.trim();
  if (!value || !window.pluginHostApi) return;
  await runMutation(async () => {
    await window.pluginHostApi!.registerLocalPlugin(value);
    localPath.value = '';
  });
}

async function handleInstallGit() {
  if (!gitUrl.value.trim() || !gitRef.value.trim() || !window.pluginHostApi) return;
  await runInstall(async () => {
    await window.pluginHostApi!.installFromGit({ url: gitUrl.value.trim(), ref: gitRef.value.trim(), refType: gitRefType.value });
    gitUrl.value = '';
    gitRef.value = '';
  });
}

async function handleRefreshMarketplace() {
  if (!marketplaceId.value.trim() || !marketplaceUrl.value.trim() || !marketplaceRef.value.trim() || !window.pluginHostApi) return;
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

async function confirmMarketplaceInstall(approvedPermissions: import('@/contracts/plugin_host').PluginPermission[]) {
  const plugin = pendingMarketplacePlugin.value;
  if (!plugin || !window.pluginHostApi) return;
  pendingMarketplacePlugin.value = null;
  const safePermissions = serializeApprovedPermissions(approvedPermissions);
  await runInstall(() => window.pluginHostApi!.installFromMarketplace(marketplaceId.value, plugin.id, safePermissions).then(() => undefined), plugin.id);
}

async function updatePlugin(plugin: InstalledPluginRecord) {
  if (!window.pluginHostApi) return;
  await runInstall(() => window.pluginHostApi!.updatePlugin(plugin.manifest.id).then(() => undefined), plugin.manifest.id);
}

async function rollbackPlugin(plugin: InstalledPluginRecord) {
  if (!window.pluginHostApi) return;
  await runMutation(() => window.pluginHostApi!.rollbackPlugin(plugin.manifest.id).then(() => undefined));
}

async function uninstallPlugin(plugin: InstalledPluginRecord) {
  if (!window.pluginHostApi) return;
  await runMutation(() => window.pluginHostApi!.uninstallPlugin(plugin.manifest.id));
}

async function togglePlugin(plugin: InstalledPluginRecord) {
  if (!window.pluginHostApi) return;
  await runMutation(async () => {
    if (plugin.enabled) await window.pluginHostApi!.disablePlugin(plugin.manifest.id);
    else await window.pluginHostApi!.enablePlugin(plugin.manifest.id);
  });
}

watch(activeTab, tab => {
  if (tab === 'marketplace' && !marketplaceLoaded.value) void handleRefreshMarketplace();
});

onMounted(() => {
  globalStore.setTopbarColor('');
  removeInstallProgressListener = window.pluginHostApi?.onInstallProgress(progress => {
    installProgress.value = progress;
  });
  void refresh();
});

onBeforeUnmount(() => removeInstallProgressListener?.());
</script>

<template>
  <div class="plugins-page">
    <header class="plugins-header">
      <div>
        <h1>插件</h1>
        <p>安装、启用并发现适合你工作流的扩展。</p>
      </div>
      <div class="plugins-summary" aria-label="插件统计">
        <span><strong>{{ plugins.length }}</strong> 个已安装</span>
        <span><strong>{{ enabledCount }}</strong> 个运行中</span>
      </div>
    </header>

    <div v-if="errorMessage" class="plugins-error ui-status-banner ui-status-banner--danger">{{ errorMessage }}</div>
    <section v-if="installProgress" class="install-progress" :class="{ 'install-progress--failed': installProgress.phase === 'failed' }" aria-live="polite">
      <div class="install-progress__head"><strong>{{ installProgressLabel }}</strong><span>{{ installProgressPercent }}%</span></div>
      <div class="install-progress__bar" role="progressbar" :aria-valuenow="installProgressPercent" aria-valuemin="0" aria-valuemax="100"><div class="install-progress__bar-fill" :style="{ width: `${installProgressPercent}%` }" /></div>
      <p v-if="installProgress.error" class="install-progress__error">{{ installProgress.error }}</p>
    </section>

    <nav class="plugin-tabs" role="tablist" aria-label="插件视图">
      <button
        class="plugin-tab"
        :class="{ 'plugin-tab--active': activeTab === 'installed' }"
        role="tab"
        :aria-selected="activeTab === 'installed'"
        type="button"
        @click="activeTab = 'installed'"
      >
        已安装
        <span class="plugin-tab__count">{{ plugins.length }}</span>
      </button>
      <button
        class="plugin-tab"
        :class="{ 'plugin-tab--active': activeTab === 'marketplace' }"
        role="tab"
        :aria-selected="activeTab === 'marketplace'"
        type="button"
        @click="activeTab = 'marketplace'"
      >
        插件市场
        <span class="plugin-tab__count">{{ marketplacePlugins.length }}</span>
      </button>
    </nav>

    <main v-if="activeTab === 'installed'" class="plugin-view" role="tabpanel">
      <section class="toolbar-panel ui-glass-surface">
        <div class="section-heading">
          <div>
            <h2>添加插件</h2>
            <p>支持 npm、本地目录和 Git 仓库。</p>
          </div>
        </div>
        <div class="install-grid">
          <label class="field"><span>NPM 包名</span><div class="field-row"><UiInput v-model="packageName" placeholder="例如：guyantools-plugin-demo" /><UiButton variant="primary" :disabled="isBusy || !packageName.trim()" @click="handleInstallPackage">安装</UiButton></div></label>
          <label class="field"><span>本地路径</span><div class="field-row"><UiInput v-model="localPath" placeholder="插件目录或 plugin.json 路径" /><UiButton variant="secondary" :disabled="isBusy || !localPath.trim()" @click="handleRegisterLocal">注册</UiButton></div></label>
          <label class="field"><span>本地开发目录</span><div class="field-row"><UiInput v-model="localDevPath" placeholder="含 .guyantools/plugin.dev.json 的目录" /><UiButton variant="secondary" :disabled="isBusy || !localDevPath.trim()" @click="connectLocalDevSession">连接</UiButton></div></label>
          <label class="field field--wide"><span>Git 仓库</span><div class="field-row field-row--git"><UiInput v-model="gitUrl" placeholder="https://github.com/owner/plugin" /><UiInput v-model="gitRef" placeholder="v1.0.0" /><select v-model="gitRefType" class="plugin-select"><option value="tag">tag</option><option value="branch">branch</option><option value="commit">commit</option></select><UiButton variant="secondary" :disabled="isBusy || !gitUrl.trim() || !gitRef.trim()" @click="handleInstallGit">安装</UiButton></div></label>
        </div>
      </section>

      <section class="installed-section">
        <div class="section-heading">
          <div><h2>已安装插件</h2><p>管理插件状态、版本和运行记录。</p></div>
        </div>
        <div v-if="plugins.length === 0" class="empty-state ui-soft-surface">还没有已安装插件，去插件市场看看吧。</div>
        <div v-else class="installed-list">
          <article v-for="plugin in plugins" :key="plugin.manifest.id" class="installed-row ui-soft-surface">
            <div class="plugin-avatar" aria-hidden="true">{{ plugin.manifest.displayName.slice(0, 1) }}</div>
            <div class="installed-row__main">
              <div class="installed-row__title"><h3>{{ plugin.manifest.displayName }}</h3><span class="status-dot" :class="{ 'status-dot--on': plugin.enabled }">{{ plugin.enabled ? '运行中' : '已停用' }}</span></div>
              <p>{{ plugin.manifest.description || '暂无描述' }}</p>
              <div class="plugin-meta"><span>{{ plugin.manifest.id }}</span><span>v{{ plugin.manifest.version }}</span><span>{{ plugin.installSource.type }}</span><span>{{ plugin.status }}</span></div>
              <div class="plugin-permission-summary"><span>请求 {{ plugin.manifest.permissions.length }} 项权限</span><span>已批准 {{ plugin.approvedPermissions.length }} 项</span><span>{{ plugin.manifest.capabilities.length }} 项能力</span></div>
            </div>
            <div class="installed-row__actions">
              <UiButton variant="secondary" size="sm" :disabled="isBusy" @click="togglePlugin(plugin)">{{ plugin.enabled ? '停用' : '启用' }}</UiButton>
              <UiButton v-if="plugin.installSource.type === 'git' || plugin.installSource.type === 'marketplace'" variant="ghost" size="sm" :disabled="isBusy" @click="updatePlugin(plugin)">更新</UiButton>
              <UiButton v-if="plugin.installSource.type === 'git' || plugin.installSource.type === 'marketplace'" variant="ghost" size="sm" :disabled="isBusy" @click="rollbackPlugin(plugin)">回滚</UiButton>
              <UiButton v-if="plugin.installSource.type === 'local' && devSessionFor(plugin.manifest.id)" variant="ghost" size="sm" :disabled="isBusy" @click="stopDevSession(plugin.manifest.id)">停止本地开发</UiButton>
              <UiButton v-if="plugin.installSource.type === 'local' && !devSessionFor(plugin.manifest.id)" variant="ghost" size="sm" :disabled="isBusy || !plugin.localPath" @click="reconnectLocalDevSession(plugin)">重连本地开发</UiButton>
              <UiButton variant="ghost" size="sm" :disabled="isBusy" @click="uninstallPlugin(plugin)">卸载</UiButton>
            </div>
            <div v-if="plugin.installSource.type === 'local' && devSessionFor(plugin.manifest.id)" class="dev-session-status">本地开发已连接 · {{ devSessionFor(plugin.manifest.id)?.port }}</div>
            <PluginJobPanel :jobs="jobsByPlugin[plugin.manifest.id] || []" />
          </article>
        </div>
      </section>

      <section class="contributions-section">
        <div class="section-heading"><div><h2>插件页面</h2><p>已启用插件提供的页面入口。</p></div></div>
        <div v-if="pages.length === 0" class="empty-state ui-soft-surface">当前没有已启用的插件页面。</div>
        <div v-else class="page-list">
          <UiButton v-for="page in pages" :key="`${page.pluginId}:${page.pageId}`" class="page-item ui-soft-surface" variant="ghost" type="button" @click="openPluginPage(page)">
            <strong>{{ page.title }}</strong><span>{{ page.routePath }}</span>
          </UiButton>
        </div>
      </section>
    </main>

    <main v-else class="plugin-view" role="tabpanel">
      <section class="marketplace-toolbar ui-glass-surface">
        <div class="section-heading">
          <div><h2>插件市场</h2><p>从公开仓库获取插件目录，选择后即可安装。</p></div>
          <UiButton variant="secondary" :disabled="isMarketplaceRefreshing || isBusy" @click="handleRefreshMarketplace">{{ isMarketplaceRefreshing ? '拉取中…' : '刷新市场' }}</UiButton>
        </div>
        <div class="marketplace-controls">
          <UiInput v-model="marketplaceQuery" placeholder="搜索插件名称或描述" />
          <details class="marketplace-settings">
            <summary>仓库设置</summary>
            <div class="marketplace-settings__body">
              <UiInput v-model="marketplaceId" placeholder="市场 ID" />
              <UiInput v-model="marketplaceRef" placeholder="分支或标签" />
              <UiInput v-model="marketplaceUrl" placeholder="catalog.json HTTPS URL" />
            </div>
          </details>
        </div>
        <div v-if="marketplaceStatus" class="marketplace-status"><span>{{ marketplaceStatus.catalog.name }}</span><span>{{ marketplaceStatus.fromCache ? '使用缓存' : '已同步' }}</span><span>更新于 {{ marketplaceStatus.refreshedAt }}</span></div>
      </section>

      <div v-if="isMarketplaceRefreshing && marketplacePlugins.length === 0" class="marketplace-loading" aria-live="polite">正在拉取市场目录…</div>
      <div v-else-if="marketplacePlugins.length === 0" class="empty-state ui-soft-surface">暂无匹配插件，请刷新市场或调整搜索条件。</div>
      <section v-else class="marketplace-grid" aria-label="市场插件列表">
        <article v-for="plugin in marketplacePlugins" :key="plugin.id" class="marketplace-card ui-soft-surface">
          <div class="marketplace-card__top"><div class="plugin-avatar plugin-avatar--market" aria-hidden="true">{{ plugin.name.slice(0, 1) }}</div><span class="version-badge">v{{ plugin.version }}</span></div>
          <h3>{{ plugin.name }}</h3>
          <p>{{ plugin.description || plugin.id }}</p>
          <div class="marketplace-card__meta"><span>{{ plugin.id }}</span><span>{{ plugin.refType }} · {{ plugin.ref }}</span><span>{{ plugin.resolvedCommit.slice(0, 12) }}</span></div>
          <div v-if="plugin.permissions?.length" class="permission-summary">{{ plugin.permissions.length }} 项权限需确认</div>
          <UiButton class="marketplace-card__action" variant="primary" block :disabled="isBusy" @click="requestMarketplaceInstall(plugin)">{{ isBusy && activeInstallPluginId === plugin.id ? installProgressLabel || '正在准备安装' : '安装插件' }}</UiButton>
        </article>
      </section>
    </main>

    <PluginPermissionDialog :plugin="pendingMarketplacePlugin" :visible="Boolean(pendingMarketplacePlugin)" @cancel="pendingMarketplacePlugin = null" @confirm="confirmMarketplaceInstall" />
  </div>
</template>

<style scoped lang="scss">
.plugins-page { min-height: 100%; padding: 28px; color: var(--ui-text-primary); background: var(--background-color); overflow: auto; box-sizing: border-box; }
.plugins-header, .plugin-view, .plugin-tabs { width: min(100%, 1240px); margin: 0 auto; }
.plugins-header { display: flex; justify-content: space-between; align-items: end; gap: 24px; margin-bottom: 22px; }
.plugins-header h1, .section-heading h2, .installed-row h3, .marketplace-card h3 { margin: 0; }
.plugins-header h1 { font-size: 1.875rem; line-height: 1.2; }
.plugins-header p, .section-heading p, .installed-row p, .marketplace-card p { color: var(--ui-text-muted); line-height: 1.55; }
.plugins-header p { margin: 8px 0 0; }
.plugins-summary { display: flex; gap: 18px; color: var(--ui-text-muted); font-size: 0.84rem; white-space: nowrap; }
.plugins-summary strong { color: var(--ui-text-primary); font-size: 1.05rem; margin-right: 4px; }
.plugins-error { width: min(100%, 1240px); margin: 0 auto 18px; }
.install-progress { width: min(100%, 1240px); margin: 0 auto 18px; padding: 14px 16px; border: var(--ui-border-width-thin) solid var(--ui-border-subtle); border-radius: var(--ui-radius-sm); background: var(--ui-surface-bg); }
.install-progress__head { display: flex; justify-content: space-between; gap: 16px; font-size: 0.82rem; }
.install-progress__head span { color: var(--ui-text-muted); font-variant-numeric: tabular-nums; }
.install-progress__bar { height: 6px; margin-top: 10px; overflow: hidden; border-radius: var(--ui-radius-full); background: var(--ui-surface-bg-muted); }
.install-progress__bar-fill { height: 100%; background: var(--ui-primary-color); transition: width 160ms ease-out; }
.install-progress--failed { border-color: var(--ui-state-danger); }
.install-progress--failed .install-progress__bar-fill { background: var(--ui-state-danger); }
.install-progress__error { margin: 8px 0 0; color: var(--ui-state-danger); font-size: 0.78rem; overflow-wrap: anywhere; }
.plugin-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--ui-border-subtle); margin-bottom: 22px; }
.plugin-tab { appearance: none; position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 14px; border: 0; background: transparent; color: var(--ui-text-muted); font: inherit; font-weight: 650; cursor: pointer; }
.plugin-tab::after { content: ''; position: absolute; right: 10px; bottom: -1px; left: 10px; height: 2px; background: transparent; }
.plugin-tab:hover, .plugin-tab:focus-visible { color: var(--ui-text-primary); }
.plugin-tab:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); border-radius: var(--ui-radius-xs); }
.plugin-tab--active { color: var(--ui-primary-color); }
.plugin-tab--active::after { background: var(--ui-primary-color); }
.plugin-tab__count { min-width: 20px; padding: 2px 6px; border-radius: var(--ui-radius-full); background: var(--ui-surface-bg-muted); font-size: 0.72rem; text-align: center; }
.plugin-view { display: grid; gap: 26px; padding-bottom: 32px; }
.toolbar-panel, .marketplace-toolbar { padding: 20px; }
.section-heading { display: flex; justify-content: space-between; align-items: start; gap: 16px; }
.section-heading h2 { font-size: 1.08rem; }
.section-heading p { margin: 5px 0 0; font-size: 0.84rem; }
.install-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; margin-top: 16px; }
.field { display: grid; gap: 7px; min-width: 0; }
.field--wide { grid-column: 1 / -1; }
.field > span { color: var(--ui-text-muted); font-size: 0.78rem; font-weight: 650; }
.field-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.field-row--git { grid-template-columns: minmax(0, 1.6fr) minmax(120px, .7fr) 100px auto; }
.plugin-select { min-height: var(--ui-control-height-md); border: var(--ui-border-width-thin) solid var(--ui-input-border); border-radius: var(--ui-radius-sm); padding: 0 10px; background: var(--ui-input-bg); color: var(--ui-input-text); }
.installed-section, .contributions-section { display: grid; gap: 14px; }
.installed-list { display: grid; gap: 10px; }
.installed-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: start; padding: 16px; }
.plugin-avatar { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 auto; border-radius: var(--ui-radius-sm); background: color-mix(in srgb, var(--ui-primary-color) 18%, var(--ui-surface-bg)); color: var(--ui-primary-color); font-size: 1.05rem; font-weight: 750; }
.plugin-avatar--market { width: 46px; height: 46px; }
.installed-row__title { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
.installed-row h3, .marketplace-card h3 { font-size: 0.98rem; }
.installed-row p, .marketplace-card p { margin: 4px 0 0; font-size: 0.84rem; }
.status-dot { display: inline-flex; align-items: center; gap: 5px; color: var(--ui-text-muted); font-size: 0.72rem; }
.status-dot::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--ui-text-muted); }
.status-dot--on { color: var(--ui-state-success); }
.status-dot--on::before { background: var(--ui-state-success); }
.plugin-meta, .marketplace-card__meta, .marketplace-status { display: flex; flex-wrap: wrap; gap: 8px 14px; color: var(--ui-text-muted); font-size: 0.74rem; }
.plugin-meta { margin-top: 8px; }
.plugin-permission-summary { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 8px; color: var(--ui-text-muted); font-size: 0.72rem; }
.plugin-meta span + span::before, .marketplace-card__meta span + span::before { content: '·'; margin-right: 14px; color: var(--ui-border-subtle); }
.installed-row__actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 4px; }
.installed-row :deep(.job-panel) { grid-column: 2 / -1; }
.page-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
.page-item.ui-button { display: grid; justify-content: start; gap: 4px; min-height: 60px; padding: 12px 14px; text-align: left; white-space: normal; }
.page-item :deep(.ui-button__label) { display: grid; gap: 4px; justify-content: start; width: 100%; text-align: left; }
.page-item span { color: var(--ui-text-muted); font-size: 0.76rem; }
.marketplace-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; margin-top: 16px; }
.marketplace-settings { position: relative; min-width: 100px; }
.marketplace-settings summary { display: flex; align-items: center; justify-content: center; height: var(--ui-control-height-md); padding: 0 12px; border: var(--ui-border-width-thin) solid var(--ui-border-subtle); border-radius: var(--ui-radius-sm); color: var(--ui-text-muted); font-size: 0.82rem; cursor: pointer; list-style: none; }
.marketplace-settings summary::-webkit-details-marker { display: none; }
.marketplace-settings[open] summary { color: var(--ui-text-primary); border-color: var(--ui-input-focus-border); }
.marketplace-settings__body { position: absolute; z-index: 2; top: calc(100% + 8px); right: 0; display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 8px; width: min(680px, calc(100vw - 56px)); padding: 12px; border: var(--ui-border-width-thin) solid var(--ui-border-subtle); border-radius: var(--ui-radius-sm); background: var(--ui-surface-bg); box-shadow: var(--ui-shadow-popover); }
.marketplace-status { margin-top: 12px; }
.marketplace-loading { padding: 38px 0; color: var(--ui-text-muted); text-align: center; }
.marketplace-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; }
.marketplace-card { display: flex; flex-direction: column; min-height: 228px; padding: 16px; }
.marketplace-card__top { display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px; }
.version-badge { padding: 4px 7px; border-radius: var(--ui-radius-xs); background: var(--ui-surface-bg-muted); color: var(--ui-text-muted); font-size: 0.72rem; font-family: var(--ui-font-mono, Consolas, "SFMono-Regular", monospace); }
.marketplace-card__meta { margin-top: auto; padding-top: 18px; }
.permission-summary { margin-top: 10px; color: var(--ui-state-warning); font-size: 0.74rem; }
.marketplace-card__action { margin-top: 14px; }
.empty-state { padding: 30px 18px; color: var(--ui-text-muted); text-align: center; }

@media (max-width: 800px) {
  .plugins-page { padding: 20px 16px; }
  .plugins-header { align-items: start; flex-direction: column; gap: 12px; }
  .install-grid { grid-template-columns: 1fr; }
  .field--wide { grid-column: auto; }
  .field-row--git { grid-template-columns: 1fr 1fr; }
  .field-row--git :deep(.ui-input:first-child) { grid-column: 1 / -1; }
  .installed-row { grid-template-columns: auto minmax(0, 1fr); }
  .installed-row__actions { grid-column: 2; justify-content: start; }
  .installed-row :deep(.job-panel) { grid-column: 1 / -1; }
  .marketplace-settings__body { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .plugin-tab, .marketplace-card, .installed-row { transition: none; }
}
</style>
