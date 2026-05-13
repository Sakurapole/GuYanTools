import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app.dart';
import 'package:mobile/app/router.dart';
import 'package:mobile/bridge/models/home_layout.dart' as frb;
import 'package:mobile/core/grid_item.dart';
import 'package:mobile/features/clipboard/application/clipboard_controller.dart';
import 'package:mobile/features/clipboard/application/clipboard_state.dart';
import 'package:mobile/features/clipboard/data/rust_clipboard_repository.dart';
import 'package:mobile/features/home/application/home_layout_controller.dart';
import 'package:mobile/features/home/data/rust_home_layout_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late Directory tempDir;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    appRouter.go('/');
    tempDir = await Directory.systemTemp.createTemp('guyantools_mobile_test_');
  });

  tearDown(() async {
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  testWidgets('renders Stitch shell navigation and clipboard empty state', (
    tester,
  ) async {
    await tester.pumpWidget(_TestApp(tempDir: tempDir));
    await _pumpReady(tester);

    expect(find.text('首页'), findsOneWidget);
    expect(find.text('剪贴板'), findsWidgets);
    expect(find.text('设置'), findsOneWidget);
    expect(find.text('工作台'), findsOneWidget);
    expect(find.text('常用工具'), findsWidgets);
    expect(find.text('搜索组件、命令或插件...'), findsNothing);
    expect(find.byKey(const ValueKey('home-grid-background')), findsNothing);
    expect(find.byIcon(Icons.home_outlined), findsOneWidget);
    expect(find.byIcon(Icons.home), findsNothing);
    final activeNav = tester.widget<AnimatedContainer>(
      find.byKey(const ValueKey('nav-container-0')),
    );
    final activeNavDecoration = activeNav.decoration as BoxDecoration?;
    expect(activeNavDecoration?.color, Colors.transparent);

    await tester.tap(find.byKey(const ValueKey('nav-1')));
    await _pumpUntilText(tester, '全部');
    expect(appRouter.routeInformationProvider.value.uri.path, '/clipboard');
    final navError = tester.takeException();
    if (navError != null) {
      fail('navigation failed: $navError');
    }

    expect(find.text('剪贴板'), findsWidgets);
    expect(find.text('全部'), findsOneWidget);
    expect(find.text('文件'), findsWidgets);
    expect(find.text('暂无剪贴板记录'), findsOneWidget);
  });

  testWidgets(
    'renders terminal tile on home and terminal route remains reachable',
    (tester) async {
      await tester.pumpWidget(_TestApp(tempDir: tempDir));
      await _pumpReady(tester);

      expect(find.text('终端面板'), findsOneWidget);

      appRouter.push('/terminal');
      await tester.pumpAndSettle();

      expect(find.text('模拟终端'), findsWidgets);
      expect(find.text('git status'), findsOneWidget);
      expect(find.text('pnpm build'), findsOneWidget);
    },
  );

  testWidgets('renders one-row home grid tiles without overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _TestApp(tempDir: tempDir, homeLayout: _buildCompactTileLayout()),
    );
    await _pumpReady(tester);

    expect(find.text('API'), findsOneWidget);
    expect(find.text('编辑器'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('switches home categories by tab and horizontal swipe', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _TestApp(tempDir: tempDir, homeLayout: _buildMultiCategoryLayout()),
    );
    await _pumpReady(tester);

    expect(find.text('API'), findsOneWidget);
    expect(find.text('知识库'), findsNothing);

    await tester.tap(find.text('扩展能力'));
    await tester.pumpAndSettle();
    expect(find.text('知识库'), findsOneWidget);

    await tester.drag(find.byType(PageView), const Offset(320, 0));
    await tester.pumpAndSettle();
    expect(find.text('API'), findsOneWidget);
  });

  testWidgets('jumps directly to a non-adjacent home category tab', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _TestApp(tempDir: tempDir, homeLayout: _buildThreeCategoryLayout()),
    );
    await _pumpReady(tester);

    expect(find.text('API'), findsOneWidget);
    expect(find.text('知识库'), findsNothing);
    expect(find.text('调试器'), findsNothing);

    await tester.tap(find.text('开发工具'));
    await tester.pumpAndSettle();

    expect(find.text('调试器'), findsOneWidget);
    expect(find.text('知识库'), findsNothing);
  });

  testWidgets('double tap opens read-only widget config sheet', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _TestApp(tempDir: tempDir, homeLayout: _buildCompactTileLayout()),
    );
    await _pumpReady(tester);

    final tileFinder = find.byKey(const Key('home-grid-tile-grid-item-api'));
    await tester.tap(tileFinder);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.tap(tileFinder);
    await tester.pumpAndSettle();

    expect(find.text('API'), findsWidgets);
    expect(find.text('类型'), findsOneWidget);
    expect(find.text('shortcut'), findsWidgets);
    expect(find.text('尺寸'), findsOneWidget);
  });

  testWidgets('long press drag saves current category layout', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final bridge = _FakeHomeLayoutBridge(layout: _buildCompactTileLayout());

    await tester.pumpWidget(_TestApp(tempDir: tempDir, homeBridge: bridge));
    await _pumpReady(tester);

    final tileFinder = find.byKey(const Key('home-grid-tile-grid-item-api'));
    await tester.ensureVisible(tileFinder);
    await tester.pumpAndSettle();
    final gesture = await tester.startGesture(tester.getCenter(tileFinder));
    await tester.pump(kLongPressTimeout + const Duration(milliseconds: 100));
    await gesture.moveBy(const Offset(80, 80));
    await tester.pump();
    expect(find.byKey(const ValueKey('home-grid-background')), findsNothing);
    expect(
      find.byKey(const ValueKey('home-grid-drop-placeholder')),
      findsOneWidget,
    );
    await gesture.up();
    await tester.pumpAndSettle();

    expect(bridge.savedLayouts, isNotEmpty);
    expect(
      find.byKey(const ValueKey('home-grid-drop-placeholder')),
      findsNothing,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('dragging a home widget does not switch category pages', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final bridge = _FakeHomeLayoutBridge(layout: _buildMultiCategoryLayout());

    await tester.pumpWidget(_TestApp(tempDir: tempDir, homeBridge: bridge));
    await _pumpReady(tester);

    final tileFinder = find.byKey(const Key('home-grid-tile-grid-item-api'));
    final gesture = await tester.startGesture(tester.getCenter(tileFinder));
    await tester.pump(kLongPressTimeout + const Duration(milliseconds: 100));
    await gesture.moveBy(const Offset(-260, 12));
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();

    expect(find.text('API'), findsOneWidget);
    expect(find.text('知识库'), findsNothing);
    expect(bridge.savedLayouts, isNotEmpty);
  });

  testWidgets('dismisses settings input dialogs without framework errors', (
    tester,
  ) async {
    await tester.pumpWidget(_TestApp(tempDir: tempDir));
    await _pumpReady(tester);

    await tester.tap(find.byKey(const ValueKey('nav-2')));
    await _pumpUntilText(tester, '全局偏好与功能配置');
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -400));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('设备名称'));
    await _pumpUntilText(tester, '取消');
    expect(find.text('取消'), findsOneWidget);

    await tester.tap(find.text('取消'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'dismisses clipboard text import dialog without framework errors',
    (tester) async {
      await tester.pumpWidget(_TestApp(tempDir: tempDir));
      await _pumpReady(tester);

      await tester.tap(find.byKey(const ValueKey('nav-1')));
      await _pumpUntilText(tester, '全部');
      await tester.tap(find.text('文本').last);
      await _pumpUntilText(tester, '导入文本');
      expect(find.text('导入文本'), findsOneWidget);

      await tester.tap(find.text('取消'));
      await tester.pump(const Duration(milliseconds: 300));

      expect(tester.takeException(), isNull);
    },
  );
}

Future<void> _pumpReady(WidgetTester tester) async {
  await _pumpUntilText(tester, '工作台');
}

Future<void> _pumpUntilText(WidgetTester tester, String text) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    if (find.text(text).evaluate().isNotEmpty) return;
  }
}

class _TestApp extends StatelessWidget {
  final Directory tempDir;
  final frb.HomeLayout? homeLayout;
  final HomeLayoutCoreBridge? homeBridge;

  const _TestApp({required this.tempDir, this.homeLayout, this.homeBridge});

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      overrides: [
        applicationDocumentsDirectoryProvider.overrideWith(
          (ref) async => tempDir,
        ),
        homeApplicationDocumentsDirectoryProvider.overrideWith(
          (ref) async => tempDir,
        ),
        clipboardRepositoryProvider.overrideWith(
          (ref) =>
              RustClipboardRepository(bridge: InMemoryClipboardCoreBridge()),
        ),
        homeLayoutRepositoryProvider.overrideWith(
          (ref) => RustHomeLayoutRepository(
            bridge:
                homeBridge ??
                _FakeHomeLayoutBridge(layout: homeLayout ?? _buildHomeLayout()),
          ),
        ),
        clipboardControllerProvider.overrideWith(FakeClipboardController.new),
      ],
      child: const GuYanMobileApp(),
    );
  }
}

class FakeClipboardController extends ClipboardController {
  @override
  Future<ClipboardUiState> build() async {
    return const ClipboardUiState(deviceName: 'Test Android');
  }
}

class _FakeHomeLayoutBridge implements HomeLayoutCoreBridge {
  final frb.HomeLayout layout;
  final List<frb.SaveMobileHomeCategoryLayoutInput> savedLayouts = [];

  _FakeHomeLayoutBridge({required this.layout});

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
    return layout.categories.first;
  }

  @override
  Future<frb.HomeLayoutCategory> saveMobileCategoryLayout({
    required String dbPath,
    required String workspaceKey,
    required MobileHomeLayoutScope layoutScope,
    required frb.SaveMobileHomeCategoryLayoutInput input,
  }) async {
    savedLayouts.add(input);
    return layout.categories.first;
  }
}

frb.HomeLayout _buildHomeLayout() {
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
            label: '终端面板',
            icon: 'terminal',
            action: '{"type":"internal_route","target":"/terminal"}',
            sourceType: 'shortcut',
            widgetType: 'shortcut',
            sizePreset: '4x2',
            widgetConfig: null,
            col: 1,
            row: 1,
            colSpan: 2,
            rowSpan: 2,
            preferredCol: 1,
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
          frb.HomeWidget(
            id: 'grid-item-clipboard',
            workspaceId: 1,
            categoryId: 'category-tools',
            label: '剪贴板同步',
            icon: 'clipboard',
            action: '{"type":"internal_route","target":"/clipboard"}',
            sourceType: 'shortcut',
            widgetType: 'shortcut',
            sizePreset: '2x2',
            widgetConfig: null,
            col: 3,
            row: 1,
            colSpan: 2,
            rowSpan: 2,
            preferredCol: 3,
            preferredRow: 1,
            priority: 2,
            color: 'linear-gradient(135deg, #6bdcba, #a5f2d4)',
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

frb.HomeLayout _buildCompactTileLayout() {
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
            id: 'grid-item-api',
            workspaceId: 1,
            categoryId: 'category-tools',
            label: 'API',
            icon: 'widgets',
            action: '{"type":"none"}',
            sourceType: 'shortcut',
            widgetType: 'shortcut',
            sizePreset: '2x1',
            widgetConfig: null,
            col: 1,
            row: 1,
            colSpan: 2,
            rowSpan: 1,
            preferredCol: 1,
            preferredRow: 1,
            priority: 1,
            color: '#4EA3D8',
            backgroundImage: null,
            backgroundVideo: null,
            backgroundStyle: null,
            hidden: false,
            createdAt: '2026-05-12T00:00:00Z',
            updatedAt: '2026-05-12T00:00:00Z',
          ),
          frb.HomeWidget(
            id: 'grid-item-editor',
            workspaceId: 1,
            categoryId: 'category-tools',
            label: '编辑器',
            icon: 'widgets',
            action: '{"type":"none"}',
            sourceType: 'shortcut',
            widgetType: 'shortcut',
            sizePreset: '4x1',
            widgetConfig: null,
            col: 1,
            row: 2,
            colSpan: 4,
            rowSpan: 1,
            preferredCol: 1,
            preferredRow: 2,
            priority: 2,
            color: '#4EA3D8',
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

frb.HomeLayout _buildMultiCategoryLayout() {
  final compact = _buildCompactTileLayout();
  return frb.HomeLayout(
    workspaceKey: compact.workspaceKey,
    categories: [
      compact.categories.first,
      frb.HomeLayoutCategory(
        id: 'category-extensions',
        workspaceId: 1,
        label: '扩展能力',
        icon: 'category-extensions',
        sortOrder: 2,
        backgroundColor: null,
        backgroundImage: null,
        backgroundVideo: null,
        backgroundStyle: null,
        widgets: [
          frb.HomeWidget(
            id: 'grid-item-knowledge',
            workspaceId: 1,
            categoryId: 'category-extensions',
            label: '知识库',
            icon: 'widgets',
            action: '{"type":"internal_route","target":"/knowledge"}',
            sourceType: 'shortcut',
            widgetType: 'shortcut',
            sizePreset: '2x1',
            widgetConfig: '{"mode":"read"}',
            col: 1,
            row: 1,
            colSpan: 2,
            rowSpan: 1,
            preferredCol: 1,
            preferredRow: 1,
            priority: 1,
            color: '#4EA3D8',
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

frb.HomeLayout _buildThreeCategoryLayout() {
  final twoCategoryLayout = _buildMultiCategoryLayout();
  return frb.HomeLayout(
    workspaceKey: twoCategoryLayout.workspaceKey,
    categories: [
      ...twoCategoryLayout.categories,
      frb.HomeLayoutCategory(
        id: 'category-developer',
        workspaceId: 1,
        label: '开发工具',
        icon: 'category-developer',
        sortOrder: 3,
        backgroundColor: null,
        backgroundImage: null,
        backgroundVideo: null,
        backgroundStyle: null,
        widgets: [
          frb.HomeWidget(
            id: 'grid-item-debugger',
            workspaceId: 1,
            categoryId: 'category-developer',
            label: '调试器',
            icon: 'widgets',
            action: '{"type":"none"}',
            sourceType: 'shortcut',
            widgetType: 'shortcut',
            sizePreset: '2x1',
            widgetConfig: null,
            col: 1,
            row: 1,
            colSpan: 2,
            rowSpan: 1,
            preferredCol: 1,
            preferredRow: 1,
            priority: 1,
            color: '#4EA3D8',
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
