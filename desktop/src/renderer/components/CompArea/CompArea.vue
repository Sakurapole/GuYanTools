<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useGridCollision } from '../../composables/useGridCollision';
import { useGridDrag } from '../../composables/useGridDrag';
import { useGridLayout } from '../../composables/useGridLayout';
import { useGridPersistence } from '../../composables/useGridPersistence';
import { useGridReflow } from '../../composables/useGridReflow';
import type { CategoryItem, GridConfig, GridItem } from '../../types/grid';
import GridItemComponent from './GridItem.vue';

const props = defineProps<{
  category: CategoryItem;
  config: GridConfig;
}>();

const emit = defineEmits<{
  layoutChange: [];
}>();

const compArea = ref<HTMLElement | null>(null);
const gridItems = computed(() => props.category.gridItems);
const visibleGridItems = computed(() => gridItems.value.filter(item => !item.hidden));

// 网格布局
const layoutHelpers = useGridLayout(compArea, props.config, ref(null));
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
  isWithinBounds,
} = layoutHelpers;

// 碰撞检测
const { hasCollision, findAvailablePosition, canPlaceAt, occupySlot } = useGridCollision(
  gridItems,
  colNum,
  rowNum,
  isWithinBounds
);

// 布局持久化
const { persistLayout } = useGridPersistence(props.config.STORAGE_KEY);

// 布局重排
const { scheduleReflow, cancelReflow } = useGridReflow(
  gridItems,
  colNum,
  rowNum,
  ref(null), // draggingItem 会在拖拽composable中设置
  canPlaceAt,
  occupySlot,
  isWithinBounds,
  () => {
    persistLayout(props.category.id, gridItems.value);
    emit('layoutChange');
  }
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
    persistLayout(props.category.id, gridItems.value);
    scheduleReflow();
    emit('layoutChange');
  }
);

function getItemStyle(item: GridItem) {
  const width =
    item.colSpan * unitSize.value + Math.max(0, item.colSpan - 1) * props.config.GRID_GAP;
  const height =
    item.rowSpan * unitSize.value + Math.max(0, item.rowSpan - 1) * props.config.GRID_GAP;

  const isActive = draggingItem.value?.id === item.id;
  const translateX = (isActive
    ? draggingPosition.value.x
    : (item.col - 1) * cellSize.value) + horizontalOffset.value;
  const translateY = (isActive
    ? draggingPosition.value.y
    : (item.row - 1) * cellSize.value) + props.config.GRID_PADDING;

  return {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate3d(${translateX}px, ${translateY}px, 0)`,
    willChange: 'transform',
    transition: isActive
      ? 'none'
      : 'transform 0.2s ease, box-shadow 0.2s ease',
    zIndex: isActive ? 1000 : 1,
    background: item.backgroundImage ? 'transparent' : item.color,
  };
}

function handleResize() {
  updateUnitSize(() => {
    scheduleReflow({ compact: true });
  });
}

// 打开小组件
function handleItemOpen(item: GridItem) {
  console.log('打开小组件:', item.label);
  // TODO: 实现打开小组件的逻辑
}

// 删除小组件
function handleItemDelete(item: GridItem) {
  const index = gridItems.value.findIndex(i => i.id === item.id);
  if (index !== -1) {
    gridItems.value.splice(index, 1);
    persistLayout(props.category.id, gridItems.value);
    scheduleReflow({ compact: true });
    emit('layoutChange');
  }
}

// 更新小组件背景
function handleItemUpdateBackground(item: GridItem, background: { color?: string; image?: string }) {
  const index = gridItems.value.findIndex(i => i.id === item.id);
  if (index !== -1) {
    if (background.color) {
      gridItems.value[index].color = background.color;
      gridItems.value[index].backgroundImage = '';
    } else if (background.image) {
      gridItems.value[index].backgroundImage = background.image;
    }
    persistLayout(props.category.id, gridItems.value);
    emit('layoutChange');
  }
}

// 监听 category 变化，重新计算布局
watch(() => props.category.id, () => {
  updateUnitSize(() => {
    scheduleReflow({ compact: true });
  });
});

onMounted(() => {
  updateUnitSize(() => {
    scheduleReflow({ compact: true });
  });
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  cancelReflow();
  cleanupDrag();
});
</script>

<template>
  <div class="comp-area" ref="compArea" :style="{ ...compAreaStyle, overflow: 'auto' }">
    <GridItemComponent v-for="item in visibleGridItems" :key="item.id" :item="item"
      :isDragging="draggingItem?.id === item.id" :style="getItemStyle(item)"
      @pointerdown="handleItemPointerDown(item, $event)" @pointermove="handleItemPointerMove($event)"
      @pointerup="handleItemPointerUp($event)" @pointercancel="handleItemPointerCancel($event)"
      @pointerleave="handleItemPointerLeave($event)" @open="handleItemOpen" @delete="handleItemDelete"
      @updateBackground="handleItemUpdateBackground" />
  </div>
</template>

<style lang="scss" scoped>
.comp-area {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
}
</style>
