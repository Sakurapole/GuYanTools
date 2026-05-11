import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app.dart';
import 'package:mobile/app/router.dart';
import 'package:mobile/features/clipboard/application/clipboard_controller.dart';
import 'package:mobile/features/clipboard/application/clipboard_state.dart';
import 'package:mobile/features/clipboard/data/rust_clipboard_repository.dart';
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

  testWidgets('opens terminal screen from home card', (tester) async {
    await tester.pumpWidget(_TestApp(tempDir: tempDir));
    await _pumpReady(tester);

    await tester.tap(find.text('local-shell'));
    await _pumpUntilText(tester, '模拟终端');

    expect(find.text('模拟终端'), findsWidgets);
    expect(find.text('git status'), findsOneWidget);
    expect(find.text('pnpm build'), findsOneWidget);
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

  const _TestApp({required this.tempDir});

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      overrides: [
        applicationDocumentsDirectoryProvider.overrideWith(
          (ref) async => tempDir,
        ),
        clipboardRepositoryProvider.overrideWith(
          (ref) =>
              RustClipboardRepository(bridge: InMemoryClipboardCoreBridge()),
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
