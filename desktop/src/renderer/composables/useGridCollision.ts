import type { Ref } from 'vue';
import type { GridItem } from '../types/grid';

/**
 * 网格碰撞检测 composable
 * 负责检测网格项之间的碰撞和查找可用位置
 */
export function useGridCollision(
  gridItems: Ref<GridItem[]>,
  colNum: Ref<number>,
  rowNum: Ref<number>,
  isWithinBounds: (item: GridItem, col: number, row: number) => boolean
) {
  function overlaps(item: GridItem, col: number, row: number, other: GridItem) {
    if (item.id === other.id) return false;

    const itemRight = col + item.colSpan - 1;
    const itemBottom = row + item.rowSpan - 1;
    const otherRight = other.col + other.colSpan - 1;
    const otherBottom = other.row + other.rowSpan - 1;

    const separatedHorizontally = itemRight < other.col || col > otherRight;
    const separatedVertically = itemBottom < other.row || row > otherBottom;

    return !(separatedHorizontally || separatedVertically);
  }

  function hasCollision(item: GridItem, col: number, row: number) {
    return gridItems.value.some(other => !other.hidden && overlaps(item, col, row, other));
  }

  function findAvailablePosition(
    item: GridItem,
    targetCol: number,
    targetRow: number,
    initialPosition: { col: number; row: number }
  ) {
    if (isWithinBounds(item, targetCol, targetRow) && !hasCollision(item, targetCol, targetRow)) {
      return { col: targetCol, row: targetRow };
    }

    const maxRadius = Math.max(colNum.value, rowNum.value);
    for (let radius = 1; radius < maxRadius; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const col = targetCol + dx;
          const row = targetRow + dy;
          if (!isWithinBounds(item, col, row)) continue;
          if (!hasCollision(item, col, row)) {
            return { col, row };
          }
        }
      }
    }

    return { col: initialPosition.col, row: initialPosition.row };
  }

  function canPlaceAt(
    occupancy: (string | null)[][],
    item: GridItem,
    col: number,
    row: number
  ) {
    if (!isWithinBounds(item, col, row)) return false;

    for (let r = 0; r < item.rowSpan; r += 1) {
      for (let c = 0; c < item.colSpan; c += 1) {
        const occRow = row + r - 1;
        const occCol = col + c - 1;
        if (occRow < 0 || occRow >= occupancy.length) return false;
        if (occCol < 0 || occCol >= occupancy[0].length) return false;
        if (occupancy[occRow][occCol]) return false;
      }
    }

    return true;
  }

  function occupySlot(
    occupancy: (string | null)[][],
    item: GridItem,
    col: number,
    row: number
  ) {
    for (let r = 0; r < item.rowSpan; r += 1) {
      for (let c = 0; c < item.colSpan; c += 1) {
        const occRow = row + r - 1;
        const occCol = col + c - 1;
        if (occRow >= 0 && occRow < occupancy.length && occCol >= 0 && occCol < occupancy[0].length) {
          occupancy[occRow][occCol] = item.id;
        }
      }
    }
  }

  return {
    hasCollision,
    findAvailablePosition,
    canPlaceAt,
    occupySlot,
  };
}

