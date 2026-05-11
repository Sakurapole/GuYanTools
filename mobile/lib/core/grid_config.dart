class GridConfig {
  final double gridGap;
  final double minUnitSize;
  final String storageKey;
  final double gridPadding;
  final int holdDelayMs;
  final int fixedColumns;

  const GridConfig({
    required this.gridGap,
    required this.minUnitSize,
    required this.storageKey,
    required this.gridPadding,
    required this.holdDelayMs,
    required this.fixedColumns,
  });

  static const defaultConfig = GridConfig(
    gridGap: 8,
    minUnitSize: 24,
    storageKey: 'mobile-grid-layout',
    gridPadding: 16,
    holdDelayMs: 300,
    fixedColumns: 4,
  );
}
