<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  WORKSPACE_WINDOW_DEFINITIONS,
  isWorkspaceWindowKey,
  type WorkspaceWindowKey,
} from '@/contracts/workspace_window';
import AppNotificationHost from '@/windows/main/components/AppNotificationHost.vue';
import ConfirmDialog from '@/windows/main/components/ui/ConfirmDialog.vue';
import GlobalContextMenu from '@/windows/main/components/ui/GlobalContextMenu.vue';
import TextPromptDialog from '@/windows/main/components/ui/TextPromptDialog.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import TrayContextMenu from '@/windows/main/components/TrayContextMenu.vue';
import WorkspaceWindowSkeleton from './WorkspaceWindowSkeleton.vue';
import '@/windows/main/assets/foundation.scss';
import '@/windows/main/assets/theme.scss';
import '@/windows/main/assets/patterns.scss';
import '@/windows/main/assets/motion.scss';
import '@/windows/main/assets/tooltip.scss';
import '@/windows/main/assets/app.scss';

const route = useRoute();
const { ipcRenderer } = window;
const prewarmMode = computed(() => route.query.prewarm === '1');
const currentKey = ref<WorkspaceWindowKey>(resolveWindowKey());
const currentDefinition = computed(() => WORKSPACE_WINDOW_DEFINITIONS[currentKey.value]);
const title = computed(() => `${currentDefinition.value.title} - GuYanTools`);
let removeWorkspaceWindowStateListener: (() => void) | undefined;

function resolveWindowKey(): WorkspaceWindowKey {
  const routeKey = route.query.detached;
  if (isWorkspaceWindowKey(routeKey)) {
    return routeKey;
  }

  const params = new URLSearchParams(window.location.search);
  const searchKey = params.get('detached');
  if (isWorkspaceWindowKey(searchKey)) {
    return searchKey;
  }

  const hashQuery = window.location.hash.split('?')[1] ?? '';
  const hashKey = new URLSearchParams(hashQuery).get('detached');
  return isWorkspaceWindowKey(hashKey) ? hashKey : 'knowledge';
}

function updateKeyFromLocation() {
  currentKey.value = resolveWindowKey();
}

function minimizeWindow() {
  ipcRenderer?.send('window:minimize');
}

function maximizeWindow() {
  ipcRenderer?.send('window:maximize');
}

function closeWindow() {
  ipcRenderer?.send('window:close');
}

async function returnToMainWindow() {
  await window.workspaceWindowApi?.returnToMain(currentKey.value);
}

watch(title, (nextTitle) => {
  document.title = nextTitle;
}, { immediate: true });

watch(
  () => [route.path, route.query.detached],
  updateKeyFromLocation,
);

onMounted(() => {
  window.addEventListener('hashchange', updateKeyFromLocation);
  void window.workspaceWindowApi?.getContext().then((context) => {
    if (context.detachedKey && isWorkspaceWindowKey(context.detachedKey)) {
      currentKey.value = context.detachedKey;
    }
  });
  removeWorkspaceWindowStateListener = window.workspaceWindowApi?.onStateChanged(() => {
    updateKeyFromLocation();
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', updateKeyFromLocation);
  removeWorkspaceWindowStateListener?.();
});
</script>

<template>
  <div class="workspace-window-shell">
    <div class="workspace-window-titlebar">
      <div class="workspace-window-titlebar__mark" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M5.25 2.75H3.75C3.2 2.75 2.75 3.2 2.75 3.75V12.25C2.75 12.8 3.2 13.25 3.75 13.25H12.25C12.8 13.25 13.25 12.8 13.25 12.25V10.75M8.25 2.75H13.25V7.75M7.75 8.25L13 3" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="workspace-window-titlebar__title">{{ currentDefinition.title }}</div>
      <div class="workspace-window-titlebar__drag" />
      <div class="workspace-window-titlebar__actions">
        <UiIconButton size="sm" variant="ghost" shape="square" title="回到主窗口" @click="returnToMainWindow">
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M5 2 1.5 5.5 5 9M2 5.5h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </UiIconButton>
        <UiIconButton size="sm" variant="ghost" shape="square" title="最小化" @click="minimizeWindow">
          <svg width="10" height="1" viewBox="0 0 10 1"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" stroke-width="1"/></svg>
        </UiIconButton>
        <UiIconButton size="sm" variant="ghost" shape="square" title="最大化" @click="maximizeWindow">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1"/></svg>
        </UiIconButton>
        <UiIconButton class="workspace-window-titlebar__close" size="sm" variant="ghost" shape="square" title="关闭" @click="closeWindow">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </UiIconButton>
      </div>
    </div>

    <main class="workspace-window-stage">
      <WorkspaceWindowSkeleton v-if="prewarmMode" :page-key="currentKey" />
      <router-view v-else v-slot="{ Component, route: activeRoute }">
        <Suspense>
          <component :is="Component" :key="activeRoute.path" />
          <template #fallback>
            <WorkspaceWindowSkeleton :page-key="currentKey" />
          </template>
        </Suspense>
      </router-view>
    </main>

    <GlobalContextMenu />
    <ConfirmDialog />
    <TextPromptDialog />
    <TrayContextMenu />
    <AppNotificationHost popup />
  </div>
</template>

<style scoped lang="scss">
.workspace-window-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg-color);
  color: var(--ui-text-primary);
}

.workspace-window-titlebar {
  display: flex;
  align-items: center;
  flex: 0 0 38px;
  min-height: 38px;
  border-bottom: 1px solid var(--ui-border-subtle);
  background: var(--topbar-bg-color);
  -webkit-app-region: drag;
}

.workspace-window-titlebar__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 34px;
  color: var(--primary-color);
}

.workspace-window-titlebar__title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-window-titlebar__drag {
  flex: 1;
  align-self: stretch;
}

.workspace-window-titlebar__actions {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  -webkit-app-region: no-drag;

  :deep(.ui-icon-button) {
    width: 38px;
    height: 100%;
    border-radius: 0;
    color: var(--primary-color);

    &:hover:not(:disabled) {
      transform: none;
      background: var(--bar-btn-hover-bg-color);
    }
  }
}

.workspace-window-titlebar__close:hover:not(:disabled) {
  :deep(.ui-icon-button__icon) {
    color: var(--ui-button-danger-text);
  }
}

.workspace-window-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;

  :deep(.main-page-layout) {
    height: 100%;
  }
}
</style>
