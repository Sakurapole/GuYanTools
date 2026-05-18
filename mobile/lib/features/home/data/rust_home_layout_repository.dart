import 'dart:async';

import '../../../bridge/bindings/mobile_api.dart' as bridge;
import '../../../bridge/models/home_layout.dart' as frb;
import '../../../core/grid_item.dart';
import '../../../core/rust_bridge_initializer.dart';

abstract class HomeLayoutCoreBridge {
  Future<frb.HomeLayout> getMobileHomeLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
  });

  Future<frb.HomeLayoutCategory> saveMobileCategoryLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required frb.SaveMobileHomeCategoryLayoutInput input,
  });

  Future<frb.HomeLayoutCategory> resetMobileCategoryLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required String categoryId,
  });
}

class RustHomeLayoutRepository {
  final HomeLayoutCoreBridge _bridge;
  String? _dbPath;

  RustHomeLayoutRepository({HomeLayoutCoreBridge? bridge})
    : _bridge = bridge ?? FlutterRustHomeLayoutCoreBridge();

  void init(String dbPath) {
    _dbPath = dbPath;
  }

  String get dbPath =>
      _dbPath ?? (throw StateError('Home layout db path not initialized'));

  Future<frb.HomeLayout> loadLayout({
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
  }) {
    return _bridge.getMobileHomeLayout(
      dbPath: dbPath,
      workspaceKey: workspaceKey,
      layoutScope: layoutScope,
    );
  }

  Future<frb.HomeLayoutCategory> saveCategoryLayout({
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required String categoryId,
    required List<GridItem> widgets,
  }) {
    return _bridge.saveMobileCategoryLayout(
      dbPath: dbPath,
      workspaceKey: workspaceKey,
      layoutScope: layoutScope,
      input: frb.SaveMobileHomeCategoryLayoutInput(
        categoryId: categoryId,
        widgets: widgets.map((item) => item.toLayoutInput()).toList(),
      ),
    );
  }

  Future<frb.HomeLayoutCategory> resetCategoryLayout({
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required String categoryId,
  }) {
    return _bridge.resetMobileCategoryLayout(
      dbPath: dbPath,
      workspaceKey: workspaceKey,
      layoutScope: layoutScope,
      categoryId: categoryId,
    );
  }
}

class FlutterRustHomeLayoutCoreBridge implements HomeLayoutCoreBridge {
  Future<void> _ensureInitialized() {
    return RustBridgeInitializer.ensureInitialized();
  }

  @override
  Future<frb.HomeLayout> getMobileHomeLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
  }) async {
    await _ensureInitialized();
    return bridge.getMobileHomeLayout(
      dbPath: dbPath,
      workspaceKey: workspaceKey,
      layoutScope: layoutScope.value,
    );
  }

  @override
  Future<frb.HomeLayoutCategory> saveMobileCategoryLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required frb.SaveMobileHomeCategoryLayoutInput input,
  }) async {
    await _ensureInitialized();
    return bridge.saveMobileCategoryLayout(
      dbPath: dbPath,
      workspaceKey: workspaceKey,
      layoutScope: layoutScope.value,
      input: input,
    );
  }

  @override
  Future<frb.HomeLayoutCategory> resetMobileCategoryLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required String categoryId,
  }) async {
    await _ensureInitialized();
    return bridge.resetMobileCategoryLayout(
      dbPath: dbPath,
      workspaceKey: workspaceKey,
      layoutScope: layoutScope.value,
      categoryId: categoryId,
    );
  }
}

class InMemoryHomeLayoutCoreBridge implements HomeLayoutCoreBridge {
  frb.HomeLayout layout;

  InMemoryHomeLayoutCoreBridge({required this.layout});

  @override
  Future<frb.HomeLayout> getMobileHomeLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
  }) async {
    return layout;
  }

  @override
  Future<frb.HomeLayoutCategory> resetMobileCategoryLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required String categoryId,
  }) async {
    return layout.categories.firstWhere(
      (category) => category.id == categoryId,
    );
  }

  @override
  Future<frb.HomeLayoutCategory> saveMobileCategoryLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required frb.SaveMobileHomeCategoryLayoutInput input,
  }) async {
    return layout.categories.firstWhere(
      (category) => category.id == input.categoryId,
    );
  }
}
