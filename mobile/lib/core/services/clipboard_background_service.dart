import 'dart:async';

import 'package:flutter_foreground_task/flutter_foreground_task.dart';

@pragma('vm:entry-point')
void startClipboardForegroundTask() {
  FlutterForegroundTask.setTaskHandler(ClipboardForegroundTaskHandler());
}

class ClipboardForegroundTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    FlutterForegroundTask.sendDataToMain({
      'type': 'clipboard-background-started',
      'timestamp': timestamp.toIso8601String(),
    });
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    FlutterForegroundTask.sendDataToMain({
      'type': 'clipboard-background-heartbeat',
      'timestamp': timestamp.toIso8601String(),
    });
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    FlutterForegroundTask.sendDataToMain({
      'type': 'clipboard-background-stopped',
      'timestamp': timestamp.toIso8601String(),
      'isTimeout': isTimeout,
    });
  }

  @override
  void onNotificationButtonPressed(String id) {
    if (id == 'read_clipboard') {
      FlutterForegroundTask.sendDataToMain({
        'type': 'clipboard-notification-read',
        'timestamp': DateTime.now().toIso8601String(),
      });
      FlutterForegroundTask.launchApp('/clipboard');
    }
  }
}

class ClipboardBackgroundService {
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;
    FlutterForegroundTask.initCommunicationPort();
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'guyantools_clipboard_sync',
        channelName: 'GuYanTools 剪贴板同步',
        channelDescription: '保持局域网剪贴板同步服务运行',
        onlyAlertOnce: true,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(30000),
        allowWakeLock: true,
        allowWifiLock: true,
        allowAutoRestart: true,
      ),
    );
    _initialized = true;
  }

  Future<void> _requestNotificationPermission() async {
    final permission = await FlutterForegroundTask.checkNotificationPermission();
    if (permission != NotificationPermission.granted) {
      final requested = await FlutterForegroundTask.requestNotificationPermission();
      if (requested != NotificationPermission.granted) {
        throw StateError('需要允许通知权限，才能启动 Android 前台同步服务');
      }
    }
  }

  Future<void> start() async {
    await initialize();
    if (await FlutterForegroundTask.isRunningService) return;
    await _requestNotificationPermission();
    final result = await FlutterForegroundTask.startService(
      serviceId: 2207,
      serviceTypes: const [ForegroundServiceTypes.dataSync],
      notificationTitle: 'GuYanTools 剪贴板同步运行中',
      notificationText: '正在保持局域网接收与发现服务',
      notificationButtons: const [
        NotificationButton(id: 'read_clipboard', text: '读取剪贴板'),
      ],
      notificationInitialRoute: '/clipboard',
      callback: startClipboardForegroundTask,
    );
    if (result is ServiceRequestFailure) {
      throw StateError('Android 前台同步服务启动失败：${result.error}');
    }
  }

  Future<void> stop() async {
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.stopService();
    }
  }

  Future<bool> get isRunning => FlutterForegroundTask.isRunningService;
}
