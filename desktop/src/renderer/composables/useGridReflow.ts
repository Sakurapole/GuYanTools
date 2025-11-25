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
  onLayoutChange: () => void
) {
  let reflowFrame = 0;
  let pendingCompact = false;

  function clampCoordinate(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function scheduleReflow(options?: { compact?: boolean }) {
    if (options?.compact) {
      pendingCompact = true;
    }

    if (typeof window === 'undefined') {
      reflowLayout(pendingCompact);
      pendingCompact = false;
      return;
    }

    if (reflowFrame !== 0) return;

    reflowFrame = window.requestAnimationFrame(() => {
      reflowFrame = 0;
      reflowLayout(pendingCompact);
      pendingCompact = false;
    });
  }

  function reflowLayout(compact: boolean) {
    if (draggingItem.value) return;

    const totalCols = Math.max(1, colNum.value);
    const totalRows = Math.max(1, rowNum.value);

    const occupancy: (string | null)[][] = Array.from({ length: totalRows }, (): (string | null)[] =>
      Array.from({ length: totalCols }, (): string | null => null)
    );

    const sortedItems = [...gridItems.value].sort((a, b) => {
      const diff = a.priority - b.priority;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
    let mutated = false;
    const visibleItems: GridItem[] = [];

    const maxRadius = Math.max(totalCols, totalRows);

    for (const item of sortedItems) {
      const maxCol = Math.max(1, colNum.value - item.colSpan + 1);
      const maxRow = Math.max(1, rowNum.value - item.rowSpan + 1);

      const baseCol = clampCoordinate(item.preferredCol ?? item.col, 1, maxCol);
      const baseRow = clampCoordinate(item.preferredRow ?? item.row, 1, maxRow);

      const placement = findPlacement(occupancy, item, baseCol, baseRow, maxRadius);

      if (!placement) {
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

    if (compact && visibleItems.length > 0) {
      const minCol = Math.min(...visibleItems.map(item => item.col));
      const minRow = Math.min(...visibleItems.map(item => item.row));
      const shiftCol = minCol > 1 ? minCol - 1 : 0;
      const shiftRow = minRow > 1 ? minRow - 1 : 0;

      if (shiftCol > 0 || shiftRow > 0) {
        for (const item of visibleItems) {
          item.col -= shiftCol;
          item.row -= shiftRow;
          item.preferredCol -= shiftCol;
          item.preferredRow -= shiftRow;
        }
        mutated = true;
      }
    }

    if (mutated) {
      onLayoutChange();
    }
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
    pendingCompact = false;
  }

  return {
    scheduleReflow,
    reflowLayout,
    cancelReflow,
  };
}

