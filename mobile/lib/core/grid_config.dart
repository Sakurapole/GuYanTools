class GridConfig {
  final double gridGap;
  final double minUnitSize;
  final double gridPadding;
  final int holdDelayMs;
  final int fixedColumns;
  final double minCardHeight;

  const GridConfig({
    required this.gridGap,
    required this.minUnitSize,
    required this.gridPadding,
    required this.holdDelayMs,
    required this.fixedColumns,
    required this.minCardHeight,
  });

  static const compact = GridConfig(
    gridGap: 8,
    minUnitSize: 68,
    gridPadding: 16,
    holdDelayMs: 300,
    fixedColumns: 4,
    minCardHeight: 72,
  );

  static const expanded = GridConfig(
    gridGap: 10,
    minUnitSize: 78,
    gridPadding: 16,
    holdDelayMs: 300,
    fixedColumns: 6,
    minCardHeight: 82,
  );
}
