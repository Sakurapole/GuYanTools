import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:share_handler/share_handler.dart';

import '../features/clipboard/application/clipboard_controller.dart';

class AppBootstrap extends ConsumerStatefulWidget {
  final Widget child;

  const AppBootstrap({super.key, required this.child});

  @override
  ConsumerState<AppBootstrap> createState() => _AppBootstrapState();
}

class _AppBootstrapState extends ConsumerState<AppBootstrap> {
  StreamSubscription<SharedMedia>? _shareSubscription;
  late final _ClipboardLifecycleObserver _lifecycleObserver;
  Timer? _foregroundClipboardTimer;
  bool _importingForegroundClipboard = false;

  @override
  void initState() {
    super.initState();
    _lifecycleObserver = _ClipboardLifecycleObserver(_onResume);
    WidgetsBinding.instance.addObserver(_lifecycleObserver);
    FlutterForegroundTask.addTaskDataCallback(_onForegroundTaskData);
    _foregroundClipboardTimer = Timer.periodic(
      const Duration(milliseconds: 1500),
      (_) => unawaited(_importForegroundClipboardWhileActive()),
    );
    unawaited(_initShareIntake());
  }

  Future<void> _initShareIntake() async {
    await ref.read(clipboardControllerProvider.future);
    await _importTriggeredClipboardRead();
    await _importForegroundClipboardAfterResume();
    await _handleInitialShare();
    _shareSubscription = ShareHandler.instance.sharedMediaStream.listen(
      (media) => unawaited(_handleSharedMedia(media)),
    );
  }

  Future<void> _handleInitialShare() async {
    try {
      final media = await ShareHandler.instance.getInitialSharedMedia();
      if (media != null) {
        await _handleSharedMedia(media);
        await ShareHandler.instance.resetInitialSharedMedia();
      }
    } catch (_) {
      // Plugin channels are not available in widget tests and unsupported shells.
    }
  }

  Future<void> _handleSharedMedia(SharedMedia media) async {
    final controller = ref.read(clipboardControllerProvider.notifier);
    final content = media.content;
    if (content != null && content.isNotEmpty) {
      await controller.importText(content);
    }
    final paths =
        media.attachments
            ?.whereType<SharedAttachment>()
            .map((attachment) => attachment.path)
            .where((path) => path.isNotEmpty)
            .toList() ??
        const <String>[];
    if (paths.isNotEmpty) {
      await controller.importFiles(paths);
    }
  }

  void _onResume() {
    unawaited(_handleForegroundClipboardResume());
  }

  void _onForegroundTaskData(Object data) {
    if (data is Map && data['type'] == 'clipboard-notification-read') {
      unawaited(_importClipboardFromNotificationAction());
    }
  }

  Future<void> _handleForegroundClipboardResume() async {
    final imported = await _importTriggeredClipboardRead();
    if (!imported) {
      await _importForegroundClipboardAfterResume();
    }
  }

  Future<bool> _importTriggeredClipboardRead({
    bool fallbackToForegroundRead = false,
  }) async {
    try {
      return await ref
          .read(clipboardControllerProvider.notifier)
          .importPendingClipboardRead(
            fallbackToForegroundRead: fallbackToForegroundRead,
          );
    } catch (_) {
      return false;
    }
  }

  Future<void> _importClipboardFromNotificationAction() async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    await _importTriggeredClipboardRead(fallbackToForegroundRead: true);
  }

  Future<void> _importForegroundClipboardAfterResume() async {
    await _importForegroundClipboardIfVisible(
      delay: const Duration(milliseconds: 250),
    );
  }

  Future<void> _importForegroundClipboardWhileActive() async {
    await _importForegroundClipboardIfVisible();
  }

  Future<void> _importForegroundClipboardIfVisible({Duration? delay}) async {
    if (_importingForegroundClipboard) return;
    if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
      return;
    }
    _importingForegroundClipboard = true;
    try {
      final state = ref.read(clipboardControllerProvider).value;
      if (state?.syncEnabled != true) return;
      if (delay != null) {
        await Future<void>.delayed(delay);
      }
      await ref
          .read(clipboardControllerProvider.notifier)
          .importCurrentClipboardForegroundOnly();
    } catch (_) {
      // Clipboard channels are platform-specific and may be unavailable in tests.
    } finally {
      _importingForegroundClipboard = false;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(_lifecycleObserver);
    FlutterForegroundTask.removeTaskDataCallback(_onForegroundTaskData);
    _foregroundClipboardTimer?.cancel();
    _shareSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(clipboardControllerProvider);
    return widget.child;
  }
}

class _ClipboardLifecycleObserver extends WidgetsBindingObserver {
  final VoidCallback onResume;

  _ClipboardLifecycleObserver(this.onResume);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      onResume();
    }
  }
}
