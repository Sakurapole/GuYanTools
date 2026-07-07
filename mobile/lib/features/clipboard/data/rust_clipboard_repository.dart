import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../../../bridge/bindings/mobile_api.dart' as bridge;
import '../../../bridge/models/multi_device_clipboard.dart' as frb;
import '../../../core/rust_bridge_initializer.dart';
import '../domain/clipboard_models.dart';

abstract class ClipboardCoreBridge {
  Future<String> createHost(String dbPath);
  Future<void> disposeHost(String hostId);
  Future<MultiDeviceClipboardDevice> getOrCreateLocalDevice(
    String hostId,
    String name,
  );
  Future<void> startDiscovery(
    String hostId, {
    required String deviceId,
    required String deviceName,
    required int port,
    required String platform,
    required List<String> probeLocalAddresses,
  });
  Future<void> stopDiscovery(String hostId);
  Future<List<MultiDeviceClipboardDiscoveredDevice>> listDiscoveredDevices(
    String hostId,
  );
  Future<List<MultiDeviceClipboardDevice>> listDevices(String hostId);
  Future<List<MultiDeviceClipboardDeviceStatus>> listDeviceStatuses(
    String hostId,
    int onlineWindowSeconds,
  );
  Future<MultiDeviceClipboardDevice> upsertDevice(
    String hostId,
    UpsertMultiDeviceClipboardDeviceInput input,
  );
  Future<MultiDeviceClipboardDevice> setDeviceTrusted(
    String hostId,
    String id,
    bool trusted,
  );
  Future<void> forgetDevice(String hostId, String id);
  Future<List<MultiDeviceClipboardItem>> listItems(String hostId, int limit);
  Future<MultiDeviceClipboardItem> getItem(String hostId, String id);
  Future<MultiDeviceClipboardItem> upsertItem(
    String hostId,
    UpsertMultiDeviceClipboardItemInput input,
  );
  Future<void> deleteItem(String hostId, String id);
  Future<void> clearHistory(String hostId);
  Future<void> pruneHistory(String hostId, int limit);
  String computeContentHash(List<String> parts);
  List<String> classifyText(String text);
  int clampMaxSyncBytes(int value);
}

class RustClipboardRepository {
  static const int maxSyncBytesHardLimit = 1024 * 1024 * 1024;

  final ClipboardCoreBridge _bridge;
  String? _hostId;
  String? _dbPath;

  RustClipboardRepository({ClipboardCoreBridge? bridge})
    : _bridge = bridge ?? FlutterRustClipboardCoreBridge();

  String get hostId =>
      _hostId ?? (throw StateError('Clipboard host not initialized'));
  String get dbPath =>
      _dbPath ?? (throw StateError('Clipboard db path not initialized'));

  Future<void> init(String dbPath) async {
    _dbPath = dbPath;
    _hostId ??= await _bridge.createHost(dbPath);
  }

  Future<void> dispose() async {
    final id = _hostId;
    if (id != null) {
      await _bridge.disposeHost(id);
    }
    _hostId = null;
  }

  Future<MultiDeviceClipboardDevice> getOrCreateLocalDevice(String name) {
    return _bridge.getOrCreateLocalDevice(hostId, name);
  }

  Future<void> startDiscovery({
    required MultiDeviceClipboardDevice localDevice,
    required int port,
    required List<String> probeLocalAddresses,
  }) {
    return _bridge.startDiscovery(
      hostId,
      deviceId: localDevice.id,
      deviceName: localDevice.name,
      port: port,
      platform: 'android',
      probeLocalAddresses: probeLocalAddresses,
    );
  }

  Future<void> stopDiscovery() => _bridge.stopDiscovery(hostId);
  Future<List<MultiDeviceClipboardDiscoveredDevice>> listDiscoveredDevices() =>
      _bridge.listDiscoveredDevices(hostId);
  Future<List<MultiDeviceClipboardDevice>> listDevices() =>
      _bridge.listDevices(hostId);
  Future<List<MultiDeviceClipboardDeviceStatus>> listDeviceStatuses({
    int onlineWindowSeconds = 60,
  }) => _bridge.listDeviceStatuses(hostId, onlineWindowSeconds);

  Future<MultiDeviceClipboardDevice> upsertDevice(
    UpsertMultiDeviceClipboardDeviceInput input,
  ) {
    return _bridge.upsertDevice(hostId, input);
  }

  Future<MultiDeviceClipboardDevice> setDeviceTrusted(String id, bool trusted) {
    return _bridge.setDeviceTrusted(hostId, id, trusted);
  }

  Future<void> forgetDevice(String id) => _bridge.forgetDevice(hostId, id);
  Future<List<MultiDeviceClipboardItem>> listItems({int limit = 100}) =>
      _bridge.listItems(hostId, limit);
  Future<MultiDeviceClipboardItem> getItem(String id) =>
      _bridge.getItem(hostId, id);

  Future<MultiDeviceClipboardItem> upsertItem(
    UpsertMultiDeviceClipboardItemInput input,
  ) {
    return _bridge.upsertItem(hostId, input);
  }

  Future<void> deleteItem(String id) => _bridge.deleteItem(hostId, id);
  Future<void> clearHistory() => _bridge.clearHistory(hostId);
  Future<void> pruneHistory(int limit) => _bridge.pruneHistory(hostId, limit);
  String computeContentHash(List<String> parts) =>
      _bridge.computeContentHash(parts);
  List<String> classifyText(String text) => _bridge.classifyText(text);
  int clampMaxSyncBytes(int value) => _bridge.clampMaxSyncBytes(value);
}

class FlutterRustClipboardCoreBridge implements ClipboardCoreBridge {
  Future<void> _ensureInitialized() {
    return RustBridgeInitializer.ensureInitialized();
  }

  @override
  Future<String> createHost(String dbPath) async {
    await _ensureInitialized();
    return bridge.createMobileClipboardHost(dbPath: dbPath);
  }

  @override
  Future<void> disposeHost(String hostId) async {
    await _ensureInitialized();
    await bridge.disposeMobileClipboardHost(hostId: hostId);
  }

  @override
  Future<MultiDeviceClipboardDevice> getOrCreateLocalDevice(
    String hostId,
    String name,
  ) async {
    await _ensureInitialized();
    return _deviceFromFrb(
      await bridge.getOrCreateMobileClipboardLocalDevice(
        hostId: hostId,
        name: name,
      ),
    );
  }

  @override
  Future<void> startDiscovery(
    String hostId, {
    required String deviceId,
    required String deviceName,
    required int port,
    required String platform,
    required List<String> probeLocalAddresses,
  }) async {
    await _ensureInitialized();
    await bridge.startMobileClipboardDiscovery(
      hostId: hostId,
      config: frb.MultiDeviceClipboardDiscoveryConfig(
        deviceId: deviceId,
        deviceName: deviceName,
        port: port,
        platform: platform,
        preferredAddress: null,
        probeLocalAddresses: probeLocalAddresses,
        httpProbeEnabled: true,
      ),
    );
  }

  @override
  Future<void> stopDiscovery(String hostId) async {
    await _ensureInitialized();
    await bridge.stopMobileClipboardDiscovery(hostId: hostId);
  }

  @override
  Future<List<MultiDeviceClipboardDiscoveredDevice>> listDiscoveredDevices(
    String hostId,
  ) async {
    await _ensureInitialized();
    final devices = await bridge.listMobileClipboardDiscoveredDevices(
      hostId: hostId,
    );
    return devices.map(_discoveredDeviceFromFrb).toList();
  }

  @override
  Future<List<MultiDeviceClipboardDevice>> listDevices(String hostId) async {
    await _ensureInitialized();
    final devices = await bridge.listMobileClipboardDevices(hostId: hostId);
    return devices.map(_deviceFromFrb).toList();
  }

  @override
  Future<List<MultiDeviceClipboardDeviceStatus>> listDeviceStatuses(
    String hostId,
    int onlineWindowSeconds,
  ) async {
    await _ensureInitialized();
    final statuses = await bridge.listMobileClipboardDeviceStatuses(
      hostId: hostId,
      onlineWindowSeconds: onlineWindowSeconds,
    );
    return statuses.map(_deviceStatusFromFrb).toList();
  }

  @override
  Future<MultiDeviceClipboardDevice> upsertDevice(
    String hostId,
    UpsertMultiDeviceClipboardDeviceInput input,
  ) async {
    await _ensureInitialized();
    return _deviceFromFrb(
      await bridge.upsertMobileClipboardDevice(
        hostId: hostId,
        input: frb.UpsertMultiDeviceClipboardDeviceInput(
          id: input.id,
          name: input.name,
          platform: input.platform,
          publicKey: input.publicKey,
          trusted: input.trusted,
          isSelf: input.isSelf,
          lastAddress: input.lastAddress,
          lastPort: input.lastPort,
          lastSeenAt: input.lastSeenAt,
        ),
      ),
    );
  }

  @override
  Future<MultiDeviceClipboardDevice> setDeviceTrusted(
    String hostId,
    String id,
    bool trusted,
  ) async {
    await _ensureInitialized();
    return _deviceFromFrb(
      await bridge.setMobileClipboardDeviceTrusted(
        hostId: hostId,
        id: id,
        trusted: trusted,
      ),
    );
  }

  @override
  Future<void> forgetDevice(String hostId, String id) async {
    await _ensureInitialized();
    await bridge.forgetMobileClipboardDevice(hostId: hostId, id: id);
  }

  @override
  Future<List<MultiDeviceClipboardItem>> listItems(
    String hostId,
    int limit,
  ) async {
    await _ensureInitialized();
    final items = await bridge.listMobileClipboardItems(
      hostId: hostId,
      limit: limit,
    );
    return items.map(_itemFromFrb).toList();
  }

  @override
  Future<MultiDeviceClipboardItem> getItem(String hostId, String id) async {
    await _ensureInitialized();
    return _itemFromFrb(
      await bridge.getMobileClipboardItem(hostId: hostId, id: id),
    );
  }

  @override
  Future<MultiDeviceClipboardItem> upsertItem(
    String hostId,
    UpsertMultiDeviceClipboardItemInput input,
  ) async {
    await _ensureInitialized();
    return _itemFromFrb(
      await bridge.upsertMobileClipboardItem(
        hostId: hostId,
        input: frb.UpsertMultiDeviceClipboardItemInput(
          id: input.id,
          sourceDeviceId: input.sourceDeviceId,
          sourceDeviceName: input.sourceDeviceName,
          contentType: input.contentType,
          mimeType: input.mimeType,
          text: input.text,
          fileName: input.fileName,
          assetPath: input.assetPath,
          previewPath: input.previewPath,
          byteSize: input.byteSize,
          contentHash: input.contentHash,
          tagsJson: input.tagsJson,
          localOnly: input.localOnly,
          createdAt: input.createdAt,
        ),
      ),
    );
  }

  @override
  Future<void> deleteItem(String hostId, String id) async {
    await _ensureInitialized();
    await bridge.deleteMobileClipboardItem(hostId: hostId, id: id);
  }

  @override
  Future<void> clearHistory(String hostId) async {
    await _ensureInitialized();
    await bridge.clearMobileClipboardHistory(hostId: hostId);
  }

  @override
  Future<void> pruneHistory(String hostId, int limit) async {
    await _ensureInitialized();
    await bridge.pruneMobileClipboardHistory(
      hostId: hostId,
      historyLimit: limit,
    );
  }

  @override
  String computeContentHash(List<String> parts) {
    return InMemoryClipboardCoreBridge().computeContentHash(parts);
  }

  @override
  List<String> classifyText(String text) {
    return InMemoryClipboardCoreBridge().classifyText(text);
  }

  @override
  int clampMaxSyncBytes(int value) {
    return value.clamp(1, RustClipboardRepository.maxSyncBytesHardLimit);
  }
}

class InMemoryClipboardCoreBridge implements ClipboardCoreBridge {
  final Map<String, _MemoryHost> _hosts = {};
  final Random _random = Random.secure();

  @override
  Future<String> createHost(String dbPath) async {
    final id = _id();
    _hosts[id] = _MemoryHost(dbPath: dbPath);
    return id;
  }

  @override
  Future<void> disposeHost(String hostId) async {
    _hosts.remove(hostId);
  }

  @override
  Future<MultiDeviceClipboardDevice> getOrCreateLocalDevice(
    String hostId,
    String name,
  ) async {
    final host = _host(hostId);
    final existing = _firstWhereOrNull(
      host.devices.values,
      (device) => device.isSelf,
    );
    if (existing != null) {
      final updated = existing.copyWith(
        name: name.trim().isEmpty ? existing.name : name.trim(),
      );
      host.devices[existing.id] = updated;
      return updated;
    }

    final now = _unixNow();
    final device = MultiDeviceClipboardDevice(
      id: _id(),
      name: name.trim().isEmpty ? 'GuYanTools Android' : name.trim(),
      platform: 'android',
      trusted: true,
      isSelf: true,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    );
    host.devices[device.id] = device;
    return device;
  }

  @override
  Future<void> startDiscovery(
    String hostId, {
    required String deviceId,
    required String deviceName,
    required int port,
    required String platform,
    required List<String> probeLocalAddresses,
  }) async {
    _host(hostId).discoveryRunning = true;
  }

  @override
  Future<void> stopDiscovery(String hostId) async {
    _host(hostId).discoveryRunning = false;
  }

  @override
  Future<List<MultiDeviceClipboardDiscoveredDevice>> listDiscoveredDevices(
    String hostId,
  ) async {
    return _host(hostId).discovered.values.toList();
  }

  @override
  Future<List<MultiDeviceClipboardDevice>> listDevices(String hostId) async {
    final devices = _host(hostId).devices.values.toList();
    devices.sort((a, b) {
      final selfCompare = (b.isSelf ? 1 : 0).compareTo(a.isSelf ? 1 : 0);
      if (selfCompare != 0) return selfCompare;
      final trustCompare = (b.trusted ? 1 : 0).compareTo(a.trusted ? 1 : 0);
      if (trustCompare != 0) return trustCompare;
      return b.updatedAt.compareTo(a.updatedAt);
    });
    return devices;
  }

  @override
  Future<List<MultiDeviceClipboardDeviceStatus>> listDeviceStatuses(
    String hostId,
    int onlineWindowSeconds,
  ) async {
    final now = _unixNow();
    final devices = await listDevices(hostId);
    return devices.map((device) {
      final secondsSinceSeen = device.lastSeenAt == null
          ? null
          : (now - device.lastSeenAt!).clamp(0, 1 << 31);
      final online =
          secondsSinceSeen != null && secondsSinceSeen <= onlineWindowSeconds;
      final state = device.isSelf
          ? 'self'
          : device.trusted && online
          ? 'trustedOnline'
          : device.trusted
          ? 'trustedOffline'
          : online
          ? 'available'
          : 'unknown';
      return MultiDeviceClipboardDeviceStatus(
        deviceId: device.id,
        name: device.name,
        platform: device.platform,
        trusted: device.trusted,
        isSelf: device.isSelf,
        state: state,
        online: online,
        lastAddress: device.lastAddress,
        lastPort: device.lastPort,
        lastSeenAt: device.lastSeenAt,
        secondsSinceSeen: secondsSinceSeen,
      );
    }).toList();
  }

  @override
  Future<MultiDeviceClipboardDevice> upsertDevice(
    String hostId,
    UpsertMultiDeviceClipboardDeviceInput input,
  ) async {
    final host = _host(hostId);
    final now = _unixNow();
    final existing = host.devices[input.id];
    final device = MultiDeviceClipboardDevice(
      id: input.id,
      name: input.name,
      platform: input.platform ?? existing?.platform ?? 'desktop',
      publicKey: input.publicKey ?? existing?.publicKey,
      trusted: input.trusted == true ? true : (existing?.trusted ?? false),
      isSelf: input.isSelf ?? existing?.isSelf ?? false,
      lastAddress: input.lastAddress ?? existing?.lastAddress,
      lastPort: input.lastPort ?? existing?.lastPort,
      lastSeenAt: input.lastSeenAt ?? existing?.lastSeenAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    );
    if (device.isSelf) {
      for (final entry in host.devices.entries.toList()) {
        if (entry.key != device.id && entry.value.isSelf) {
          host.devices[entry.key] = entry.value.copyWith(isSelf: false);
        }
      }
    }
    host.devices[device.id] = device;
    return device;
  }

  @override
  Future<MultiDeviceClipboardDevice> setDeviceTrusted(
    String hostId,
    String id,
    bool trusted,
  ) async {
    final host = _host(hostId);
    final device = host.devices[id];
    if (device == null) throw StateError('Device not found: $id');
    final updated = device.copyWith(trusted: trusted, updatedAt: _unixNow());
    host.devices[id] = updated;
    return updated;
  }

  @override
  Future<void> forgetDevice(String hostId, String id) async {
    final device = _host(hostId).devices[id];
    if (device?.isSelf == true) return;
    _host(hostId).devices.remove(id);
  }

  @override
  Future<List<MultiDeviceClipboardItem>> listItems(
    String hostId,
    int limit,
  ) async {
    final items = _host(hostId).items.values.toList()
      ..sort((a, b) {
        final created = b.createdAt.compareTo(a.createdAt);
        return created != 0 ? created : b.updatedAt.compareTo(a.updatedAt);
      });
    return items.take(limit.clamp(1, 1000)).toList();
  }

  @override
  Future<MultiDeviceClipboardItem> getItem(String hostId, String id) async {
    final item = _host(hostId).items[id];
    if (item == null) throw StateError('Clipboard item not found: $id');
    return item;
  }

  @override
  Future<MultiDeviceClipboardItem> upsertItem(
    String hostId,
    UpsertMultiDeviceClipboardItemInput input,
  ) async {
    final host = _host(hostId);
    final now = _unixNow();
    final duplicate = _firstWhereOrNull(
      host.items.values,
      (item) =>
          item.sourceDeviceId == input.sourceDeviceId &&
          item.contentHash == input.contentHash,
    );
    final id = duplicate?.id ?? input.id;
    final item = MultiDeviceClipboardItem(
      id: id,
      sourceDeviceId: input.sourceDeviceId,
      sourceDeviceName: input.sourceDeviceName,
      contentType: input.contentType,
      mimeType: input.mimeType,
      text: input.text,
      fileName: input.fileName,
      assetPath: input.assetPath ?? duplicate?.assetPath,
      previewPath: input.previewPath ?? duplicate?.previewPath,
      byteSize:
          input.byteSize?.clamp(
            0,
            RustClipboardRepository.maxSyncBytesHardLimit,
          ) ??
          duplicate?.byteSize ??
          0,
      contentHash: input.contentHash,
      tagsJson: input.tagsJson ?? duplicate?.tagsJson ?? '[]',
      localOnly: input.localOnly ?? duplicate?.localOnly ?? false,
      createdAt: duplicate?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    );
    host.items[id] = item;
    return item;
  }

  @override
  Future<void> deleteItem(String hostId, String id) async {
    _host(hostId).items.remove(id);
  }

  @override
  Future<void> clearHistory(String hostId) async {
    _host(hostId).items.clear();
  }

  @override
  Future<void> pruneHistory(String hostId, int limit) async {
    final host = _host(hostId);
    final keep = (await listItems(
      hostId,
      limit,
    )).map((item) => item.id).toSet();
    host.items.removeWhere((id, _) => !keep.contains(id));
  }

  @override
  String computeContentHash(List<String> parts) {
    final builder = BytesBuilder();
    for (final part in parts) {
      final bytes = utf8.encode(part);
      final length = ByteData(8)..setUint64(0, bytes.length, Endian.little);
      builder.add(length.buffer.asUint8List());
      builder.add(bytes);
    }
    return sha256.convert(builder.toBytes()).toString();
  }

  @override
  List<String> classifyText(String text) {
    final trimmed = text.trim();
    final tags = <String>['text'];
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      tags.add('url');
    }
    if (text.contains('```') ||
        text.contains('**') ||
        trimmed.startsWith('#')) {
      tags.add('markdown');
    }
    if (text.runes.any(
      (rune) =>
          (rune >= 0x1F300 && rune <= 0x1FAFF) ||
          (rune >= 0x2600 && rune <= 0x27BF),
    )) {
      tags.add('emoji');
    }
    return tags;
  }

  @override
  int clampMaxSyncBytes(int value) {
    return value.clamp(1, RustClipboardRepository.maxSyncBytesHardLimit);
  }

  _MemoryHost _host(String hostId) {
    final host = _hosts[hostId];
    if (host == null) throw StateError('Clipboard host not found: $hostId');
    return host;
  }

  String _id() {
    final now = DateTime.now().microsecondsSinceEpoch.toRadixString(16);
    final suffix = List.generate(
      8,
      (_) => _random.nextInt(16).toRadixString(16),
    ).join();
    return '$now-$suffix';
  }

  int _unixNow() => DateTime.now().millisecondsSinceEpoch ~/ 1000;
}

class _MemoryHost {
  final String dbPath;
  final Map<String, MultiDeviceClipboardItem> items = {};
  final Map<String, MultiDeviceClipboardDevice> devices = {};
  final Map<String, MultiDeviceClipboardDiscoveredDevice> discovered = {};
  bool discoveryRunning = false;

  _MemoryHost({required this.dbPath});
}

MultiDeviceClipboardDevice _deviceFromFrb(
  frb.MultiDeviceClipboardDevice device,
) {
  return MultiDeviceClipboardDevice(
    id: device.id,
    name: device.name,
    platform: device.platform,
    publicKey: device.publicKey,
    trusted: device.trusted,
    isSelf: device.isSelf,
    lastAddress: device.lastAddress,
    lastPort: device.lastPort,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  );
}

MultiDeviceClipboardDiscoveredDevice _discoveredDeviceFromFrb(
  frb.MultiDeviceClipboardDiscoveredDevice device,
) {
  return MultiDeviceClipboardDiscoveredDevice(
    id: device.id,
    name: device.name,
    platform: device.platform,
    address: device.address,
    port: device.port,
    serviceName: device.serviceName,
    lastSeenAt: device.lastSeenAt,
  );
}

MultiDeviceClipboardDeviceStatus _deviceStatusFromFrb(
  frb.MultiDeviceClipboardDeviceStatus status,
) {
  return MultiDeviceClipboardDeviceStatus(
    deviceId: status.deviceId,
    name: status.name,
    platform: status.platform,
    trusted: status.trusted,
    isSelf: status.isSelf,
    state: status.state,
    online: status.online,
    lastAddress: status.lastAddress,
    lastPort: status.lastPort,
    lastSeenAt: status.lastSeenAt,
    secondsSinceSeen: status.secondsSinceSeen,
  );
}

MultiDeviceClipboardItem _itemFromFrb(frb.MultiDeviceClipboardItem item) {
  return MultiDeviceClipboardItem(
    id: item.id,
    sourceDeviceId: item.sourceDeviceId,
    sourceDeviceName: item.sourceDeviceName,
    contentType: item.contentType,
    mimeType: item.mimeType,
    text: item.text,
    fileName: item.fileName,
    assetPath: item.assetPath,
    previewPath: item.previewPath,
    byteSize: item.byteSize,
    contentHash: item.contentHash,
    tagsJson: item.tagsJson,
    localOnly: item.localOnly,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  );
}

T? _firstWhereOrNull<T>(Iterable<T> values, bool Function(T value) test) {
  for (final value in values) {
    if (test(value)) return value;
  }
  return null;
}
