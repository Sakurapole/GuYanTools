import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../models/clipboard_models.dart';
import '../repositories/rust_clipboard_repository.dart';

typedef ClipboardPayloadReceiver =
    Future<MultiDeviceClipboardItem> Function(ClipboardSyncPayload payload);
typedef ClipboardAssetReader =
    Future<String?> Function(MultiDeviceClipboardItem item);
typedef ClipboardChanged = void Function();

class ClipboardSyncService {
  static const int maxSyncBytesHardLimit = 1024 * 1024 * 1024;
  static const int defaultSyncPort = 49649;

  final RustClipboardRepository repository;
  final int Function() maxSyncBytes;
  final ClipboardPayloadReceiver onReceivePayload;
  final ClipboardAssetReader readAssetBase64;
  final ClipboardChanged? onChanged;

  HttpServer? _server;
  Timer? _discoveryTimer;
  MultiDeviceClipboardDevice? _localDevice;
  final Random _random = Random.secure();
  final Map<String, MultiDeviceClipboardPairingRequest> _pairingRequests = {};

  ClipboardSyncService({
    required this.repository,
    required this.maxSyncBytes,
    required this.onReceivePayload,
    required this.readAssetBase64,
    this.onChanged,
  });

  int get port => _server?.port ?? 0;
  bool get isRunning => _server != null;

  List<MultiDeviceClipboardPairingRequest> get pairingRequests {
    final requests = _pairingRequests.values.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return requests;
  }

  Future<void> start(MultiDeviceClipboardDevice localDevice) async {
    _localDevice = localDevice;
    await _ensureServer();
    await repository.startDiscovery(
      localDevice: localDevice,
      port: port,
      probeLocalAddresses: await _localIpv4Addresses(),
    );
    _startDiscoveryPolling();
  }

  Future<void> stop() async {
    _discoveryTimer?.cancel();
    _discoveryTimer = null;
    await repository.stopDiscovery().catchError((_) {});
    final server = _server;
    _server = null;
    if (server != null) {
      await server.close(force: true);
    }
  }

  Future<List<MultiDeviceClipboardDiscoveredDevice>> refreshDiscoveredDevices({
    bool notify = true,
  }) async {
    final discovered = await repository.listDiscoveredDevices();
    final now = _unixNow();
    for (final device in discovered) {
      await repository.upsertDevice(
        UpsertMultiDeviceClipboardDeviceInput(
          id: device.id,
          name: device.name,
          platform: device.platform,
          trusted: false,
          isSelf: false,
          lastAddress: device.address,
          lastPort: device.port,
          lastSeenAt: device.lastSeenAt == 0 ? now : device.lastSeenAt,
        ),
      );
    }
    if (notify && discovered.isNotEmpty) onChanged?.call();
    return discovered;
  }

  Future<MultiDeviceClipboardPairingRequest> startPairing(
    MultiDeviceClipboardDiscoveredDevice device,
  ) async {
    final localDevice = _requireLocalDevice();
    return _postJson<MultiDeviceClipboardPairingRequest>(
      device.address,
      device.port,
      '/pair/request',
      {'deviceId': localDevice.id, 'deviceName': localDevice.name},
      (json) => MultiDeviceClipboardPairingRequest.fromJson(json),
    );
  }

  Future<MultiDeviceClipboardPairingRequest> startPairingByEndpoint(
    String endpoint,
  ) async {
    final parsed = _parseManualPairingEndpoint(endpoint);
    final localDevice = _requireLocalDevice();
    final status = await _getJson<Map<String, dynamic>>(
      parsed.address,
      parsed.port,
      '/status',
      (json) => json,
    );
    final remoteDevice = status['device'] is Map
        ? MultiDeviceClipboardDevice.fromJson(
            Map<String, dynamic>.from(status['device'] as Map),
          )
        : null;
    if (remoteDevice == null) {
      throw StateError('该地址不是有效的 GuYanTools 剪贴板服务');
    }
    await repository.upsertDevice(
      UpsertMultiDeviceClipboardDeviceInput(
        id: remoteDevice.id,
        name: remoteDevice.name,
        platform: remoteDevice.platform,
        trusted: false,
        isSelf: false,
        lastAddress: parsed.address,
        lastPort: parsed.port,
        lastSeenAt: _unixNow(),
      ),
    );
    final request = await _postJson<MultiDeviceClipboardPairingRequest>(
      parsed.address,
      parsed.port,
      '/pair/request',
      {'deviceId': localDevice.id, 'deviceName': localDevice.name},
      (json) => MultiDeviceClipboardPairingRequest.fromJson(json),
    );
    onChanged?.call();
    return request;
  }

  Future<void> approvePairing(String requestId) async {
    final request = _pairingRequests.remove(requestId);
    if (request == null) {
      throw StateError('配对请求已失效');
    }

    await repository.upsertDevice(
      UpsertMultiDeviceClipboardDeviceInput(
        id: request.deviceId,
        name: request.deviceName,
        platform: 'desktop',
        trusted: true,
        isSelf: false,
        lastAddress: request.address,
        lastPort: request.port,
        lastSeenAt: _unixNow(),
      ),
    );

    final localDevice = _requireLocalDevice();
    await _postJson<Map<String, dynamic>>(
      request.address,
      request.port,
      '/pair/approve',
      {
        'requestId': requestId,
        'deviceId': localDevice.id,
        'deviceName': localDevice.name,
      },
      (json) => json,
    ).catchError((_) => <String, dynamic>{});
    onChanged?.call();
  }

  void rejectPairing(String requestId) {
    _pairingRequests.remove(requestId);
    onChanged?.call();
  }

  Future<void> broadcastItem(MultiDeviceClipboardItem item) async {
    if (item.localOnly) return;
    final discovered = isRunning
        ? await refreshDiscoveredDevices(
            notify: false,
          ).catchError((_) => <MultiDeviceClipboardDiscoveredDevice>[])
        : <MultiDeviceClipboardDiscoveredDevice>[];
    final discoveredById = {for (final device in discovered) device.id: device};
    final devices = await repository.listDevices();
    final targets = <_ClipboardSyncTarget>[];
    for (final device in devices) {
      if (!device.trusted || device.isSelf) continue;
      final discoveredDevice = discoveredById[device.id];
      final address = discoveredDevice?.address ?? device.lastAddress;
      final port = discoveredDevice?.port ?? device.lastPort;
      if (address == null || port == null) continue;

      if (discoveredDevice != null &&
          (device.lastAddress != discoveredDevice.address ||
              device.lastPort != discoveredDevice.port ||
              device.lastSeenAt != discoveredDevice.lastSeenAt)) {
        await repository.upsertDevice(
          UpsertMultiDeviceClipboardDeviceInput(
            id: device.id,
            name: discoveredDevice.name,
            platform: discoveredDevice.platform,
            trusted: true,
            isSelf: false,
            lastAddress: discoveredDevice.address,
            lastPort: discoveredDevice.port,
            lastSeenAt: discoveredDevice.lastSeenAt == 0
                ? _unixNow()
                : discoveredDevice.lastSeenAt,
          ),
        );
      }
      targets.add(_ClipboardSyncTarget(address: address, port: port));
    }
    if (targets.isEmpty) return;

    final assetBase64 = await readAssetBase64(item);
    final payload = ClipboardSyncPayload(item: item, assetBase64: assetBase64);

    await Future.wait(
      targets
          .map(
            (target) => _postJson<Map<String, dynamic>>(
              target.address,
              target.port,
              '/sync/item',
              payload.toJson(),
              (json) => json,
            ).catchError((_) => <String, dynamic>{}),
          ),
    );
  }

  Future<void> _ensureServer() async {
    if (_server != null) return;
    try {
      _server = await HttpServer.bind(InternetAddress.anyIPv4, defaultSyncPort);
    } on SocketException {
      _server = await HttpServer.bind(InternetAddress.anyIPv4, 0);
    }
    _server!.listen((request) {
      unawaited(_handleRequest(request));
    });
  }

  Future<void> _handleRequest(HttpRequest request) async {
    try {
      if (request.method == 'GET' && request.uri.path == '/status') {
        _sendJson(request.response, 200, {
          'device': _requireLocalDevice().toJson(),
        });
        return;
      }

      if (request.method == 'POST' && request.uri.path == '/pair/request') {
        final body = await _readRequestJson(request);
        final remoteAddress = _normalizeRemoteAddress(
          request.connectionInfo?.remoteAddress.address,
        );
        final requestPort =
            int.tryParse(request.headers.value('x-guyantools-port') ?? '') ?? 0;
        final remoteDeviceId = body['deviceId'] as String? ?? '';
        final remoteDeviceName = body['deviceName'] as String? ?? 'GuYanTools';
        final discovered = await repository.listDiscoveredDevices();
        final matched = _firstWhereOrNull(
          discovered,
          (device) => device.id == remoteDeviceId,
        );
        final pairingRequest = MultiDeviceClipboardPairingRequest(
          requestId: _id(),
          deviceId: remoteDeviceId,
          deviceName: remoteDeviceName,
          address: matched?.address ?? remoteAddress,
          port: requestPort == 0 ? matched?.port ?? 0 : requestPort,
          code: (_random.nextInt(900000) + 100000).toString(),
          createdAt: DateTime.now().millisecondsSinceEpoch,
        );
        _pairingRequests[pairingRequest.requestId] = pairingRequest;
        onChanged?.call();
        _sendJson(request.response, 200, pairingRequest.toJson());
        return;
      }

      if (request.method == 'POST' && request.uri.path == '/pair/approve') {
        final body = await _readRequestJson(request);
        final deviceId = body['deviceId'] as String? ?? '';
        final deviceName = body['deviceName'] as String? ?? 'GuYanTools';
        final requestPort =
            int.tryParse(request.headers.value('x-guyantools-port') ?? '') ?? 0;
        final discovered = await repository.listDiscoveredDevices();
        final matched = _firstWhereOrNull(
          discovered,
          (device) => device.id == deviceId,
        );
        await repository.upsertDevice(
          UpsertMultiDeviceClipboardDeviceInput(
            id: deviceId,
            name: deviceName,
            platform: matched?.platform ?? 'desktop',
            trusted: true,
            isSelf: false,
            lastAddress:
                matched?.address ??
                _normalizeRemoteAddress(
                  request.connectionInfo?.remoteAddress.address,
                ),
            lastPort: matched?.port ?? (requestPort == 0 ? null : requestPort),
            lastSeenAt: _unixNow(),
          ),
        );
        onChanged?.call();
        _sendJson(request.response, 200, {'ok': true});
        return;
      }

      if (request.method == 'POST' && request.uri.path == '/sync/item') {
        final body = await _readRequestJson(request);
        final payload = ClipboardSyncPayload.fromJson(body);
        await _receiveRemoteItem(payload);
        _sendJson(request.response, 200, {'ok': true});
        return;
      }

      _sendJson(request.response, 404, {'error': 'Not found'});
    } catch (error) {
      _sendJson(request.response, 500, {'error': error.toString()});
    }
  }

  Future<void> _receiveRemoteItem(ClipboardSyncPayload payload) async {
    final devices = await repository.listDevices();
    final trusted = devices.any(
      (device) => device.id == payload.item.sourceDeviceId && device.trusted,
    );
    if (!trusted) {
      throw StateError('设备尚未配对，拒绝同步内容');
    }

    if (payload.assetBase64 != null) {
      final estimatedBytes = (payload.assetBase64!.length * 3 / 4).ceil();
      if (estimatedBytes > _boundedMaxSyncBytes()) {
        throw StateError('接收内容超过最大同步大小');
      }
    }

    await onReceivePayload(payload);
    onChanged?.call();
  }

  Future<Map<String, dynamic>> _readRequestJson(HttpRequest request) async {
    final limit = min(
      maxSyncBytesHardLimit * 2,
      _boundedMaxSyncBytes() * 2 + 1024,
    );
    final bytes = <int>[];
    await for (final chunk in request) {
      bytes.addAll(chunk);
      if (bytes.length > limit) {
        throw StateError('请求内容超过最大同步大小');
      }
    }
    final decoded = jsonDecode(utf8.decode(bytes));
    return Map<String, dynamic>.from(decoded as Map);
  }

  Future<T> _postJson<T>(
    String address,
    int port,
    String route,
    Map<String, dynamic> body,
    T Function(Map<String, dynamic> json) convert,
  ) async {
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 5);
    try {
      final uri = Uri.parse(
        'http://${_formatAddressForUrl(address)}:$port$route',
      );
      final request = await client.postUrl(uri);
      request.headers.contentType = ContentType.json;
      request.headers.set('x-guyantools-port', this.port.toString());
      request.write(jsonEncode(body));
      final response = await request.close();
      final content = await utf8.decodeStream(response);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException('请求失败：${response.statusCode}', uri: uri);
      }
      return convert(Map<String, dynamic>.from(jsonDecode(content) as Map));
    } finally {
      client.close(force: true);
    }
  }

  Future<T> _getJson<T>(
    String address,
    int port,
    String route,
    T Function(Map<String, dynamic> json) convert,
  ) async {
    final client = HttpClient();
    try {
      final uri = Uri.parse(
        'http://${_formatAddressForUrl(address)}:$port$route',
      );
      final request = await client.getUrl(uri);
      final response = await request.close();
      final content = await utf8.decodeStream(response);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException('请求失败：${response.statusCode}', uri: uri);
      }
      return convert(Map<String, dynamic>.from(jsonDecode(content) as Map));
    } finally {
      client.close(force: true);
    }
  }

  void _sendJson(
    HttpResponse response,
    int statusCode,
    Map<String, dynamic> payload,
  ) {
    response.statusCode = statusCode;
    response.headers.contentType = ContentType.json;
    response.write(jsonEncode(payload));
    unawaited(response.close());
  }

  void _startDiscoveryPolling() {
    _discoveryTimer ??= Timer.periodic(const Duration(seconds: 2), (_) {
      unawaited(refreshDiscoveredDevices());
    });
  }

  Future<List<String>> _localIpv4Addresses() async {
    final interfaces = await NetworkInterface.list(
      type: InternetAddressType.IPv4,
      includeLoopback: false,
    );
    return interfaces
        .expand((item) => item.addresses)
        .map((address) => address.address)
        .where((address) => _parseIpv4(address) != null)
        .toSet()
        .toList();
  }

  int _boundedMaxSyncBytes() {
    return max(1, min(maxSyncBytes(), maxSyncBytesHardLimit));
  }

  MultiDeviceClipboardDevice _requireLocalDevice() {
    final device = _localDevice;
    if (device == null) {
      throw StateError('本机剪贴板设备尚未初始化');
    }
    return device;
  }

  String _id() {
    final time = DateTime.now().microsecondsSinceEpoch.toRadixString(16);
    final random = List.generate(
      8,
      (_) => _random.nextInt(16).toRadixString(16),
    ).join();
    return '$time-$random';
  }

  int _unixNow() => DateTime.now().millisecondsSinceEpoch ~/ 1000;
}

T? _firstWhereOrNull<T>(Iterable<T> values, bool Function(T value) test) {
  for (final value in values) {
    if (test(value)) return value;
  }
  return null;
}

class _ClipboardSyncTarget {
  final String address;
  final int port;

  const _ClipboardSyncTarget({required this.address, required this.port});
}

List<int>? _parseIpv4(String address) {
  final parts = address.split('.').map(int.tryParse).toList();
  if (parts.length != 4 ||
      parts.any((part) => part == null || part < 0 || part > 255)) {
    return null;
  }
  return parts.cast<int>();
}

String _normalizeRemoteAddress(String? value) {
  if (value == null || value.isEmpty) return '127.0.0.1';
  if (value.startsWith('::ffff:')) return value.substring('::ffff:'.length);
  return value == '::1' ? '127.0.0.1' : value;
}

String _formatAddressForUrl(String address) {
  return address.contains(':') && !address.startsWith('[')
      ? '[$address]'
      : address;
}

({String address, int port}) _parseManualPairingEndpoint(String endpoint) {
  final trimmed = endpoint.trim();
  if (trimmed.isEmpty) {
    throw StateError('请输入设备 IP 地址');
  }
  final withoutScheme = trimmed
      .replaceFirst(RegExp(r'^https?://', caseSensitive: false), '')
      .replaceFirst(RegExp(r'/.*$'), '');
  final ipv6Match = RegExp(
    r'^\[([^\]]+)\](?::(\d+))?$',
  ).firstMatch(withoutScheme);
  if (ipv6Match != null) {
    return (address: ipv6Match.group(1)!, port: _parsePort(ipv6Match.group(2)));
  }
  final firstColon = withoutScheme.indexOf(':');
  final lastColon = withoutScheme.lastIndexOf(':');
  if (firstColon > -1 && firstColon == lastColon) {
    return (
      address: withoutScheme.substring(0, lastColon),
      port: _parsePort(withoutScheme.substring(lastColon + 1)),
    );
  }
  return (address: withoutScheme, port: ClipboardSyncService.defaultSyncPort);
}

int _parsePort(String? value) {
  if (value == null || value.isEmpty) {
    return ClipboardSyncService.defaultSyncPort;
  }
  final port = int.tryParse(value);
  if (port == null || port < 1 || port > 65535) {
    throw StateError('端口必须是 1-65535 之间的数字');
  }
  return port;
}
