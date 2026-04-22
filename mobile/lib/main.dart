import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'state/theme_provider.dart';
import 'state/todo_store.dart';
import 'state/chat_store.dart';
import 'ui/main_shell.dart';
import 'ui/pages/knowledge_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider(create: (_) => TodoStore()),
        ChangeNotifierProvider(create: (_) => ChatStore()),
      ],
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    final themeProvider = context.watch<ThemeProvider>();

    return MaterialApp(
      title: 'GuYan Tools',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeProvider.themeMode,
      home: const _AppInit(),
      routes: {
        '/knowledge': (context) => const KnowledgePage(),
      },
    );
  }
}

/// 初始化加载：从 SQLite 加载数据并 seed 模拟数据
class _AppInit extends StatefulWidget {
  const _AppInit();

  @override
  State<_AppInit> createState() => _AppInitState();
}

class _AppInitState extends State<_AppInit> {
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final todoStore = context.read<TodoStore>();
    final chatStore = context.read<ChatStore>();

    await todoStore.seedIfEmpty();
    await todoStore.loadFromDb();
    await chatStore.seedIfEmpty();
    await chatStore.loadFromDb();

    if (mounted) setState(() => _ready = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return Scaffold(
        body: Center(
          child: CircularProgressIndicator(
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
      );
    }
    return const MainShell();
  }
}
