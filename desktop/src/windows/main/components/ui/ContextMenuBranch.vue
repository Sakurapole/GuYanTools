<script lang="ts" setup>
import { onBeforeUnmount, ref } from 'vue';
import type { ContextMenuItem } from '../../composables/useContextMenu';
import UiMenuDivider from './UiMenuDivider.vue';
import UiMenuItem from './UiMenuItem.vue';
import UiPopupSurface from './UiPopupSurface.vue';

defineOptions({ name: 'ContextMenuBranch' });

const props = withDefaults(defineProps<{
  items: ContextMenuItem[];
  nested?: boolean;
  closeMenu: () => void;
}>(), {
  nested: false,
});

const openSubmenuId = ref('');
const submenuDirection = ref<Record<string, 'left' | 'right'>>({});
const submenuStyle = ref<Record<string, Record<string, string>>>({});
let closeTimer: number | null = null;

function hasChildren(item: ContextMenuItem) {
  return Boolean(item.children?.length);
}

function clearCloseTimer() {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function scheduleClose(targetId = '') {
  clearCloseTimer();
  closeTimer = window.setTimeout(() => {
    if (!targetId || openSubmenuId.value === targetId) {
      openSubmenuId.value = '';
    }
  }, 120);
}

function estimateSubmenuHeight(item: ContextMenuItem) {
  const itemCount = item.children?.length ?? 0;
  return Math.min(window.innerHeight - 20, Math.max(84, itemCount * 34 + 12));
}

function handleItemEnter(event: MouseEvent, item: ContextMenuItem) {
  clearCloseTimer();

  if (!hasChildren(item)) {
    openSubmenuId.value = '';
    return;
  }

  openSubmenuId.value = item.id;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const estimatedWidth = 220;
  const estimatedHeight = estimateSubmenuHeight(item);
  const openToLeft = window.innerWidth - rect.right < estimatedWidth + 12;
  const left = openToLeft ? rect.left - estimatedWidth - 6 : rect.right + 6;
  const top = Math.min(Math.max(10, rect.top - 6), window.innerHeight - estimatedHeight - 10);

  submenuDirection.value[item.id] = openToLeft ? 'left' : 'right';
  submenuStyle.value[item.id] = {
    left: `${Math.max(10, left)}px`,
    top: `${Math.max(10, top)}px`,
  };
}

function handleItemLeave(item: ContextMenuItem) {
  if (!hasChildren(item)) {
    return;
  }

  scheduleClose(item.id);
}

function handleItemClick(item: ContextMenuItem) {
  if (item.disabled || hasChildren(item)) {
    return;
  }

  item.action?.();
  props.closeMenu();
}

onBeforeUnmount(() => {
  clearCloseTimer();
});
</script>

<template>
  <div class="context-menu-branch" :class="{ 'context-menu-branch--nested': nested }">
    <template v-for="(item, index) in items" :key="item.id">
      <UiMenuDivider v-if="item.divided && index > 0" />
      <div class="context-menu-branch__item" @mouseenter="handleItemEnter($event, item)" @mouseleave="handleItemLeave(item)">
        <UiMenuItem :danger="item.danger" :disabled="item.disabled" @click="handleItemClick(item)">
          <template v-if="item.icon" #icon>
            <component :is="item.icon" :width="16" :height="16" v-bind="item.iconProps" />
          </template>
          {{ item.label }}
          <template v-if="hasChildren(item)" #suffix>
            <span class="context-menu-branch__arrow" :class="{ 'context-menu-branch__arrow--left': submenuDirection[item.id] === 'left' }">
              {{ submenuDirection[item.id] === 'left' ? '‹' : '›' }}
            </span>
          </template>
        </UiMenuItem>

        <UiPopupSurface
          :model-value="hasChildren(item) && openSubmenuId === item.id"
          variant="floating"
          :overlay="false"
          :close-on-outside="false"
          :close-on-esc="false"
          :panel-style="submenuStyle[item.id]"
          z-index="var(--ui-z-toast)"
          role="menu"
          data-context-menu-surface="true"
          @mouseenter="clearCloseTimer"
          @mouseleave="scheduleClose(item.id)"
        >
          <div class="context-menu-branch__panel">
            <ContextMenuBranch :items="item.children || []" nested :close-menu="closeMenu" />
          </div>
        </UiPopupSurface>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.context-menu-branch {
  display: flex;
  flex-direction: column;
  gap: 0;

  &--nested {
    min-width: 180px;
  }
}

.context-menu-branch__item {
  position: relative;
}

.context-menu-branch__panel {
  min-width: clamp(160px, 20vw, 220px);
  max-width: clamp(200px, 28vw, 320px);
  max-height: min(60vh, 360px);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 90%, transparent);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-menu-bg);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  box-shadow: var(--ui-menu-shadow);

  &::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
}

.context-menu-branch__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 12px;
  font-size: 12px;
  color: var(--ui-text-muted);

  &--left {
    transform: translateY(-0.5px);
  }
}
</style>
