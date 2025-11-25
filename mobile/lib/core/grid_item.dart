class GridItem {
  final String id;
  final String label;
  final String? icon;
  int col;
  int row;
  int colSpan;
  int rowSpan;
  final String color;
  final String? backgroundImage;
  bool isDragging;
  int preferredCol;
  int preferredRow;
  int priority;
  bool hidden;

  GridItem({
    required this.id,
    required this.label,
    this.icon,
    required this.col,
    required this.row,
    required this.colSpan,
    required this.rowSpan,
    required this.color,
    this.backgroundImage,
    this.isDragging = false,
    required this.preferredCol,
    required this.preferredRow,
    required this.priority,
    this.hidden = false,
  });
}