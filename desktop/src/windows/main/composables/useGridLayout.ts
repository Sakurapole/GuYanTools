import { computed, ref, type Ref } from 'vue';
import type { GridConfig, GridItem } from '../types/grid';

/**
 * 网格布局计算 composable
 * 负责计算单元格大小、网格样式等布局相关逻辑
 */
export function useGridLayout(
  viewport: Ref<HTMLElement | null>,
  compArea: Ref<HTMLElement | null>,
  config: GridConfig
) {
  const unitSize = ref(config.FIXED_UNIT_SIZE);
  const rowNum = ref(12);
  const colNum = ref(config.FIXED_COLUMNS);
  const horizontalOffset = ref(config.GRID_PADDING);
  const canvasWidth = ref(config.MIN_VIEWPORT_WIDTH);
  const canvasHeight = ref(config.MIN_VIEWPORT_HEIGHT);

  const cellSize = computed(() => unitSize.value + config.GRID_GAP);

  const compAreaStyle = computed(() => {
    const cell = `${cellSize.value}px`;
    return {
      width: `${canvasWidth.value}px`,
      height: `${canvasHeight.value}px`,
      backgroundColor: 'transparent',
      backgroundImage: `
        linear-gradient(to right, var(--home-grid-line-color) 1px, transparent 1px),
        linear-gradient(to bottom, var(--home-grid-line-color) 1px, transparent 1px)
      `,
      backgroundSize: `${cell} ${cell}`,
      backgroundPosition: `${horizontalOffset.value}px ${config.GRID_PADDING}px`,
      paddingTop: `${config.GRID_PADDING}px`,
      paddingBottom: `${config.GRID_PADDING}px`,
    };
  });

  function clampCoordinate(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function toGridPosition(value: number) {
    return Math.round(value / cellSize.value) + 1;
  }

  function syncDraggingPosition(item: GridItem, draggingPosition: Ref<{ x: number; y: number }>) {
    draggingPosition.value = {
      x: (item.col - 1) * cellSize.value,
      y: (item.row - 1) * cellSize.value,
    };
  }

  function updateUnitSize(onComplete?: () => void) {
    const viewportElement = viewport.value;
    if (!viewportElement) return;

    // 固定 unitSize
    const nextUnit = config.FIXED_UNIT_SIZE;
    if (nextUnit !== unitSize.value) {
      unitSize.value = nextUnit;
    }

    const cell = nextUnit + config.GRID_GAP;

    // 横向：根据 viewport 宽度动态计算列数（窗口越宽列越多）
    const viewportWidth = viewportElement.clientWidth;
    const availableWidth = Math.max(viewportWidth, config.MIN_VIEWPORT_WIDTH);
    const dynamicCols = cell > 0
      ? Math.max(1, Math.floor((availableWidth - config.GRID_PADDING * 2 + config.GRID_GAP) / cell))
      : config.FIXED_COLUMNS;
    colNum.value = Math.max(config.FIXED_COLUMNS, dynamicCols);

    // 画布宽度 = 实际列数所需的宽度与 viewport 取大值
    const gridNativeWidth = colNum.value * nextUnit + config.GRID_GAP * Math.max(0, colNum.value - 1) + config.GRID_PADDING * 2;
    canvasWidth.value = Math.max(viewportWidth, gridNativeWidth, config.MIN_VIEWPORT_WIDTH);

    // 左对齐，让 widget 从最左上角开始排列
    horizontalOffset.value = config.GRID_PADDING;

    // 纵向：根据 viewport 高度计算可视行数（初始值，后续会被 expandRowsForContent 扩展）
    const viewportHeight = viewportElement.clientHeight;
    const viewportRows = cell > 0
      ? Math.max(1, Math.floor((viewportHeight - config.GRID_PADDING * 2 + config.GRID_GAP) / cell))
      : 1;
    rowNum.value = viewportRows;

    // 画布高度初始值取 viewport 与最低值中较大的
    canvasHeight.value = Math.max(viewportHeight, config.MIN_VIEWPORT_HEIGHT);

    onComplete?.();
  }

  /**
   * 根据当前所有 widget 实际占据的最大行来扩展 rowNum 和 canvasHeight。
   * 在 reflow 完成后调用，确保容器能容纳所有 widget。
   */
  function expandRowsForContent(items: GridItem[]) {
    const visibleItems = items.filter(i => !i.hidden);
    if (visibleItems.length === 0) return;

    const maxRowEnd = Math.max(...visibleItems.map(i => i.row + i.rowSpan - 1));
    const neededRows = maxRowEnd + 1; // 留一行余量
    if (neededRows > rowNum.value) {
      rowNum.value = neededRows;
    }

    const cell = unitSize.value + config.GRID_GAP;
    const neededHeight = rowNum.value * cell + config.GRID_PADDING * 2;
    const viewportHeight = viewport.value?.clientHeight ?? config.MIN_VIEWPORT_HEIGHT;
    canvasHeight.value = Math.max(neededHeight, viewportHeight, config.MIN_VIEWPORT_HEIGHT);
  }

  function isWithinBounds(item: GridItem, col: number, row: number) {
    const maxCol = colNum.value - item.colSpan + 1;
    const maxRow = rowNum.value - item.rowSpan + 1;
    return col >= 1 && row >= 1 && col <= maxCol && row <= maxRow;
  }

  return {
    unitSize,
    rowNum,
    colNum,
    horizontalOffset,
    canvasWidth,
    canvasHeight,
    cellSize,
    compAreaStyle,
    clampCoordinate,
    toGridPosition,
    syncDraggingPosition,
    updateUnitSize,
    expandRowsForContent,
    isWithinBounds,
  };
}
