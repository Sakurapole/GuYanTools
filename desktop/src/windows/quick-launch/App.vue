<template>
  <main class="quick-launch-shell" :class="{ 'quick-launch-shell--visible': windowVisible }">
    <section class="quick-launch-panel" :style="quickLaunchPanelStyle">
      <div class="quick-launch-background" :style="backgroundLayerStyle">
        <video
          v-if="hasBackgroundVideo"
          class="quick-launch-background__video"
          :src="activeQuickLaunchBackground.video"
          :style="backgroundVideoStyle"
          autoplay
          muted
          loop
          playsinline
        />
      </div>

      <div class="quick-launch-search">
        <span class="quick-launch-search__mark">
          <img :src="appIconUrl" alt="" />
        </span>
        <button
          v-for="filter in selectedProviderFilterOptions"
          :key="filter.value"
          class="quick-launch-filter-tag"
          type="button"
          :title="`移除 ${filter.label} 筛选`"
          @click="removeProviderFilter(filter.value)"
        >
          <span>{{ filter.label }}</span>
          <span aria-hidden="true">×</span>
        </button>
        <input
          ref="inputRef"
          v-model="query"
          class="quick-launch-search__input"
          :placeholder="searchInputPlaceholder"
          spellcheck="false"
          @keydown="handleKeydown"
        />
      </div>

      <div v-if="!loading && errors.length" class="quick-launch-status" role="status">
        {{ errors[0] }}
      </div>

      <section v-if="everythingStartPromptVisible" class="quick-launch-everything-prompt" role="dialog" aria-live="polite">
        <div class="quick-launch-everything-prompt__body">
          <strong>Everything 未运行</strong>
          <span>{{ everythingStartPromptMessage }}</span>
        </div>
        <div class="quick-launch-everything-prompt__actions">
          <button type="button" class="quick-launch-everything-prompt__button" @click="dismissEverythingStartPrompt">
            稍后
          </button>
          <button
            type="button"
            class="quick-launch-everything-prompt__button quick-launch-everything-prompt__button--primary"
            :disabled="everythingStarting"
            @click="startEverythingFromPrompt"
          >
            {{ everythingStarting ? '启动中' : '启动 Everything' }}
          </button>
        </div>
      </section>

      <section v-if="searchProgressVisible" class="quick-launch-progress" role="status" aria-live="polite">
        <div class="quick-launch-progress__meta">
          <span>{{ searchProgressText }}</span>
          <small>{{ searchProgressCountText }}</small>
        </div>
        <div class="quick-launch-progress__track">
          <span class="quick-launch-progress__bar" :style="{ width: `${searchProgressPercent}%` }" />
        </div>
      </section>

      <UiScrollbar
        ref="resultsScrollbarRef"
        class="quick-launch-results-scrollbar"
        :x="false"
        :y="true"
        :size="8"
        track-color="transparent"
        thumb-color="rgba(82, 96, 114, 0.32)"
        thumb-hover-color="rgba(82, 96, 114, 0.48)"
      >
        <div v-if="historyVisible" class="quick-launch-history">
          <button
            v-for="(item, index) in queryHistory"
            :key="item"
            class="quick-launch-history__item"
            :class="{ 'quick-launch-history__item--active': index === historyActiveIndex }"
            type="button"
            @mouseenter="historyActiveIndex = index"
            @mousedown.prevent="applyHistoryQuery(index)"
          >
            {{ item }}
          </button>
          <div v-if="queryHistory.length === 0" class="quick-launch-empty">
            暂无搜索历史
          </div>
        </div>

        <div v-else-if="actionPanelOpen" class="quick-launch-action-panel" role="menu" :aria-label="actionPanelTargetLabel">
          <button
            v-for="(action, index) in filteredContextActions"
            :key="action.id"
            class="quick-launch-action-panel__item"
            :class="{ 'quick-launch-action-panel__item--active': index === actionPanelIndex }"
            type="button"
            role="menuitem"
            @mouseenter="actionPanelIndex = index"
            @mousedown.prevent="runActionPanelAction(action.id)"
          >
            <span class="quick-launch-action-panel__body">
              <span class="quick-launch-action-panel__title">{{ action.label }}</span>
            </span>
            <small>{{ actionPanelShortcut(index) }}</small>
          </button>
          <div v-if="filteredContextActions.length === 0" class="quick-launch-empty">
            没有匹配操作
          </div>
        </div>

        <div v-else class="quick-launch-results">
          <button
            v-for="(result, index) in results"
            :key="result.id"
            :ref="(element) => setResultButtonRef(element, index)"
            class="quick-launch-result"
            :class="{ 'quick-launch-result--active': index === activeIndex }"
            type="button"
            aria-haspopup="menu"
            @mouseenter="activeIndex = index"
            @mousedown.prevent="handleResultMouseDown($event, result, index)"
            @contextmenu.prevent="openActionPanelForResult(index)"
          >
            <span v-if="result.iconDataUrl" class="quick-launch-result__icon">
              <img :src="result.iconDataUrl" alt="" />
            </span>
            <span v-else class="quick-launch-result__provider">{{ providerLabels[result.providerId] }}</span>
            <span class="quick-launch-result__body">
              <span class="quick-launch-result__title">{{ result.title }}</span>
              <span v-if="result.subtitle" class="quick-launch-result__subtitle">{{ result.subtitle }}</span>
            </span>
          </button>

          <div v-if="!loading && query && results.length === 0" class="quick-launch-empty">
            {{ emptyStateText }}
          </div>
          <div v-if="loading" class="quick-launch-empty">
            正在搜索
          </div>
        </div>
      </UiScrollbar>

      <section v-if="previewVisible && activeResult" class="quick-launch-preview">
        <span class="quick-launch-preview__provider">{{ providerLabels[activeResult.providerId] }}</span>
        <span class="quick-launch-preview__content">
          <strong>{{ activeResult.title }}</strong>
          <span v-if="activeResult.subtitle">{{ activeResult.subtitle }}</span>
          <span v-if="activeResult.detail">{{ activeResult.detail }}</span>
          <span v-if="previewTargetText">{{ previewTargetText }}</span>
        </span>
      </section>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { createDefaultAppConfig, type AppConfig } from '@/contracts/app_config';
import { resolveThemeBackground } from '@/contracts/background';
import type {
  QuickLaunchExecuteOptions,
  QuickLaunchExecutionMode,
  QuickLaunchProviderId,
  QuickLaunchResult,
  QuickLaunchSearchInput,
  QuickLaunchSearchProgressEvent,
} from '@/contracts/quick_launch';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';

const appIconUrl = new URL('../../assets/icons/icon_64.png', import.meta.url).href;

const PROVIDER_FILTER_OPTIONS: Array<{
  value: QuickLaunchProviderId;
  label: string;
  aliases: string[];
}> = [
  { value: 'internal-route', label: '功能', aliases: ['功能', 'gn', 'function', 'functions', 'route', 'routes'] },
  { value: 'terminal', label: '终端', aliases: ['终端', 'zd', 'zhongduan', 'terminal', 'term', 'shell', 'cmd', 'powershell', 'pwsh'] },
  { value: 'ssh', label: 'SSH', aliases: ['ssh', '连接', 'lj', 'lianjie', 'server', 'remote'] },
  { value: 'ftp', label: '传输', aliases: ['传输', 'cs', 'chuanshu', 'ftp', 'sftp', 'transfer', 'filetransfer'] },
  { value: 'todo', label: '待办', aliases: ['待办', 'db', 'daiban', 'todo', 'task', 'tasks'] },
  { value: 'knowledge', label: '知识库', aliases: ['知识库', 'zsk', 'zhishiku', 'knowledge', 'kb', 'note', 'notes'] },
  { value: 'plugin', label: '插件', aliases: ['插件', 'cj', 'chajian', 'plugin', 'plugins', 'extension'] },
  { value: 'app', label: '应用', aliases: ['应用', 'yy', 'yingyong', 'app', 'apps', 'application'] },
  { value: 'file', label: '文件', aliases: ['文件', 'wj', 'wenjian', 'file', 'files', 'everything'] },
];

const providerLabels = Object.fromEntries(
  PROVIDER_FILTER_OPTIONS.map((option) => [option.value, option.label]),
) as Record<QuickLaunchProviderId, string>;

const QUERY_HISTORY_STORAGE_KEY = 'guyantools.quickLaunch.queryHistory';
const ACTION_PANEL_TARGET_STORAGE_KEY = 'guyantools.quickLaunch.actionPanelTarget';
const MAX_QUERY_HISTORY = 30;

type QuickLaunchContextActionId =
  | 'open'
  | 'open-detached-window'
  | 'open-containing-folder'
  | 'run-as-admin'
  | 'copy'
  | 'copy-path'
  | 'refresh';

interface QuickLaunchContextAction {
  id: QuickLaunchContextActionId;
  label: string;
  shortcut: string;
}

const query = ref('');
const loading = ref(false);
const executing = ref(false);
const results = ref<QuickLaunchResult[]>([]);
const errors = ref<string[]>([]);
const activeIndex = ref(0);
const runtimeMaxResults = ref<number | null>(null);
const actionPanelOpen = ref(false);
const actionPanelIndex = ref(0);
const actionPanelReturnQuery = ref('');
const contextPanelTargetResult = ref<QuickLaunchResult | null>(null);
const previewVisible = ref(false);
const historyVisible = ref(false);
const historyActiveIndex = ref(0);
const queryHistory = ref<string[]>([]);
const gameModeEnabled = ref(false);
const everythingStartPromptResult = ref<QuickLaunchResult | null>(null);
const dismissedEverythingStartPromptKey = ref('');
const everythingStarting = ref(false);
const searchProgress = ref<QuickLaunchSearchProgressEvent | null>(null);
const windowVisible = ref(false);
const selectedProviderFilters = ref<QuickLaunchProviderId[]>([]);
const inputRef = ref<HTMLInputElement | null>(null);
const resultButtonRefs = ref<Array<HTMLElement | null>>([]);
const resultsScrollbarRef = ref<InstanceType<typeof UiScrollbar> | null>(null);
const appConfig = ref<AppConfig>(createDefaultAppConfig());
const api = computed(() => window.quickLaunchApi);
const selectedProviderFilterOptions = computed(() => (
  selectedProviderFilters.value
    .map((providerId) => PROVIDER_FILTER_OPTIONS.find((option) => option.value === providerId))
    .filter((option): option is typeof PROVIDER_FILTER_OPTIONS[number] => Boolean(option))
));
const quickLaunchConfig = computed(() => appConfig.value.features.quickLaunch);
const effectiveMaxResults = computed(() => (
  Math.max(1, Math.min(50, Math.round(runtimeMaxResults.value ?? quickLaunchConfig.value.maxResults ?? 12)))
));
const activeResult = computed(() => historyVisible.value ? null : results.value[activeIndex.value]);
const actionTargetResult = computed(() => (
  actionPanelOpen.value ? contextPanelTargetResult.value : activeResult.value
));
const actionTargetHasPath = computed(() => Boolean(actionTargetResult.value && resultPath(actionTargetResult.value)));
const actionTargetIsApp = computed(() => actionTargetResult.value?.providerId === 'app');
const actionTargetIsFile = computed(() => actionTargetResult.value?.providerId === 'file');
const actionTargetCanOpenDetached = computed(() => Boolean(actionTargetResult.value && canOpenDetachedWindow(actionTargetResult.value)));
const contextActions = computed<QuickLaunchContextAction[]>(() => {
  if (!actionTargetResult.value) {
    return [];
  }

  const actions: QuickLaunchContextAction[] = [
    { id: 'open', label: '打开', shortcut: 'Enter' },
  ];

  if (actionTargetCanOpenDetached.value) {
    actions.push({ id: 'open-detached-window', label: '在独立窗口打开', shortcut: 'Alt+Enter' });
  }

  if (actionTargetHasPath.value) {
    actions.push({
      id: 'open-containing-folder',
      label: actionTargetIsFile.value ? '在资源管理器中打开' : '打开所在位置',
      shortcut: 'Ctrl+Enter',
    });
  }

  if (actionTargetHasPath.value && actionTargetIsApp.value) {
    actions.push({ id: 'run-as-admin', label: '以管理员身份启动', shortcut: 'Ctrl+Shift+Enter' });
  }

  actions.push({ id: 'copy', label: '复制', shortcut: 'Ctrl+C' });

  if (actionTargetHasPath.value) {
    actions.push({ id: 'copy-path', label: '复制路径', shortcut: 'Ctrl+Shift+C' });
  }

  actions.push({ id: 'refresh', label: '刷新结果', shortcut: 'Ctrl+R / F5' });
  return actions;
});
const filteredContextActions = computed(() => {
  if (!actionPanelOpen.value) {
    return contextActions.value;
  }

  const normalizedQuery = normalizeActionPanelQuery(query.value);
  if (!normalizedQuery) {
    return contextActions.value;
  }

  return contextActions.value.filter((action) => (
    normalizeActionPanelQuery(action.label).includes(normalizedQuery)
    || normalizeActionPanelQuery(action.shortcut).includes(normalizedQuery)
    || normalizeActionPanelQuery(action.id).includes(normalizedQuery)
  ));
});
const previewTargetText = computed(() => (
  activeResult.value ? describeActionTarget(activeResult.value) : ''
));
const actionPanelTargetLabel = computed(() => (
  contextPanelTargetResult.value
    ? `操作：${contextPanelTargetResult.value.title}`
    : '快速启动操作面板'
));
const searchInputPlaceholder = computed(() => {
  if (actionPanelOpen.value) {
    return '在此处输入以搜索操作';
  }

  return selectedProviderFilters.value.length
    ? '输入关键词继续筛选'
    : '搜索功能、应用、文件、连接、待办、知识库或插件';
});
const activeQuickLaunchBackground = computed(() => {
  const config = quickLaunchConfig.value;
  return resolveThemeBackground({
    type: config.backgroundType,
    color: config.backgroundColor,
    image: config.backgroundImage,
    video: config.backgroundVideo,
    backgroundStyle: config.backgroundStyle,
  }, appConfig.value.appearance.theme);
});
const hasBackgroundVideo = computed(() => (
  activeQuickLaunchBackground.value.type === 'video' && Boolean(activeQuickLaunchBackground.value.video)
));
const backgroundLayerStyle = computed<CSSProperties>(() => {
  const background = activeQuickLaunchBackground.value;
  const style = background.backgroundStyle ?? {};
  const result: CSSProperties = {
    opacity: style.opacity ?? 1,
    filter: style.blur ? `blur(${style.blur}px)` : undefined,
  };

  if (background.type === 'image' && background.image) {
    result.backgroundImage = `url(${background.image})`;
    result.backgroundSize = style.backgroundSize || 'cover';
    result.backgroundPosition = style.backgroundPosition || 'center';
    result.backgroundRepeat = style.backgroundRepeat || 'no-repeat';
  } else if (background.type === 'color' && background.color) {
    result.background = background.color;
  }

  return result;
});
const backgroundVideoStyle = computed<CSSProperties>(() => {
  const style = activeQuickLaunchBackground.value.backgroundStyle ?? {};
  return {
    opacity: style.opacity ?? 1,
    filter: style.blur ? `blur(${style.blur}px)` : undefined,
    objectFit: toObjectFit(style.backgroundSize || 'cover'),
    objectPosition: style.backgroundPosition || 'center',
  };
});
const quickLaunchPanelStyle = computed<CSSProperties>(() => {
  const textColor = activeQuickLaunchBackground.value.backgroundStyle?.textColor;
  const config = quickLaunchConfig.value;
  const selectionOpacity = clampUnit(config.selectionOpacity, 0.14);
  const style: CSSProperties & Record<string, string> = {
    '--quick-launch-window-opacity': String(clampUnit(config.windowOpacity, 0.96, 0.2)),
    '--quick-launch-selection-color': config.selectionColor || '#3b82f6',
    '--quick-launch-selection-bg-opacity': toPercent(selectionOpacity),
    '--quick-launch-selection-border-opacity': toPercent(Math.min(1, selectionOpacity + 0.12)),
    '--quick-launch-selection-chip-opacity': toPercent(Math.min(1, selectionOpacity + 0.06)),
    '--quick-launch-result-title-color': config.resultTitleColor || textColor || '#17202b',
    '--quick-launch-result-subtitle-color': config.resultSubtitleColor || '#667385',
  };

  if (textColor) {
    style['--quick-launch-text-color'] = textColor;
  }

  return style;
});
const emptyStateText = computed(() => '没有匹配结果');
const everythingStartPromptVisible = computed(() => Boolean(everythingStartPromptResult.value));
const everythingStartPromptMessage = computed(() => (
  everythingStartPromptResult.value?.subtitle
  || 'Everything 当前未运行。是否现在启动 Everything 并继续搜索本机文件？'
));
const searchProgressVisible = computed(() => Boolean(loading.value || searchProgress.value));
const searchProgressPercent = computed(() => {
  const progress = searchProgress.value;
  if (!progress) {
    return loading.value ? 8 : 0;
  }

  if (progress.stage === 'completed') {
    return 100;
  }

  if (progress.stage === 'ranking') {
    return Math.max(94, searchProgressProviderPercent(progress));
  }

  return searchProgressProviderPercent(progress);
});
const searchProgressText = computed(() => {
  const progress = searchProgress.value;
  if (!progress) {
    return '准备搜索。';
  }

  const providerLabel = progress.providerId ? providerLabels[progress.providerId] : '';
  if (progress.stage === 'provider-started' && providerLabel) {
    return `正在搜索：${providerLabel}`;
  }
  if (progress.stage === 'provider-completed' && providerLabel) {
    return `已完成：${providerLabel}`;
  }
  if (progress.stage === 'ranking') {
    return progress.resultCount === undefined
      ? '正在整理结果。'
      : `正在整理 ${progress.resultCount} 条候选结果。`;
  }
  if (progress.stage === 'completed') {
    return progress.resultCount === undefined
      ? '搜索完成。'
      : `搜索完成，得到 ${progress.resultCount} 条结果。`;
  }

  return progress.message || '准备搜索。';
});
const searchProgressCountText = computed(() => {
  const progress = searchProgress.value;
  if (!progress || progress.totalProviders <= 0) {
    return loading.value ? '搜索中' : '';
  }

  return `${progress.completedProviders}/${progress.totalProviders}`;
});
let sessionCounter = 0;
let activeSessionId = '';
let removeConfigListener: (() => void) | undefined;
let removeRevealListener: (() => void) | undefined;
let removeHiddenListener: (() => void) | undefined;
let removeSearchProgressListener: (() => void) | undefined;
let clearSearchProgressTimer: number | undefined;

watch(query, () => {
  if (actionPanelOpen.value) {
    actionPanelIndex.value = 0;
    void nextTick(() => resultsScrollbarRef.value?.refresh());
    return;
  }
  void search();
});

watch(selectedProviderFilters, () => {
  if (actionPanelOpen.value) {
    return;
  }
  void search();
});

watch(results, () => {
  if (activeIndex.value >= results.value.length) {
    activeIndex.value = Math.max(0, results.value.length - 1);
  }
  resultButtonRefs.value = [];
  void nextTick(() => {
    if (!actionPanelOpen.value) {
      scrollActiveResultIntoView();
    }
    resultsScrollbarRef.value?.refresh();
  });
});

watch(activeIndex, () => {
  if (actionPanelOpen.value) {
    return;
  }
  void nextTick(scrollActiveResultIntoView);
});

watch(filteredContextActions, () => {
  if (actionPanelIndex.value >= filteredContextActions.value.length) {
    actionPanelIndex.value = Math.max(0, filteredContextActions.value.length - 1);
  }
  void nextTick(() => resultsScrollbarRef.value?.refresh());
});

onMounted(async () => {
  removeRevealListener = api.value?.onReveal(playWindowReveal);
  removeHiddenListener = api.value?.onHidden(resetWindowReveal);
  removeSearchProgressListener = api.value?.onSearchProgress(handleSearchProgress);

  try {
    await loadAppConfig();
    loadQueryHistory();
    loadLastActionPanelTarget();
    await loadGameModeStatus();
    removeConfigListener = window.appConfigApi?.onDidChange((config) => {
      appConfig.value = config;
    });
    void nextTick(() => inputRef.value?.focus());
    void search();
    window.addEventListener('keydown', handleGlobalKeydown);
  } finally {
    void notifyRendererReady();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  removeConfigListener?.();
  removeRevealListener?.();
  removeHiddenListener?.();
  removeSearchProgressListener?.();
  window.clearTimeout(clearSearchProgressTimer);
});

async function loadAppConfig() {
  const config = await window.appConfigApi?.getConfig();
  if (config) {
    appConfig.value = config;
  }
}

async function notifyRendererReady() {
  try {
    await nextTick();
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    await api.value?.notifyReady();
  } catch {
    // The main process has a timeout fallback; startup should not fail on this signal.
  }
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function playWindowReveal() {
  dismissedEverythingStartPromptKey.value = '';
  windowVisible.value = false;
  await nextTick();
  await waitForAnimationFrame();
  windowVisible.value = true;
  void nextTick(() => inputRef.value?.focus());
}

function resetWindowReveal() {
  windowVisible.value = false;
}

async function search() {
  const sessionId = `renderer-${Date.now()}-${++sessionCounter}`;
  activeSessionId = sessionId;
  loading.value = true;
  window.clearTimeout(clearSearchProgressTimer);
  searchProgress.value = {
    sessionId,
    query: query.value,
    stage: 'started',
    completedProviders: 0,
    totalProviders: selectedProviderFilters.value.length || quickLaunchConfig.value.enabledProviders.length,
    elapsedMs: 0,
    message: '准备搜索。',
  };

  try {
    const response = await api.value?.search(cloneQuickLaunchSearchInput(sessionId));
    if (response?.sessionId !== activeSessionId) {
      return;
    }
    results.value = response?.results ?? [];
    errors.value = (response?.errors ?? []).map((error) => `${providerLabels[error.providerId]}：${error.message}`);
    syncEverythingStartPrompt(results.value);
    activeIndex.value = 0;
  } catch (error) {
    if (sessionId === activeSessionId) {
      results.value = [];
      errors.value = [formatError(error)];
      everythingStartPromptResult.value = null;
    }
  } finally {
    if (sessionId === activeSessionId) {
      loading.value = false;
    }
  }
}

function handleSearchProgress(progress: QuickLaunchSearchProgressEvent) {
  if (progress.sessionId !== activeSessionId) {
    return;
  }

  searchProgress.value = progress;
  if (progress.stage === 'completed') {
    window.clearTimeout(clearSearchProgressTimer);
    clearSearchProgressTimer = window.setTimeout(() => {
      if (searchProgress.value?.sessionId === progress.sessionId) {
        searchProgress.value = null;
      }
    }, 700);
  }
}

async function execute(
  result: QuickLaunchResult,
  mode: QuickLaunchExecutionMode = 'default',
  historyQuery = query.value,
) {
  if (executing.value) {
    return;
  }

  executing.value = true;
  try {
    if (result.action.type === 'start-everything') {
      await startEverythingFromPrompt();
      return;
    }

    if (mode !== 'copy' && mode !== 'copy-path') {
      recordQueryHistory(historyQuery);
      await hideForLaunchBeforeExecute();
    }
    await api.value?.execute(cloneQuickLaunchResult(result), cloneQuickLaunchExecuteOptions(mode));
  } catch (error) {
    errors.value = [`启动失败：${formatError(error)}`];
  } finally {
    executing.value = false;
  }
}

async function hideForLaunchBeforeExecute() {
  try {
    await api.value?.close();
  } catch {
    // Launch execution should continue even if the transient quick-launch window is already hidden.
  }
}

function handleResultMouseDown(event: MouseEvent, result: QuickLaunchResult, index: number) {
  activeIndex.value = index;

  if (event.button === 2) {
    openActionPanel(result);
    return;
  }

  if (event.button === 0) {
    void execute(result);
  }
}

function openActionPanelForResult(index: number) {
  const result = results.value[index];
  if (!result) {
    return;
  }

  activeIndex.value = index;
  openActionPanel(result);
}

async function refreshIndex() {
  await api.value?.refreshIndex();
  await search();
}

function getEverythingStartPromptKey(result: QuickLaunchResult) {
  return result.action.type === 'start-everything'
    ? result.action.esPath || result.detail || result.id
    : '';
}

function findEverythingStartResult(items: QuickLaunchResult[]) {
  return items.find((result) => result.action.type === 'start-everything') ?? null;
}

function syncEverythingStartPrompt(items: QuickLaunchResult[]) {
  const result = findEverythingStartResult(items);
  if (!result) {
    everythingStartPromptResult.value = null;
    return;
  }

  const key = getEverythingStartPromptKey(result);
  if (key && dismissedEverythingStartPromptKey.value === key) {
    everythingStartPromptResult.value = null;
    return;
  }

  everythingStartPromptResult.value = cloneQuickLaunchResult(result);
}

function dismissEverythingStartPrompt() {
  const result = everythingStartPromptResult.value;
  if (result) {
    dismissedEverythingStartPromptKey.value = getEverythingStartPromptKey(result);
  }
  everythingStartPromptResult.value = null;
  void nextTick(() => inputRef.value?.focus());
}

async function startEverythingFromPrompt() {
  if (everythingStarting.value) {
    return;
  }

  everythingStarting.value = true;
  try {
    const response = await api.value?.startEverything();
    if (!response?.ok) {
      errors.value = [response?.message || 'Everything 启动失败。'];
      return;
    }

    everythingStartPromptResult.value = null;
    errors.value = ['Everything 已启动，正在重新搜索。'];
    await wait(1200);
    await refreshIndex();
  } catch (error) {
    errors.value = [`Everything 启动失败：${formatError(error)}`];
  } finally {
    everythingStarting.value = false;
    void nextTick(() => inputRef.value?.focus());
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function searchProgressProviderPercent(progress: QuickLaunchSearchProgressEvent) {
  if (progress.totalProviders <= 0) {
    return progress.stage === 'started' ? 8 : 100;
  }

  const completedPercent = (progress.completedProviders / progress.totalProviders) * 88;
  const activeProviderOffset = progress.stage === 'provider-started' ? 5 : 0;
  return Math.max(8, Math.min(92, 8 + completedPercent + activeProviderOffset));
}

function handleKeydown(event: KeyboardEvent) {
  if (actionPanelOpen.value && handleActionPanelKeydown(event)) {
    return;
  }

  if (historyVisible.value && handleHistoryKeydown(event)) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'F12') {
    event.preventDefault();
    void toggleGameMode();
  } else if (event.key === 'F1') {
    event.preventDefault();
    previewVisible.value = !previewVisible.value;
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'h') {
    event.preventDefault();
    toggleHistory();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'o') {
    event.preventDefault();
    openActionPanel();
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    openActionPanel();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    closeActionPanel();
  } else if (event.altKey && /^[0-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    executeResultByNumber(event.key);
  } else if (event.altKey && event.key === 'Home') {
    event.preventDefault();
    activeIndex.value = 0;
  } else if (event.altKey && event.key === 'End') {
    event.preventDefault();
    activeIndex.value = Math.max(0, results.value.length - 1);
  } else if (event.key === 'Tab') {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      autocompleteFromActiveResult();
    } else {
      moveActiveIndex(event.shiftKey ? -1 : 1);
    }
  } else if (event.key === 'PageDown') {
    event.preventDefault();
    moveActiveIndexByPage(1);
  } else if (event.key === 'PageUp') {
    event.preventDefault();
    moveActiveIndexByPage(-1);
  } else if (event.key === 'F5') {
    event.preventDefault();
    void refreshIndex();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveActiveIndex(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveActiveIndex(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      executeSelectedResult('open-detached-window');
    } else if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      openActionPanel();
    } else if (event.ctrlKey && event.shiftKey) {
      executeSelectedResult('run-as-admin');
    } else if (event.ctrlKey || event.metaKey) {
      executeSelectedResult('open-containing-folder');
    } else {
      executeSelectedResult('default');
    }
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'c') {
    if (!event.shiftKey && hasInputSelection()) {
      return;
    }
    event.preventDefault();
    if (event.shiftKey) {
      executeSelectedResult('copy-path');
    } else {
      executeSelectedResult('copy');
    }
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'i') {
    event.preventDefault();
    void openSettings();
  } else if ((event.ctrlKey || event.metaKey) && isIncreaseResultKey(event)) {
    event.preventDefault();
    adjustRuntimeMaxResults(1);
  } else if ((event.ctrlKey || event.metaKey) && isDecreaseResultKey(event)) {
    event.preventDefault();
    adjustRuntimeMaxResults(-1);
  } else if ((event.ctrlKey || event.metaKey) && event.key === '[') {
    event.preventDefault();
    resizeQuickLaunchWindow(-40);
  } else if ((event.ctrlKey || event.metaKey) && event.key === ']') {
    event.preventDefault();
    resizeQuickLaunchWindow(40);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'r') {
    event.preventDefault();
    void refreshIndex();
  } else if (event.key === ' ' && !event.isComposing) {
    if (commitProviderFilterFromQuery()) {
      event.preventDefault();
    }
  } else if (event.key === 'Backspace' && !query.value && selectedProviderFilters.value.length) {
    event.preventDefault();
    removeProviderFilter(selectedProviderFilters.value[selectedProviderFilters.value.length - 1]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    if (previewVisible.value) {
      previewVisible.value = false;
    } else if (actionPanelOpen.value) {
      closeActionPanel();
    } else {
      void api.value?.close();
    }
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    if (actionPanelOpen.value) {
      closeActionPanel();
    } else {
      void api.value?.close();
    }
  }
}

function cloneQuickLaunchResult(result: QuickLaunchResult): QuickLaunchResult {
  return JSON.parse(JSON.stringify(toRaw(result))) as QuickLaunchResult;
}

function cloneQuickLaunchExecuteOptions(mode: QuickLaunchExecutionMode): QuickLaunchExecuteOptions | undefined {
  return mode === 'default'
    ? undefined
    : { mode };
}

function cloneQuickLaunchSearchInput(sessionId: string): QuickLaunchSearchInput {
  const providers = selectedProviderFilters.value.length
    ? [...selectedProviderFilters.value]
    : undefined;
  return {
    query: query.value,
    limit: effectiveMaxResults.value,
    providers,
    sessionId,
  };
}

function setResultButtonRef(element: Element | null, index: number) {
  resultButtonRefs.value[index] = element instanceof HTMLElement ? element : null;
}

function actionPanelShortcut(index: number) {
  return `Alt+${index === 9 ? 0 : index + 1}`;
}

function normalizeActionPanelQuery(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, '');
}

function handleActionPanelKeydown(event: KeyboardEvent) {
  if (event.altKey && /^[0-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    runActionPanelActionByNumber(event.key);
    return true;
  }

  if (event.ctrlKey && event.shiftKey && event.key === 'Enter') {
    event.preventDefault();
    runActionPanelAction('run-as-admin');
    return true;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    runActionPanelAction('open-containing-folder');
    return true;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'c') {
    if (!event.shiftKey && hasInputSelection()) {
      return false;
    }
    event.preventDefault();
    runActionPanelAction(event.shiftKey ? 'copy-path' : 'copy');
    return true;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'r') {
    event.preventDefault();
    runActionPanelAction('refresh');
    return true;
  }

  if (event.key === 'ArrowDown' || (!event.shiftKey && event.key === 'Tab')) {
    event.preventDefault();
    moveActionPanelIndex(1);
    return true;
  }

  if (event.key === 'ArrowUp' || (event.shiftKey && event.key === 'Tab')) {
    event.preventDefault();
    moveActionPanelIndex(-1);
    return true;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    if (event.altKey) {
      runActionPanelAction('open-detached-window');
    } else {
      runActionPanelAction(filteredContextActions.value[actionPanelIndex.value]?.id);
    }
    return true;
  }

  if (event.key === 'Escape' || event.key === 'ArrowLeft') {
    event.preventDefault();
    closeActionPanel();
    return true;
  }

  return false;
}

function handleHistoryKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'h') {
    event.preventDefault();
    toggleHistory();
    return true;
  }

  if (event.key === 'ArrowDown' || (!event.shiftKey && event.key === 'Tab')) {
    event.preventDefault();
    moveHistoryIndex(1);
    return true;
  }

  if (event.key === 'ArrowUp' || (event.shiftKey && event.key === 'Tab')) {
    event.preventDefault();
    moveHistoryIndex(-1);
    return true;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    applyHistoryQuery(historyActiveIndex.value);
    return true;
  }

  if (event.key === 'Escape' || event.key === 'ArrowLeft') {
    event.preventDefault();
    historyVisible.value = false;
    void nextTick(() => inputRef.value?.focus());
    return true;
  }

  return false;
}

function openActionPanel(result: QuickLaunchResult | null = activeResult.value ?? contextPanelTargetResult.value) {
  if (!result) {
    return;
  }

  const target = cloneQuickLaunchResult(result);
  contextPanelTargetResult.value = target;
  saveLastActionPanelTarget(target);
  actionPanelReturnQuery.value = actionPanelOpen.value ? actionPanelReturnQuery.value : query.value;
  historyVisible.value = false;
  previewVisible.value = false;
  actionPanelOpen.value = true;
  actionPanelIndex.value = 0;
  query.value = '';
  void nextTick(() => {
    inputRef.value?.focus();
    resultsScrollbarRef.value?.scrollTo({ top: 0 });
    resultsScrollbarRef.value?.refresh();
  });
}

function closeActionPanel({ restoreQuery = true } = {}) {
  if (!actionPanelOpen.value) {
    return;
  }

  const previousQuery = actionPanelReturnQuery.value;
  actionPanelOpen.value = false;
  actionPanelIndex.value = 0;
  actionPanelReturnQuery.value = '';

  if (restoreQuery) {
    query.value = previousQuery;
  }

  void nextTick(() => {
    inputRef.value?.focus();
    resultsScrollbarRef.value?.refresh();
  });
}

function runActionPanelAction(actionId?: QuickLaunchContextActionId) {
  if (!actionId || !contextActions.value.some((action) => action.id === actionId)) {
    return;
  }

  const historyQuery = actionPanelReturnQuery.value || query.value;
  closeActionPanel({ restoreQuery: true });
  switch (actionId) {
    case 'open':
      executeContextTargetResult('default', historyQuery);
      return;
    case 'open-detached-window':
      executeContextTargetResult('open-detached-window', historyQuery);
      return;
    case 'open-containing-folder':
      executeContextTargetResult('open-containing-folder', historyQuery);
      return;
    case 'run-as-admin':
      executeContextTargetResult('run-as-admin', historyQuery);
      return;
    case 'copy':
      executeContextTargetResult('copy', historyQuery);
      return;
    case 'copy-path':
      executeContextTargetResult('copy-path', historyQuery);
      return;
    case 'refresh':
      void refreshIndex();
      return;
    default:
      return;
  }
}

function runActionPanelActionByNumber(key: string) {
  const index = key === '0' ? 9 : Number(key) - 1;
  const action = filteredContextActions.value[index];
  if (action) {
    runActionPanelAction(action.id);
  }
}

function executeContextTargetResult(mode: QuickLaunchExecutionMode = 'default', historyQuery = actionPanelReturnQuery.value) {
  const result = contextPanelTargetResult.value;
  if (result) {
    void execute(result, mode, historyQuery);
  }
}

function canOpenDetachedWindow(result: QuickLaunchResult) {
  if (result.action.type === 'open-ssh-profile' || result.action.type === 'open-ftp-profile') {
    return true;
  }

  return result.action.type === 'open-route'
    && ['/terminal', '/ftp', '/todo', '/ai', '/knowledge'].includes(result.action.route.split('?')[0]);
}

function moveActionPanelIndex(delta: 1 | -1) {
  const total = filteredContextActions.value.length;
  if (!total) {
    return;
  }
  actionPanelIndex.value = (actionPanelIndex.value + delta + total) % total;
}

function toggleHistory() {
  closeActionPanel();
  historyVisible.value = !historyVisible.value;
  historyActiveIndex.value = 0;
  void nextTick(() => inputRef.value?.focus());
}

function moveHistoryIndex(delta: 1 | -1) {
  if (!queryHistory.value.length) {
    return;
  }
  historyActiveIndex.value = (historyActiveIndex.value + delta + queryHistory.value.length) % queryHistory.value.length;
}

function applyHistoryQuery(index: number) {
  const item = queryHistory.value[index];
  if (!item) {
    return;
  }
  query.value = item;
  historyVisible.value = false;
  activeIndex.value = 0;
  void nextTick(() => inputRef.value?.focus());
}

function loadQueryHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(QUERY_HISTORY_STORAGE_KEY) || '[]') as unknown;
    queryHistory.value = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, MAX_QUERY_HISTORY)
      : [];
  } catch {
    queryHistory.value = [];
  }
}

function recordQueryHistory(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return;
  }

  queryHistory.value = [
    normalized,
    ...queryHistory.value.filter((item) => item !== normalized),
  ].slice(0, MAX_QUERY_HISTORY);
  localStorage.setItem(QUERY_HISTORY_STORAGE_KEY, JSON.stringify(queryHistory.value));
}

function loadLastActionPanelTarget() {
  try {
    const value = JSON.parse(localStorage.getItem(ACTION_PANEL_TARGET_STORAGE_KEY) || 'null') as unknown;
    if (isQuickLaunchResultLike(value)) {
      contextPanelTargetResult.value = value;
    }
  } catch {
    contextPanelTargetResult.value = null;
  }
}

function saveLastActionPanelTarget(result: QuickLaunchResult) {
  localStorage.setItem(ACTION_PANEL_TARGET_STORAGE_KEY, JSON.stringify(cloneQuickLaunchResult(result)));
}

function isQuickLaunchResultLike(value: unknown): value is QuickLaunchResult {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as QuickLaunchResult).id === 'string'
    && typeof (value as QuickLaunchResult).providerId === 'string'
    && typeof (value as QuickLaunchResult).title === 'string'
    && Boolean((value as QuickLaunchResult).action)
    && typeof (value as QuickLaunchResult).action === 'object';
}

async function loadGameModeStatus() {
  gameModeEnabled.value = Boolean(await api.value?.getGameModeStatus());
}

async function toggleGameMode() {
  gameModeEnabled.value = Boolean(await api.value?.setGameMode(!gameModeEnabled.value));
}

function resizeQuickLaunchWindow(widthDelta: number) {
  void api.value?.resizeWindow({ widthDelta });
}

function executeSelectedResult(mode: QuickLaunchExecutionMode = 'default') {
  const result = results.value[activeIndex.value];
  if (result) {
    void execute(result, mode);
  }
}

function executeResultByNumber(key: string) {
  const index = key === '0' ? 9 : Number(key) - 1;
  const result = results.value[index];
  if (!result) {
    return;
  }
  activeIndex.value = index;
  void execute(result);
}

function moveActiveIndex(delta: number) {
  if (!results.value.length) {
    return;
  }
  activeIndex.value = (activeIndex.value + delta + results.value.length) % results.value.length;
}

function moveActiveIndexByPage(direction: 1 | -1) {
  if (!results.value.length) {
    return;
  }
  const pageSize = Math.max(1, Math.min(results.value.length, effectiveMaxResults.value || 8));
  activeIndex.value = Math.max(0, Math.min(results.value.length - 1, activeIndex.value + (direction * pageSize)));
}

function adjustRuntimeMaxResults(delta: 1 | -1) {
  runtimeMaxResults.value = Math.max(1, Math.min(50, effectiveMaxResults.value + delta));
  void search();
}

function isIncreaseResultKey(event: KeyboardEvent) {
  return event.key === '+' || event.key === '=';
}

function isDecreaseResultKey(event: KeyboardEvent) {
  return event.key === '-' || event.key === '_';
}

function autocompleteFromActiveResult() {
  const result = results.value[activeIndex.value];
  if (!result) {
    return;
  }
  query.value = result.title;
  void nextTick(() => inputRef.value?.focus());
}

function hasInputSelection() {
  const input = inputRef.value;
  return Boolean(input && input.selectionStart !== input.selectionEnd);
}

async function openSettings() {
  await execute({
    id: 'quick-launch:settings',
    providerId: 'internal-route',
    title: '设置',
    score: 0,
    action: {
      type: 'open-route',
      route: '/settings',
    },
  });
}

function resultPath(result: QuickLaunchResult) {
  switch (result.action.type) {
    case 'open-path':
    case 'show-path-in-folder':
      return result.action.path;
    default:
      return '';
  }
}

function describeActionTarget(result: QuickLaunchResult) {
  switch (result.action.type) {
    case 'open-path':
    case 'show-path-in-folder':
      return result.action.path;
    case 'open-external':
      return result.action.url;
    case 'open-route':
      return result.action.route;
    case 'open-terminal-profile':
    case 'open-ssh-profile':
    case 'open-ftp-profile':
      return result.action.profileId;
    case 'open-todo':
      return result.action.todoId;
    case 'open-knowledge-result':
      return result.action.nodeId ?? result.action.sourceId;
    case 'open-plugin-page':
      return result.action.routePath;
    case 'execute-plugin-command':
      return result.action.commandId;
    case 'copy-text':
      return result.action.text;
    case 'start-everything':
      return result.action.esPath || 'Everything.exe';
    default:
      return '';
  }
}

function scrollActiveResultIntoView() {
  const activeElement = resultButtonRefs.value[activeIndex.value];
  activeElement?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });
}

function normalizeProviderAlias(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
}

function findProviderFilterByAlias(value: string) {
  const normalized = normalizeProviderAlias(value);
  if (!normalized) {
    return undefined;
  }

  return PROVIDER_FILTER_OPTIONS.find((option) => (
    normalizeProviderAlias(option.label) === normalized
    || option.aliases.some((alias) => normalizeProviderAlias(alias) === normalized)
  ));
}

function commitProviderFilterFromQuery() {
  const option = findProviderFilterByAlias(query.value);
  if (!option) {
    return false;
  }

  selectedProviderFilters.value = selectedProviderFilters.value.includes(option.value)
    ? selectedProviderFilters.value
    : [...selectedProviderFilters.value, option.value];
  query.value = '';
  activeIndex.value = 0;
  void nextTick(() => inputRef.value?.focus());
  return true;
}

function removeProviderFilter(providerId: QuickLaunchProviderId) {
  selectedProviderFilters.value = selectedProviderFilters.value.filter((item) => item !== providerId);
  void nextTick(() => inputRef.value?.focus());
}

function toObjectFit(backgroundSizeValue: string): 'contain' | 'cover' | 'fill' | 'none' {
  switch (backgroundSizeValue) {
    case 'contain':
      return 'contain';
    case '100% 100%':
      return 'fill';
    case 'auto':
      return 'none';
    case 'cover':
    default:
      return 'cover';
  }
}

function clampUnit(value: number | undefined, fallback: number, min = 0) {
  return Number.isFinite(value)
    ? Math.max(min, Math.min(1, Number(value)))
    : fallback;
}

function toPercent(value: number) {
  return `${Math.round(clampUnit(value, 0) * 100)}%`;
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
</script>

<style scoped lang="scss">
:global(body) {
  margin: 0;
  background: transparent;
  overflow: hidden;
  font-family: 'Geist Variable', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

:global(*) {
  box-sizing: border-box;
}

.quick-launch-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 18px;
  color: var(--quick-launch-text-color, #1b1f24);
  opacity: 0;
  transition: opacity 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.quick-launch-panel {
  position: relative;
  isolation: isolate;
  width: min(100%, 680px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(23, 31, 43, 0.14);
  border-radius: 8px;
  background: rgba(250, 252, 255, var(--quick-launch-window-opacity, 0.96));
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
  transform: translateY(-10px) scale(0.985);
  transform-origin: top center;
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

.quick-launch-shell--visible {
  opacity: 1;
}

.quick-launch-shell--visible .quick-launch-panel {
  transform: translateY(0) scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .quick-launch-shell {
    transition: opacity 80ms linear;
  }

  .quick-launch-panel {
    transform: none;
    transition: none;
  }

  .quick-launch-progress__bar {
    transition: none;
  }
}

.quick-launch-background,
.quick-launch-background__video {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.quick-launch-background {
  background: transparent;
}

.quick-launch-background__video {
  width: 100%;
  height: 100%;
}

.quick-launch-search {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 58px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(23, 31, 43, 0.1);
  background: rgba(250, 252, 255, calc(var(--quick-launch-window-opacity, 0.96) * 0.76));
}

.quick-launch-search__mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: transparent;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.quick-launch-filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 8px;
  border: 1px solid rgba(31, 99, 196, 0.18);
  border-radius: 6px;
  background: rgba(216, 232, 255, 0.82);
  color: #24568f;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.quick-launch-filter-tag:hover {
  border-color: rgba(31, 99, 196, 0.34);
  background: rgba(202, 224, 255, 0.92);
}

.quick-launch-search__input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--quick-launch-text-color, #151a21);
  font-size: 18px;
  line-height: 1.3;
}

.quick-launch-search__input::placeholder {
  color: #8a95a6;
}

.quick-launch-results-scrollbar {
  position: relative;
  z-index: 1;
  height: min(360px, calc(100vh - 148px));
  min-height: 140px;
  background: rgba(250, 252, 255, calc(var(--quick-launch-window-opacity, 0.96) * 0.68));

  :deep(.ui-scrollbar__rail--y) {
    right: 3px;
  }
}

.quick-launch-results {
  min-height: 100%;
  padding: 8px;
}

.quick-launch-history {
  min-height: 100%;
  padding: 8px;
}

.quick-launch-history__item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--quick-launch-text-color, #17202b);
  font: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.quick-launch-history__item--active {
  border-color: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) var(--quick-launch-selection-border-opacity, 26%),
    transparent
  );
  background: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) var(--quick-launch-selection-bg-opacity, 14%),
    transparent
  );
}

.quick-launch-result {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  width: 100%;
  min-height: 58px;
  gap: 12px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.quick-launch-result--active {
  border-color: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) var(--quick-launch-selection-border-opacity, 26%),
    transparent
  );
  background: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) var(--quick-launch-selection-bg-opacity, 14%),
    transparent
  );
}

.quick-launch-result__provider {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  background: #f1f4f8;
  color: #526072;
  font-size: 12px;
  white-space: nowrap;
}

.quick-launch-result__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 auto;
  border-radius: 8px;
  background: #f1f4f8;
  overflow: hidden;

  img {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
}

.quick-launch-result--active .quick-launch-result__provider {
  background: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) var(--quick-launch-selection-chip-opacity, 20%),
    transparent
  );
  color: var(--quick-launch-selection-color, #24568f);
}

.quick-launch-result--active .quick-launch-result__icon {
  background: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) var(--quick-launch-selection-chip-opacity, 20%),
    transparent
  );
}

.quick-launch-result__body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.quick-launch-result__title,
.quick-launch-result__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-launch-result__title {
  color: var(--quick-launch-result-title-color, var(--quick-launch-text-color, #17202b));
  font-size: 15px;
  font-weight: 650;
}

.quick-launch-result__subtitle {
  color: var(--quick-launch-result-subtitle-color, color-mix(in srgb, var(--quick-launch-text-color, #667385) 68%, transparent));
  font-size: 12px;
}

.quick-launch-empty {
  display: grid;
  place-items: center;
  min-height: 140px;
  color: #718096;
  font-size: 14px;
}

.quick-launch-status {
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 9px 16px;
  border-top: 1px solid rgba(180, 83, 9, 0.16);
  border-bottom: 1px solid rgba(180, 83, 9, 0.2);
  background: color-mix(
    in srgb,
    #fff4e5 calc(var(--quick-launch-window-opacity, 0.96) * 100%),
    transparent
  );
  color: #8a4b00;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-launch-everything-prompt {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-top: 1px solid rgba(31, 99, 196, 0.14);
  border-bottom: 1px solid rgba(31, 99, 196, 0.16);
  background: rgba(232, 242, 255, calc(var(--quick-launch-window-opacity, 0.96) * 0.9));
}

.quick-launch-everything-prompt__body {
  display: grid;
  min-width: 0;
  gap: 3px;

  strong {
    color: var(--quick-launch-text-color, #17202b);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    min-width: 0;
    overflow: hidden;
    color: color-mix(in srgb, var(--quick-launch-text-color, #4f6278) 72%, transparent);
    font-size: 12px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.quick-launch-everything-prompt__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quick-launch-everything-prompt__button {
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid rgba(31, 99, 196, 0.18);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.72);
  color: #24568f;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.quick-launch-everything-prompt__button:hover:not(:disabled) {
  border-color: rgba(31, 99, 196, 0.32);
  background: rgba(255, 255, 255, 0.92);
}

.quick-launch-everything-prompt__button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.quick-launch-everything-prompt__button--primary {
  border-color: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) 42%,
    transparent
  );
  background: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) 14%,
    rgba(255, 255, 255, 0.88)
  );
  color: var(--quick-launch-selection-color, #24568f);
}

.quick-launch-progress {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 7px;
  padding: 9px 16px 10px;
  border-bottom: 1px solid rgba(23, 31, 43, 0.08);
  background: rgba(250, 252, 255, calc(var(--quick-launch-window-opacity, 0.96) * 0.62));
}

.quick-launch-progress__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  color: color-mix(in srgb, var(--quick-launch-text-color, #526072) 72%, transparent);
  font-size: 12px;
  line-height: 1.35;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--quick-launch-text-color, #667385) 54%, transparent);
    font-size: 12px;
    font-weight: 650;
  }
}

.quick-launch-progress__track {
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(82, 96, 114, 0.14);
}

.quick-launch-progress__bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) 70%,
    #ffffff 10%
  );
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16) inset;
  transition: width 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

@media (max-width: 560px) {
  .quick-launch-everything-prompt {
    grid-template-columns: 1fr;
  }

  .quick-launch-everything-prompt__actions {
    justify-content: flex-end;
  }

  .quick-launch-everything-prompt__body span {
    white-space: normal;
  }
}

.quick-launch-action-panel {
  min-height: 100%;
  padding: 8px;
}

.quick-launch-action-panel__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 58px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--quick-launch-text-color, #17202b);
  font: inherit;
  text-align: left;
  cursor: pointer;

  small {
    min-width: 48px;
    padding: 5px 8px;
    border-radius: 6px;
    background: rgba(241, 244, 248, 0.76);
    color: color-mix(in srgb, var(--quick-launch-text-color, #7b8798) 55%, transparent);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    text-align: center;
  }
}

.quick-launch-action-panel__item--active {
  border-color: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) var(--quick-launch-selection-border-opacity, 26%),
    transparent
  );
  background: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) var(--quick-launch-selection-bg-opacity, 14%),
    transparent
  );
}

.quick-launch-action-panel__body {
  display: grid;
  min-width: 0;
}

.quick-launch-action-panel__title {
  overflow: hidden;
  color: var(--quick-launch-text-color, #17202b);
  font-size: 15px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-launch-preview {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 16px 14px;
  border-top: 1px solid rgba(23, 31, 43, 0.1);
  background: rgba(250, 252, 255, calc(var(--quick-launch-window-opacity, 0.96) * 0.78));
}

.quick-launch-preview__provider {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: start;
  height: 28px;
  padding: 0 9px;
  border-radius: 6px;
  background: color-mix(
    in srgb,
    var(--quick-launch-selection-color, #3b82f6) 12%,
    transparent
  );
  color: var(--quick-launch-selection-color, #24568f);
  font-size: 12px;
  font-weight: 700;
}

.quick-launch-preview__content {
  display: grid;
  gap: 4px;
  min-width: 0;

  strong,
  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--quick-launch-text-color, #17202b);
    font-size: 15px;
  }

  span {
    color: color-mix(in srgb, var(--quick-launch-text-color, #667385) 72%, transparent);
    font-size: 12px;
  }
}
</style>
