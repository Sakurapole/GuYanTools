<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { GridItem, WidgetEditPayload } from '../../types/grid';
import { useContextMenu, type ContextMenuItem } from '../../composables/useContextMenu';
import WidgetEditor from './WidgetEditor.vue';
import HomeWidgetRenderer from '../../widgets/home/HomeWidgetRenderer.vue';
import UiScrollbar from '../ui/UiScrollbar.vue';
import OpenIcon from '../svgs/icons/OpenIcon.vue';
import EditIcon from '../svgs/icons/EditIcon.vue';
import DeleteIcon from '../svgs/icons/DeleteIcon.vue';
import { getHomeWidgetDefinition } from '../../widgets/home/registry';

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
  updateWidget: [item: GridItem, payload: WidgetEditPayload];
}>();

const showWidgetEditor = ref(false);
const contextMenu = useContextMenu();

function parseStyleSize(value: string | number | undefined, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

const itemClass = computed(() => ({
  'grid-item': true,
  'is-dragging': props.isDragging,
  'grid-item--shortcut': props.item.widgetType === 'shortcut',
  'grid-item--builtin': props.item.sourceType === 'builtin' && props.item.widgetType !== 'shortcut',
  'grid-item--featured': props.item.colSpan >= 2 || props.item.rowSpan >= 2,
  'grid-item--hero': props.item.colSpan >= 4 || props.item.rowSpan >= 3,
  'grid-item--with-image': Boolean(props.item.backgroundImage) || Boolean(props.item.backgroundVideo),
}));

const itemWidth = computed(() => parseStyleSize(props.style.width, 72));
const itemHeight = computed(() => parseStyleSize(props.style.height, 72));
const hasOpenAction = computed(() => {
  const definition = getHomeWidgetDefinition(props.item.widgetType);
  const action = props.item.action;

  if (!definition.allowAction || !action || action.type === 'none') {
    return false;
  }

  if (action.type === 'external_app' || action.type === 'internal_route') {
    return Boolean(action.target);
  }

  if (action.type === 'open_webpage') {
    return Boolean(action.url);
  }

  if (action.type === 'plugin_page') {
    return Boolean(action.pluginId && action.pageId);
  }

  if (action.type === 'plugin_command') {
    return Boolean(action.pluginId && action.commandId);
  }

  return false;
});

const backgroundSize = computed(() => props.item.backgroundStyle?.backgroundSize || 'cover');
const backgroundPosition = computed(() => props.item.backgroundStyle?.backgroundPosition || 'center');
const backgroundRepeat = computed(() => props.item.backgroundStyle?.backgroundRepeat || 'no-repeat');
const backgroundOpacity = computed(() => {
  const val = props.item.backgroundStyle?.opacity;
  return val != null && Number.isFinite(val) ? val : 1;
});

function toObjectFit(backgroundSizeValue: string): 'contain' | 'cover' | 'fill' | 'none' {
  switch (backgroundSizeValue) {
    case 'contain':
      return 'contain';
    case '100% 100%':
      return 'fill';
    case 'auto':
      return 'none';
    default:
      return 'cover';
  }
}

const useImgTag = computed(() => {
  return Boolean(props.item.backgroundImage)
    && !props.item.backgroundVideo
    && backgroundRepeat.value === 'no-repeat';
});

const backgroundLayerStyle = computed(() => {
  const style: Record<string, string> = {
    background: props.item.color || 'transparent',
  };

  if (props.item.backgroundImage && !useImgTag.value) {
    style.backgroundImage = `url(${props.item.backgroundImage})`;
    style.backgroundSize = backgroundSize.value;
    style.backgroundPosition = backgroundPosition.value;
    style.backgroundRepeat = backgroundRepeat.value;
  }

  if (backgroundOpacity.value < 1) {
    style.opacity = String(backgroundOpacity.value);
  }

  return style;
});

const backgroundImageStyle = computed(() => ({
  objectFit: toObjectFit(backgroundSize.value),
  objectPosition: backgroundPosition.value,
}));

const backgroundMemoKey = computed(() => [
  props.item.color || '',
  props.item.backgroundImage || '',
  props.item.backgroundVideo || '',
  backgroundSize.value,
  backgroundPosition.value,
  backgroundRepeat.value,
  String(backgroundOpacity.value),
].join('::'));

function handleContextMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  const menuItems: ContextMenuItem[] = [];

  if (hasOpenAction.value) {
    menuItems.push({
      id: `open-${props.item.id}`,
      label: '打开',
      icon: OpenIcon,
      action: () => { emit('open', props.item); },
    });
  }

  menuItems.push(
    {
      id: `edit-${props.item.id}`,
      label: '编辑组件',
      icon: EditIcon,
      divided: hasOpenAction.value,
      action: () => { showWidgetEditor.value = true; },
    },
    {
      id: `delete-${props.item.id}`,
      label: '删除',
      icon: DeleteIcon,
      danger: true,
      divided: true,
      action: () => { emit('delete', props.item); },
    },
  );

  contextMenu.open(event.clientX, event.clientY, menuItems);
}

function handleWidgetEditorClose() {
  showWidgetEditor.value = false;
}

function handleWidgetEditorConfirm(payload: WidgetEditPayload) {
  emit('updateWidget', props.item, payload);
}
</script>

<template>
  <div :class="itemClass" :style="props.style" @pointerdown="emit('pointerdown', $event)"
    @pointermove="emit('pointermove', $event)" @pointerup="emit('pointerup', $event)"
    @pointercancel="emit('pointercancel', $event)" @pointerleave="emit('pointerleave', $event)"
    @contextmenu="handleContextMenu" @dblclick="emit('open', props.item)">
    <div class="grid-item__background" v-memo="[backgroundMemoKey]" :style="backgroundLayerStyle">
      <img v-if="useImgTag" class="grid-item__background-image" :src="props.item.backgroundImage" alt=""
        :style="backgroundImageStyle" decoding="async" draggable="false" />
      <video v-if="props.item.backgroundVideo" class="grid-item__background-video" :src="props.item.backgroundVideo" autoplay loop
        muted playsinline />
    </div>

    <div class="grid-item__content">
      <UiScrollbar v-if="props.item.sourceType === 'builtin' && props.item.widgetType !== 'shortcut'"
        class="grid-item__scrollbar" :x="true" :y="true" :show-on-hover="true" :size="5"
        thumb-color="rgba(255, 255, 255, 0.36)" thumb-hover-color="rgba(255, 255, 255, 0.62)"
        track-color="rgba(255, 255, 255, 0.12)">
        <HomeWidgetRenderer :item="props.item" :interactive="!props.isDragging" />
      </UiScrollbar>
      <HomeWidgetRenderer v-else :item="props.item" :interactive="!props.isDragging" />
    </div>

    <WidgetEditor :visible="showWidgetEditor" :item="props.item" :previewWidth="itemWidth" :previewHeight="itemHeight"
      @close="handleWidgetEditorClose" @confirm="handleWidgetEditorConfirm" />
  </div>
</template>

<style lang="scss" scoped>
.grid-item {
  position: absolute;
  border-radius: var(--ui-radius-sm);
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  border: var(--ui-border-width-thin) solid var(--widget-border-color);
  box-shadow: var(--ui-shadow-md);
  isolation: isolate;
  contain: layout paint;
  backface-visibility: hidden;
  transition:
    transform 0.22s ease,
    border-color 0.22s ease,
    box-shadow 0.22s ease,
    cursor 0s;

  &:hover:not(.is-dragging) {
    border-color: var(--widget-border-hover-color);
    box-shadow: var(--ui-shadow-lg);
  }

  &.grid-item--shortcut:hover:not(.is-dragging) {
    transform: translateY(-3px);
    box-shadow: var(--ui-shadow-xl);
  }

  &.is-dragging {
    cursor: grabbing;
    border-color: var(--widget-border-hover-color);
    box-shadow: var(--ui-shadow-xl);
  }
}

.grid-item__content {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.grid-item__scrollbar {
  width: 100%;
  height: 100%;
}

.grid-item__background {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  contain: paint;
  transform: translateZ(0);
  backface-visibility: hidden;
}

.grid-item__background-image {
  width: 100%;
  height: 100%;
  display: block;
  transform: translateZ(0);
  backface-visibility: hidden;
}

.grid-item__background-video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transform: translateZ(0);
  backface-visibility: hidden;
}
</style>
