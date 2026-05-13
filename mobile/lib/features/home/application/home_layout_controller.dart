import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/grid_item.dart';
import '../data/rust_home_layout_repository.dart';
import 'home_layout_state.dart';

final homeLayoutRepositoryProvider = Provider<RustHomeLayoutRepository>(
  (ref) => RustHomeLayoutRepository(),
);

final homeApplicationDocumentsDirectoryProvider = FutureProvider<Directory>(
  (ref) => getApplicationDocumentsDirectory(),
);

final homeLayoutControllerProvider =
    AsyncNotifierProvider<HomeLayoutController, HomeLayoutUiState>(
      HomeLayoutController.new,
    );

class HomeLayoutController extends AsyncNotifier<HomeLayoutUiState> {
  late final RustHomeLayoutRepository _repository;

  @override
  Future<HomeLayoutUiState> build() async {
    _repository = ref.watch(homeLayoutRepositoryProvider);
    final appDir = await ref.watch(
      homeApplicationDocumentsDirectoryProvider.future,
    );
    _repository.init(_resolveDbPath(appDir.path));
    final scope = MobileHomeLayoutScope.mobileCompact;
    final initial = await _loadState(scope: scope);
    return initial;
  }

  Future<void> refresh() async {
    final current = state.value;
    final nextScope =
        current?.layoutScope ?? MobileHomeLayoutScope.mobileCompact;
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _loadState(scope: nextScope));
  }

  Future<void> setLayoutScope(MobileHomeLayoutScope scope) async {
    final current = state.value;
    if (current == null || current.layoutScope == scope) {
      return;
    }
    state = AsyncData(current.copyWith(layoutScope: scope));
    try {
      final next = await _loadState(
        scope: scope,
        preserveEditMode: current.editMode,
        query: current.query,
      );
      state = AsyncData(next);
    } catch (error, stackTrace) {
      state = AsyncError(error, stackTrace);
    }
  }

  void setActiveCategory(int index) {
    final current = state.value;
    if (current == null) return;
    final nextIndex = index.clamp(0, current.categories.length - 1);
    state = AsyncData(
      current.copyWith(activeCategoryIndex: nextIndex, clearError: true),
    );
  }

  void setQuery(String query) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(current.copyWith(query: query, clearError: true));
  }

  void toggleEditMode() {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(editMode: !current.editMode, clearError: true),
    );
  }

  Future<void> saveActiveCategoryLayout(List<GridItem> items) async {
    final current = state.value;
    final activeCategory = current?.activeCategory;
    if (current == null || activeCategory == null) {
      return;
    }

    final categoryId = activeCategory.id;
    final normalizedItems = items.map((item) => item.copy()).toList()
      ..sort((a, b) {
        final priorityCompare = a.priority.compareTo(b.priority);
        if (priorityCompare != 0) {
          return priorityCompare;
        }
        return a.id.compareTo(b.id);
      });

    await _repository.saveCategoryLayout(
      workspaceKey: current.workspaceKey,
      layoutScope: current.layoutScope,
      categoryId: categoryId,
      widgets: normalizedItems,
    );

    final updatedCategories = current.categories.map((category) {
      if (category.id != categoryId) {
        return category;
      }
      return category.copyWith(items: normalizedItems);
    }).toList();

    state = AsyncData(
      current.copyWith(categories: updatedCategories, clearError: true),
    );
  }

  Future<void> resetActiveCategoryLayout() async {
    final current = state.value;
    final activeCategory = current?.activeCategory;
    if (current == null || activeCategory == null) {
      return;
    }

    await _repository.resetCategoryLayout(
      workspaceKey: current.workspaceKey,
      layoutScope: current.layoutScope,
      categoryId: activeCategory.id,
    );

    final next = await _loadState(
      scope: current.layoutScope,
      preserveEditMode: current.editMode,
      activeCategoryId: activeCategory.id,
      query: current.query,
    );
    state = AsyncData(next);
  }

  Future<HomeLayoutUiState> _loadState({
    required MobileHomeLayoutScope scope,
    bool preserveEditMode = false,
    String? activeCategoryId,
    String query = '',
  }) async {
    final layout = await _repository.loadLayout(
      workspaceKey: 'default',
      layoutScope: scope,
    );
    final categories = layout.categories.map(GridCategory.fromBridge).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    final activeIndex = _resolveActiveCategoryIndex(
      categories,
      activeCategoryId,
    );
    return HomeLayoutUiState(
      workspaceKey: layout.workspaceKey,
      categories: categories,
      activeCategoryIndex: activeIndex,
      layoutScope: scope,
      editMode: preserveEditMode,
      query: query,
    );
  }

  int _resolveActiveCategoryIndex(
    List<GridCategory> categories,
    String? activeCategoryId,
  ) {
    if (categories.isEmpty) {
      return 0;
    }
    if (activeCategoryId == null) {
      return 0;
    }
    final index = categories.indexWhere(
      (category) => category.id == activeCategoryId,
    );
    return index >= 0 ? index : 0;
  }

  String _resolveDbPath(String appDirPath) {
    return '$appDirPath${Platform.pathSeparator}guyantools.db';
  }
}
