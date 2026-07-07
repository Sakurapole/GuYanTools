<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { registerPluginRoutes } from '../../routes/router';
import { useGlobalStore } from '../../stores/global_store';
import type { InstalledPluginRecord, PluginHostSummary, PluginPageDescriptor } from '@/contracts/plugin_host';
import UiButton from '../../components/ui/UiButton.vue';
import UiInput from '../../components/ui/UiInput.vue';
import { notifyError } from '../../composables/useInAppNotification';

const router = useRouter();

const hostSummary = ref<PluginHostSummary | null>(null);
const plugins = ref<InstalledPluginRecord[]>([]);
const pages = ref<PluginPageDescriptor[]>([]);
const packageName = ref('');
const localPath = ref('');
const isBusy = ref(false);
const errorMessage = ref('');

const enabledCount = computed(() => plugins.value.filter(plugin => plugin.enabled).length);

async function refresh() {
  if (!window.pluginHostApi) {
    errorMessage.value = 'pluginHostApi 不可用';
    return;
  }

  hostSummary.value = await window.pluginHostApi.getHostSummary();
  plugins.value = await window.pluginHostApi.listPlugins();
  pages.value = await window.pluginHostApi.listPages();
  registerPluginRoutes(pages.value);
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

function openPluginPage(page: PluginPageDescriptor) {
  void router.push(page.routePath);
}

async function handleInstallPackage() {
  const value = packageName.value.trim();
  if (!value || !window.pluginHostApi) {
    return;
  }

  await runMutation(async () => {
    await window.pluginHostApi!.installPluginFromPackage(value);
    packageName.value = '';
  });
}

async function handleRegisterLocal() {
  const value = localPath.value.trim();
  if (!value || !window.pluginHostApi) {
    return;
  }

  await runMutation(async () => {
    await window.pluginHostApi!.registerLocalPlugin(value);
    localPath.value = '';
  });
}

async function togglePlugin(plugin: InstalledPluginRecord) {
  if (!window.pluginHostApi) {
    return;
  }

  await runMutation(async () => {
    if (plugin.enabled) {
      await window.pluginHostApi!.disablePlugin(plugin.manifest.id);
    } else {
      await window.pluginHostApi!.enablePlugin(plugin.manifest.id);
    }
  });
}

const globalStore = useGlobalStore();

onMounted(() => {
  globalStore.setTopbarColor('');
  void refresh();
});
</script>

<template>
  <div class="plugins-page">
    <header class="plugins-hero">
      <div>
        <h1>插件平台</h1>
        <p>宿主能力层、插件内核和运行时桥接已经接入主应用。这里展示当前已注册插件、页面贡献和宿主能力域。</p>
      </div>
      <div class="hero-metrics">
        <div class="metric-card ui-soft-surface">
          <span>已注册插件</span>
          <strong>{{ plugins.length }}</strong>
        </div>
        <div class="metric-card ui-soft-surface">
          <span>已启用</span>
          <strong>{{ enabledCount }}</strong>
        </div>
        <div class="metric-card ui-soft-surface">
          <span>页面贡献</span>
          <strong>{{ pages.length }}</strong>
        </div>
      </div>
    </header>

    <div v-if="errorMessage" class="plugins-error ui-status-banner ui-status-banner--danger">
      {{ errorMessage }}
    </div>

    <section class="plugins-section">
      <div class="section-card ui-glass-surface">
        <h2>安装插件</h2>
        <label class="field">
          <span>NPM 包名</span>
          <div class="field-row">
            <UiInput v-model="packageName" placeholder="例如：guyantools-plugin-demo" />
            <UiButton variant="primary" :disabled="isBusy || !packageName.trim()" @click="handleInstallPackage">安装</UiButton>
          </div>
        </label>

        <label class="field">
          <span>本地路径</span>
          <div class="field-row">
            <UiInput v-model="localPath" placeholder="插件目录或 plugin.json 路径" />
            <UiButton variant="primary" :disabled="isBusy || !localPath.trim()" @click="handleRegisterLocal">注册</UiButton>
          </div>
        </label>
      </div>

      <div v-if="hostSummary" class="section-card ui-glass-surface">
        <h2>宿主能力域</h2>
        <div class="capability-grid">
          <div class="capability-card ui-soft-surface">
            <span>workspace</span>
            <code>{{ hostSummary.capabilities.workspace.join(', ') }}</code>
          </div>
          <div class="capability-card ui-soft-surface">
            <span>data</span>
            <code>{{ hostSummary.capabilities.data.join(', ') }}</code>
          </div>
          <div class="capability-card ui-soft-surface">
            <span>storage</span>
            <code>{{ hostSummary.capabilities.storage.join(', ') }}</code>
          </div>
          <div class="capability-card ui-soft-surface">
            <span>navigation</span>
            <code>{{ hostSummary.capabilities.navigation.join(', ') }}</code>
          </div>
          <div class="capability-card ui-soft-surface">
            <span>commands</span>
            <code>{{ hostSummary.capabilities.commands.join(', ') }}</code>
          </div>
          <div class="capability-card ui-soft-surface">
            <span>ui</span>
            <code>{{ hostSummary.capabilities.ui.join(', ') }}</code>
          </div>
          <div class="capability-card ui-soft-surface">
            <span>system</span>
            <code>{{ hostSummary.capabilities.system.join(', ') }}</code>
          </div>
          <div class="capability-card ui-soft-surface">
            <span>observability</span>
            <code>{{ hostSummary.capabilities.observability.join(', ') }}</code>
          </div>
        </div>
      </div>
    </section>

    <section class="plugins-section">
      <div class="section-card section-card--wide ui-glass-surface">
        <h2>插件注册表</h2>
        <div v-if="plugins.length === 0" class="empty-state ui-soft-surface">
          还没有已注册插件。
        </div>
        <div v-else class="plugin-list">
          <article v-for="plugin in plugins" :key="plugin.manifest.id" class="plugin-card ui-soft-surface">
            <div class="plugin-card__header">
              <div>
                <h3>{{ plugin.manifest.displayName }}</h3>
                <p>{{ plugin.manifest.description || '暂无描述' }}</p>
              </div>
              <UiButton variant="secondary" size="sm" :disabled="isBusy" @click="togglePlugin(plugin)">
                {{ plugin.enabled ? '禁用' : '启用' }}
              </UiButton>
            </div>

            <div class="plugin-meta">
              <span>ID: <code>{{ plugin.manifest.id }}</code></span>
              <span>版本: <code>{{ plugin.manifest.version }}</code></span>
              <span>状态: <code>{{ plugin.status }}</code></span>
              <span>信任级别: <code>{{ plugin.manifest.trustLevel }}</code></span>
              <span>运行时: <code>{{ plugin.manifest.runtime }}</code></span>
              <span>来源: <code>{{ plugin.installSource.type }}</code></span>
            </div>

            <div class="plugin-permissions">
              <strong>权限</strong>
              <code>{{ plugin.manifest.permissions.join(', ') || '无' }}</code>
            </div>
          </article>
        </div>
      </div>

      <div class="section-card ui-glass-surface">
        <h2>页面贡献</h2>
        <div v-if="pages.length === 0" class="empty-state ui-soft-surface">
          当前没有已启用的插件页面。
        </div>
        <div v-else class="page-list">
          <UiButton v-for="page in pages" :key="`${page.pluginId}:${page.pageId}`" class="page-item ui-soft-surface" variant="ghost" type="button"
            @click="openPluginPage(page)">
            <strong>{{ page.title }}</strong>
            <span>{{ page.routePath }}</span>
          </UiButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.plugins-page {
  min-height: 100%;
  padding: 28px;
  color: var(--ui-text-primary);
  background:
    radial-gradient(circle at top right, rgba(93, 158, 237, 0.16), transparent 28%),
    linear-gradient(180deg, var(--background-color) 0%, var(--ui-surface-glass) 100%);
  overflow: auto;
  box-sizing: border-box;
}

.plugins-hero,
.plugins-section {
  display: grid;
  width: min(100%, 1240px);
  margin: 0 auto;
  gap: 20px;
}

.plugins-hero {
  grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
  align-items: start;
  margin-bottom: 20px;
}

.plugins-hero h1,
.section-card h2,
.plugin-card h3 {
  margin: 0;
}

.plugins-hero p,
.plugin-card p {
  color: var(--ui-text-muted);
  line-height: 1.6;
}

.hero-metrics,
.capability-grid,
.plugin-list,
.page-list {
  display: grid;
  gap: 14px;
}

.hero-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.metric-card {
  color: var(--ui-text-primary);
}

.metric-card,
.capability-card {
  padding: 16px;
}

.metric-card span,
.capability-card span,
.plugin-meta span {
  color: var(--ui-text-muted);
}

.metric-card strong {
  display: block;
  font-size: 28px;
  margin-top: 6px;
}

.plugins-error {
  width: min(100%, 1240px);
  margin: 0 auto 20px;
}

.plugins-section {
  grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
  margin-bottom: 20px;
}

.section-card { padding: 22px; }

.section-card--wide {
  min-width: 0;
}

.field {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.field-row :deep(.ui-input),
.field-row :deep(.ui-button) {
  width: 100%;
}

.plugin-card {
  padding: 18px;
}

.plugin-card__header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
}

.plugin-meta,
.plugin-permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-top: 14px;
}

code {
  font-family: Consolas, "SFMono-Regular", monospace;
  color: var(--ui-text-primary);
}

.page-item.ui-button {
  display: grid;
  gap: 4px;
  padding: 14px;
  text-align: left;
  border: none;
  cursor: pointer;
  color: var(--ui-text-primary);
  font: inherit;
  font-weight: inherit;
  white-space: normal;
  transform: none;

  &:hover:not(:disabled) {
    transform: none;
  }
}

.page-item :deep(.ui-button__label) {
  display: grid;
  justify-content: start;
  gap: 4px;
  width: 100%;
  text-align: left;
}

.empty-state {
  color: var(--ui-text-muted);
  padding: 16px;
}

@media (max-width: 1200px) {
  .plugins-hero,
  .plugins-section {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .plugins-page {
    padding: 18px;
  }

  .hero-metrics {
    grid-template-columns: 1fr;
  }

  .field-row {
    grid-template-columns: 1fr;
  }

  .plugin-card__header {
    flex-direction: column;
  }
}
</style>
