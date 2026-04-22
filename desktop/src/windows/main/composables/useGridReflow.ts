import type { Ref } from 'vue';
import type { GridItem } from '../types/grid';

/**
 * 网格布局重排 composable
 * 负责网格项的自动排列和紧凑布局
 */
export function useGridReflow(
  gridItems: Ref<GridItem[]>,
  colNum: Ref<number>,
  rowNum: Ref<number>,
  draggingItem: Ref<GridItem | null>,
  canPlaceAt: (occupancy: (string | null)[][], item: GridItem, col: number, row: number) => boolean,
  occupySlot: (occupancy: (string | null)[][], item: GridItem, col: number, row: number) => void,
  isWithinBounds: (item: GridItem, col: number, row: number) => boolean,
  onLayoutChange: () => void,
  expandRowsForContent?: (items: GridItem[]) => void
) {
  let reflowFrame = 0;
  let pendingForceNotify = false;

  function clampCoordinate(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function scheduleReflow(options?: { forceNotify?: boolean }) {
    if (options?.forceNotify) {
      pendingForceNotify = true;
    }

    if (typeof window === 'undefined') {
      reflowLayout(pendingForceNotify);
      pendingForceNotify = false;
      return;
    }

    if (reflowFrame !== 0) return;

    reflowFrame = window.requestAnimationFrame(() => {
      reflowFrame = 0;
      reflowLayout(pendingForceNotify);
      pendingForceNotify = false;
    });
  }

  function reflowLayout(forceNotify = false) {
    if (draggingItem.value) return;

    const totalCols = Math.max(1, colNum.value);
    let totalRows = Math.max(1, rowNum.value);

    // 预扩展 totalRows：保证现有 item 位置不会被 clampCoordinate 压缩
    for (const item of gridItems.value) {
      if (item.hidden) continue;
      const itemEndRow = (item.preferredRow ?? item.row) + item.rowSpan - 1;
      if (itemEndRow >= totalRows) {
        totalRows = itemEndRow + 1;
      }
    }
    rowNum.value = totalRows;

    let occupancy: (string | null)[][] = buildOccupancy(totalRows, totalCols);

    const sortedItems = [...gridItems.value].sort((a, b) => {
      const diff = a.priority - b.priority;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
    let mutated = false;
    const visibleItems: GridItem[] = [];

    for (const item of sortedItems) {
      const maxCol = Math.max(1, colNum.value - item.colSpan + 1);
      const maxRow = Math.max(1, totalRows - item.rowSpan + 1);

      const baseCol = clampCoordinate(item.preferredCol ?? item.col, 1, maxCol);
      const baseRow = clampCoordinate(item.preferredRow ?? item.row, 1, maxRow);

      const maxRadius = Math.max(totalCols, totalRows);
      let placement = findPlacement(occupancy, item, baseCol, baseRow, maxRadius);

      // 放不下时自动扩展行数再重试
      if (!placement) {
        const extraRows = item.rowSpan + 1;
        totalRows += extraRows;
        rowNum.value = totalRows;
        occupancy = expandOccupancy(occupancy, extraRows, totalCols);

        const newMaxRow = Math.max(1, totalRows - item.rowSpan + 1);
        const newBaseRow = clampCoordinate(item.preferredRow ?? item.row, 1, newMaxRow);
        const newMaxRadius = Math.max(totalCols, totalRows);
        placement = findPlacement(occupancy, item, baseCol, newBaseRow, newMaxRadius);
      }

      if (!placement) {
        // 极端情况仍放不下，隐藏
        if (!item.hidden) {
          item.hidden = true;
          mutated = true;
        }
        continue;
      }

      const { col, row } = placement;
      occupySlot(occupancy, item, col, row);
      visibleItems.push(item);

      if (
        item.hidden ||
        item.col !== col ||
        item.row !== row ||
        item.preferredCol !== col ||
        item.preferredRow !== row
      ) {
        mutated = true;
      }

      item.hidden = false;
      item.col = col;
      item.row = row;
      item.preferredCol = col;
      item.preferredRow = row;
    }


    // reflow 完成后，根据实际内容扩展容器
    expandRowsForContent?.(gridItems.value);

    if (mutated || forceNotify) {
      onLayoutChange();
    }
  }

  function buildOccupancy(rows: number, cols: number): (string | null)[][] {
    return Array.from({ length: rows }, (): (string | null)[] =>
      Array.from({ length: cols }, (): string | null => null)
    );
  }

  function expandOccupancy(
    occupancy: (string | null)[][],
    extraRows: number,
    cols: number
  ): (string | null)[][] {
    for (let i = 0; i < extraRows; i++) {
      occupancy.push(Array.from({ length: cols }, (): string | null => null));
    }
    return occupancy;
  }

  function findPlacement(
    occupancy: (string | null)[][],
    item: GridItem,
    targetCol: number,
    targetRow: number,
    maxRadius: number
  ) {
    if (canPlaceAt(occupancy, item, targetCol, targetRow)) {
      return { col: targetCol, row: targetRow };
    }

    for (let radius = 1; radius < maxRadius; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const col = targetCol + dx;
          const row = targetRow + dy;
          if (!canPlaceAt(occupancy, item, col, row)) continue;
          return { col, row };
        }
      }
    }

    return null;
  }

  function cancelReflow() {
    if (typeof window !== 'undefined' && reflowFrame) {
      window.cancelAnimationFrame(reflowFrame);
      reflowFrame = 0;
    }
    pendingForceNotify = false;
  }

  return {
    scheduleReflow,
    reflowLayout,
    cancelReflow,
  };
}
