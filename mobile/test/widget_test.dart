import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:mobile/state/theme_provider.dart';
import 'package:mobile/state/todo_store.dart';
import 'package:mobile/state/chat_store.dart';
import 'package:mobile/main.dart';

void main() {
  testWidgets('App renders with bottom navigation', (WidgetTester tester) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
          ChangeNotifierProvider(create: (_) => TodoStore()),
          ChangeNotifierProvider(create: (_) => ChatStore()),
        ],
        child: const MyApp(),
      ),
    );

    // 等待初始化
    await tester.pumpAndSettle(const Duration(seconds: 3));

    // 验证底部导航文字存在
    expect(find.text('HOME'), findsOneWidget);
    expect(find.text('AI CHAT'), findsOneWidget);
    expect(find.text('ALL APPS'), findsOneWidget);
  });
}
