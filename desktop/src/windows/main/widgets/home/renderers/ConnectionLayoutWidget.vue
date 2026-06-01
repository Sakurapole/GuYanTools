<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ConnectionLayoutWidgetConfig, GridItem } from '../../../types/grid';
import {
  CONNECTION_LAYOUTS_CHANGED_EVENT,
  describeConnectionLayoutConfig,
  getConnectionLayoutConfig,
  layoutModeLabel,
  type ConnectionLayoutConfig,
} from '../../../session_layouts';
import { openConnectionLayoutFromHome } from '../connectionLayoutNavigation';
import { normalizeWidgetConfig } from '../registry';
import UiButton from '../../../components/ui/UiButton.vue';

const props = withDefaults(defineProps<{
  item: GridItem;
  interactive?: boolean;
}>(), {
  interactive: true,
});

const refreshTick = ref(0);
const config = computed(() =>
  normalizeWidgetConfig('connection_layout', props.item.widgetConfig) as ConnectionLayoutWidgetConfig,
);
const layout = computed<ConnectionLayoutConfig | null>(() => {
  refreshTick.value;
  return config.value.layoutId ? getConnectionLayoutConfig(config.value.layoutId) : null;
});
const isWide = computed(() => props.item.colSpan >= 4);
const isTall = computed(() => props.item.rowSpan >= 3);
const title = computed(() => layout.value?.name || props.item.label || '连接布局');
const meta = computed(() => layout.value ? describeConnectionLayoutConfig(layout.value) : '选择布局后可快速打开多连接工作区');
const visibleTargets = computed(() => layout.value?.targets.slice(0, isTall.value ? 4 : 2) ?? []);

function refreshLayout() {
  refreshTick.value += 1;
}

async function openLayout() {
  if (!props.interactive || !layout.value) return;
  await openConnectionLayoutFromHome(layout.value);
}

onMounted(() => {
  window.addEventListener(CONNECTION_LAYOUTS_CHANGED_EVENT, refreshLayout);
});

onBeforeUnmount(() => {
  window.removeEventListener(CONNECTION_LAYOUTS_CHANGED_EVENT, refreshLayout);
});
</script>

<template>
  <div class="connection-layout-widget" :class="{ 'connection-layout-widget--wide': isWide, 'connection-layout-widget--tall': isTall }" @dblclick.stop="openLayout">
    <header class="connection-layout-widget__header">
      <span class="connection-layout-widget__mark">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="7" height="7" rx="1.5" />
          <rect x="14" y="4" width="7" height="7" rx="1.5" />
          <rect x="3" y="15" width="18" height="5" rx="1.5" />
        </svg>
      </span>
      <span class="connection-layout-widget__surface">{{ layout?.surface === 'ftp' ? '传输' : '终端' }}</span>
    </header>

    <main class="connection-layout-widget__main">
      <div class="connection-layout-widget__title" :title="title">{{ title }}</div>
      <div class="connection-layout-widget__meta" :title="meta">{{ meta }}</div>
      <div v-if="layout" class="connection-layout-widget__mode">
        {{ layoutModeLabel(layout.viewState.layoutMode) }} · {{ layout.targets.length }} 个连接
      </div>
    </main>

    <div v-if="visibleTargets.length && isWide" class="connection-layout-widget__targets">
      <span v-for="target in visibleTargets" :key="`${target.surface}:${target.kind}:${target.label ?? ''}:${'profileId' in target ? target.profileId ?? '' : target.path}`">
        {{ target.label || (target.kind === 'local' ? '本地' : target.kind.toUpperCase()) }}
      </span>
    </div>

    <UiButton class="connection-layout-widget__action" variant="ghost" type="button" :disabled="!layout || !interactive" @click.stop="openLayout">
      打开布局
    </UiButton>
  </div>
</template>

<style lang="scss" scoped>
.connection-layout-widget {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 14px;
  color: var(--widget-text-primary, rgba(255, 255, 255, 0.95));
  overflow: hidden;
}

.connection-layout-widget__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.connection-layout-widget__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 22%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 14%, transparent);
}

.connection-layout-widget__mark svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.connection-layout-widget__surface {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 20%, transparent);
  border-radius: 999px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 10%, transparent);
  color: var(--widget-text-secondary, rgba(255, 255, 255, 0.72));
  font-size: 0.68rem;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-layout-widget__main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.connection-layout-widget__title,
.connection-layout-widget__meta,
.connection-layout-widget__mode {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-layout-widget__title {
  font-size: 1.02rem;
  font-weight: 780;
}

.connection-layout-widget__meta {
  margin-top: 5px;
  color: var(--widget-text-secondary, rgba(255, 255, 255, 0.7));
  font-size: 0.74rem;
}

.connection-layout-widget__mode {
  margin-top: 8px;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.62));
  font-size: 0.7rem;
}

.connection-layout-widget__targets {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 0;
  overflow: hidden;
}

.connection-layout-widget__targets span {
  max-width: 100%;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 16%, transparent);
  border-radius: 6px;
  padding: 3px 6px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 10%, transparent);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-layout-widget__action.ui-button {
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 24%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 14%, transparent);
  color: var(--widget-text-primary, rgba(255, 255, 255, 0.92));
  font-size: 0.76rem;
  font-weight: 760;
  cursor: pointer;
  transform: none;
}

.connection-layout-widget__action.ui-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--widget-text-primary, white) 22%, transparent);
  transform: none;
}

.connection-layout-widget__action.ui-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.connection-layout-widget--wide {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 112px;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-items: center;
}

.connection-layout-widget--wide .connection-layout-widget__header {
  grid-column: 1;
  grid-row: 1;
  justify-content: center;
}

.connection-layout-widget--wide .connection-layout-widget__surface {
  display: none;
}

.connection-layout-widget--wide .connection-layout-widget__main {
  grid-column: 2;
  grid-row: 1;
}

.connection-layout-widget--wide .connection-layout-widget__action {
  grid-column: 3;
  grid-row: 1;
  min-height: 38px;
}

.connection-layout-widget--wide .connection-layout-widget__targets {
  grid-column: 1 / -1;
  grid-row: 2;
}
</style>
