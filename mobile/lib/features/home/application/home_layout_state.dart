import '../../../core/grid_item.dart';

class HomeLayoutUiState {
  final String workspaceKey;
  final List<GridCategory> categories;
  final int activeCategoryIndex;
  final MobileHomeLayoutScope layoutScope;
  final bool editMode;
  final String query;
  final String? error;

  const HomeLayoutUiState({
    required this.workspaceKey,
    required this.categories,
    required this.activeCategoryIndex,
    required this.layoutScope,
    required this.editMode,
    required this.query,
    this.error,
  });

  const HomeLayoutUiState.initial({required this.layoutScope})
    : workspaceKey = 'default',
      categories = const [],
      activeCategoryIndex = 0,
      editMode = false,
      query = '',
      error = null;

  GridCategory? get activeCategory {
    if (categories.isEmpty) {
      return null;
    }
    final index = activeCategoryIndex.clamp(0, categories.length - 1);
    return categories[index];
  }

  int get visibleWidgetCount =>
      activeCategory?.items.where((item) => !item.hidden).length ?? 0;

  int get totalWidgetCount => categories.fold(
    0,
    (sum, category) =>
        sum + category.items.where((item) => !item.hidden).length,
  );

  List<GridItem> get visibleItems {
    final items = activeCategory?.items ?? const <GridItem>[];
    final normalizedQuery = query.trim().toLowerCase();
    return items.where((item) {
      if (item.hidden) {
        return false;
      }
      if (normalizedQuery.isEmpty) {
        return true;
      }
      return item.label.toLowerCase().contains(normalizedQuery) ||
          item.widgetType.toLowerCase().contains(normalizedQuery);
    }).toList();
  }

  HomeLayoutUiState copyWith({
    String? workspaceKey,
    List<GridCategory>? categories,
    int? activeCategoryIndex,
    MobileHomeLayoutScope? layoutScope,
    bool? editMode,
    String? query,
    String? error,
    bool clearError = false,
  }) {
    return HomeLayoutUiState(
      workspaceKey: workspaceKey ?? this.workspaceKey,
      categories: categories ?? this.categories,
      activeCategoryIndex: activeCategoryIndex ?? this.activeCategoryIndex,
      layoutScope: layoutScope ?? this.layoutScope,
      editMode: editMode ?? this.editMode,
      query: query ?? this.query,
      error: clearError ? null : (error ?? this.error),
    );
  }
}
