import { computed, ref, type Ref } from 'vue';
import type { GridConfig, GridItem } from '../types/grid';

/**
 * 网格布局计算 composable
 * 负责计算单元格大小、网格样式等布局相关逻辑
 */
export function useGridLayout(
  compArea: Ref<HTMLElement | null>,
  config: GridConfig,
  draggingItem: Ref<GridItem | null>
) {
  const unitSize = ref(36);
  const rowNum = ref(12);
  const colNum = ref(config.FIXED_COLUMNS);
  const horizontalOffset = ref(config.GRID_PADDING);

  const cellSize = computed(() => unitSize.value + config.GRID_GAP);

  const compAreaStyle = computed(() => {
    const cell = `${cellSize.value}px`;
    return {
      backgroundColor: 'var(--surface-color)',
      backgroundImage: `
        linear-gradient(to right, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.06) 1px, transparent 1px)
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
    if (!compArea.value) return;

    const { clientWidth, clientHeight } = compArea.value;

    colNum.value = config.FIXED_COLUMNS;

    const maxColsGap = config.GRID_GAP * Math.max(0, config.FIXED_COLUMNS - 1);
    const widthAvailable = Math.max(0, clientWidth - maxColsGap);
    const widthUnit = config.FIXED_COLUMNS > 0 ? widthAvailable / config.FIXED_COLUMNS : 0;

    const tentativeUnit = Math.floor(widthUnit);
    const nextUnit = Math.max(config.MIN_UNIT_SIZE, tentativeUnit);

    if (nextUnit !== unitSize.value) {
      unitSize.value = nextUnit;
    }

    // 计算实际使用的总宽度
    const actualGridWidth = config.FIXED_COLUMNS * nextUnit + maxColsGap;
    const remainingSpace = Math.max(0, clientWidth - actualGridWidth);
    horizontalOffset.value = Math.max(config.GRID_PADDING, Math.floor(remainingSpace / 2));

    // 垂直方向
    const contentHeight = Math.max(0, clientHeight - config.GRID_PADDING * 2);
    const rowUnit = unitSize.value + config.GRID_GAP;
    const nextRows = rowUnit > 0
      ? Math.max(1, Math.floor((contentHeight + config.GRID_GAP) / rowUnit))
      : 1;
    rowNum.value = nextRows;

    onComplete?.();
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
    cellSize,
    compAreaStyle,
    clampCoordinate,
    toGridPosition,
    syncDraggingPosition,
    updateUnitSize,
    isWithinBounds,
  };
}

