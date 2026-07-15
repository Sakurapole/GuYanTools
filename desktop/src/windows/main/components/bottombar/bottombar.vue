<template>
  <div class="bottombar-container">
    <div class="bottombar-app-func-container">
      <div class="bottombar-app-func-item switch-sidebar-btn" @click="toggleSidebar" v-ripple>
        <SvgIcon width="24" height="24" viewBox="0 0 1024 1024">
          <path
            d="M896 261.4272L524.7488 475.136a25.6 25.6 0 0 1-25.6 0L128 261.4272a25.6 25.6 0 0 1 0-44.3392L499.2512 3.4304a25.6 25.6 0 0 1 25.6 0L896 217.088a25.6 25.6 0 0 1 0 44.3392zM934.3488 333.4656L563.7632 547.84a25.6 25.6 0 0 0-12.7488 22.1184l-0.512 428.1856a25.6 25.6 0 0 0 38.4512 22.2208l370.5856-214.528a25.6 25.6 0 0 0 12.7488-22.1696l0.512-428.1856a25.6 25.6 0 0 0-38.4512-22.016zM51.2 355.6352l0.512 428.1856a25.6 25.6 0 0 0 12.7488 22.1696L435.2 1020.5184a25.6 25.6 0 0 0 38.2976-22.1184l-0.512-428.1856a25.6 25.6 0 0 0-12.7488-22.3744L89.6512 333.4656A25.6 25.6 0 0 0 51.2 355.6352z"
            p-id="2031"></path>
        </SvgIcon>
      </div>
    </div>
    <div class="bottombar-running-tool-container">
      <TransitionGroup name="tab-move" tag="div" class="tab-list" :class="{ 'tab-list--instant': tabListInstant }">
        <ToolItem v-for="tab in ungroupedTabPages" :key="tab.id"
          :tab-id="tab.id" :tab-name="tab.name" :url="tab.url"
          :icon="tab.icon" :active="tab.active" :closable="tab.closable !== false" :icon-only="tab.iconOnly"
          @close="handleTabClose"
          @dragstart="handleDragStart"
          @dragenter="handleDragEnter"
          @drop="handleTabDrop"
          @dragend="handleDragEnd"
          @hover="handleTabHover"
          @hoverend="handleTabHoverEnd" />
        <div
          v-for="collection in collections"
          :key="collection.id"
          class="tab-collection-button"
          :class="{ 'is-active': collection.active }"
          role="button"
          tabindex="0"
          draggable="true"
          :title="collection.name"
          @click="openCollectionFirstTab(collection.id)"
          @keydown.enter.prevent="openCollectionFirstTab(collection.id)"
          @keydown.space.prevent="openCollectionFirstTab(collection.id)"
          @dragstart="handleCollectionDragStart(collection.id, $event)"
          @dragenter.prevent
          @dragover.prevent
          @drop="handleCollectionDrop(collection.id, $event)"
          @dragend="handleDragEnd"
          @mouseenter="handleCollectionHover(collection.id, $event)"
          @mouseleave="handleCollectionHoverEnd"
        >
          <IconRenderer :icon="collection.icon" :size="16" color="currentColor" />
          <span class="tab-collection-button__count">{{ collection.tabs.length }}</span>
        </div>
      </TransitionGroup>
    </div>
  </div>

  <!-- 页面预览弹窗（全局唯一实例） -->
  <TabPreview
    :visible="previewVisible"
    :tab-name="previewTabName"
    :tab-url="previewTabUrl"
    :tab-icon="previewTabIcon"
    :trigger-rect="previewTriggerRect"
    @mouseenter="onPreviewMouseEnter"
    @mouseleave="onPreviewMouseLeave"
  />

  <Teleport to="body">
    <Transition name="tab-collection-panel">
      <div
        v-if="collectionPanelVisible && activeCollection"
        class="tab-collection-panel"
        :style="collectionPanelStyle"
        @mouseenter="onCollectionPanelMouseEnter"
        @mouseleave="onCollectionPanelMouseLeave"
      >
        <div class="tab-collection-panel__head">
          <span>{{ activeCollection.name }}</span>
          <small>{{ activeCollection.tabs.length }} 个标签</small>
        </div>
        <div class="tab-collection-panel__items">
          <div
            v-for="tab in activeCollection.tabs"
            :key="tab.id"
            class="tab-collection-panel__item"
            :class="{ 'is-active': tab.active }"
            role="button"
            tabindex="0"
            :title="tab.name"
            @click="activatePanelTab(tab.url)"
            @keydown.enter.prevent="activatePanelTab(tab.url)"
            @keydown.space.prevent="activatePanelTab(tab.url)"
          >
            <span v-if="tab.icon && svgIcons[tab.icon]" class="tab-collection-panel__icon">
              <SvgIcon width="17" height="17" viewBox="0 0 24 24">
                <path :d="svgIcons[tab.icon]" />
              </SvgIcon>
            </span>
            <IconRenderer v-else-if="tab.icon" :icon="tab.icon" :size="17" color="currentColor" />
            <span class="tab-collection-panel__label">{{ tab.name }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

</template>

<script lang="ts" setup>
import ToolItem from '@/windows/main/components/bottombar/tool_item.vue';
import TabPreview from '@/windows/main/components/bottombar/TabPreview.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import SvgIcon from '@/windows/main/components/svgs/svgicon.vue';
import { useBarStore } from '@/windows/main/stores/bar_store';
import { useWebviewStore } from '@/windows/main/stores/webview_store';
import { computed, nextTick, ref, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';

const router = useRouter();
const barStore = useBarStore();
const webviewStore = useWebviewStore();
const { toggleSidebar } = barStore;
const { tabPages, ungroupedTabPages, collections } = storeToRefs(barStore);

const draggingTabId = ref<string | null>(null);
const tabListInstant = ref(false);

// ─── 预览弹窗状态（集中管理） ───
const previewVisible = ref(false);
const previewTabName = ref('');
const previewTabUrl = ref('');
const previewTabIcon = ref<string | undefined>(undefined);
const previewTriggerRect = ref<DOMRect | null>(null);

let previewShowTimer: number | null = null;
let previewHideTimer: number | null = null;
let collectionShowTimer: number | null = null;
let collectionHideTimer: number | null = null;

const collectionPanelVisible = ref(false);
const collectionPanelId = ref('');
const collectionTriggerRect = ref<DOMRect | null>(null);
const activeCollection = computed(() => collections.value.find(collection => collection.id === collectionPanelId.value));
const collectionPanelStyle = computed(() => {
  const rect = collectionTriggerRect.value;
  const width = Math.min(420, Math.max(220, (activeCollection.value?.tabs.length ?? 1) * 66 + 24));
  if (!rect) {
    return { left: '50%', top: '0px', width: `${width}px` };
  }

  const halfWidth = width / 2 + 10;
  const x = Math.min(window.innerWidth - halfWidth, Math.max(halfWidth, rect.left + rect.width / 2));
  return {
    left: `${x}px`,
    top: `${rect.top - 10}px`,
    width: `${width}px`,
  };
});

const svgIcons: Record<string, string> = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  plugins: 'M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z',
  terminal: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm1.5 3.5L8.5 11l-3 2.5 1 1.2L11 11l-4.5-3.7-1 1.2zM12 14h6v-1.5h-6V14z',
  ftp: 'M15 5H5a2 2 0 0 0-2 2v10h2V7h10V5zm4 4H9a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2zm-5 9h-2v-2h2v2zm0-3h-2v-4h2v4zm5 3h-2v-2h2v2zm-3-5-3 3-3-3h2V11h2v2h2z',
  todo: 'M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8c1.57 0 3.04.46 4.28 1.25l1.45-1.45A10.02 10.02 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10h-2c0 4.41-3.59 8-8 8z',
  knowledge: 'M5 4.5A2.5 2.5 0 0 1 7.5 2H20v16H8a2 2 0 0 0-2 2h14v2H7a4 4 0 0 1-4-4V6.5A2 2 0 0 1 5 4.5zM6 6.5V17.1c.57-.36 1.26-.6 2-.6h10V4H7.5A1.5 1.5 0 0 0 6 5.5v1zM8 7h8v2H8V7zm0 4h6v2H8v-2z',
  ai: 'M12 2a6 6 0 0 1 6 6v1.2a4.8 4.8 0 0 1 1.4 8.2l1.3 2.6h-2.2l-1-2H6.5l-1 2H3.3l1.3-2.6A4.8 4.8 0 0 1 6 9.2V8a6 6 0 0 1 6-6zm0 2a4 4 0 0 0-4 4v1h8V8a4 4 0 0 0-4-4zm-1 7H8.8A2.8 2.8 0 0 0 6 13.8v.4A2.8 2.8 0 0 0 8.8 17H11v-6zm2 0v6h2.2a2.8 2.8 0 0 0 2.8-2.8v-.4a2.8 2.8 0 0 0-2.8-2.8H13zm-4 2h1.5v2H9v-2zm4.5 0H15v2h-1.5v-2z',
  script: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2.5L17.5 8H14V4.5zM8.6 17.4 5.8 14.6l2.8-2.8L10 13.2l-1.4 1.4L10 16l-1.4 1.4zm6.8 0L14 16l1.4-1.4L14 13.2l1.4-1.4 2.8 2.8-2.8 2.8zm-4.3.1-1.4-.5 3.2-8.5 1.4.5-3.2 8.5z',
  devtools: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
};

function clearPreviewTimers() {
  if (previewShowTimer !== null) { clearTimeout(previewShowTimer); previewShowTimer = null; }
  if (previewHideTimer !== null) { clearTimeout(previewHideTimer); previewHideTimer = null; }
}

function hidePreview() {
  clearPreviewTimers();
  previewVisible.value = false;
  previewTriggerRect.value = null;
}

function clearCollectionTimers() {
  if (collectionShowTimer !== null) { clearTimeout(collectionShowTimer); collectionShowTimer = null; }
  if (collectionHideTimer !== null) { clearTimeout(collectionHideTimer); collectionHideTimer = null; }
}

function handleTabHover(tabId: string, rect: DOMRect) {
  clearPreviewTimers();
  const tab = tabPages.value.find(t => t.id === tabId);
  if (!tab) return;

  const applyPreview = () => {
    previewTabName.value = tab.name;
    previewTabUrl.value = tab.url;
    previewTabIcon.value = tab.icon;
    previewTriggerRect.value = rect;
    previewVisible.value = true;
  };

  if (previewVisible.value) {
    // 预览已显示 → 立即切换到新 Tab 的预览
    applyPreview();
  } else {
    // 预览未显示 → 延迟 400ms 后显示
    previewShowTimer = window.setTimeout(applyPreview, 400);
  }
}

function handleTabHoverEnd(_tabId: string) {
  clearPreviewTimers();
  previewHideTimer = window.setTimeout(() => {
    previewVisible.value = false;
  }, 150);
}

function onPreviewMouseEnter() {
  clearPreviewTimers();
}

function onPreviewMouseLeave() {
  clearPreviewTimers();
  previewHideTimer = window.setTimeout(() => {
    previewVisible.value = false;
  }, 150);
}

onBeforeUnmount(() => {
  clearPreviewTimers();
  clearCollectionTimers();
});

// ─── Tab 关闭 & 拖拽 ───
function getKeepAliveTargetUrl(tabUrl?: string): string | null {
  if (!tabUrl) return null;

  const [path, query = ''] = tabUrl.split('?');
  if (path !== '/webview') return null;

  const rawUrl = new URLSearchParams(query).get('url');
  if (!rawUrl) return null;

  let targetUrl = rawUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl);
  } catch {
    targetUrl = rawUrl;
  }

  if (!webviewStore.isManagedKeepAliveUrl(targetUrl)) return null;

  return targetUrl;
}

function closeTabAndNavigate(tabId: string) {
  const nextRoute = barStore.closeTab(tabId);
  if (nextRoute) {
    void router.push(nextRoute);
  }
}

function handleTabClose(tabId: string) {
  const tab = tabPages.value.find(item => item.id === tabId);
  if (!tab) return;

  const targetUrl = getKeepAliveTargetUrl(tab.url);
  if (!targetUrl) {
    closeTabAndNavigate(tabId);
    return;
  }

  webviewStore.hideInstance(targetUrl);
  closeTabAndNavigate(tabId);
}

function handleDragStart(tabId: string, _e: DragEvent) {
  draggingTabId.value = tabId;
}

function handleDragEnter(targetTabId: string, _e: DragEvent) {
  const sourceId = draggingTabId.value;
  if (!sourceId || sourceId === targetTabId) return;
}

function handleTabDrop(targetTabId: string, _e: DragEvent) {
  const sourceId = draggingTabId.value;
  if (!sourceId || sourceId === targetTabId) return;

  hidePreview();
  void runInstantTabMutation(() => barStore.createCollectionFromTabs(sourceId, targetTabId));
}

function handleDragEnd() {
  draggingTabId.value = null;
  hidePreview();
}

function handleCollectionDragStart(collectionId: string, e: DragEvent) {
  const firstTab = collections.value.find(collection => collection.id === collectionId)?.tabs[0];
  if (!firstTab) return;
  draggingTabId.value = firstTab.id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', firstTab.id);
  }
}

function handleCollectionDrop(collectionId: string, _e: DragEvent) {
  const sourceId = draggingTabId.value;
  const targetTab = collections.value.find(collection => collection.id === collectionId)?.tabs[0];
  if (!sourceId || !targetTab || sourceId === targetTab.id) return;

  hidePreview();
  void runInstantTabMutation(() => barStore.createCollectionFromTabs(sourceId, targetTab.id));
}

async function runInstantTabMutation(action: () => Promise<void> | void) {
  tabListInstant.value = true;
  try {
    await action();
    await nextTick();
  } finally {
    window.setTimeout(() => {
      tabListInstant.value = false;
    }, 80);
  }
}

function handleCollectionHover(collectionId: string, event: MouseEvent) {
  clearPreviewTimers();
  clearCollectionTimers();
  collectionPanelId.value = collectionId;
  collectionTriggerRect.value = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (collectionPanelVisible.value) {
    collectionPanelVisible.value = true;
    return;
  }

  collectionShowTimer = window.setTimeout(() => {
    collectionPanelVisible.value = true;
  }, 180);
}

function handleCollectionHoverEnd() {
  clearCollectionTimers();
  collectionHideTimer = window.setTimeout(() => {
    collectionPanelVisible.value = false;
  }, 160);
}

function onCollectionPanelMouseEnter() {
  clearCollectionTimers();
}

function onCollectionPanelMouseLeave() {
  clearCollectionTimers();
  collectionHideTimer = window.setTimeout(() => {
    collectionPanelVisible.value = false;
  }, 160);
}

function openCollectionFirstTab(collectionId: string) {
  const firstTab = collections.value.find(collection => collection.id === collectionId)?.tabs[0];
  if (firstTab) {
    void router.push(firstTab.url);
  }
}

function activatePanelTab(url: string) {
  void router.push(url);
  collectionPanelVisible.value = false;
}

</script>

<style lang="scss">
@use "./bottombar.scss";

.tab-list {
  display: flex;
  align-items: center;
  height: 100%;
  width: 100%;
}

.tab-collection-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  min-width: 46px;
  height: 100%;
  border: 0;
  border-right: var(--ui-border-width-thin) solid var(--ui-border-accent);
  background: var(--ui-surface-glass);
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;

  &:hover,
  &.is-active {
    color: var(--primary-color);
    background: var(--ui-surface-overlay);
  }

  &.is-active {
    box-shadow: inset 0 -2px 0 var(--primary-color);
  }
}

.tab-collection-button__count {
  position: absolute;
  right: 5px;
  bottom: 5px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: var(--ui-radius-full);
  background: var(--ui-button-primary-bg);
  color: var(--ui-button-primary-text);
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
  pointer-events: none;
}

.tab-collection-panel {
  position: fixed;
  z-index: var(--ui-z-toast);
  transform: translateX(-50%) translateY(-100%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: calc(100vw - 24px);
  padding: 10px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-glass-strong);
  box-shadow: var(--ui-shadow-popover, var(--ui-panel-shadow));
  backdrop-filter: var(--ui-backdrop-blur-md);
  color: var(--ui-text-primary);
}

.tab-collection-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 0 2px 2px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 700;
  }

  small {
    flex: 0 0 auto;
    color: var(--ui-text-muted);
    font-size: 11px;
  }
}

.tab-collection-panel__items {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 1px;

  &::-webkit-scrollbar {
    height: 0;
  }
}

.tab-collection-panel__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 36px;
  flex: 0 0 44px;
  box-sizing: border-box;
  padding: 0;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-button-ghost-bg);
  color: var(--ui-icon-button-text);
  cursor: pointer;
  outline: none;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;

  &:hover,
  &:focus-visible,
  &.is-active {
    background: var(--ui-icon-button-hover-bg);
    color: var(--ui-icon-button-hover-text);
    border-color: var(--ui-border-accent-soft);
  }

  &:focus-visible {
    box-shadow: var(--ui-focus-ring);
  }
}

.tab-collection-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  svg {
    fill: currentColor;
  }
}

.tab-collection-panel__label {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.tab-collection-panel-enter-active,
.tab-collection-panel-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.tab-collection-panel-enter-from,
.tab-collection-panel-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(calc(-100% + 6px));
}

@media (prefers-reduced-motion: reduce) {
  .tab-collection-panel-enter-active,
  .tab-collection-panel-leave-active,
  .tab-move-move,
  .tab-move-enter-active,
  .tab-move-leave-active {
    transition-duration: 0.01ms;
  }
}

.tab-move-move {
  transition: transform 0.25s ease;
}

.tab-list--instant .tab-move-move,
.tab-list--instant .tab-move-enter-active,
.tab-list--instant .tab-move-leave-active {
  position: static;
  transition: none !important;
}

.tab-list--instant .tab-move-enter-from,
.tab-list--instant .tab-move-leave-to {
  opacity: 1;
  transform: none;
}

.tab-move-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.tab-move-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
  position: absolute;
}

.tab-move-enter-from {
  opacity: 0;
  transform: translateX(-12px);
}

.tab-move-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

</style>
