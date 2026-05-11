import '../../core/grid_item.dart';
import 'grid_layout.dart';

class GridCollision {
  final List<GridItem> gridItems;
  final GridLayout layout;

  GridCollision({required this.gridItems, required this.layout});

  bool overlaps(GridItem item, int col, int row, GridItem other) {
    if (item.id == other.id) return false;
    final itemRight = col + item.colSpan - 1;
    final itemBottom = row + item.rowSpan - 1;
    final otherRight = other.col + other.colSpan - 1;
    final otherBottom = other.row + other.rowSpan - 1;
    final separatedHorizontally = itemRight < other.col || col > otherRight;
    final separatedVertically = itemBottom < other.row || row > otherBottom;
    return !(separatedHorizontally || separatedVertically);
  }

  bool hasCollision(GridItem item, int col, int row) {
    for (final other in gridItems) {
      if (!other.hidden && overlaps(item, col, row, other)) return true;
    }
    return false;
  }

  Map<String, int> findAvailablePosition(
    GridItem item,
    int targetCol,
    int targetRow,
    Map<String, int> initialPosition,
  ) {
    if (layout.isWithinBounds(item, targetCol, targetRow) &&
        !hasCollision(item, targetCol, targetRow)) {
      return {'col': targetCol, 'row': targetRow};
    }
    final maxRadius = layout.colNum > layout.rowNum
        ? layout.colNum
        : layout.rowNum;
    for (int radius = 1; radius < maxRadius; radius += 1) {
      for (int dx = -radius; dx <= radius; dx += 1) {
        for (int dy = -radius; dy <= radius; dy += 1) {
          if ((dx.abs() > dy.abs() ? dx.abs() : dy.abs()) != radius) continue;
          final col = targetCol + dx;
          final row = targetRow + dy;
          if (!layout.isWithinBounds(item, col, row)) continue;
          if (!hasCollision(item, col, row)) {
            return {'col': col, 'row': row};
          }
        }
      }
    }
    return {'col': initialPosition['col']!, 'row': initialPosition['row']!};
  }

  bool canPlaceAt(
    List<List<String?>> occupancy,
    GridItem item,
    int col,
    int row,
  ) {
    if (!layout.isWithinBounds(item, col, row)) return false;
    for (int r = 0; r < item.rowSpan; r += 1) {
      for (int c = 0; c < item.colSpan; c += 1) {
        final occRow = row + r - 1;
        final occCol = col + c - 1;
        if (occRow < 0 || occRow >= occupancy.length) return false;
        if (occCol < 0 || occCol >= occupancy[0].length) return false;
        if (occupancy[occRow][occCol] != null) return false;
      }
    }
    return true;
  }

  void occupySlot(
    List<List<String?>> occupancy,
    GridItem item,
    int col,
    int row,
  ) {
    for (int r = 0; r < item.rowSpan; r += 1) {
      for (int c = 0; c < item.colSpan; c += 1) {
        final occRow = row + r - 1;
        final occCol = col + c - 1;
        if (occRow >= 0 &&
            occRow < occupancy.length &&
            occCol >= 0 &&
            occCol < occupancy[0].length) {
          occupancy[occRow][occCol] = item.id;
        }
      }
    }
  }
}
