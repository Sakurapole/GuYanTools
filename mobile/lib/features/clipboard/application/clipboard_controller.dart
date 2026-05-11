import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/services/clipboard_background_service.dart';
import '../../../core/services/clipboard_platform_channel.dart';
import '../../../core/services/clipboard_sync_service.dart';
import '../data/clipboard_asset_store.dart';
import '../data/rust_clipboard_repository.dart';
import '../domain/clipboard_models.dart';
import 'clipboard_state.dart';

const clipboardDefaultHistoryLimit = 200;
const clipboardDefaultMaxSyncBytes = 100 * 1024 * 1024;
const clipboardHardMaxSyncBytes = 1024 * 1024 * 1024;

final clipboardRepositoryProvider = Provider<RustClipboardRepository>(
  (ref) => RustClipboardRepository(),
);

final clipboardPlatformChannelProvider = Provider<ClipboardPlatformChannel>(
  (ref) => ClipboardPlatformChannel(),
);

final clipboardBackgroundServiceProvider = Provider<ClipboardBackgroundService>(
  (ref) => ClipboardBackgroundService(),
);

final sharedPreferencesProvider = FutureProvider<SharedPreferences>(
  (ref) => SharedPreferences.getInstance(),
);

final applicationDocumentsDirectoryProvider = FutureProvider<Directory>(
  (ref) => getApplicationDocumentsDirectory(),
);

final clipboardControllerProvider =
    AsyncNotifierProvider<ClipboardController, ClipboardUiState>(
      ClipboardController.new,
    );

class ClipboardController extends AsyncNotifier<ClipboardUiState> {
  late final RustClipboardRepository _repository;
  late final ClipboardPlatformChannel _platformChannel;
  late final ClipboardBackgroundService _backgroundService;
  late final ClipboardSyncService _syncService;
  late SharedPreferences _prefs;
  late ClipboardAssetStore _assetStore;
  String _lastForegroundClipboardHash = '';

  @override
  Future<ClipboardUiState> build() async {
    _repository = ref.watch(clipboardRepositoryProvider);
    _platformChannel = ref.watch(clipboardPlatformChannelProvider);
    _backgroundService = ref.watch(clipboardBackgroundServiceProvider);
    final prefsFuture = ref.watch(sharedPreferencesProvider.future);
    final appDirFuture = ref.watch(
      applicationDocumentsDirectoryProvider.future,
    );
    _prefs = await prefsFuture;
    final appDir = await appDirFuture;
    final assetDir = Directory(
      joinPath(appDir.path, 'multi-device-clipboard-assets'),
    );
    await assetDir.create(recursive: true);
    _assetStore = ClipboardAssetStore(assetDir);

    _syncService = ClipboardSyncService(
      repository: _repository,
      maxSyncBytes: () =>
          state.value?.maxSyncBytes ?? clipboardDefaultMaxSyncBytes,
      onReceivePayload: _receiveRemotePayload,
      readAssetBase64: _assetBase64ForItem,
      onChanged: () => unawaited(refreshAll()),
    );
    ref.onDispose(() {
      unawaited(_syncService.stop());
      unawaited(_repository.dispose());
    });

    await _repository.init(joinPath(appDir.path, 'guyantools.db'));
    final deviceName =
        _prefs.getString('clipboard.deviceName') ?? _defaultDeviceName().trim();
    final historyLimit =
        _prefs.getInt('clipboard.historyLimit') ?? clipboardDefaultHistoryLimit;
    final maxSyncBytes = _repository.clampMaxSyncBytes(
      _prefs.getInt('clipboard.maxSyncBytes') ?? clipboardDefaultMaxSyncBytes,
    );
    final syncEnabled = _prefs.getBool('clipboard.syncEnabled') ?? false;
    final backgroundSyncEnabled =
        _prefs.getBool('clipboard.backgroundSyncEnabled') ?? false;
    final localDevice = await _repository.getOrCreateLocalDevice(deviceName);

    final initial = ClipboardUiState(
      localDevice: localDevice,
      deviceName: deviceName,
      historyLimit: historyLimit,
      maxSyncBytes: maxSyncBytes,
      syncEnabled: syncEnabled,
      backgroundSyncEnabled: backgroundSyncEnabled,
    );
    state = AsyncData(initial);
    await refreshAll();
    if (syncEnabled) {
      await startSync();
    }
    return state.requireValue.copyWith(error: null);
  }

  Future<void> refreshAll() async {
    await Future.wait([
      refreshItems(),
      refreshDevices(),
      refreshDiscoveredDevices(),
    ]);
  }

  Future<void> refreshItems() async {
    final current = state.requireValue;
    final items = await _repository.listItems(limit: current.historyLimit);
    state = AsyncData(current.copyWith(items: items, error: null));
  }

  Future<void> refreshDevices() async {
    final current = state.requireValue;
    final devices = await _repository.listDevices();
    final deviceStatuses = await _repository.listDeviceStatuses();
    state = AsyncData(
      current.copyWith(
        devices: devices,
        deviceStatuses: deviceStatuses,
        error: null,
      ),
    );
  }

  Future<void> refreshDiscoveredDevices() async {
    final current = state.requireValue;
    final discoveredDevices = _syncService.isRunning
        ? await _syncService.refreshDiscoveredDevices(notify: false)
        : await _repository.listDiscoveredDevices();
    state = AsyncData(
      current.copyWith(
        discoveredDevices: discoveredDevices,
        pairingRequests: _syncService.pairingRequests,
        syncRunning: _syncService.isRunning,
        error: null,
      ),
    );
  }

  void setFilter(ClipboardContentFilter filter) {
    final current = state.requireValue;
    if (current.filter == filter) return;
    state = AsyncData(current.copyWith(filter: filter));
  }

  void setQuery(String query) {
    final current = state.requireValue;
    if (current.query == query) return;
    state = AsyncData(current.copyWith(query: query));
  }

  Future<void> setSyncEnabled(bool value) async {
    final current = state.requireValue;
    state = AsyncData(current.copyWith(syncEnabled: value, error: null));
    try {
      await _prefs.setBool('clipboard.syncEnabled', value);
      if (value) {
        await startSync();
      } else {
        await stopSync();
      }
    } catch (error) {
      await _prefs.setBool('clipboard.syncEnabled', current.syncEnabled);
      state = AsyncData(current.copyWith(error: '剪贴板同步切换失败：$error'));
    }
  }

  Future<void> setBackgroundSyncEnabled(bool value) async {
    final current = state.requireValue;
    if (value && !current.syncEnabled) {
      state = AsyncData(current.copyWith(error: '请先开启多设备剪贴板，再启用 Android 后台同步'));
      return;
    }

    state = AsyncData(
      current.copyWith(backgroundSyncEnabled: value, error: null),
    );
    try {
      await _prefs.setBool('clipboard.backgroundSyncEnabled', value);
      if (current.syncEnabled) {
        if (value && Platform.isAndroid) {
          await _backgroundService.start();
        } else {
          await _backgroundService.stop();
        }
      }
    } catch (error) {
      await _prefs.setBool(
        'clipboard.backgroundSyncEnabled',
        current.backgroundSyncEnabled,
      );
      state = AsyncData(current.copyWith(error: 'Android 后台同步切换失败：$error'));
    }
  }

  Future<void> setDeviceName(String name) async {
    final trimmed = name.trim();
    final current = state.requireValue;
    if (trimmed.isEmpty || trimmed == current.deviceName) return;
    await _prefs.setString('clipboard.deviceName', trimmed);
    final localDevice = await _repository.getOrCreateLocalDevice(trimmed);
    state = AsyncData(
      current.copyWith(deviceName: trimmed, localDevice: localDevice),
    );
    if (current.syncEnabled) {
      await stopSync();
      await startSync();
    }
    await refreshDevices();
  }

  Future<void> setHistoryLimit(int value) async {
    final historyLimit = value.clamp(1, 5000);
    final current = state.requireValue;
    state = AsyncData(current.copyWith(historyLimit: historyLimit));
    await _prefs.setInt('clipboard.historyLimit', historyLimit);
    await _repository.pruneHistory(historyLimit);
    await refreshItems();
  }

  Future<void> setMaxSyncBytes(int value) async {
    final maxSyncBytes = _repository.clampMaxSyncBytes(value);
    final current = state.requireValue;
    state = AsyncData(current.copyWith(maxSyncBytes: maxSyncBytes));
    await _prefs.setInt('clipboard.maxSyncBytes', maxSyncBytes);
  }

  Future<void> startSync() async {
    final current = state.requireValue;
    final localDevice = current.localDevice;
    if (localDevice == null) return;
    try {
      await _syncService.start(localDevice);
      String? warning;
      if (current.backgroundSyncEnabled && Platform.isAndroid) {
        try {
          await _backgroundService.start();
        } catch (error) {
          warning = 'Android 后台同步启动失败：$error';
        }
      }
      state = AsyncData(
        current.copyWith(syncRunning: true, syncEnabled: true, error: warning),
      );
      await refreshAll();
    } catch (error) {
      await _prefs.setBool('clipboard.syncEnabled', false);
      state = AsyncData(
        current.copyWith(
          syncRunning: false,
          syncEnabled: false,
          error: '剪贴板同步启动失败：$error',
        ),
      );
    }
  }

  Future<void> stopSync() async {
    final current = state.requireValue;
    await _syncService.stop();
    await _backgroundService.stop();
    state = AsyncData(current.copyWith(syncRunning: false, syncEnabled: false));
    await refreshDiscoveredDevices();
  }

  Future<MultiDeviceClipboardPairingRequest> startPairing(
    String deviceId,
  ) async {
    final current = state.requireValue;
    final matched = current.discoveredDevices.where((item) => item.id == deviceId);
    final device = matched.isNotEmpty
        ? matched.first
        : _discoveredDeviceFromStatus(current, deviceId);
    final request = await _syncService.startPairing(device);
    await refreshDevices();
    return request;
  }

  Future<MultiDeviceClipboardPairingRequest> startPairingByEndpoint(
    String endpoint,
  ) async {
    final request = await _syncService.startPairingByEndpoint(endpoint);
    await refreshDevices();
    await refreshDiscoveredDevices();
    return request;
  }

  Future<void> approvePairing(String requestId) async {
    await _syncService.approvePairing(requestId);
    await refreshDevices();
    await refreshDiscoveredDevices();
  }

  void rejectPairing(String requestId) {
    _syncService.rejectPairing(requestId);
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(pairingRequests: _syncService.pairingRequests),
    );
  }

  Future<void> forgetDevice(String deviceId) async {
    await _repository.forgetDevice(deviceId);
    await refreshDevices();
  }

  Future<void> importCurrentClipboardForegroundOnly() async {
    final text = await _platformChannel.readText();
    if (text == null || text.isEmpty) return;
    final hash = _repository.computeContentHash(['text', text]);
    if (hash == _lastForegroundClipboardHash) return;
    final items = state.value?.items ?? const <MultiDeviceClipboardItem>[];
    if (items.isNotEmpty && items.first.contentHash == hash) {
      _lastForegroundClipboardHash = hash;
      return;
    }
    await importText(text);
    _lastForegroundClipboardHash = hash;
  }

  Future<bool> importPendingClipboardRead({
    bool fallbackToForegroundRead = false,
  }) async {
    final pendingText = await _platformChannel.takePendingReadText();
    final text =
        pendingText ??
        (fallbackToForegroundRead ? await _platformChannel.readText() : null);
    if (text == null || text.isEmpty) return false;
    final hash = _repository.computeContentHash(['text', text]);
    if (hash == _lastForegroundClipboardHash) return false;
    await importText(text);
    _lastForegroundClipboardHash = hash;
    return true;
  }

  Future<void> installReadShortcut() async {
    try {
      await _platformChannel.installReadShortcut();
      final current = state.requireValue;
      state = AsyncData(current.copyWith(error: '已请求添加“读取剪贴板”桌面快捷方式'));
    } catch (error) {
      final current = state.requireValue;
      state = AsyncData(current.copyWith(error: '添加桌面快捷方式失败：$error'));
    }
  }

  Future<void> importText(String text) async {
    if (text.isEmpty) return;
    final localDevice = _requireLocalDevice();
    final bytes = utf8.encode(text).length;
    final hash = _repository.computeContentHash(['text', text]);
    final items = state.value?.items ?? const <MultiDeviceClipboardItem>[];
    if (items.isNotEmpty && items.first.contentHash == hash) return;
    final item = await _repository.upsertItem(
      UpsertMultiDeviceClipboardItemInput(
        id: _id(),
        sourceDeviceId: localDevice.id,
        sourceDeviceName: localDevice.name,
        contentType: 'text',
        mimeType: 'text/plain',
        text: text,
        byteSize: bytes,
        contentHash: hash,
        tagsJson: jsonEncode(_repository.classifyText(text)),
        localOnly: false,
      ),
    );
    await _afterLocalItemUpsert(item);
  }

  Future<void> importFiles(List<String> paths) async {
    for (final path in paths) {
      final file = File(path);
      final exists = await file.exists();
      if (!exists) continue;
      final stat = await file.stat();
      final fileName = basename(path);
      final size = stat.size;
      final current = state.requireValue;
      final localOnly = size > current.maxSyncBytes;
      final tags = _tagsForFile(fileName);
      final contentType = tags.contains('image') ? 'image' : 'file';
      final mimeType = _guessMimeType(fileName);
      String assetPath = path;
      String contentHash;

      if (!localOnly) {
        final bytes = await file.readAsBytes();
        contentHash = _hashBytes(['file', fileName], bytes);
        assetPath = await _assetStore.writeBytes(
          '$contentHash-$fileName',
          bytes,
        );
      } else {
        contentHash = _repository.computeContentHash([
          'file-ref',
          path,
          size.toString(),
          stat.modified.millisecondsSinceEpoch.toString(),
        ]);
      }

      final localDevice = _requireLocalDevice();
      final item = await _repository.upsertItem(
        UpsertMultiDeviceClipboardItemInput(
          id: _id(),
          sourceDeviceId: localDevice.id,
          sourceDeviceName: localDevice.name,
          contentType: contentType,
          mimeType: mimeType,
          text: jsonEncode({
            'paths': [path],
          }),
          fileName: fileName,
          assetPath: assetPath,
          previewPath: tags.contains('image') ? assetPath : null,
          byteSize: size,
          contentHash: contentHash,
          tagsJson: jsonEncode(tags),
          localOnly: localOnly,
        ),
      );
      await _afterLocalItemUpsert(item);
    }
  }

  Future<void> importSharedMedia(Object? media) async {
    if (media == null) return;
    if (media is String) {
      await importFiles([media]);
      return;
    }
    if (media is Iterable) {
      final paths = media.whereType<String>().toList();
      if (paths.isNotEmpty) await importFiles(paths);
      return;
    }
    if (media is Map) {
      final text = media['content'] ?? media['text'];
      if (text is String && text.isNotEmpty) {
        await importText(text);
        return;
      }
      final path = media['path'] ?? media['filePath'];
      if (path is String) await importFiles([path]);
    }
  }

  Future<void> applyItem(MultiDeviceClipboardItem item) async {
    if (item.isText) {
      await _platformChannel.writeText(item.text ?? '');
      return;
    }
    final path = item.assetPath ?? item.previewPath;
    if (path != null && path.isNotEmpty) {
      await _platformChannel.writeFile(path, mimeType: item.mimeType);
    }
  }

  Future<void> deleteItem(String id) async {
    await _repository.deleteItem(id);
    await refreshItems();
  }

  Future<void> clearHistory() async {
    await _repository.clearHistory();
    await refreshItems();
  }

  Future<void> _afterLocalItemUpsert(MultiDeviceClipboardItem item) async {
    final current = state.requireValue;
    await _repository.pruneHistory(current.historyLimit);
    await refreshItems();
    await _syncService.broadcastItem(item);
  }

  Future<MultiDeviceClipboardItem> _receiveRemotePayload(
    ClipboardSyncPayload payload,
  ) async {
    final item = payload.item;
    String? assetPath = item.assetPath;
    String? previewPath = item.previewPath;
    int byteSize = item.byteSize;

    if (payload.assetBase64 != null && item.fileName != null) {
      final bytes = base64Decode(payload.assetBase64!);
      if (bytes.length > state.requireValue.maxSyncBytes) {
        throw StateError('接收内容超过最大同步大小');
      }
      assetPath = await _assetStore.writeBytes(
        '${item.contentHash}-${item.fileName}',
        bytes,
      );
      byteSize = bytes.length;
      if (item.isImage || item.tags.contains('image')) {
        previewPath = assetPath;
      }
    }

    final received = await _repository.upsertItem(
      UpsertMultiDeviceClipboardItemInput(
        id: item.id,
        sourceDeviceId: item.sourceDeviceId,
        sourceDeviceName: item.sourceDeviceName,
        contentType: item.contentType,
        mimeType: item.mimeType,
        text: item.text,
        fileName: item.fileName,
        assetPath: assetPath,
        previewPath: previewPath,
        byteSize: byteSize,
        contentHash: item.contentHash,
        tagsJson: item.tagsJson,
        localOnly: false,
        createdAt: item.createdAt,
      ),
    );
    await applyItem(received);
    await _repository.pruneHistory(state.requireValue.historyLimit);
    await refreshItems();
    return received;
  }

  Future<String?> _assetBase64ForItem(MultiDeviceClipboardItem item) async {
    if (item.localOnly) return null;
    final path = item.assetPath;
    if (path == null || path.isEmpty) return null;
    final file = File(path);
    if (!await file.exists()) return null;
    final size = await file.length();
    if (size > state.requireValue.maxSyncBytes) return null;
    return base64Encode(await file.readAsBytes());
  }

  List<String> _tagsForFile(String fileName) {
    final ext = extension(fileName).toLowerCase();
    final tags = <String>['file'];
    if ([
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.bmp',
      '.avif',
    ].contains(ext)) {
      tags.add('image');
    }
    if (['.mp4', '.webm', '.mov', '.mkv'].contains(ext)) {
      tags.add('video');
    }
    return tags;
  }

  String _guessMimeType(String fileName) {
    final ext = extension(fileName).toLowerCase();
    return switch (ext) {
      '.png' => 'image/png',
      '.jpg' || '.jpeg' => 'image/jpeg',
      '.gif' => 'image/gif',
      '.webp' => 'image/webp',
      '.mp4' => 'video/mp4',
      '.webm' => 'video/webm',
      '.mov' => 'video/quicktime',
      '.mkv' => 'video/x-matroska',
      '.txt' || '.md' || '.json' || '.csv' || '.log' => 'text/plain',
      _ => 'application/octet-stream',
    };
  }

  String _hashBytes(List<String> parts, Uint8List bytes) {
    final builder = BytesBuilder();
    for (final part in parts) {
      final encoded = utf8.encode(part);
      final length = ByteData(8)..setUint64(0, encoded.length, Endian.little);
      builder.add(length.buffer.asUint8List());
      builder.add(encoded);
    }
    builder.add(bytes);
    return sha256.convert(builder.toBytes()).toString();
  }

  MultiDeviceClipboardDevice _requireLocalDevice() {
    final device = state.requireValue.localDevice;
    if (device == null) throw StateError('剪贴板本机设备尚未初始化');
    return device;
  }

  String _defaultDeviceName() {
    try {
      return Platform.localHostname.isEmpty
          ? 'GuYanTools Android'
          : Platform.localHostname;
    } catch (_) {
      return 'GuYanTools Android';
    }
  }

  String _id() {
    final time = DateTime.now().microsecondsSinceEpoch.toRadixString(16);
    final random = Random.secure().nextInt(0x7fffffff).toRadixString(16);
    return '$time-$random';
  }
}

MultiDeviceClipboardDiscoveredDevice _discoveredDeviceFromStatus(
  ClipboardUiState state,
  String deviceId,
) {
  final status = state.deviceStatuses.firstWhere(
    (item) => item.deviceId == deviceId && item.lastAddress != null,
    orElse: () => throw StateError('未发现该设备，无法发起配对'),
  );
  return MultiDeviceClipboardDiscoveredDevice(
    id: status.deviceId,
    name: status.name,
    platform: status.platform,
    address: status.lastAddress!,
    port: status.lastPort ?? ClipboardSyncService.defaultSyncPort,
    serviceName: 'http://${status.lastAddress}:${status.lastPort ?? ClipboardSyncService.defaultSyncPort}',
    lastSeenAt: status.lastSeenAt ?? 0,
  );
}
