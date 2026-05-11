import 'package:flutter/material.dart';
import '../../core/grid_item.dart';
import '../../core/grid_config.dart';
import 'grid_layout.dart';
import 'grid_collision.dart';

class GridDragController {
  final GridLayout layout;
  final GridCollision collision;
  final GridConfig config;

  GridItem? draggingItem;
  Offset pointerOffset = Offset.zero;
  Offset draggingPosition = Offset.zero;
  Offset areaOrigin = Offset.zero;
  Map<String, int> initialPosition = {'col': 1, 'row': 1};

  GridDragController({
    required this.layout,
    required this.collision,
    required this.config,
  });

  void setAreaOrigin(Offset origin) {
    areaOrigin = origin;
  }

  void beginDrag(
    GridItem item,
    LongPressStartDetails details,
    RenderBox targetBox,
  ) {
    draggingItem = item;
    item.isDragging = true;
    item.hidden = false;
    initialPosition = {'col': item.col, 'row': item.row};

    pointerOffset = details.localPosition;
    draggingPosition = layout.syncDraggingPosition(item);
  }

  void updateDrag(LongPressMoveUpdateDetails details) {
    final item = draggingItem;
    if (item == null) return;
    final rawX =
        details.globalPosition.dx -
        areaOrigin.dx -
        layout.horizontalOffset -
        pointerOffset.dx;
    final rawY =
        details.globalPosition.dy -
        areaOrigin.dy -
        config.gridPadding -
        pointerOffset.dy;
    final maxX = (layout.colNum - item.colSpan) * layout.cellSize;
    final maxY = (layout.rowNum - item.rowSpan) * layout.cellSize;
    draggingPosition = Offset(
      layout.clampCoordinate(rawX, 0, maxX > 0 ? maxX : 0),
      layout.clampCoordinate(rawY, 0, maxY > 0 ? maxY : 0),
    );
  }

  void stopDrag(LongPressEndDetails details) {
    final item = draggingItem;
    if (item == null) return;
    final snappedCol = layout
        .clampCoordinate(
          layout.toGridPosition(draggingPosition.dx).toDouble(),
          1,
          (layout.colNum - item.colSpan + 1).toDouble(),
        )
        .toInt();
    final snappedRow = layout
        .clampCoordinate(
          layout.toGridPosition(draggingPosition.dy).toDouble(),
          1,
          (layout.rowNum - item.rowSpan + 1).toDouble(),
        )
        .toInt();
    final finalPos = collision.findAvailablePosition(
      item,
      snappedCol,
      snappedRow,
      initialPosition,
    );
    item.col = finalPos['col']!;
    item.row = finalPos['row']!;
    item.isDragging = false;
    item.hidden = false;
    item.preferredCol = finalPos['col']!;
    item.preferredRow = finalPos['row']!;
    draggingItem = null;
    pointerOffset = Offset.zero;
    draggingPosition = Offset.zero;
  }
}
