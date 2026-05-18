import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bridge/models/home_layout.dart' as frb;
import 'package:mobile/core/grid_item.dart';
import 'package:mobile/features/home/application/home_layout_controller.dart';
import 'package:mobile/features/home/data/rust_home_layout_repository.dart';

void main() {
  late Directory tempDir;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp(
      'home_layout_controller_test_',
    );
  });

  tearDown(() async {
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  test('loads categories and switches scope', () async {
    final compactLayout = _buildLayout(col: 1, label: '终端面板');
    final expandedLayout = _buildLayout(col: 3, label: '终端面板');
    final bridge = _FakeHomeLayoutBridge(
      layouts: {
        MobileHomeLayoutScope.mobileCompact.value: compactLayout,
        MobileHomeLayoutScope.mobileExpanded.value: expandedLayout,
      },
    );

    final container = ProviderContainer(
      overrides: [
        homeApplicationDocumentsDirectoryProvider.overrideWith(
          (ref) async => tempDir,
        ),
        homeLayoutRepositoryProvider.overrideWith(
          (ref) => RustHomeLayoutRepository(bridge: bridge),
        ),
      ],
    );
    addTearDown(container.dispose);

    final initial = await container.read(homeLayoutControllerProvider.future);
    expect(initial.categories.length, 1);
    expect(initial.activeCategory?.label, '常用工具');
    expect(initial.activeCategory?.items.first.col, 1);

    await container
        .read(homeLayoutControllerProvider.notifier)
        .setLayoutScope(MobileHomeLayoutScope.mobileExpanded);

    final next = container.read(homeLayoutControllerProvider).requireValue;
    expect(next.layoutScope, MobileHomeLayoutScope.mobileExpanded);
    expect(next.activeCategory?.items.first.col, 3);
  });
}

class _FakeHomeLayoutBridge implements HomeLayoutCoreBridge {
  final Map<String, frb.HomeLayout> layouts;

  _FakeHomeLayoutBridge({required this.layouts});

  @override
  Future<frb.HomeLayout> getMobileHomeLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
  }) async {
    return layouts[layoutScope.value]!;
  }

  @override
  Future<frb.HomeLayoutCategory> resetMobileCategoryLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required String categoryId,
  }) async {
    return layouts[layoutScope.value]!.categories.first;
  }

  @override
  Future<frb.HomeLayoutCategory> saveMobileCategoryLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required frb.SaveMobileHomeCategoryLayoutInput input,
  }) async {
    return layouts[layoutScope.value]!.categories.first;
  }
}

frb.HomeLayout _buildLayout({required int col, required String label}) {
  return frb.HomeLayout(
    workspaceKey: 'default',
    categories: [
      frb.HomeLayoutCategory(
        id: 'category-tools',
        workspaceId: 1,
        label: '常用工具',
        icon: 'category-tools',
        sortOrder: 1,
        backgroundColor: null,
        backgroundImage: null,
        backgroundVideo: null,
        backgroundStyle: null,
        widgets: [
          frb.HomeWidget(
            id: 'grid-item-terminal',
            workspaceId: 1,
            categoryId: 'category-tools',
            label: label,
            icon: 'terminal',
            action: '{"type":"internal_route","target":"/terminal"}',
            sourceType: 'shortcut',
            widgetType: 'shortcut',
            sizePreset: '4x2',
            widgetConfig: null,
            col: col,
            row: 1,
            colSpan: 2,
            rowSpan: 2,
            preferredCol: col,
            preferredRow: 1,
            priority: 1,
            color: 'linear-gradient(135deg, #5c9ded, #84c9ff)',
            backgroundImage: null,
            backgroundVideo: null,
            backgroundStyle: null,
            hidden: false,
            createdAt: '2026-05-12T00:00:00Z',
            updatedAt: '2026-05-12T00:00:00Z',
          ),
        ],
      ),
    ],
  );
}
