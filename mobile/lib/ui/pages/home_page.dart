

import 'package:flutter/material.dart';
import 'dart:math';
import '../../core/grid_config.dart';
import '../../core/grid_item.dart';
import '../../features/grid/grid_layout.dart';
import '../../features/grid/grid_collision.dart';
import '../../features/grid/grid_drag_controller.dart';
import '../../state/grid_store.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final config = GridConfig.defaultConfig;
  late GridLayout layout;
  late GridStore store;
  GridDragController? dragController;

  @override
  void initState() {
    super.initState();
    layout = GridLayout(config: config);
    store = GridStore();
    store.setItems(_sampleItems());
  }

  List<GridItem> _sampleItems() {
    return [
      GridItem(id: 'a', label: 'A', col: 1, row: 1, colSpan: 1, rowSpan: 1, color: '#4CAF50', preferredCol: 1, preferredRow: 1, priority: 1),
      GridItem(id: 'b', label: 'B', col: 2, row: 1, colSpan: 1, rowSpan: 1, color: '#2196F3', preferredCol: 2, preferredRow: 1, priority: 1),
      GridItem(id: 'c', label: 'C', col: 3, row: 1, colSpan: 1, rowSpan: 1, color: '#FF9800', preferredCol: 3, preferredRow: 1, priority: 1),
      GridItem(id: 'd', label: 'D', col: 1, row: 2, colSpan: 2, rowSpan: 1, color: '#9C27B0', preferredCol: 1, preferredRow: 2, priority: 1),
      GridItem(id: 'e', label: 'E', col: 3, row: 2, colSpan: 1, rowSpan: 2, color: '#F44336', preferredCol: 3, preferredRow: 2, priority: 1),
      GridItem(id: 'f', label: 'F', col: 1, row: 3, colSpan: 1, rowSpan: 1, color: '#00BCD4', preferredCol: 1, preferredRow: 3, priority: 1),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('GuYan Tools Mobile')),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final areaSize = Size(constraints.maxWidth, constraints.maxHeight);
          layout.updateUnitSize(areaSize);
          final collision = GridCollision(gridItems: store.items, layout: layout);
          dragController ??= GridDragController(layout: layout, collision: collision, config: config);
          return _buildGridArea(context);
        },
      ),
    );
  }

  Widget _buildGridArea(BuildContext context) {
    final rows = store.items.map((i) => i.row + i.rowSpan - 1).toList();
    final maxRow = rows.isNotEmpty ? rows.reduce(max) : 0;
    final gridHeight = maxRow * layout.cellSize + config.gridPadding * 2;

    final draggingId = dragController?.draggingItem?.id;
    final items = List<GridItem>.from(store.items);
    if (draggingId != null) {
      GridItem? di;
      items.removeWhere((i) {
        if (i.id == draggingId) {
          di = i;
          return true;
        }
        return false;
      });
      if (di != null) items.add(di!);
    }

    return SingleChildScrollView(
      child: SizedBox(
        height: gridHeight,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: Container(
                color: const Color(0xFF121212),
              ),
            ),
            ...items.map((item) => _buildGridItem(context, item)),
          ],
        ),
      ),
    );
  }

  Widget _buildGridItem(BuildContext context, GridItem item) {
    final left = layout.horizontalOffset + (item.col - 1) * layout.cellSize;
    final top = config.gridPadding + (item.row - 1) * layout.cellSize;
    final width = item.colSpan * layout.cellSize - config.gridGap;
    final height = item.rowSpan * layout.cellSize - config.gridGap;

    final renderPosition = dragController?.draggingItem?.id == item.id
        ? dragController!.draggingPosition
        : Offset(left, top);

    return Positioned(
      left: renderPosition.dx,
      top: renderPosition.dy,
      width: width,
      height: height,
      child: Builder(
        builder: (itemContext) {
          return GestureDetector(
            onLongPressStart: (details) {
              final box = itemContext.findRenderObject() as RenderBox;
              final areaBox = context.findRenderObject() as RenderBox;
              final origin = areaBox.localToGlobal(Offset.zero);
              dragController?.setAreaOrigin(origin);
              dragController?.beginDrag(item, details, box);
              setState(() {});
            },
            onLongPressMoveUpdate: (details) {
              dragController?.updateDrag(details);
              setState(() {});
            },
            onLongPressEnd: (details) {
              dragController?.stopDrag(details);
              setState(() {});
            },
            child: RepaintBoundary(
              child: Opacity(
                opacity: item.hidden ? 0.5 : 1,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.grey.shade800,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.white10),
                  ),
                  alignment: Alignment.center,
                  child: Text(item.label, style: const TextStyle(color: Colors.white)),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
