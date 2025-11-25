<script lang="ts" setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import type { GridItem } from '../../types/grid';
import BackgroundPicker from './BackgroundPicker.vue';
import ContextMenu from './ContextMenu.vue';

const props = defineProps<{
  item: GridItem;
  isDragging: boolean;
  style: Record<string, string | number>;
}>();

const emit = defineEmits<{
  pointerdown: [event: PointerEvent];
  pointermove: [event: PointerEvent];
  pointerup: [event: PointerEvent];
  pointercancel: [event: PointerEvent];
  pointerleave: [event: PointerEvent];
  open: [item: GridItem];
  delete: [item: GridItem];
  updateBackground: [item: GridItem, background: { color?: string; image?: string }];
}>();

const showContextMenu = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const showBackgroundPicker = ref(false);

// 全局事件：关闭其他菜单
const CLOSE_ALL_MENUS_EVENT = 'close-all-context-menus';

const itemClass = computed(() => ({
  'grid-item': true,
  'is-dragging': props.isDragging,
}));

// 动态加载图标组件
const iconComponents: Record<string, any> = {
  'tool': defineAsyncComponent(() => import('../svgs/icons/ToolIcon.vue')),
  'video': defineAsyncComponent(() => import('../svgs/icons/VideoIcon.vue')),
  'audio': defineAsyncComponent(() => import('../svgs/icons/AudioIcon.vue')),
  'edit': defineAsyncComponent(() => import('../svgs/icons/EditIcon.vue')),
  'convert': defineAsyncComponent(() => import('../svgs/icons/ConvertIcon.vue')),
  'api': defineAsyncComponent(() => import('../svgs/icons/ApiIcon.vue')),
  'settings': defineAsyncComponent(() => import('../svgs/icons/SettingsIcon.vue')),
};

const currentIcon = computed(() => {
  if (props.item.icon && iconComponents[props.item.icon]) {
    return iconComponents[props.item.icon];
  }
  return null;
});

// 计算背景样式
const itemBackgroundStyle = computed(() => {
  if (props.item.backgroundImage) {
    return {
      backgroundImage: `url(${props.item.backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {};
});

// 右键菜单处理
const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();

  // 先关闭所有其他菜单
  document.dispatchEvent(new CustomEvent(CLOSE_ALL_MENUS_EVENT, { detail: { excludeId: props.item.id } }));

  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY,
  };
  showContextMenu.value = true;
};

const handleContextMenuClose = () => {
  showContextMenu.value = false;
};

// 监听全局关闭菜单事件
const handleCloseAllMenus = (event: Event) => {
  const customEvent = event as CustomEvent;
  // 如果不是排除自己的事件，则关闭菜单
  if (customEvent.detail?.excludeId !== props.item.id) {
    showContextMenu.value = false;
  }
};

const handleOpen = () => {
  emit('open', props.item);
};

const handleDelete = () => {
  emit('delete', props.item);
};

const handleChangeBackground = () => {
  showBackgroundPicker.value = true;
};

const handleBackgroundPickerClose = () => {
  showBackgroundPicker.value = false;
};

const handleBackgroundConfirm = (background: { color?: string; image?: string }) => {
  emit('updateBackground', props.item, background);
};

// 生命周期 - 使用 passive 选项优化性能
onMounted(() => {
  // 使用 passive: true 提升滚动性能
  document.addEventListener(CLOSE_ALL_MENUS_EVENT, handleCloseAllMenus as EventListener, { passive: true } as AddEventListenerOptions);
});

onBeforeUnmount(() => {
  // 必须使用相同的选项才能正确移除监听器
  document.removeEventListener(CLOSE_ALL_MENUS_EVENT, handleCloseAllMenus as EventListener, { passive: true } as EventListenerOptions);
});
</script>

<template>
  <div :class="itemClass" :style="{ ...style, ...itemBackgroundStyle }" @pointerdown="emit('pointerdown', $event)"
    @pointermove="emit('pointermove', $event)" @pointerup="emit('pointerup', $event)"
    @pointercancel="emit('pointercancel', $event)" @pointerleave="emit('pointerleave', $event)"
    @contextmenu="handleContextMenu">
    <div class="grid-item__content">
      <div class="grid-item__icon">
        <component v-if="currentIcon" :is="currentIcon" :width="32" :height="32" color="white" />
        <span v-else class="icon-text">{{ item.label }}</span>
      </div>
      <div class="grid-item__label">{{ item.label }}</div>
    </div>

    <!-- 右键菜单 -->
    <ContextMenu :visible="showContextMenu" :x="contextMenuPosition.x" :y="contextMenuPosition.y"
      @close="handleContextMenuClose" @open="handleOpen" @delete="handleDelete"
      @changeBackground="handleChangeBackground" />

    <!-- 背景选择器 -->
    <BackgroundPicker :visible="showBackgroundPicker" :currentBackground="item.color"
      :currentBackgroundImage="item.backgroundImage" @close="handleBackgroundPickerClose"
      @confirm="handleBackgroundConfirm" />
  </div>
</template>

<style lang="scss" scoped>
.grid-item {
  position: absolute;
  border-radius: 8px;
  cursor: grab;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &.is-dragging {
    cursor: grabbing;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
    opacity: 0.9;
  }

  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    text-align: center;
    padding: 8px;
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;

    .icon-text {
      font-size: 1.5em;
      font-weight: 600;
    }
  }

  &__label {
    font-size: 0.9em;
    font-weight: 500;
    opacity: 0.95;
  }
}
</style>
