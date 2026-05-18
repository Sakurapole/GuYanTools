import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:provider/provider.dart';
import 'app/app.dart';
import 'state/todo_store.dart';
import 'state/chat_store.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterForegroundTask.initCommunicationPort();
  runApp(
    ProviderScope(
      child: MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => TodoStore()),
          ChangeNotifierProvider(create: (_) => ChatStore()),
        ],
        child: const GuYanMobileApp(),
      ),
    ),
  );
}
