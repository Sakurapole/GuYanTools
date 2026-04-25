<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { AppLanguage, AppTheme } from '@/contracts/app_config';
import type { TerminalProfile, TerminalRendererMode } from '@/contracts/terminal';
import type { WebScriptRule } from '@/contracts/webview';
import type { InstalledPluginRecord, PluginHostSummary } from '@/contracts/plugin_host';
import UiButton from '../components/ui/UiButton.vue';
import UiField from '../components/ui/UiField.vue';
import UiInput from '../components/ui/UiInput.vue';
import ShortcutRecorder from '../components/ui/ShortcutRecorder.vue';
import UiSelect from '../components/ui/UiSelect.vue';
import UiTabs, { type UiTabItem } from '../components/ui/UiTabs.vue';
import { useAppConfigStore } from '../stores/app_config_store';
import { useGlobalStore } from '../stores/global_store';
import { useSettingStore, type SettingsTabKey } from '../stores/settings_store';
import { useUpdaterStore } from '../stores/updater_store';
import { createDefaultAppConfig } from '@/contracts/app_config';

const settingsStore = useSettingStore();
const appConfigStore = useAppConfigStore();
const globalStore = useGlobalStore();
const updaterStore = useUpdaterStore();
const defaultShortcuts = createDefaultAppConfig().shortcuts;

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
const sshReconnectMaxAttemptsInput = ref(String(appConfigStore.config.features.terminal.sshReconnectMaxAttempts || 3));
const githubTokenInput = ref('');
const updaterAuthMessage = ref('');
const updaterAuthSaving = ref(false);

const settingsTabs: UiTabItem[] = [
  { key: 'general', label: '基础设置' },
  { key: 'web-security', label: 'WebView' },
  { key: 'ai-agent', label: 'Agent' },
  { key: 'plugins', label: '插件配置' },
  { key: 'terminal', label: '终端' },
  { key: 'shortcuts', label: '快捷键' },
];
const settingsTabOrder = settingsTabs.map(tab => tab.key) as SettingsTabKey[];
const settingsTabTransition = ref('settings-tab-forward');
const settingsNavDirection = ref<'forward' | 'back'>('forward');

const themeOptions = [
  { label: '浅色主题', value: 'light' },
  { label: '深色主题', value: 'dark' },
];

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
const terminalProfileOptions = computed(() => terminalProfiles.value.map((profile) => ({
  label: profile.label,
  value: profile.id,
})));
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
  }
}

async function handleThemeChange(value: string) {
  await appConfigStore.updateConfig({
    appearance: {
      theme: value as AppTheme,
    },
  });
}

async function handleLanguageChange(value: string) {
  await appConfigStore.updateConfig({
    appearance: {
      language: value as AppLanguage,
    },
  });
}

function handleSettingsTabChange(value: string) {
  const nextTab = value as SettingsTabKey;
  const currentIndex = settingsTabOrder.indexOf(settingsStore.activeSettingsTab);
  const nextIndex = settingsTabOrder.indexOf(nextTab);

  settingsTabTransition.value = nextIndex >= currentIndex ? 'settings-tab-forward' : 'settings-tab-back';
  settingsNavDirection.value = nextIndex >= currentIndex ? 'forward' : 'back';
  settingsStore.setActiveSettingsTab(nextTab);
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

async function handleTerminalSixelChange(event: Event) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        enableSixel: (event.target as HTMLInputElement).checked,
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

onMounted(() => {
  globalStore.setTopbarColor('');
  if (appConfigStore.fontOptions.length === 0) {
    void appConfigStore.loadLocalFonts();
  }

  void loadPluginContext();
  void loadTerminalProfiles();

  // 如果已配置 FFmpeg 路径，则自动验证
  if (ffmpegPathInput.value) {
    void commitAndVerifyFfmpeg();
  }
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
  try {
    chromeExtensions.value = await window.webviewApi.getExtensions();
  } catch (err) {
    console.error('Failed to load extensions:', err);
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
    alert(err.message || '安装扩展失败');
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
  }
}

async function toggleExtension(id: string, enabled: boolean) {
  try {
    await window.webviewApi.toggleExtension(id, enabled);
    await loadExtensions();
  } catch (err) {
    console.error('Toggle extension failed:', err);
  }
}

// 初始化加载
loadExtensions();

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
  <div class="settings-page">
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
        :class="`settings-nav--${settingsNavDirection}`"
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
                <div class="update-release-notes">
                  {{ updaterStore.releaseNotesSummary }}
                </div>
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
          </section>

          <section class="settings-group">
            <h3>行为偏好</h3>
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
  </div>
</template>

<style lang="scss" scoped>
.settings-page {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  color: var(--ui-text-primary);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--background-color) 90%, #ffffff 10%) 0%, var(--background-color) 100%);
  overflow-y: auto;
  overflow-x: hidden;
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

  :deep(.ui-tabs--line .ui-tabs__item::after) {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: #0b67d8;
    opacity: 0;
    transform: translateX(0) scaleX(0.36);
    transform-origin: center;
    transition:
      opacity 0.28s ease,
      transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  :deep(.ui-tabs--line .ui-tabs__item.is-active::after) {
    opacity: 1;
    transform: translateX(0) scaleX(1);
  }
}

.settings-nav--forward {
  :deep(.ui-tabs--line .ui-tabs__item::after) {
    transform: translateX(14px) scaleX(0.34);
    transform-origin: right;
  }

  :deep(.ui-tabs--line .ui-tabs__item.is-active::after) {
    animation: settingsUnderlineInForward 0.46s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    transform-origin: left;
  }
}

.settings-nav--back {
  :deep(.ui-tabs--line .ui-tabs__item::after) {
    transform: translateX(-14px) scaleX(0.34);
    transform-origin: left;
  }

  :deep(.ui-tabs--line .ui-tabs__item.is-active::after) {
    animation: settingsUnderlineInBack 0.46s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    transform-origin: right;
  }
}

@keyframes settingsUnderlineInForward {
  from {
    opacity: 0;
    transform: translateX(-14px) scaleX(0.34);
  }

  to {
    opacity: 1;
    transform: translateX(0) scaleX(1);
  }
}

@keyframes settingsUnderlineInBack {
  from {
    opacity: 0;
    transform: translateX(14px) scaleX(0.34);
  }

  to {
    opacity: 1;
    transform: translateX(0) scaleX(1);
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

.settings-tab-forward-enter-active,
.settings-tab-forward-leave-active,
.settings-tab-back-enter-active,
.settings-tab-back-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity, transform;
}

.settings-tab-forward-enter-from {
  opacity: 0;
  transform: translateX(28px);
}

.settings-tab-forward-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.settings-tab-back-enter-from {
  opacity: 0;
  transform: translateX(-28px);
}

.settings-tab-back-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

@media (prefers-reduced-motion: reduce) {
  .settings-nav :deep(.ui-tabs__item),
  .settings-nav :deep(.ui-tabs--line .ui-tabs__item::after),
  .settings-tab-forward-enter-active,
  .settings-tab-forward-leave-active,
  .settings-tab-back-enter-active,
  .settings-tab-back-leave-active {
    transition: none;
  }

  .settings-nav :deep(.ui-tabs--line .ui-tabs__item.is-active::after) {
    animation: none;
  }

  .settings-nav :deep(.ui-tabs__item.is-active),
  .settings-tab-forward-enter-from,
  .settings-tab-forward-leave-to,
  .settings-tab-back-enter-from,
  .settings-tab-back-leave-to {
    transform: none;
  }
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
  min-height: 88px;
  max-height: 180px;
  overflow: auto;
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
</style>
