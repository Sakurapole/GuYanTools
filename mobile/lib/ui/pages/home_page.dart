import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/grid_config.dart';
import '../../core/grid_item.dart';
import '../../core/theme/app_colors.dart';
import '../../design_system/design_system.dart';
import '../../features/clipboard/application/clipboard_controller.dart';
import '../../features/grid/grid_collision.dart';
import '../../features/grid/grid_layout.dart';
import '../../features/home/application/home_layout_controller.dart';
import '../../features/home/application/home_layout_state.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clipboardCount = ref.watch(
      clipboardControllerProvider.select(
        (value) => value.value?.totalCount ?? 0,
      ),
    );
    final homeLayout = ref.watch(homeLayoutControllerProvider);

    return homeLayout.when(
      data: (state) =>
          _HomeLoadedView(state: state, clipboardCount: clipboardCount),
      loading: () => const Scaffold(
        body: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: AppTopBar(title: 'GuYanTools')),
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            ),
          ],
        ),
      ),
      error: (error, _) => Scaffold(
        body: CustomScrollView(
          slivers: [
            const SliverToBoxAdapter(child: AppTopBar(title: 'GuYanTools')),
            SliverFillRemaining(
              hasScrollBody: false,
              child: _HomeErrorState(message: '$error'),
            ),
          ],
        ),
      ),
    );
  }
}

class _HomeLoadedView extends ConsumerStatefulWidget {
  final HomeLayoutUiState state;
  final int clipboardCount;

  const _HomeLoadedView({required this.state, required this.clipboardCount});

  @override
  ConsumerState<_HomeLoadedView> createState() => _HomeLoadedViewState();
}

class _HomeLoadedViewState extends ConsumerState<_HomeLoadedView> {
  late final PageController _pageController;
  bool _draggingHomeWidget = false;
  int? _programmaticCategoryTarget;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(
      initialPage: widget.state.activeCategoryIndex,
    );
  }

  @override
  void didUpdateWidget(covariant _HomeLoadedView oldWidget) {
    super.didUpdateWidget(oldWidget);
    final nextIndex = widget.state.categories.isEmpty
        ? 0
        : widget.state.activeCategoryIndex.clamp(
            0,
            widget.state.categories.length - 1,
          );
    if (_programmaticCategoryTarget != null) {
      return;
    }
    if (_pageController.hasClients &&
        oldWidget.state.activeCategoryIndex != nextIndex) {
      _pageController.animateToPage(
        nextIndex,
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _setDraggingHomeWidget(bool dragging) {
    if (!mounted || _draggingHomeWidget == dragging) {
      return;
    }
    void apply() {
      if (!mounted || _draggingHomeWidget == dragging) {
        return;
      }
      setState(() {
        _draggingHomeWidget = dragging;
      });
    }

    final phase = SchedulerBinding.instance.schedulerPhase;
    if (phase == SchedulerPhase.persistentCallbacks ||
        phase == SchedulerPhase.postFrameCallbacks) {
      SchedulerBinding.instance.addPostFrameCallback((_) => apply());
      return;
    }
    apply();
  }

  Future<void> _selectCategory(int index) async {
    if (widget.state.categories.isEmpty) {
      return;
    }
    final targetIndex = index.clamp(0, widget.state.categories.length - 1);
    _programmaticCategoryTarget = targetIndex;
    ref
        .read(homeLayoutControllerProvider.notifier)
        .setActiveCategory(targetIndex);

    if (!_pageController.hasClients) {
      _programmaticCategoryTarget = null;
      return;
    }

    try {
      await _pageController.animateToPage(
        targetIndex,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
      );
    } finally {
      if (mounted && _programmaticCategoryTarget == targetIndex) {
        _programmaticCategoryTarget = null;
      }
    }
  }

  void _handlePageChanged(int index) {
    final targetIndex = _programmaticCategoryTarget;
    if (targetIndex != null && index != targetIndex) {
      return;
    }
    if (targetIndex != null && index == targetIndex) {
      _programmaticCategoryTarget = null;
    }
    ref.read(homeLayoutControllerProvider.notifier).setActiveCategory(index);
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final clipboardCount = widget.clipboardCount;
    return LayoutBuilder(
      builder: (context, constraints) {
        final layoutScope = constraints.maxWidth > 600
            ? MobileHomeLayoutScope.mobileExpanded
            : MobileHomeLayoutScope.mobileCompact;

        if (layoutScope != state.layoutScope) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            ref
                .read(homeLayoutControllerProvider.notifier)
                .setLayoutScope(layoutScope);
          });
        }

        return Scaffold(
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTopBar(
                title: 'GuYanTools',
                trailing: IconButton(
                  icon: const Icon(Icons.refresh_rounded),
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  onPressed: () =>
                      ref.read(homeLayoutControllerProvider.notifier).refresh(),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
                child: _Header(state: state, clipboardCount: clipboardCount),
              ),
              const SizedBox(height: 14),
              _CategoryTabs(
                categories: state.categories,
                activeCategoryIndex: state.activeCategoryIndex,
                enabled: !_draggingHomeWidget,
                onTap: (index) => unawaited(_selectCategory(index)),
              ),
              const SizedBox(height: 10),
              Expanded(
                child: state.categories.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.fromLTRB(16, 0, 16, 96),
                        child: _HomeEmptyState(),
                      )
                    : PageView.builder(
                        controller: _pageController,
                        physics: _draggingHomeWidget
                            ? const NeverScrollableScrollPhysics()
                            : const PageScrollPhysics(),
                        itemCount: state.categories.length,
                        onPageChanged: _handlePageChanged,
                        itemBuilder: (context, index) {
                          final category = state.categories[index];
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
                            child: _CategoryGridSection(
                              category: category,
                              layoutScope: state.layoutScope,
                              clipboardCount: clipboardCount,
                              onDraggingChanged: _setDraggingHomeWidget,
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Header extends ConsumerWidget {
  final HomeLayoutUiState state;
  final int clipboardCount;

  const _Header({required this.state, required this.clipboardCount});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('工作台', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                '${state.categories.length} 个分类 · ${state.totalWidgetCount} 个组件 · $clipboardCount 条剪贴板历史',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
        Row(
          children: [
            _RoundButton(
              icon: Icons.restart_alt_rounded,
              color: cs.onSurfaceVariant,
              onTap: () => ref
                  .read(homeLayoutControllerProvider.notifier)
                  .resetActiveCategoryLayout(),
            ),
          ],
        ),
      ],
    );
  }
}

class _CategoryTabs extends StatelessWidget {
  final List<GridCategory> categories;
  final int activeCategoryIndex;
  final bool enabled;
  final ValueChanged<int> onTap;

  const _CategoryTabs({
    required this.categories,
    required this.activeCategoryIndex,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (categories.isEmpty) {
      return const SizedBox.shrink();
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        const minTabWidth = 96.0;
        final horizontalPadding = 16.0;
        final availableWidth = math.max(
          0.0,
          constraints.maxWidth - horizontalPadding * 2,
        );
        final fillWidth = availableWidth / categories.length;
        final tabWidth = math.max(minTabWidth, fillWidth);
        final cs = Theme.of(context).colorScheme;

        const tabRadius = BorderRadius.vertical(top: Radius.circular(16));
        return SizedBox(
          height: 48,
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            scrollDirection: Axis.horizontal,
            physics: enabled
                ? const BouncingScrollPhysics()
                : const NeverScrollableScrollPhysics(),
            itemCount: categories.length,
            itemBuilder: (context, index) {
              final category = categories[index];
              final active = index == activeCategoryIndex;
              return SizedBox(
                width: tabWidth,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Column(
                    children: [
                      Expanded(
                        child: Material(
                          color: Colors.transparent,
                          shape: const RoundedRectangleBorder(
                            borderRadius: tabRadius,
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            customBorder: const RoundedRectangleBorder(
                              borderRadius: tabRadius,
                            ),
                            onTap: enabled ? () => onTap(index) : null,
                            child: Center(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                ),
                                child: AnimatedDefaultTextStyle(
                                  duration: const Duration(milliseconds: 180),
                                  curve: Curves.easeOutCubic,
                                  style:
                                      Theme.of(
                                        context,
                                      ).textTheme.labelLarge?.copyWith(
                                        color: active
                                            ? cs.primary
                                            : cs.onSurfaceVariant,
                                        fontWeight: active
                                            ? FontWeight.w700
                                            : FontWeight.w500,
                                      ) ??
                                      TextStyle(
                                        color: active
                                            ? cs.primary
                                            : cs.onSurfaceVariant,
                                        fontWeight: active
                                            ? FontWeight.w700
                                            : FontWeight.w500,
                                      ),
                                  child: Text(
                                    category.label,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        curve: Curves.easeOutCubic,
                        height: 3,
                        width: double.infinity,
                        color: active ? cs.primary : Colors.transparent,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _CategoryGridSection extends StatelessWidget {
  final GridCategory category;
  final MobileHomeLayoutScope layoutScope;
  final int clipboardCount;
  final ValueChanged<bool> onDraggingChanged;

  const _CategoryGridSection({
    required this.category,
    required this.layoutScope,
    required this.clipboardCount,
    required this.onDraggingChanged,
  });

  @override
  Widget build(BuildContext context) {
    return _MobileGridBoard(
      key: ValueKey('${layoutScope.value}-${category.id}'),
      category: category,
      layoutScope: layoutScope,
      clipboardCount: clipboardCount,
      onDraggingChanged: onDraggingChanged,
    );
  }
}

class _MobileGridBoard extends ConsumerStatefulWidget {
  final GridCategory category;
  final MobileHomeLayoutScope layoutScope;
  final int clipboardCount;
  final ValueChanged<bool> onDraggingChanged;

  const _MobileGridBoard({
    super.key,
    required this.category,
    required this.layoutScope,
    required this.clipboardCount,
    required this.onDraggingChanged,
  });

  @override
  ConsumerState<_MobileGridBoard> createState() => _MobileGridBoardState();
}

class _MobileGridBoardState extends ConsumerState<_MobileGridBoard> {
  static const Duration _snapDuration = Duration(milliseconds: 210);

  late List<GridItem> _items;
  final GlobalKey _boardKey = GlobalKey();
  bool _saving = false;
  GridLayout? _layout;
  GridCollision? _collision;
  String? _draggingItemId;
  String? _settlingItemId;
  Offset? _draggingPosition;
  Map<String, int>? _placeholderPosition;
  Timer? _holdTimer;
  int? _activePointer;
  Offset _pointerOffset = Offset.zero;
  Map<String, int> _initialDragPosition = {'col': 1, 'row': 1};

  @override
  void initState() {
    super.initState();
    _items = widget.category.items.map((item) => item.copy()).toList();
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _MobileGridBoard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.category.id != widget.category.id ||
        oldWidget.layoutScope != widget.layoutScope ||
        oldWidget.category.items.length != widget.category.items.length ||
        oldWidget.category.items
                .map(
                  (item) =>
                      '${item.id}:${item.col}:${item.row}:${item.colSpan}:${item.rowSpan}:${item.priority}:${item.hidden}',
                )
                .join('|') !=
            widget.category.items
                .map(
                  (item) =>
                      '${item.id}:${item.col}:${item.row}:${item.colSpan}:${item.rowSpan}:${item.priority}:${item.hidden}',
                )
                .join('|')) {
      _items = widget.category.items.map((item) => item.copy()).toList();
    }
  }

  @override
  Widget build(BuildContext context) {
    final visibleItems = _items.where((item) => !item.hidden).toList()
      ..sort((a, b) {
        final priorityCompare = a.priority.compareTo(b.priority);
        if (priorityCompare != 0) {
          return priorityCompare;
        }
        return a.id.compareTo(b.id);
      });

    final config = widget.layoutScope == MobileHomeLayoutScope.mobileExpanded
        ? GridConfig.expanded
        : GridConfig.compact;

    return LayoutBuilder(
      builder: (context, constraints) {
        final boardWidth = constraints.maxWidth;
        final availableHeight = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : 600.0;
        final layout = GridLayout(config: config);
        layout.updateUnitSize(Size(boardWidth, availableHeight));
        _layout = layout;
        _ensureVerticalCapacity(layout, visibleItems);
        final collision = GridCollision(
          gridItems: visibleItems,
          layout: layout,
        );
        _collision = collision;

        final boardHeight = math.max(
          availableHeight,
          _computeBoardHeight(layout, visibleItems),
        );
        GridItem? placeholderItem;
        if (_placeholderPosition != null) {
          final activeId = _draggingItemId ?? _settlingItemId;
          for (final item in visibleItems) {
            if (item.id == activeId) {
              placeholderItem = item;
              break;
            }
          }
        }
        return SizedBox(
          key: _boardKey,
          width: double.infinity,
          height: boardHeight,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              if (placeholderItem != null)
                _buildDropPlaceholder(context, placeholderItem, layout),
              for (final item in _paintOrder(visibleItems))
                _buildGridTile(context, item, layout),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDropPlaceholder(
    BuildContext context,
    GridItem item,
    GridLayout layout,
  ) {
    final placeholder = _placeholderPosition;
    if (placeholder == null) {
      return const SizedBox.shrink();
    }

    final tileInset = layout.config.gridGap / 2;
    final left =
        layout.horizontalOffset +
        tileInset +
        (placeholder['col']! - 1) * layout.cellSize;
    final top =
        layout.config.gridPadding +
        tileInset +
        (placeholder['row']! - 1) * layout.cellSize;
    final width =
        item.colSpan * layout.unitSize +
        math.max(0, item.colSpan - 1) * layout.config.gridGap;
    final height =
        item.rowSpan * layout.unitSize +
        math.max(0, item.rowSpan - 1) * layout.config.gridGap;
    final cs = Theme.of(context).colorScheme;

    return AnimatedPositioned(
      key: const ValueKey('home-grid-drop-placeholder'),
      duration: _snapDuration,
      curve: Curves.easeOutCubic,
      left: left,
      top: top,
      width: width,
      height: height,
      child: IgnorePointer(
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            color: cs.primary.withValues(alpha: 0.06),
            boxShadow: [
              BoxShadow(
                color: cs.primary.withValues(alpha: 0.18),
                blurRadius: 22,
                spreadRadius: 1,
                offset: const Offset(0, 10),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGridTile(
    BuildContext context,
    GridItem item,
    GridLayout layout,
  ) {
    final draggingThisItem =
        _draggingItemId == item.id && _draggingPosition != null;
    final settlingThisItem = _settlingItemId == item.id;
    final tileInset = layout.config.gridGap / 2;
    final left =
        layout.horizontalOffset +
        tileInset +
        (draggingThisItem
            ? _draggingPosition!.dx
            : (item.col - 1) * layout.cellSize);
    final top =
        layout.config.gridPadding +
        tileInset +
        (draggingThisItem
            ? _draggingPosition!.dy
            : (item.row - 1) * layout.cellSize);
    final width =
        item.colSpan * layout.unitSize +
        math.max(0, item.colSpan - 1) * layout.config.gridGap;
    final height =
        item.rowSpan * layout.unitSize +
        math.max(0, item.rowSpan - 1) * layout.config.gridGap;

    final child = _HomeWidgetTile(
      item: item,
      clipboardCount: widget.clipboardCount,
      editMode: item.isDragging,
      tileWidth: width,
      tileHeight: height,
    );

    const tileRadius = BorderRadius.all(Radius.circular(14));

    return AnimatedPositioned(
      key: ValueKey('home-grid-positioned-${item.id}'),
      duration: draggingThisItem ? Duration.zero : _snapDuration,
      curve: Curves.easeOutCubic,
      left: left,
      top: top,
      width: width,
      height: height,
      child: Listener(
        key: ValueKey('home-grid-tile-${item.id}'),
        behavior: HitTestBehavior.opaque,
        onPointerDown: (event) => _scheduleDragStart(event, item, layout),
        onPointerMove: (event) => _updatePointerDrag(event, item, layout),
        onPointerUp: (_) => _finishPointerDrag(item, layout),
        onPointerCancel: (_) => _cancelPointerDrag(item),
        child: Stack(
          clipBehavior: Clip.none,
          fit: StackFit.expand,
          children: [
            settlingThisItem
                ? IgnorePointer(ignoring: true, child: child)
                : child,
            if (!settlingThisItem)
              Positioned.fill(
                child: _ImmediateInkTapLayer(
                  borderRadius: tileRadius,
                  onTap: item.isDragging ? null : () => _handleItemTap(item),
                  onDoubleTap: item.isDragging
                      ? null
                      : () => _showWidgetConfigSheet(context, item),
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _scheduleDragStart(
    PointerDownEvent event,
    GridItem item,
    GridLayout layout,
  ) {
    if (_settlingItemId != null) {
      return;
    }
    _holdTimer?.cancel();
    _activePointer = event.pointer;
    _pointerOffset = event.localPosition;
    _initialDragPosition = {'col': item.col, 'row': item.row};
    _holdTimer = Timer(Duration(milliseconds: layout.config.holdDelayMs), () {
      if (!mounted || _activePointer != event.pointer) {
        return;
      }
      widget.onDraggingChanged(true);
      setState(() {
        item.isDragging = true;
        item.hidden = false;
        _draggingItemId = item.id;
        _draggingPosition = Offset(
          (item.col - 1) * layout.cellSize,
          (item.row - 1) * layout.cellSize,
        );
        _placeholderPosition = {'col': item.col, 'row': item.row};
      });
    });
  }

  void _updatePointerDrag(
    PointerMoveEvent event,
    GridItem item,
    GridLayout layout,
  ) {
    if (_activePointer != event.pointer || _draggingItemId != item.id) {
      return;
    }
    final boardBox = _currentBoardBox();
    if (boardBox == null) {
      return;
    }
    final local = boardBox.globalToLocal(event.position);
    final tileInset = layout.config.gridGap / 2;
    final rawX =
        local.dx - layout.horizontalOffset - tileInset - _pointerOffset.dx;
    final rawY =
        local.dy - layout.config.gridPadding - tileInset - _pointerOffset.dy;
    final maxX = (layout.colNum - item.colSpan) * layout.cellSize;
    final maxY = (layout.rowNum - item.rowSpan) * layout.cellSize;
    final nextPosition = Offset(
      layout.clampCoordinate(rawX, 0, maxX > 0 ? maxX : 0),
      layout.clampCoordinate(rawY, 0, maxY > 0 ? maxY : 0),
    );
    final nextPlaceholder = _resolveDropPosition(item, layout, nextPosition);
    setState(() {
      _draggingPosition = nextPosition;
      _placeholderPosition = nextPlaceholder;
    });
  }

  Future<void> _finishPointerDrag(GridItem item, GridLayout layout) async {
    _holdTimer?.cancel();
    _holdTimer = null;
    _activePointer = null;
    if (_draggingItemId != item.id) {
      return;
    }
    await _finishDrag(item, layout);
  }

  Future<void> _finishDrag(GridItem item, GridLayout layout) async {
    if (_draggingItemId != item.id) {
      return;
    }
    final position =
        _draggingPosition ??
        Offset(
          (item.col - 1) * layout.cellSize,
          (item.row - 1) * layout.cellSize,
        );
    final finalPos = _resolveDropPosition(item, layout, position);
    final settlingId = item.id;
    if (!mounted) {
      return;
    }
    setState(() {
      item.col = finalPos['col']!;
      item.row = finalPos['row']!;
      item.preferredCol = finalPos['col']!;
      item.preferredRow = finalPos['row']!;
      item.isDragging = true;
      item.hidden = false;
      _draggingItemId = null;
      _settlingItemId = settlingId;
      _draggingPosition = null;
      _placeholderPosition = finalPos;
      _reflowItems();
    });
    await Future<void>.delayed(_snapDuration);
    if (!mounted || _settlingItemId != settlingId) {
      return;
    }
    setState(() {
      item.isDragging = false;
      _settlingItemId = null;
      _placeholderPosition = null;
    });
    widget.onDraggingChanged(false);
    await _persistLayout();
  }

  void _cancelPointerDrag(GridItem item) {
    _holdTimer?.cancel();
    _holdTimer = null;
    _activePointer = null;
    if (_draggingItemId != item.id) {
      return;
    }
    _cancelDrag(item);
  }

  void _cancelDrag(GridItem item) {
    if (_draggingItemId != item.id) {
      return;
    }
    setState(() {
      item.isDragging = false;
      _draggingItemId = null;
      _settlingItemId = null;
      _draggingPosition = null;
      _placeholderPosition = null;
    });
    widget.onDraggingChanged(false);
  }

  Map<String, int> _resolveDropPosition(
    GridItem item,
    GridLayout layout,
    Offset position,
  ) {
    final targetCol = layout
        .clampCoordinate(
          layout.toGridPosition(position.dx).toDouble(),
          1,
          (layout.colNum - item.colSpan + 1).toDouble(),
        )
        .toInt();
    final targetRow = layout
        .clampCoordinate(
          layout.toGridPosition(position.dy).toDouble(),
          1,
          (layout.rowNum - item.rowSpan + 1).toDouble(),
        )
        .toInt();
    return (_collision ?? GridCollision(gridItems: _items, layout: layout))
        .findAvailablePosition(
          item,
          targetCol,
          targetRow,
          _initialDragPosition,
        );
  }

  RenderBox? _currentBoardBox() {
    final boardContext = _boardKey.currentContext;
    final renderObject = boardContext?.findRenderObject();
    return renderObject is RenderBox ? renderObject : null;
  }

  List<GridItem> _paintOrder(List<GridItem> items) {
    return items.toList()..sort((a, b) {
      final activeId = _draggingItemId ?? _settlingItemId;
      if (a.id == activeId) {
        return 1;
      }
      if (b.id == activeId) {
        return -1;
      }
      return 0;
    });
  }

  Future<void> _persistLayout() async {
    if (_saving) {
      return;
    }
    setState(() => _saving = true);
    try {
      await ref
          .read(homeLayoutControllerProvider.notifier)
          .saveActiveCategoryLayout(_items);
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  void _handleItemTap(GridItem item) {
    final action = item.action;
    if (action == null) {
      return;
    }

    if (item.widgetType == 'todo') {
      context.push('/settings');
      return;
    }

    if (item.widgetType == 'shortcut' && item.label.contains('剪贴板')) {
      context.go('/clipboard');
      return;
    }

    switch (action.type) {
      case 'internal_route':
        if (action.target != null) {
          context.push(action.target!);
        }
        break;
      case 'open_webpage':
        if (action.url != null) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('移动端暂未接入网页窗口：${action.url}')));
        }
        break;
      default:
        if (item.label.contains('终端')) {
          context.push('/terminal');
        } else if (item.label.contains('剪贴板')) {
          context.go('/clipboard');
        } else {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('组件「${item.label}」暂未接入移动端操作')));
        }
    }
  }

  void _showWidgetConfigSheet(BuildContext context, GridItem item) {
    final cs = Theme.of(context).colorScheme;
    final configText = item.widgetConfig == null || item.widgetConfig!.isEmpty
        ? '暂无配置'
        : item.widgetConfig.toString();

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: cs.surfaceContainerLowest,
      builder: (context) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.label, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 14),
              _ConfigRow(label: '类型', value: item.widgetType),
              _ConfigRow(label: '来源', value: item.sourceType),
              _ConfigRow(
                label: '尺寸',
                value: '${item.colSpan} x ${item.rowSpan}',
              ),
              _ConfigRow(label: '位置', value: '${item.col}, ${item.row}'),
              const SizedBox(height: 12),
              Text('配置', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                constraints: const BoxConstraints(maxHeight: 180),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: cs.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: SingleChildScrollView(
                  child: Text(
                    configText,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _ensureVerticalCapacity(GridLayout layout, List<GridItem> items) {
    if (items.isEmpty) {
      layout.rowNum = 4;
      return;
    }
    final maxRow = items
        .map((item) => item.preferredRow + item.rowSpan)
        .reduce(math.max);
    layout.rowNum = math.max(layout.rowNum, maxRow + 1);
  }

  double _computeBoardHeight(GridLayout layout, List<GridItem> items) {
    final maxRowEnd = items.isEmpty
        ? 4
        : items.map((item) => item.row + item.rowSpan - 1).reduce(math.max);
    final rows = math.max(layout.rowNum, maxRowEnd + 1);
    final gridHeight =
        rows * layout.unitSize + math.max(0, rows - 1) * layout.config.gridGap;
    return gridHeight + layout.config.gridPadding * 2;
  }

  void _reflowItems() {
    final visibleItems = _items.where((item) => !item.hidden).toList()
      ..sort((a, b) {
        final priorityCompare = a.priority.compareTo(b.priority);
        if (priorityCompare != 0) {
          return priorityCompare;
        }
        return a.id.compareTo(b.id);
      });

    if (_layout == null || _collision == null) {
      return;
    }

    final layout = _layout!;
    final occupancy = List.generate(
      math.max(layout.rowNum + 8, 12),
      (_) => List<String?>.filled(layout.colNum, null),
    );

    for (final item in visibleItems) {
      final targetCol = item.preferredCol;
      final targetRow = item.preferredRow;
      if (_collision!.canPlaceAt(occupancy, item, targetCol, targetRow)) {
        item.col = targetCol;
        item.row = targetRow;
        _collision!.occupySlot(occupancy, item, targetCol, targetRow);
        continue;
      }

      final fallback = _collision!.findAvailablePosition(
        item,
        targetCol,
        targetRow,
        {'col': item.col, 'row': item.row},
      );
      item.col = fallback['col']!;
      item.row = fallback['row']!;
      item.preferredCol = fallback['col']!;
      item.preferredRow = fallback['row']!;
      _collision!.occupySlot(occupancy, item, item.col, item.row);
    }
  }
}

class _ImmediateInkTapLayer extends StatefulWidget {
  final BorderRadius borderRadius;
  final VoidCallback? onTap;
  final VoidCallback? onDoubleTap;

  const _ImmediateInkTapLayer({
    required this.borderRadius,
    required this.onTap,
    required this.onDoubleTap,
  });

  @override
  State<_ImmediateInkTapLayer> createState() => _ImmediateInkTapLayerState();
}

class _ImmediateInkTapLayerState extends State<_ImmediateInkTapLayer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _rippleController;
  Offset? _rippleOrigin;

  @override
  void initState() {
    super.initState();
    _rippleController =
        AnimationController(
          vsync: this,
          duration: const Duration(milliseconds: 420),
        )..addStatusListener((status) {
          if (status == AnimationStatus.completed && mounted) {
            setState(() => _rippleOrigin = null);
          }
        });
  }

  @override
  void dispose() {
    _rippleController.dispose();
    super.dispose();
  }

  void _startRipple(PointerDownEvent event) {
    if (widget.onTap == null && widget.onDoubleTap == null) {
      return;
    }
    setState(() => _rippleOrigin = event.localPosition);
    _rippleController.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final rippleColor = Theme.of(
      context,
    ).colorScheme.primary.withValues(alpha: 0.24);

    return ClipRRect(
      borderRadius: widget.borderRadius,
      child: Listener(
        behavior: HitTestBehavior.opaque,
        onPointerDown: _startRipple,
        child: Stack(
          fit: StackFit.expand,
          children: [
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: widget.onTap,
              onDoubleTap: widget.onDoubleTap,
            ),
            if (_rippleOrigin != null)
              Positioned.fill(
                child: IgnorePointer(
                  child: AnimatedBuilder(
                    animation: _rippleController,
                    builder: (context, _) {
                      return CustomPaint(
                        painter: _ImmediateRipplePainter(
                          origin: _rippleOrigin!,
                          progress: _rippleController.value,
                          color: rippleColor,
                        ),
                      );
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ImmediateRipplePainter extends CustomPainter {
  final Offset origin;
  final double progress;
  final Color color;

  const _ImmediateRipplePainter({
    required this.origin,
    required this.progress,
    required this.color,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final maxRadius = math.sqrt(
      size.width * size.width + size.height * size.height,
    );
    final easedProgress = Curves.easeOutCubic.transform(progress);
    final radius = 14 + (maxRadius - 14) * easedProgress;
    final fadeProgress = progress <= 0.55 ? 0.0 : (progress - 0.55) / 0.45;
    final opacity = (1 - Curves.easeOut.transform(fadeProgress)).clamp(
      0.0,
      1.0,
    );
    final paint = Paint()..color = color.withValues(alpha: color.a * opacity);
    canvas.drawCircle(origin, radius, paint);
  }

  @override
  bool shouldRepaint(covariant _ImmediateRipplePainter oldDelegate) {
    return oldDelegate.origin != origin ||
        oldDelegate.progress != progress ||
        oldDelegate.color != color;
  }
}

class _HomeWidgetTile extends StatelessWidget {
  final GridItem item;
  final int clipboardCount;
  final bool editMode;
  final double tileWidth;
  final double tileHeight;

  const _HomeWidgetTile({
    required this.item,
    required this.clipboardCount,
    required this.editMode,
    required this.tileWidth,
    required this.tileHeight,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = _resolveAccentColor(cs);
    final compact = tileHeight < 120;
    final showSubtitle = tileHeight >= 84 && tileWidth >= 126;
    final showTerminalPreview =
        !compact &&
        item.widgetType == 'shortcut' &&
        item.label.contains('终端') &&
        tileHeight >= 210;

    return AppCard(
      onTap: null,
      padding: EdgeInsets.zero,
      color: item.widgetType == 'shortcut' && item.label.contains('终端')
          ? AppColors.terminal
          : cs.surfaceContainerLowest,
      child: DecoratedBox(
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(14)),
        child: Padding(
          padding: EdgeInsets.all(compact ? 10 : 14),
          child: compact
              ? _CompactTileContent(
                  icon: _resolveIcon(),
                  accent: accent,
                  terminalStyle:
                      item.widgetType == 'shortcut' &&
                      item.label.contains('终端'),
                  label: item.label,
                  subtitle: showSubtitle ? _buildSubtitle() : null,
                  editMode: editMode,
                  textColor:
                      item.widgetType == 'shortcut' && item.label.contains('终端')
                      ? AppColors.inverseOnSurface
                      : cs.onSurface,
                  subtitleColor:
                      item.widgetType == 'shortcut' && item.label.contains('终端')
                      ? AppColors.inverseOnSurface.withValues(alpha: 0.72)
                      : cs.onSurfaceVariant,
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Stack(
                        children: [
                          if (editMode)
                            Positioned(
                              top: 0,
                              right: 0,
                              child: Icon(
                                Icons.drag_indicator_rounded,
                                size: 18,
                                color: cs.onSurfaceVariant,
                              ),
                            )
                          else if (item.widgetType == 'shortcut' &&
                              item.label.contains('剪贴板'))
                            Positioned(
                              top: 0,
                              right: 0,
                              child: _ChipLabel(label: '$clipboardCount 条'),
                            ),
                          Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                _IconTile(
                                  icon: _resolveIcon(),
                                  color: accent,
                                  terminalStyle:
                                      item.widgetType == 'shortcut' &&
                                      item.label.contains('终端'),
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  item.label,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.titleSmall
                                      ?.copyWith(
                                        color:
                                            item.widgetType == 'shortcut' &&
                                                item.label.contains('终端')
                                            ? AppColors.inverseOnSurface
                                            : cs.onSurface,
                                        fontWeight: FontWeight.w700,
                                      ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _buildSubtitle(),
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodySmall
                                      ?.copyWith(
                                        color:
                                            item.widgetType == 'shortcut' &&
                                                item.label.contains('终端')
                                            ? AppColors.inverseOnSurface
                                                  .withValues(alpha: 0.72)
                                            : cs.onSurfaceVariant,
                                      ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (showTerminalPreview) ...[
                      const SizedBox(height: 10),
                      Expanded(
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(
                              alpha: isDark ? 0.24 : 0.18,
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            'root@guyantools : ~ \$ systemctl status dashboard\n'
                            '● dashboard.service - Main Dashboard UI\n'
                            'Active: active (running)',
                            maxLines: 4,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.inverseOnSurface,
                              fontFamily: 'monospace',
                              fontSize: 11,
                              height: 1.35,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
        ),
      ),
    );
  }

  IconData _resolveIcon() {
    if (item.label.contains('终端')) return Icons.terminal_rounded;
    if (item.label.contains('剪贴板')) return Icons.content_paste_rounded;
    if (item.label.contains('FTP')) return Icons.folder_open_rounded;
    if (item.label.contains('Web')) return Icons.language_rounded;
    if (item.label.contains('通知')) return Icons.notifications_outlined;
    if (item.label.contains('Todo')) return Icons.checklist_rounded;
    switch (item.widgetType) {
      case 'weather':
        return Icons.wb_sunny_outlined;
      case 'todo':
        return Icons.check_circle_outline;
      case 'date':
        return Icons.calendar_month_outlined;
      case 'pomodoro':
        return Icons.timer_outlined;
      default:
        return Icons.widgets_outlined;
    }
  }

  Color _resolveAccentColor(ColorScheme cs) {
    if (item.widgetType == 'shortcut' && item.label.contains('终端')) {
      return cs.primaryContainer;
    }
    if (item.widgetType == 'todo') return cs.tertiary;
    if (item.widgetType == 'weather') return cs.primary;
    return cs.primary;
  }

  String _buildSubtitle() {
    if (item.widgetType == 'shortcut' && item.label.contains('剪贴板')) {
      return '同步查看剪贴板历史';
    }
    if (item.widgetType == 'shortcut' && item.label.contains('终端')) {
      return '快速进入本地终端会话';
    }
    if (item.widgetType == 'todo') {
      return '待办视图与快速操作';
    }
    if (item.widgetType == 'weather') {
      return '天气组件';
    }
    return '${item.sourceType} · ${item.widgetType}';
  }
}

class _ConfigRow extends StatelessWidget {
  final String label;
  final String value;

  const _ConfigRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          SizedBox(
            width: 64,
            child: Text(label, style: Theme.of(context).textTheme.labelMedium),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: cs.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactTileContent extends StatelessWidget {
  final IconData icon;
  final Color accent;
  final bool terminalStyle;
  final String label;
  final String? subtitle;
  final bool editMode;
  final Color textColor;
  final Color subtitleColor;

  const _CompactTileContent({
    required this.icon,
    required this.accent,
    required this.terminalStyle,
    required this.label,
    required this.subtitle,
    required this.editMode,
    required this.textColor,
    required this.subtitleColor,
  });

  @override
  Widget build(BuildContext context) {
    final content = Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _IconTile(
          icon: icon,
          color: accent,
          terminalStyle: terminalStyle,
          compact: true,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: textColor,
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: subtitleColor),
                ),
              ],
            ],
          ),
        ),
      ],
    );

    if (!editMode) {
      return Center(child: content);
    }

    return Stack(
      children: [
        Center(child: content),
        Positioned(
          top: 0,
          right: 0,
          child: Icon(
            Icons.drag_indicator_rounded,
            size: 18,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _IconTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final bool terminalStyle;
  final bool compact;

  const _IconTile({
    required this.icon,
    required this.color,
    this.terminalStyle = false,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: compact ? 34 : 38,
      height: compact ? 34 : 38,
      decoration: BoxDecoration(
        color: terminalStyle
            ? Colors.white.withValues(alpha: 0.08)
            : cs.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(icon, size: compact ? 18 : 20, color: color),
    );
  }
}

class _ChipLabel extends StatelessWidget {
  final String label;

  const _ChipLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}

class _HomeEmptyState extends StatelessWidget {
  const _HomeEmptyState();

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: SizedBox(
        height: 240,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.dashboard_customize_outlined,
                size: 36,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 12),
              Text(
                '当前工作台还没有分类',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 6),
              Text(
                '等首页布局数据准备好后，这里会显示真实组件网格。',
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeErrorState extends StatelessWidget {
  final String message;

  const _HomeErrorState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: AppCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline_rounded,
              size: 36,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 12),
            Text('首页布局加载失败', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              message,
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _RoundButton({
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: cs.surfaceContainer,
          shape: BoxShape.circle,
          border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.25)),
        ),
        child: Icon(icon, size: 20, color: color),
      ),
    );
  }
}
