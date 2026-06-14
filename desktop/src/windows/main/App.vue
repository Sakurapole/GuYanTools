<script setup lang="ts">
import { useElementSize } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppNotificationHost from './components/AppNotificationHost.vue';
import bottombar from './components/bottombar/bottombar.vue';
import ConfirmDialog from './components/ui/ConfirmDialog.vue';
import GlobalContextMenu from './components/ui/GlobalContextMenu.vue';
import UiIconButton from './components/ui/UiIconButton.vue';
import TextPromptDialog from './components/ui/TextPromptDialog.vue';
import Sidebar from './components/sidebar/sidebar.vue';
import Topbar from './components/topbar/topbar.vue';
import TrayContextMenu from './components/TrayContextMenu.vue';
import WebViewKeepAlive from './components/webview/WebViewKeepAlive.vue';
import { schedulePageSnapshot } from './composables/useTabSnapshot';
import { useBarStore } from './stores/bar_store';
import { useWebviewStore } from './stores/webview_store';
import {
  WORKSPACE_WINDOW_DEFINITIONS,
  type WorkspaceDetachedWindowState,
  type WorkspaceWindowContext,
  type WorkspaceWindowKey,
} from '@/contracts/workspace_window';

const { ipcRenderer } = window;
const router = useRouter();
const route = useRoute();
const pageContainerRef = ref<HTMLElement | null>(null);
const { width: containerWidth, height: containerHeight } = useElementSize(pageContainerRef);
let removeNavigationListener: (() => void) | undefined;
const webviewStore = useWebviewStore();
const barStore = useBarStore();
const pageTransitionName = ref('ui-page-forward');
const firstVisitProgressVisible = ref(false);
const workspaceWindowState = ref<WorkspaceDetachedWindowState>({ detached: {} });
const workspaceWindowContext = ref<WorkspaceWindowContext>({ role: 'main' });
let routeRenderTimer: number | undefined;
let routeFirstVisitTimer: number | undefined;
let removeWorkspaceWindowStateListener: (() => void) | undefined;
let routeFirstVisitStartedAt = 0;
const visitedPagePaths = new Set<string>();
const fallbackPageRouteOrder = [
  '/home',
  '/terminal',
  '/settings',
  '/ftp',
  '/plugins',
  '/todo',
  '/webview',
  '/script-editor',
  '/devtools',
];

if (route.path && route.path !== '/') {
  visitedPagePaths.add(route.path);
}

/** 新窗口弹窗模式：隐藏顶栏、侧栏、底栏 */
const isPopupMode = computed(() => route.query.popup === '1');
/** 页面自带标题栏（如脚本编辑器），popup 模式下跳过 App 自带的标题栏 */
const hasSelfTitlebar = computed(() => false);
const detachedRouteKey = computed<WorkspaceWindowKey | null>(() => {
  const matched = Object.values(WORKSPACE_WINDOW_DEFINITIONS).find(definition => definition.route === route.path);
  return matched?.key ?? null;
});
const isDetachedWindow = computed(() => workspaceWindowContext.value.role === 'detached');
const isCurrentPageDetached = computed(() => (
  workspaceWindowContext.value.role === 'main'
  && Boolean(detachedRouteKey.value && workspaceWindowState.value.detached[detachedRouteKey.value])
));
const currentDetachedDefinition = computed(() => (
  detachedRouteKey.value ? WORKSPACE_WINDOW_DEFINITIONS[detachedRouteKey.value] : null
));

function routePathFromTabUrl(url: string) {
  return url.split('?')[0] || url;
}

function getPageRouteOrder() {
  const orderedTabPaths = barStore.tabPages
    .map(tab => routePathFromTabUrl(tab.url))
    .filter((path, index, paths) => path && paths.indexOf(path) === index);

  return orderedTabPaths.concat(
    fallbackPageRouteOrder.filter(path => !orderedTabPaths.includes(path)),
  );
}

function markRouteRenderBusy() {
  const root = document.documentElement;
  root.classList.add('app-rendering-busy');
  window.clearTimeout(routeRenderTimer);
  routeRenderTimer = window.setTimeout(() => {
    root.classList.remove('app-rendering-busy');
  }, 700);
}

function beginFirstVisitLoad() {
  routeFirstVisitStartedAt = window.performance.now();
  firstVisitProgressVisible.value = true;
  window.clearTimeout(routeFirstVisitTimer);
}

function endFirstVisitLoad() {
  if (!firstVisitProgressVisible.value) return;

  const elapsed = window.performance.now() - routeFirstVisitStartedAt;
  const remainingVisibleTime = Math.max(0, 220 - elapsed);
  window.clearTimeout(routeFirstVisitTimer);
  routeFirstVisitTimer = window.setTimeout(() => {
    firstVisitProgressVisible.value = false;
  }, remainingVisibleTime);
}

function resetFirstVisitLoad() {
  window.clearTimeout(routeFirstVisitTimer);
  firstVisitProgressVisible.value = false;
}

async function openCurrentPageDetached() {
  if (!detachedRouteKey.value) return;
  workspaceWindowState.value = await window.workspaceWindowApi?.openDetached(detachedRouteKey.value)
    ?? workspaceWindowState.value;
}

async function openDetachedRouteFromDetachedWindow(key: WorkspaceWindowKey, fullPath: string) {
  workspaceWindowState.value = await window.workspaceWindowApi?.openDetached(key, { routeOverride: fullPath })
    ?? workspaceWindowState.value;
}

async function returnDetachedPageToMain() {
  const key = workspaceWindowContext.value.detachedKey ?? detachedRouteKey.value;
  if (!key) return;
  workspaceWindowState.value = await window.workspaceWindowApi?.returnToMain(key)
    ?? workspaceWindowState.value;
}

let removeBeforeEach: (() => void) | undefined;
let removeAfterEach: (() => void) | undefined;
let removeRouterError: (() => void) | undefined;
removeBeforeEach = router.beforeEach((to, from, next) => {
  if (to.path && to.path !== '/') {
    schedulePageSnapshot(to.path);
  }

  markRouteRenderBusy();

  const isFirstPageVisit = to.path !== from.path && to.path !== '/' && !visitedPagePaths.has(to.path);
  if (isFirstPageVisit) {
    beginFirstVisitLoad();
  } else {
    resetFirstVisitLoad();
  }

  if (isFirstPageVisit) {
    pageTransitionName.value = 'ui-page-instant';
  } else {
    const pageRouteOrder = getPageRouteOrder();
    const fromIndex = pageRouteOrder.indexOf(from.path);
    const toIndex = pageRouteOrder.indexOf(to.path);
    if (from.path === to.path) {
      pageTransitionName.value = 'ui-fade';
    } else if (fromIndex === -1 || toIndex === -1) {
      pageTransitionName.value = 'ui-page-forward';
    } else {
      pageTransitionName.value = toIndex >= fromIndex ? 'ui-page-forward' : 'ui-page-back';
    }
  }

  if (workspaceWindowContext.value.role === 'detached' && from.query.detached) {
    const targetDefinition = Object.values(WORKSPACE_WINDOW_DEFINITIONS).find(definition => definition.route === to.path);
    if (targetDefinition) {
      void openDetachedRouteFromDetachedWindow(targetDefinition.key, to.fullPath);
    }
    next(false);
    return;
  }

  next();
});

removeAfterEach = router.afterEach((to, _from, failure) => {
  if (!failure && to.path && to.path !== '/') {
    visitedPagePaths.add(to.path);
  }

  if (failure) {
    resetFirstVisitLoad();
  } else {
    endFirstVisitLoad();
  }
});

removeRouterError = router.onError(() => {
  resetFirstVisitLoad();
});

onMounted(() => {
  removeNavigationListener = ipcRenderer?.on('plugin-host:navigate', (route: string) => {
    void router.push(route);
    ipcRenderer?.send('plugin-host:navigate-complete');
  });

  setTimeout(() => {
    schedulePageSnapshot(router.currentRoute.value.path, 0);
  }, 1500);

  void window.workspaceWindowApi?.getState().then((state) => {
    workspaceWindowState.value = state;
  });
  void window.workspaceWindowApi?.getContext().then((context) => {
    workspaceWindowContext.value = context;
  });
  removeWorkspaceWindowStateListener = window.workspaceWindowApi?.onStateChanged((state) => {
    workspaceWindowState.value = state;
  });
})

onBeforeUnmount(() => {
  removeNavigationListener?.();
  removeWorkspaceWindowStateListener?.();
  removeBeforeEach?.();
  removeAfterEach?.();
  removeRouterError?.();
  window.clearTimeout(routeRenderTimer);
  window.clearTimeout(routeFirstVisitTimer);
  document.documentElement.classList.remove('app-rendering-busy');
})
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--popup': isPopupMode }">
    <!-- 弹窗模式：精简标题栏（ScriptEditor 等自带标题栏的页面跳过） -->
    <div v-if="isPopupMode && !hasSelfTitlebar" class="popup-titlebar">
      <div class="popup-titlebar__title">
        {{ route.meta.title || '网页' }}
      </div>
      <div class="popup-titlebar__drag" />
      <div class="popup-titlebar__actions">
        <UiIconButton
          v-if="isDetachedWindow"
          class="popup-titlebar__btn popup-titlebar__return"
          size="sm"
          variant="ghost"
          title="回到主窗口"
          @click="returnDetachedPageToMain"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M5 2 1.5 5.5 5 9M2 5.5h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </UiIconButton>
        <UiIconButton class="popup-titlebar__btn" size="sm" variant="ghost" title="最小化" @click="ipcRenderer.send('window:minimize')">
          <svg width="10" height="1" viewBox="0 0 10 1"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" stroke-width="1"/></svg>
        </UiIconButton>
        <UiIconButton class="popup-titlebar__btn" size="sm" variant="ghost" title="最大化" @click="ipcRenderer.send('window:maximize')">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1"/></svg>
        </UiIconButton>
        <UiIconButton class="popup-titlebar__btn popup-titlebar__btn--close" size="sm" variant="ghost" title="关闭" @click="ipcRenderer.send('window:close')">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </UiIconButton>
      </div>
    </div>
    <Topbar
      v-if="!isPopupMode"
      :can-detach-current-page="Boolean(detachedRouteKey && !isCurrentPageDetached)"
      :detached-page-title="currentDetachedDefinition?.title ?? ''"
      @detach-current-page="openCurrentPageDetached"
    />
    <div class="page-container" ref="pageContainerRef">
      <Sidebar v-if="!isPopupMode" :parent-height="containerHeight" :parent-width="containerWidth" />
      <div class="page-router-viewport">
        <div
          v-show="firstVisitProgressVisible"
          class="page-first-visit-progress"
          aria-hidden="true"
        >
          <div class="page-first-visit-progress__bar" />
        </div>
        <section v-if="isCurrentPageDetached && currentDetachedDefinition" class="workspace-detached-placeholder">
          <div class="workspace-detached-placeholder__panel">
            <div class="workspace-detached-placeholder__eyebrow">独立窗口</div>
            <h2>当前页面已独立显示</h2>
            <p>{{ currentDetachedDefinition.title }} 已在独立窗口中打开。主窗口可以继续查看其它页面。</p>
            <button class="workspace-detached-placeholder__button" type="button" @click="returnDetachedPageToMain">
              回到主窗口
            </button>
          </div>
        </section>
        <router-view v-slot="{ Component, route }">
          <Transition :name="pageTransitionName" mode="out-in">
            <KeepAlive>
              <component
                :is="Component"
                v-if="route.meta.keepAlive && !isCurrentPageDetached"
                :key="route.path"
                v-show="!webviewStore.hasActiveInstance"
              />
            </KeepAlive>
          </Transition>
          <Transition :name="pageTransitionName" mode="out-in">
            <component
              :is="Component"
              v-if="!route.meta.keepAlive && !isCurrentPageDetached"
              :key="route.path"
              v-show="!webviewStore.hasActiveInstance"
            />
          </Transition>
        </router-view>
      </div>
      <!-- WebView 保活容器：与 router-view 平级 -->
      <WebViewKeepAlive v-if="!isPopupMode" />
    </div>
    <bottombar v-if="!isPopupMode" />
    <GlobalContextMenu />
    <ConfirmDialog />
    <TextPromptDialog />
    <!-- Tray context menu (custom renderer-side popup) -->
    <TrayContextMenu />
    <AppNotificationHost :popup="isPopupMode" />
  </div>
</template>

<style lang="scss">
@use './assets/foundation.scss';
@use './assets/theme.scss';
@use './assets/patterns.scss';
@use './assets/motion.scss';
@use './assets/tooltip.scss';
@use './assets/app.scss';

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em rgba(102, 204, 255, 0.6));
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2.4em rgba(102, 204, 255, 0.85));
}

/* ─── 弹窗模式标题栏 ─── */
.popup-titlebar {
  display: flex;
  align-items: center;
  height: 32px;
  flex-shrink: 0;
  background: var(--ui-surface-elevated);
  border-bottom: 1px solid var(--ui-border-subtle);
}

.popup-titlebar__title {
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.popup-titlebar__drag {
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
}

.popup-titlebar__actions {
  display: flex;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.popup-titlebar__btn.ui-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 32px;
  border-radius: 0;
  border: none;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover:not(:disabled) {
    background: rgba(128, 128, 128, 0.12);
    color: var(--ui-text-secondary);
    transform: none;
  }

  &:active:not(:disabled) {
    transform: none;
  }

  svg {
    fill: none;
    stroke: currentColor;
  }

  &.popup-titlebar__btn--close:hover:not(:disabled) {
    background: #e81123;
    color: #fff;
  }
}

.page-first-visit-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: var(--ui-z-sticky);
  overflow: hidden;
  pointer-events: none;
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.page-first-visit-progress__bar {
  width: 42%;
  height: 100%;
  border-radius: var(--ui-radius-full);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--primary-color) 72%, white 12%),
    transparent
  );
  animation: page-first-visit-progress-slide 980ms var(--ui-motion-ease-emphasized, ease) infinite;
}

.workspace-detached-placeholder__button {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  border-radius: 7px;
  color: var(--ui-text-secondary);
  background: color-mix(in srgb, var(--ui-surface-panel) 88%, transparent);
  font: inherit;
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
  cursor: pointer;
  pointer-events: auto;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}

.workspace-detached-placeholder__button:hover {
  border-color: color-mix(in srgb, var(--ui-primary-color) 42%, var(--ui-border-subtle));
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--ui-primary-color) 9%, var(--ui-surface-panel));
}

.workspace-detached-placeholder {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: 32px;
  color: var(--ui-text-primary);
}

.workspace-detached-placeholder__panel {
  display: grid;
  width: min(440px, 100%);
  gap: 10px;
  justify-items: start;
  padding: 22px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 84%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--ui-surface-panel) 72%, transparent);
}

.workspace-detached-placeholder__eyebrow {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  font-weight: 750;
}

.workspace-detached-placeholder h2 {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.35;
}

.workspace-detached-placeholder p {
  margin: 0;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-size-sm);
  line-height: 1.6;
}

@keyframes page-first-visit-progress-slide {
  0% {
    transform: translateX(-110%);
  }

  100% {
    transform: translateX(260%);
  }
}
</style>
