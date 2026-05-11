import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../design_system/design_system.dart';
import 'bootstrap.dart';
import 'router.dart';
import 'theme_controller.dart';

class GuYanMobileApp extends ConsumerWidget {
  const GuYanMobileApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'GuYan Tools',
      debugShowCheckedModeBanner: false,
      theme: GuYanTheme.light(),
      darkTheme: GuYanTheme.dark(),
      themeMode: themeMode,
      routerConfig: appRouter,
      builder: (context, child) =>
          AppBootstrap(child: child ?? const SizedBox.shrink()),
    );
  }
}
