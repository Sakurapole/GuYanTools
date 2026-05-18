import 'package:go_router/go_router.dart';

import '../features/clipboard/presentation/clipboard_page.dart';
import '../ui/main_shell.dart';
import '../ui/pages/home_page.dart';
import '../ui/pages/knowledge_page.dart';
import '../ui/pages/settings_page.dart';
import '../ui/pages/terminal_page.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      pageBuilder: (context, state) => const NoTransitionPage(
        child: MainShell(location: '/', child: HomePage()),
      ),
    ),
    GoRoute(
      path: '/clipboard',
      pageBuilder: (context, state) => const NoTransitionPage(
        child: MainShell(location: '/clipboard', child: ClipboardPage()),
      ),
      routes: [
        GoRoute(
          path: 'detail/:id',
          builder: (context, state) => ClipboardPage(
            showTopBack: true,
            focusedItemId: state.pathParameters['id'],
          ),
        ),
      ],
    ),
    GoRoute(
      path: '/settings',
      pageBuilder: (context, state) => const NoTransitionPage(
        child: MainShell(location: '/settings', child: SettingsPage()),
      ),
    ),
    GoRoute(
      path: '/terminal',
      builder: (context, state) => const TerminalPage(),
    ),
    GoRoute(
      path: '/knowledge',
      builder: (context, state) => const KnowledgePage(),
    ),
  ],
);
