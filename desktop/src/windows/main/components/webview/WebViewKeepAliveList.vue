<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import { useBarStore } from '../../stores/bar_store';
import { useWebviewStore, type WebviewInstance } from '../../stores/webview_store';

const props = withDefaults(defineProps<{
  compact?: boolean;
  emptyText?: string;
}>(), {
  compact: false,
  emptyText: '暂无正在保活的网页',
});

const route = useRoute();
const router = useRouter();
const barStore = useBarStore();
const webviewStore = useWebviewStore();

const sortedInstances = computed(() =>
  [...webviewStore.instances].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return (right.hiddenAt ?? right.createdAt) - (left.hiddenAt ?? left.createdAt);
  }),
);

function webviewRoute(url: string) {
  return `/webview?url=${encodeURIComponent(url)}`;
}

function instanceTitle(instance: WebviewInstance) {
  return instance.title || instance.domain || instance.url;
}

function statusText(instance: WebviewInstance) {
  if (instance.active) return '正在显示';
  return instance.keepAliveMode === 'temporary' ? '临时保活' : '后台保活';
}

function openInstance(instance: WebviewInstance) {
  const routePath = webviewRoute(instance.url);
  barStore.openTab(routePath, instanceTitle(instance), undefined);
  void router.push(routePath);
}

function closeInstance(instance: WebviewInstance) {
  const routePath = webviewRoute(instance.url);
  const tab = barStore.tabPages.find(item => item.url === routePath);
  const shouldNavigate = route.fullPath === routePath || tab?.active;

  webviewStore.removeInstance(instance.url);

  if (tab) {
    const nextRoute = barStore.closeTab(tab.id);
    if (shouldNavigate && nextRoute) {
      void router.push(nextRoute);
    }
    return;
  }

  if (shouldNavigate) {
    void router.push('/home');
  }
}
</script>

<template>
  <div class="webview-keepalive-list" :class="{ 'webview-keepalive-list--compact': props.compact }">
    <div v-if="sortedInstances.length === 0" class="webview-keepalive-list__empty">
      {{ props.emptyText }}
    </div>
    <div v-else class="webview-keepalive-list__items">
      <div v-for="instance in sortedInstances" :key="instance.url" class="webview-keepalive-list__item">
        <button class="webview-keepalive-list__main" type="button" @click="openInstance(instance)">
          <span class="webview-keepalive-list__title">{{ instanceTitle(instance) }}</span>
          <span v-if="!props.compact" class="webview-keepalive-list__meta">{{ instance.domain || instance.url }}</span>
          <span v-if="!props.compact" class="webview-keepalive-list__url">{{ instance.url }}</span>
        </button>
        <div class="webview-keepalive-list__actions">
          <span v-if="!props.compact" class="webview-keepalive-list__status" :class="{ active: instance.active }">
            {{ statusText(instance) }}
          </span>
          <UiIconButton
            v-if="props.compact"
            class="webview-keepalive-list__close"
            variant="ghost"
            size="sm"
            shape="square"
            title="关闭"
            @click.stop="closeInstance(instance)"
          >
            ×
          </UiIconButton>
          <UiButton v-else variant="danger" size="sm" @click.stop="closeInstance(instance)">关闭</UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.webview-keepalive-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.webview-keepalive-list__items {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  gap: 8px;
  max-height: 240px;
  overflow: auto;
  padding-right: 4px;
}

.webview-keepalive-list__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-panel) 78%, transparent);
}

.webview-keepalive-list__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 0;
  border: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.webview-keepalive-list__title,
.webview-keepalive-list__meta,
.webview-keepalive-list__url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.webview-keepalive-list__title {
  color: var(--ui-text-primary);
  font-size: 13px;
  font-weight: 700;
}

.webview-keepalive-list__meta {
  color: var(--ui-text-secondary);
  font-size: 12px;
}

.webview-keepalive-list__url {
  color: var(--ui-text-muted);
  font-size: 11px;
}

.webview-keepalive-list__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.webview-keepalive-list__status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  color: var(--ui-text-secondary);
  font-size: 11px;
  background: var(--ui-tabs-active-bg);
}

.webview-keepalive-list__status.active {
  color: var(--ui-input-focus-border);
  background: color-mix(in srgb, var(--ui-input-focus-border) 14%, transparent);
}

.webview-keepalive-list__empty {
  padding: 18px 12px;
  border: 1px dashed var(--ui-border-subtle);
  border-radius: 8px;
  color: var(--ui-text-muted);
  font-size: 13px;
  text-align: center;
  background: color-mix(in srgb, var(--ui-surface-panel) 64%, transparent);
}

.webview-keepalive-list--compact {
  .webview-keepalive-list__items {
    flex: 1 1 0;
    min-height: 0;
    max-height: none;
    height: 100%;
    gap: 6px;
    padding: 0;
  }

  .webview-keepalive-list__item {
    grid-template-columns: minmax(0, 1fr) 28px;
    min-height: 34px;
    gap: 6px;
    padding: 5px 6px 5px 10px;
    border-color: color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--ui-surface-glass-strong) 58%, transparent);
    box-shadow: none;
  }

  .webview-keepalive-list__item:hover {
    border-color: color-mix(in srgb, var(--ui-input-focus-border) 34%, var(--ui-border-subtle));
    background: color-mix(in srgb, var(--ui-input-focus-border) 8%, var(--ui-surface-glass-strong));
  }

  .webview-keepalive-list__main {
    justify-content: center;
  }

  .webview-keepalive-list__title {
    color: var(--widget-text-primary, var(--ui-text-primary));
    font-size: 12px;
    font-weight: 650;
  }

  .webview-keepalive-list__actions {
    justify-content: flex-end;
  }

  .webview-keepalive-list__close {
    width: 26px;
    height: 26px;
    color: var(--ui-text-muted);
    font-size: 18px;
    line-height: 1;
  }

  .webview-keepalive-list__close:hover {
    color: var(--ui-button-danger-text);
    background: var(--ui-button-danger-bg);
  }

  .webview-keepalive-list__empty {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 0;
    padding: 0 10px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--ui-surface-glass-strong) 46%, transparent);
  }
}
</style>
