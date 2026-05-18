<script lang="ts" setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch, shallowRef } from 'vue';
import { useGridCollision } from '../../composables/useGridCollision';
import { useGridDrag } from '../../composables/useGridDrag';
import { useGridLayout } from '../../composables/useGridLayout';
import { useGridLayoutMemory } from '../../composables/useGridLayoutMemory';
import { useGridReflow } from '../../composables/useGridReflow';
import { useContextMenu, type ContextMenuItem } from '../../composables/useContextMenu';
import type { CategoryItem, GridConfig, GridItem, WidgetCreatePayload, WidgetEditPayload } from '../../types/grid';
import UiScrollbar from '../ui/UiScrollbar.vue';
import GridItemComponent from './GridItem.vue';
import WidgetSizePicker from './WidgetSizePicker.vue';
import AddIcon from '../svgs/icons/AddIcon.vue';
import EditIcon from '../svgs/icons/EditIcon.vue';
import { router } from '../../routes/router';
import { useBarStore } from '../../stores/bar_store';
import { useAppConfigStore } from '../../stores/app_config_store';
import { buildBackgroundTextVars } from '../../utils/backgroundTextColor';
import { resolveThemeBackground } from '@/contracts/background';

const props = defineProps<{
  category: CategoryItem;
  config: GridConfig;
}>();

const emit = defineEmits<{
  layoutChange: [categoryId: string, gridItems: GridItem[]];
  itemDeleted: [categoryId: string, itemId: string];
  itemCreated: [categoryId: string, item: GridItem];
  changeBackground: [];
}>();

const compAreaViewport = ref<HTMLElement | null>(null);
const compAreaScrollbar = ref<{
  viewportRef: HTMLElement | null;
  refresh: () => void;
  scrollTo: (options: ScrollToOptions) => void;
} | null>(null);
const compArea = ref<HTMLElement | null>(null);
const shouldEmitLayoutChangeAfterReflow = ref(false);
const layoutReady = ref(false);
const gridItems = computed(() => props.category.gridItems);
const visibleGridItems = computed(() => gridItems.value.filter(item => !item.hidden));
const isAreaPanning = ref(false);
const appConfigStore = useAppConfigStore();
const activeCategoryBackground = computed(() => resolveThemeBackground({
  type: props.category.backgroundVideo ? 'video' : props.category.backgroundImage ? 'image' : 'color',
  color: props.category.backgroundColor,
  image: props.category.backgroundImage,
  video: props.category.backgroundVideo,
  backgroundStyle: props.category.backgroundStyle,
}, appConfigStore.config.appearance.theme));

type ItemStyle = Record<string, string | number>;

type AreaPanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
};

const AREA_PAN_THRESHOLD = 4;
let areaPanState: AreaPanState | null = null;
let suppressNextAreaContextMenu = false;

// 布局记忆
const { saveSnapshot, restoreSnapshot, clearCategory: clearLayoutMemory } = useGridLayoutMemory();
let lastColNum = 0;

// 网格布局
const layoutHelpers = useGridLayout(compAreaViewport, compArea, props.config);
const {
  unitSize,
  rowNum,
  colNum,
  horizontalOffset,
  cellSize,
  compAreaStyle,
  clampCoordinate,
  toGridPosition,
  syncDraggingPosition,
  updateUnitSize,
  expandRowsForContent,
  isWithinBounds,
} = layoutHelpers;

// 碰撞检测
const { hasCollision, findAvailablePosition, canPlaceAt, occupySlot } = useGridCollision(
  gridItems,
  colNum,
  rowNum,
  isWithinBounds
);

// 拖拽功能
const {
  draggingItem,
  draggingPosition,
  handleItemPointerDown,
  handleItemPointerMove,
  handleItemPointerUp,
  handleItemPointerCancel,
  handleItemPointerLeave,
  cleanup: cleanupDrag,
} = useGridDrag(
  compArea,
  {
    GRID_PADDING: props.config.GRID_PADDING,
    HOLD_DELAY_MS: props.config.HOLD_DELAY_MS,
  },
  {
    cellSize,
    horizontalOffset,
    colNum,
    rowNum,
    clampCoordinate,
    toGridPosition,
    syncDraggingPosition,
    findAvailablePosition,
  },
  () => {
    // 拖拽结束后保存当前列数的快照
    saveSnapshot(props.category.id, colNum.value, gridItems.value);
    shouldEmitLayoutChangeAfterReflow.value = true;
    scheduleReflow({ forceNotify: true });
  }
);

// 布局重排
const { scheduleReflow, cancelReflow } = useGridReflow(
  gridItems,
  colNum,
  rowNum,
  draggingItem,
  canPlaceAt,
  occupySlot,
  isWithinBounds,
  () => {
    if (shouldEmitLayoutChangeAfterReflow.value) {
      shouldEmitLayoutChangeAfterReflow.value = false;
      emit('layoutChange', props.category.id, [...gridItems.value]);
    }
  },
  expandRowsForContent
);

function buildBaseItemStyle(item: GridItem): ItemStyle {
  const width =
    item.colSpan * unitSize.value + Math.max(0, item.colSpan - 1) * props.config.GRID_GAP;
  const height =
    item.rowSpan * unitSize.value + Math.max(0, item.rowSpan - 1) * props.config.GRID_GAP;

  return {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate3d(${(item.col - 1) * cellSize.value + horizontalOffset.value}px, ${(item.row - 1) * cellSize.value + props.config.GRID_PADDING}px, 0)`,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    zIndex: 1,
  };
}

const baseItemStyleMap = shallowRef<Record<string, ItemStyle>>({});

const itemLayoutSignature = computed(() => visibleGridItems.value
  .map(item => `${item.id}:${item.col}:${item.row}:${item.colSpan}:${item.rowSpan}`)
  .join('|'));

function syncBaseItemStyles() {
  const nextStyles: Record<string, ItemStyle> = {};

  for (const item of visibleGridItems.value) {
    nextStyles[item.id] = buildBaseItemStyle(item);
  }

  baseItemStyleMap.value = nextStyles;
}

watch(
  [itemLayoutSignature, unitSize, cellSize, horizontalOffset],
  syncBaseItemStyles,
  { immediate: true }
);

const activeDraggingStyle = computed<ItemStyle | null>(() => {
  const item = draggingItem.value;
  if (!item) {
    return null;
  }

  return {
    ...(baseItemStyleMap.value[item.id] ?? buildBaseItemStyle(item)),
    transform: `translate3d(${draggingPosition.value.x + horizontalOffset.value}px, ${draggingPosition.value.y + props.config.GRID_PADDING}px, 0)`,
    transition: 'none',
    zIndex: 1000,
    willChange: 'transform',
  };
});

function getItemStyle(item: GridItem) {
  if (draggingItem.value?.id === item.id && activeDraggingStyle.value) {
    return activeDraggingStyle.value;
  }

  return baseItemStyleMap.value[item.id] ?? buildBaseItemStyle(item);
}

function handleResize() {
  updateUnitSize(() => {
    const newColNum = colNum.value;
    if (newColNum !== lastColNum) {
      // 保存旧列数的布局快照
      saveSnapshot(props.category.id, lastColNum, gridItems.value);
      const prevColNum = lastColNum;
      lastColNum = newColNum;

      // 尝试恢复新列数的布局
      const restored = restoreSnapshot(props.category.id, newColNum, gridItems.value);
      if (restored) {
        // 恢复成功，只需扩展容器，不 reflow
        expandRowsForContent(gridItems.value);
        compAreaScrollbar.value?.refresh();
        return;
      }
    }
    shouldEmitLayoutChangeAfterReflow.value = false;
    scheduleReflow();
  });
  compAreaScrollbar.value?.refresh();
}

function isBlankCompAreaTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && !target.closest('.grid-item');
}

function stopAreaPan() {
  areaPanState = null;
  isAreaPanning.value = false;
  window.removeEventListener('pointermove', handleAreaPanPointerMove);
  window.removeEventListener('pointerup', handleAreaPanPointerEnd);
  window.removeEventListener('pointercancel', handleAreaPanPointerEnd);
}

function handleAreaPointerDown(event: PointerEvent) {
  if (event.button !== 2 || !isBlankCompAreaTarget(event.target)) {
    return;
  }

  const viewport = compAreaScrollbar.value?.viewportRef;
  if (!viewport) {
    return;
  }

  const canPanX = viewport.scrollWidth - viewport.clientWidth > 1;
  const canPanY = viewport.scrollHeight - viewport.clientHeight > 1;
  if (!canPanX && !canPanY) {
    return;
  }

  areaPanState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startScrollLeft: viewport.scrollLeft,
    startScrollTop: viewport.scrollTop,
    moved: false,
  };

  window.addEventListener('pointermove', handleAreaPanPointerMove);
  window.addEventListener('pointerup', handleAreaPanPointerEnd);
  window.addEventListener('pointercancel', handleAreaPanPointerEnd);
}

function handleAreaPanPointerMove(event: PointerEvent) {
  if (!areaPanState || event.pointerId !== areaPanState.pointerId) {
    return;
  }

  const viewport = compAreaScrollbar.value?.viewportRef;
  if (!viewport) {
    stopAreaPan();
    return;
  }

  const deltaX = event.clientX - areaPanState.startClientX;
  const deltaY = event.clientY - areaPanState.startClientY;
  if (!areaPanState.moved && Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AREA_PAN_THRESHOLD) {
    return;
  }

  areaPanState.moved = true;
  isAreaPanning.value = true;
  suppressNextAreaContextMenu = true;
  viewport.scrollTo({
    left: areaPanState.startScrollLeft - deltaX,
    top: areaPanState.startScrollTop - deltaY,
    behavior: 'auto',
  });
  compAreaScrollbar.value?.refresh();
  event.preventDefault();
}

function handleAreaPanPointerEnd(event: PointerEvent) {
  if (!areaPanState || event.pointerId !== areaPanState.pointerId) {
    return;
  }

  if (areaPanState.moved) {
    suppressNextAreaContextMenu = true;
    window.setTimeout(() => {
      suppressNextAreaContextMenu = false;
    }, 300);
  }

  stopAreaPan();
}

function handleAreaPanContextMenu(event: MouseEvent) {
  if (!suppressNextAreaContextMenu) {
    return;
  }

  const viewport = compAreaScrollbar.value?.viewportRef;
  if (!viewport || !(event.target instanceof Node) || !viewport.contains(event.target)) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  suppressNextAreaContextMenu = false;
}

// 打开小组件
const barStore = useBarStore();

async function handleItemOpen(item: GridItem) {
  const action = item.action;
  if (!action || action.type === 'none') return;

  try {
    if (action.type === 'external_app' && action.target) {
      await window.shellApi.openPath(action.target);
    } else if (action.type === 'internal_route' && action.target) {
      // 添加到底栏（可关闭）并导航
      barStore.openTab(action.target, item.label || '页面', item.icon);
      await router.push(action.target);
    } else if (action.type === 'plugin_page' && action.pluginId && action.pageId) {
      // 跳转到插件页面路由
      const routePath = `/plugin/${action.pluginId}/${action.pageId}`;
      barStore.openTab(routePath, item.label || '插件页面', item.icon);
      await router.push(routePath);
    } else if (action.type === 'plugin_command' && action.pluginId && action.commandId) {
      // 执行插件命令（预留）
      console.log('执行插件命令:', action.pluginId, action.commandId);
    } else if (action.type === 'open_webpage' && action.url) {
      if (action.openMode === 'new_window') {
        // 新窗口打开 → 独立 Electron 窗口
        await window.webviewApi.openNewWindow(action.url);
      } else {
        // 主窗口内打开 → webview 页面
        const encodedUrl = encodeURIComponent(action.url);
        const routePath = `/webview?url=${encodedUrl}`;
        barStore.openTab(routePath, item.label || '网页', item.icon);
        await router.push(routePath);
      }
    }
  } catch (error) {
    console.error('打开小组件失败:', error);
  }
}

// 删除小组件
function handleItemDelete(item: GridItem) {
  const index = gridItems.value.findIndex(i => i.id === item.id);
  if (index !== -1) {
    gridItems.value.splice(index, 1);
    clearLayoutMemory(props.category.id); // widget 变化后旧快照失效
    shouldEmitLayoutChangeAfterReflow.value = true;
    scheduleReflow();
    emit('itemDeleted', props.category.id, item.id);
  }
}

// 更新小组件（编辑组件）
function handleItemUpdateWidget(item: GridItem, payload: WidgetEditPayload) {
  const index = gridItems.value.findIndex(i => i.id === item.id);
  if (index !== -1) {
    const widget = gridItems.value[index];
    const sizeChanged = widget.colSpan !== payload.colSpan || widget.rowSpan !== payload.rowSpan;

    // 基础信息
    widget.label = payload.label;
    widget.icon = payload.icon;
    widget.action = payload.action;

    // 尺寸
    widget.colSpan = payload.colSpan;
    widget.rowSpan = payload.rowSpan;
    widget.sizePreset = payload.sizePreset;
    widget.widgetConfig = payload.widgetConfig;

    // 背景
    widget.color = payload.color;
    widget.backgroundImage = payload.backgroundImage || '';
    widget.backgroundVideo = payload.backgroundVideo || '';
    widget.backgroundStyle = payload.backgroundStyle;

    if (sizeChanged) {
      clearLayoutMemory(props.category.id); // 尺寸变化后旧快照失效
      shouldEmitLayoutChangeAfterReflow.value = true;
      scheduleReflow({ forceNotify: true });
    } else {
      emit('layoutChange', props.category.id, [...gridItems.value]);
    }
  }
}

// ─── 空白区域右键菜单 ───
const showSizePicker = ref(false);
const contextMenu = useContextMenu();

function handleAreaContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement;
  // 如果点击目标在 GridItem 内，不处理（交给 GridItem 自身的菜单）
  if (target.closest('.grid-item')) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (suppressNextAreaContextMenu) {
    suppressNextAreaContextMenu = false;
    return;
  }

  const menuItems: ContextMenuItem[] = [
    {
      id: 'area-create',
      label: '新建组件',
      icon: AddIcon,
      action: () => { showSizePicker.value = true; },
    },
    {
      id: 'area-bg',
      label: '区域个性化配置',
      icon: EditIcon,
      divided: true,
      action: () => { emit('changeBackground'); },
    },
  ];
  contextMenu.open(event.clientX, event.clientY, menuItems);
}

function handleSizePickerClose() {
  showSizePicker.value = false;
}

// 预设渐变色池
function handleCreateWidget(payload: WidgetCreatePayload) {
  // 构建临时 item 用于碰撞检测
  const tempItem: GridItem = {
    id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: payload.label,
    icon: payload.icon,
    action: payload.action,
    sourceType: payload.sourceType,
    widgetType: payload.widgetType,
    sizePreset: payload.sizePreset,
    widgetConfig: payload.widgetConfig,
    col: 1,
    row: 1,
    colSpan: payload.colSpan,
    rowSpan: payload.rowSpan,
    color: payload.color,
    backgroundImage: payload.backgroundImage,
    backgroundVideo: payload.backgroundVideo,
    backgroundStyle: payload.backgroundStyle,
    isDragging: false,
    preferredCol: 1,
    preferredRow: 1,
    priority: gridItems.value.length + 1,
    hidden: false,
  };

  // 利用碰撞检测系统寻找可用位置
  const pos = findAvailablePosition(tempItem, 1, 1, { col: 1, row: 1 });
  tempItem.col = pos.col;
  tempItem.row = pos.row;
  tempItem.preferredCol = pos.col;
  tempItem.preferredRow = pos.row;

  // 加入到网格
  gridItems.value.push(tempItem);
  clearLayoutMemory(props.category.id); // widget 变化后旧快照失效

  // 触发重排和持久化
  shouldEmitLayoutChangeAfterReflow.value = true;
  scheduleReflow({ forceNotify: true });

  // 通知父组件创建新 widget
  emit('itemCreated', props.category.id, tempItem);
}

// 监听 category 变化，重新计算布局
watch(() => props.category.id, () => {
  layoutReady.value = false;
  compAreaScrollbar.value?.scrollTo({
    left: 0,
    top: 0,
    behavior: 'auto',
  });

  updateUnitSize(() => {
    lastColNum = colNum.value;
    shouldEmitLayoutChangeAfterReflow.value = false;
    scheduleReflow();
    void nextTick(() => { layoutReady.value = true; });
  });
  void nextTick(() => {
    compAreaViewport.value = compAreaScrollbar.value?.viewportRef ?? null;
    compAreaScrollbar.value?.refresh();
  });
});

onMounted(() => {
  enableCategoryVideoAutoplay();
  compAreaViewport.value = compAreaScrollbar.value?.viewportRef ?? null;
  updateUnitSize(() => {
    lastColNum = colNum.value;
    shouldEmitLayoutChangeAfterReflow.value = false;
    scheduleReflow();
    void nextTick(() => { layoutReady.value = true; });
  });
  window.addEventListener('resize', handleResize);
  window.addEventListener('contextmenu', handleAreaPanContextMenu, true);
  void nextTick(() => {
    compAreaViewport.value = compAreaScrollbar.value?.viewportRef ?? null;
    compAreaScrollbar.value?.refresh();
  });
});

onBeforeUnmount(() => {
  disableCategoryVideoAutoplay();
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('contextmenu', handleAreaPanContextMenu, true);
  cancelReflow();
  cleanupDrag();
  stopAreaPan();
});
// 类别背景 —— 独立追踪，避免拖拽时 gridItems 变化导致重新 diff 巨大 base64
const catBgColor = shallowRef('');
const catBgImage = shallowRef('');
const catBgVideo = shallowRef('');
const catBgSize = shallowRef('cover');
const catBgPosition = shallowRef('center');
const catBgRepeat = shallowRef('no-repeat');
const catBgOpacity = shallowRef(1);
const catBgTextColor = shallowRef('');
const categoryBgVideoRef = ref<HTMLVideoElement | null>(null);
const shouldAutoPlayCategoryVideo = ref(false);
let categoryVideoResumeTimer: ReturnType<typeof setTimeout> | null = null;
let categoryVideoWatchdogTimer: ReturnType<typeof setInterval> | null = null;

function syncCategoryBackground() {
  const background = activeCategoryBackground.value;
  catBgColor.value = background.color || '';
  catBgImage.value = background.image || '';
  catBgVideo.value = background.video || '';
  catBgSize.value = background.backgroundStyle?.backgroundSize || 'cover';
  catBgPosition.value = background.backgroundStyle?.backgroundPosition || 'center';
  catBgRepeat.value = background.backgroundStyle?.backgroundRepeat || 'no-repeat';
  catBgOpacity.value = background.backgroundStyle?.opacity != null && Number.isFinite(background.backgroundStyle.opacity)
    ? background.backgroundStyle.opacity
    : 1;
  catBgTextColor.value = background.backgroundStyle?.textColor || '';
}

syncCategoryBackground();

watch(() => props.category.id, syncCategoryBackground);
watch(() => props.category.backgroundColor, syncCategoryBackground);
watch(() => props.category.backgroundImage, syncCategoryBackground);
watch(() => props.category.backgroundVideo, syncCategoryBackground);
watch(() => props.category.backgroundStyle, syncCategoryBackground, { deep: true });
watch(() => appConfigStore.config.appearance.theme, syncCategoryBackground);

const categoryBgStyle = computed(() => {
  const style: Record<string, string> = {};

  if (catBgColor.value) {
    style.background = catBgColor.value;
  }

  if (catBgImage.value) {
    style.backgroundImage = `url(${catBgImage.value})`;
    style.backgroundSize = catBgSize.value;
    style.backgroundPosition = catBgPosition.value;
    style.backgroundRepeat = catBgRepeat.value;
  }

  if (catBgOpacity.value < 1) {
    style.opacity = String(catBgOpacity.value);
  }

  return style;
});

const categoryTextStyle = computed(() => buildBackgroundTextVars(catBgTextColor.value, {
  aliases: {
    primary: ['--ui-text-primary'],
    secondary: ['--ui-text-secondary'],
    muted: ['--ui-text-muted'],
    subtle: ['--ui-text-subtle'],
  },
}));

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

const categoryBgVideoStyle = computed(() => ({
  objectFit: toObjectFit(catBgSize.value),
  objectPosition: catBgPosition.value,
}));

const hasCategoryBackground = computed(() => {
  return Boolean(catBgColor.value || catBgImage.value || catBgVideo.value);
});

const categoryBackgroundMemoKey = computed(() => [
  catBgColor.value,
  catBgImage.value,
  catBgVideo.value,
  catBgSize.value,
  catBgPosition.value,
  catBgRepeat.value,
  String(catBgOpacity.value),
  catBgTextColor.value,
].join('::'));

function clearCategoryVideoResumeTimer() {
  if (categoryVideoResumeTimer) {
    clearTimeout(categoryVideoResumeTimer);
    categoryVideoResumeTimer = null;
  }
}

function ensureCategoryVideoPlayback() {
  const video = categoryBgVideoRef.value;
  if (!video || !shouldAutoPlayCategoryVideo.value || !catBgVideo.value) return;

  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;

  if (video.paused || video.ended) {
    void video.play().catch(() => {
      scheduleCategoryVideoPlayback(500);
    });
  }
}

function scheduleCategoryVideoPlayback(delay = 0) {
  clearCategoryVideoResumeTimer();
  categoryVideoResumeTimer = setTimeout(() => {
    categoryVideoResumeTimer = null;
    ensureCategoryVideoPlayback();
  }, delay);
}

function startCategoryVideoWatchdog() {
  if (categoryVideoWatchdogTimer) return;

  categoryVideoWatchdogTimer = setInterval(() => {
    const video = categoryBgVideoRef.value;
    if (!video || !catBgVideo.value || !shouldAutoPlayCategoryVideo.value) return;

    if (video.paused || video.ended || video.readyState < video.HAVE_CURRENT_DATA) {
      ensureCategoryVideoPlayback();
    }
  }, 1000);
}

function stopCategoryVideoWatchdog() {
  if (categoryVideoWatchdogTimer) {
    clearInterval(categoryVideoWatchdogTimer);
    categoryVideoWatchdogTimer = null;
  }
  clearCategoryVideoResumeTimer();
}

function enableCategoryVideoAutoplay() {
  shouldAutoPlayCategoryVideo.value = true;
  startCategoryVideoWatchdog();
  void nextTick(() => scheduleCategoryVideoPlayback());
}

function disableCategoryVideoAutoplay() {
  shouldAutoPlayCategoryVideo.value = false;
  stopCategoryVideoWatchdog();
}

watch(catBgVideo, () => {
  if (shouldAutoPlayCategoryVideo.value) {
    void nextTick(() => scheduleCategoryVideoPlayback());
  }
});

onActivated(enableCategoryVideoAutoplay);
onDeactivated(disableCategoryVideoAutoplay);
</script>

<template>
  <UiScrollbar ref="compAreaScrollbar" class="comp-area-viewport" :style="categoryTextStyle" :x="true" :y="true" :show-on-hover="true"
    :size="6"
    thumb-color="var(--workspace-scrollbar-thumb-color)"
    thumb-hover-color="var(--workspace-scrollbar-thumb-hover-color)"
    track-color="var(--workspace-scrollbar-track-color)"
  >
    <!-- 类别背景层 -->
    <div v-if="hasCategoryBackground" v-memo="[categoryBackgroundMemoKey]" class="comp-area-bg" :style="categoryBgStyle">
      <video
        v-if="catBgVideo"
        ref="categoryBgVideoRef"
        class="comp-area-bg__video"
        :src="catBgVideo"
        :style="categoryBgVideoStyle"
        autoplay
        loop
        muted
        playsinline
        @loadedmetadata="scheduleCategoryVideoPlayback()"
        @canplay="scheduleCategoryVideoPlayback()"
        @pause="scheduleCategoryVideoPlayback(250)"
        @ended="scheduleCategoryVideoPlayback()"
        @stalled="scheduleCategoryVideoPlayback(500)"
        @error="scheduleCategoryVideoPlayback(1000)"
      />
    </div>

    <div class="comp-area" :class="{ 'comp-area--panning': isAreaPanning }" ref="compArea" :style="compAreaStyle"
      @pointerdown="handleAreaPointerDown" @contextmenu="handleAreaContextMenu">
      <template v-if="layoutReady">
        <GridItemComponent v-for="item in visibleGridItems" :key="item.id" :item="item"
          :isDragging="draggingItem?.id === item.id" :style="getItemStyle(item)"
          @pointerdown="handleItemPointerDown(item, $event)" @pointermove="handleItemPointerMove($event)"
          @pointerup="handleItemPointerUp($event)" @pointercancel="handleItemPointerCancel($event)"
          @pointerleave="handleItemPointerLeave($event)" @open="handleItemOpen" @delete="handleItemDelete"
          @updateWidget="handleItemUpdateWidget" />
      </template>
    </div>

    <!-- 尺寸选择弹框 -->
    <WidgetSizePicker :visible="showSizePicker" @close="handleSizePickerClose" @confirm="handleCreateWidget" />
  </UiScrollbar>
</template>

<style lang="scss" scoped>
.comp-area-viewport {
  position: relative;
  width: 100%;
  height: 100%;
}

.comp-area {
  position: relative;
  min-width: 100%;
  min-height: 100%;
  z-index: 1;
}

.comp-area--panning {
  cursor: grabbing;
  user-select: none;
}

.comp-area-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  contain: paint;
  transform: translateZ(0);
  backface-visibility: hidden;
  image-rendering: auto;
  -webkit-image-rendering: auto;

  &__video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}
</style>
