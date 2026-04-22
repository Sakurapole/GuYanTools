import { ref, type Ref } from 'vue';
import type { GridItem, PendingDragState } from '../types/grid';

/**
 * 网格拖拽 composable
 * 负责处理网格项的拖拽交互
 */
export function useGridDrag(
  compArea: Ref<HTMLElement | null>,
  config: {
    GRID_PADDING: number;
    HOLD_DELAY_MS: number;
  },
  layoutHelpers: {
    cellSize: Ref<number>;
    horizontalOffset: Ref<number>;
    colNum: Ref<number>;
    rowNum: Ref<number>;
    clampCoordinate: (value: number, min: number, max: number) => number;
    toGridPosition: (value: number) => number;
    syncDraggingPosition: (item: GridItem, draggingPosition: Ref<{ x: number; y: number }>) => void;
    findAvailablePosition: (item: GridItem, targetCol: number, targetRow: number, initialPosition: { col: number; row: number }) => { col: number; row: number };
  },
  onDragEnd: () => void
) {
  const draggingItem = ref<GridItem | null>(null);
  const activePointerId = ref<number | null>(null);
  const pointerOffset = ref({ x: 0, y: 0 });
  const draggingPosition = ref({ x: 0, y: 0 });
  const captureTarget = ref<HTMLElement | null>(null);
  const initialPosition = ref({ col: 1, row: 1 });
  const holdTimerId = ref<number | null>(null);
  const pendingDrag = ref<PendingDragState | null>(null);
  const cachedAreaRect = ref<DOMRect | null>(null);
  const isListeningToWindow = ref(false);

  function clearHoldTimer() {
    if (holdTimerId.value !== null) {
      clearTimeout(holdTimerId.value);
      holdTimerId.value = null;
    }
  }

  function cancelPendingHold(pointerId?: number) {
    if (pendingDrag.value && pointerId !== undefined && pendingDrag.value.pointerId !== pointerId) {
      return;
    }
    clearHoldTimer();
    pendingDrag.value = null;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!draggingItem.value || !compArea.value) return;
    if (activePointerId.value !== null && event.pointerId !== activePointerId.value) return;

    // 使用缓存的 areaRect，避免每次都调用昂贵的 getBoundingClientRect()
    const areaRect = cachedAreaRect.value;
    if (!areaRect) return;

    const rawX =
      event.clientX -
      areaRect.left -
      layoutHelpers.horizontalOffset.value -
      pointerOffset.value.x;
    const rawY =
      event.clientY -
      areaRect.top -
      config.GRID_PADDING -
      pointerOffset.value.y;

    const maxX =
      (layoutHelpers.colNum.value - draggingItem.value.colSpan) * layoutHelpers.cellSize.value;
    const maxY =
      (layoutHelpers.rowNum.value - draggingItem.value.rowSpan) * layoutHelpers.cellSize.value;

    draggingPosition.value = {
      x: layoutHelpers.clampCoordinate(rawX, 0, Math.max(0, maxX)),
      y: layoutHelpers.clampCoordinate(rawY, 0, Math.max(0, maxY)),
    };
  }

  function stopDragging(event?: PointerEvent) {
    if (!draggingItem.value) return;
    if (event && activePointerId.value !== null && event.pointerId !== activePointerId.value) return;

    const item = draggingItem.value;

    const snappedCol = layoutHelpers.clampCoordinate(
      layoutHelpers.toGridPosition(draggingPosition.value.x),
      1,
      Math.max(1, layoutHelpers.colNum.value - item.colSpan + 1)
    );
    const snappedRow = layoutHelpers.clampCoordinate(
      layoutHelpers.toGridPosition(draggingPosition.value.y),
      1,
      Math.max(1, layoutHelpers.rowNum.value - item.rowSpan + 1)
    );

    const finalPosition = layoutHelpers.findAvailablePosition(item, snappedCol, snappedRow, initialPosition.value);

    item.col = finalPosition.col;
    item.row = finalPosition.row;
    item.isDragging = false;
    item.hidden = false;
    item.preferredCol = finalPosition.col;
    item.preferredRow = finalPosition.row;

    if (captureTarget.value && activePointerId.value !== null) {
      try {
        captureTarget.value.releasePointerCapture(activePointerId.value);
      } catch {
        // ignore release errors
      }
    }

    draggingItem.value = null;
    activePointerId.value = null;
    captureTarget.value = null;
    cachedAreaRect.value = null;

    // 移除窗口事件监听器
    if (isListeningToWindow.value) {
      isListeningToWindow.value = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    }

    cancelPendingHold();

    onDragEnd();
  }

  function beginDrag() {
    const pending = pendingDrag.value;
    if (!pending) return;

    pendingDrag.value = null;

    const { item, pointerId, target, clientX, clientY } = pending;

    draggingItem.value = item;
    activePointerId.value = pointerId;
    item.isDragging = true;
    item.hidden = false;
    initialPosition.value = { col: item.col, row: item.row };

    const rect = target.getBoundingClientRect();
    pointerOffset.value = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };

    // 缓存容器的 DOMRect，在拖拽过程中复用，避免频繁调用 getBoundingClientRect()
    if (compArea.value) {
      cachedAreaRect.value = compArea.value.getBoundingClientRect();
    }

    layoutHelpers.syncDraggingPosition(item, draggingPosition);

    captureTarget.value = null;
    if ('setPointerCapture' in target) {
      try {
        target.setPointerCapture(pointerId);
        captureTarget.value = target;
      } catch {
        captureTarget.value = null;
      }
    }

    clearHoldTimer();

    // 防止重复添加事件监听器
    if (!isListeningToWindow.value) {
      isListeningToWindow.value = true;
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopDragging);
      window.addEventListener('pointercancel', stopDragging);
    }
  }

  function handleItemPointerDown(item: GridItem, event: PointerEvent) {
    if (event.button !== 0) return;
    if (draggingItem.value) return;

    event.preventDefault();

    cancelPendingHold();

    pendingDrag.value = {
      item,
      pointerId: event.pointerId,
      target: event.currentTarget as HTMLElement,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    holdTimerId.value = window.setTimeout(() => {
      holdTimerId.value = null;
      beginDrag();
    }, config.HOLD_DELAY_MS);
  }

  function handleItemPointerMove(event: PointerEvent) {
    if (draggingItem.value) return;
    const pending = pendingDrag.value;
    if (!pending) return;
    if (pending.pointerId !== event.pointerId) return;

    pending.clientX = event.clientX;
    pending.clientY = event.clientY;
  }

  function handleItemPointerUp(event: PointerEvent) {
    if (draggingItem.value) return;
    const pending = pendingDrag.value;
    if (!pending) return;
    if (pending.pointerId !== event.pointerId) return;
    cancelPendingHold();
  }

  function handleItemPointerCancel(event: PointerEvent) {
    if (draggingItem.value && activePointerId.value === event.pointerId) return;
    cancelPendingHold(event.pointerId);
  }

  function handleItemPointerLeave(event: PointerEvent) {
    if (draggingItem.value && activePointerId.value === event.pointerId) return;
    const pending = pendingDrag.value;
    if (!pending) return;
    if (pending.pointerId !== event.pointerId) return;
    cancelPendingHold();
  }

  function cleanup() {
    stopDragging();
    cancelPendingHold();
  }

  return {
    draggingItem,
    draggingPosition,
    handleItemPointerDown,
    handleItemPointerMove,
    handleItemPointerUp,
    handleItemPointerCancel,
    handleItemPointerLeave,
    stopDragging,
    cleanup,
  };
}

