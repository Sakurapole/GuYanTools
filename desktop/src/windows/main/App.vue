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
let routeRenderTimer: number | undefined;
let routeFirstVisitTimer: number | undefined;
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
})

onBeforeUnmount(() => {
  removeNavigationListener?.();
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
    <Topbar v-if="!isPopupMode" />
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
        <router-view v-slot="{ Component, route }">
          <Transition :name="pageTransitionName" mode="out-in">
            <KeepAlive>
              <component
                :is="Component"
                v-if="route.meta.keepAlive"
                :key="route.path"
                v-show="!webviewStore.hasActiveInstance"
              />
            </KeepAlive>
          </Transition>
          <Transition :name="pageTransitionName" mode="out-in">
            <component
              :is="Component"
              v-if="!route.meta.keepAlive"
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

@keyframes page-first-visit-progress-slide {
  0% {
    transform: translateX(-110%);
  }

  100% {
    transform: translateX(260%);
  }
}
</style>
