<script lang="ts" setup>
import { computed } from 'vue';
import type { GridItem } from '../../../types/grid';
import WebViewKeepAliveList from '../../../components/webview/WebViewKeepAliveList.vue';
import { useWebviewStore } from '../../../stores/webview_store';

const props = withDefaults(defineProps<{
  item: GridItem;
  interactive?: boolean;
}>(), {
  interactive: true,
});

const webviewStore = useWebviewStore();
const isCompact = computed(() => props.item.rowSpan <= 2);
const countLabel = computed(() => `${webviewStore.instances.length} 个页面`);
</script>

<template>
  <div class="webview-keepalive-widget" :class="{ 'webview-keepalive-widget--compact': isCompact }">
    <div class="webview-keepalive-widget__head">
      <div class="webview-keepalive-widget__title-row">
        <svg class="webview-keepalive-widget__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z" stroke="currentColor" stroke-width="1.4"/>
          <path d="M2.8 10h14.4M10 2.5c2 2.1 3 4.6 3 7.5s-1 5.4-3 7.5c-2-2.1-3-4.6-3-7.5s1-5.4 3-7.5Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <span>{{ props.item.label || '保活网页' }}</span>
      </div>
      <span class="webview-keepalive-widget__count">{{ countLabel }}</span>
    </div>

    <WebViewKeepAliveList
      class="webview-keepalive-widget__list"
      compact
      empty-text="暂无保活网页"
    />
  </div>
</template>

<style lang="scss" scoped>
.webview-keepalive-widget {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 10px;
  box-sizing: border-box;
  color: var(--ui-text-primary);
}

.webview-keepalive-widget__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  flex: 0 0 auto;
}

.webview-keepalive-widget__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.webview-keepalive-widget__icon {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--ui-input-focus-border) 88%, var(--ui-text-primary));
}

.webview-keepalive-widget__count {
  flex: 0 0 auto;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.webview-keepalive-widget__list {
  min-height: 0;
  flex: 1 1 0;
  overflow: hidden;
  align-self: stretch;
}

.webview-keepalive-widget--compact {
  padding: 8px;
  gap: 6px;

  .webview-keepalive-widget__head {
    align-items: center;
  }

  .webview-keepalive-widget__title-row {
    font-size: 13px;
  }

  .webview-keepalive-widget__list {
    flex: 1 1 0;
  }
}
</style>
