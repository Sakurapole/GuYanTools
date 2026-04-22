<script setup lang="ts">
import { useElementSize } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import bottombar from './components/bottombar/bottombar.vue';
import ConfirmDialog from './components/ui/ConfirmDialog.vue';
import GlobalContextMenu from './components/ui/GlobalContextMenu.vue';
import Sidebar from './components/sidebar/sidebar.vue';
import Topbar from './components/topbar/topbar.vue';
import TrayContextMenu from './components/TrayContextMenu.vue';
import WebViewKeepAlive from './components/webview/WebViewKeepAlive.vue';
import { capturePageSnapshot } from './composables/useTabSnapshot';
import { useWebviewStore } from './stores/webview_store';

const { ipcRenderer } = window;
const router = useRouter();
const route = useRoute();
const pageContainerRef = ref<HTMLElement | null>(null);
const { width: containerWidth, height: containerHeight } = useElementSize(pageContainerRef);
let removeNavigationListener: (() => void) | undefined;
const webviewStore = useWebviewStore();

/** 新窗口弹窗模式：隐藏顶栏、侧栏、底栏 */
const isPopupMode = computed(() => route.query.popup === '1');
/** 页面自带标题栏（如脚本编辑器），popup 模式下跳过 App 自带的标题栏 */
const hasSelfTitlebar = computed(() => false);

// 路由切换时，对当前页面截图缓存
let removeBeforeEach: (() => void) | undefined;
removeBeforeEach = router.beforeEach((to, from, next) => {
  if (from.path && from.path !== '/') {
    void capturePageSnapshot(from.path);
  }
  next();
});

onMounted(() => {
  removeNavigationListener = ipcRenderer?.on('plugin-host:navigate', (route: string) => {
    void router.push(route);
    ipcRenderer?.send('plugin-host:navigate-complete');
  });

  // 初始页面也截一次
  setTimeout(() => {
    void capturePageSnapshot(router.currentRoute.value.path);
  }, 1500);
})

onBeforeUnmount(() => {
  removeNavigationListener?.();
  removeBeforeEach?.();
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
        <button class="popup-titlebar__btn" title="最小化" @click="ipcRenderer.send('window:minimize')">
          <svg width="10" height="1" viewBox="0 0 10 1"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" stroke-width="1"/></svg>
        </button>
        <button class="popup-titlebar__btn" title="最大化" @click="ipcRenderer.send('window:maximize')">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1"/></svg>
        </button>
        <button class="popup-titlebar__btn popup-titlebar__btn--close" title="关闭" @click="ipcRenderer.send('window:close')">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
    <Topbar v-if="!isPopupMode" />
    <div class="page-container" ref="pageContainerRef">
      <Sidebar v-if="!isPopupMode" :parent-height="containerHeight" :parent-width="containerWidth" />
      <router-view v-slot="{ Component, route }">
        <KeepAlive>
          <component :is="Component" v-if="route.meta.keepAlive" :key="route.path" v-show="!webviewStore.hasActiveInstance" />
        </KeepAlive>
        <component :is="Component" v-if="!route.meta.keepAlive" :key="route.path" v-show="!webviewStore.hasActiveInstance" />
      </router-view>
      <!-- WebView 保活容器：与 router-view 平级 -->
      <WebViewKeepAlive v-if="!isPopupMode" />
    </div>
    <bottombar v-if="!isPopupMode" />
    <GlobalContextMenu />
    <ConfirmDialog />
    <!-- Tray context menu (custom renderer-side popup) -->
    <TrayContextMenu />
  </div>
</template>

<style lang="scss">
@use './assets/foundation.scss';
@use './assets/theme.scss';
@use './assets/patterns.scss';
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
  background: var(--ui-surface-elevated, var(--background-color));
  border-bottom: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
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

.popup-titlebar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: rgba(128, 128, 128, 0.12);
  }

  &--close:hover {
    background: #e81123;
    color: #fff;
  }
}
</style>
