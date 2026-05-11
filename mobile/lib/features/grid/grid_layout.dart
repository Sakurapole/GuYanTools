import 'dart:math';

import 'package:flutter/widgets.dart';
import '../../core/grid_config.dart';
import '../../core/grid_item.dart';

class GridLayout {
  final GridConfig config;
  double unitSize = 36;
  int rowNum = 12;
  int colNum;
  double horizontalOffset;

  GridLayout({required this.config})
    : colNum = config.fixedColumns,
      horizontalOffset = config.gridPadding;

  double get cellSize => unitSize + config.gridGap;

  Map<String, double> compAreaStyle() {
    return {
      'backgroundPositionX': horizontalOffset,
      'backgroundPositionY': config.gridPadding,
      'paddingTop': config.gridPadding,
      'paddingBottom': config.gridPadding,
    };
  }

  double clampCoordinate(double value, double minValue, double maxValue) {
    if (maxValue < minValue) return minValue;
    return min(max(value, minValue), maxValue);
  }

  int toGridPosition(double value) {
    return (value / cellSize).round() + 1;
  }

  Offset syncDraggingPosition(GridItem item) {
    return Offset((item.col - 1) * cellSize, (item.row - 1) * cellSize);
  }

  void updateUnitSize(Size areaSize) {
    final clientWidth = areaSize.width;
    final clientHeight = areaSize.height;

    colNum = config.fixedColumns;

    final maxColsGap = config.gridGap * max(0, config.fixedColumns - 1);
    final widthAvailable = max(0, clientWidth - maxColsGap);
    final widthUnit = config.fixedColumns > 0
        ? widthAvailable / config.fixedColumns
        : 0;

    final tentativeUnit = widthUnit.floorToDouble();
    final nextUnit = max(config.minUnitSize, tentativeUnit);

    if (nextUnit != unitSize) {
      unitSize = nextUnit;
    }

    final actualGridWidth = config.fixedColumns * nextUnit + maxColsGap;
    final remainingSpace = max(0, clientWidth - actualGridWidth);
    horizontalOffset = max(
      config.gridPadding,
      (remainingSpace / 2).floorToDouble(),
    );

    final contentHeight = max(0, clientHeight - config.gridPadding * 2);
    final rowUnit = unitSize + config.gridGap;
    final nextRows = rowUnit > 0
        ? max(1, ((contentHeight + config.gridGap) / rowUnit).floor())
        : 1;
    rowNum = nextRows;
  }

  bool isWithinBounds(GridItem item, int col, int row) {
    final maxCol = colNum - item.colSpan + 1;
    final maxRow = rowNum - item.rowSpan + 1;
    return col >= 1 && row >= 1 && col <= maxCol && row <= maxRow;
  }
}
