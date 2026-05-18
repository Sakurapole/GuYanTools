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
      <TransitionGroup name="tab-move" tag="div" class="tab-list">
        <ToolItem v-for="tab in tabPages" :key="tab.id"
          :tab-id="tab.id" :tab-name="tab.name" :url="tab.url"
          :icon="tab.icon" :active="tab.active" :closable="tab.closable !== false"
          @close="handleTabClose"
          @dragstart="handleDragStart"
          @dragenter="handleDragEnter"
          @dragend="handleDragEnd"
          @hover="handleTabHover"
          @hoverend="handleTabHoverEnd" />
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

</template>

<script lang="ts" setup>
import ToolItem from '@/windows/main/components/bottombar/tool_item.vue';
import TabPreview from '@/windows/main/components/bottombar/TabPreview.vue';
import SvgIcon from '@/windows/main/components/svgs/svgicon.vue';
import { useBarStore } from '@/windows/main/stores/bar_store';
import { useWebviewStore } from '@/windows/main/stores/webview_store';
import { ref, toRefs, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const barStore = useBarStore();
const webviewStore = useWebviewStore();
const { toggleSidebar } = barStore;
const { tabPages } = toRefs(useBarStore());

const draggingTabId = ref<string | null>(null);
let lastSwapTime = 0;

// ─── 预览弹窗状态（集中管理） ───
const previewVisible = ref(false);
const previewTabName = ref('');
const previewTabUrl = ref('');
const previewTabIcon = ref<string | undefined>(undefined);
const previewTriggerRect = ref<DOMRect | null>(null);

let previewShowTimer: number | null = null;
let previewHideTimer: number | null = null;

function clearPreviewTimers() {
  if (previewShowTimer !== null) { clearTimeout(previewShowTimer); previewShowTimer = null; }
  if (previewHideTimer !== null) { clearTimeout(previewHideTimer); previewHideTimer = null; }
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
  lastSwapTime = 0;
}

function handleDragEnter(targetTabId: string, _e: DragEvent) {
  const sourceId = draggingTabId.value;
  if (!sourceId || sourceId === targetTabId) return;

  const now = Date.now();
  if (now - lastSwapTime < 150) return;
  lastSwapTime = now;

  barStore.moveTabToDragTarget(sourceId, targetTabId);
}

function handleDragEnd() {
  draggingTabId.value = null;
  lastSwapTime = 0;
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

.tab-move-move {
  transition: transform 0.25s ease;
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
