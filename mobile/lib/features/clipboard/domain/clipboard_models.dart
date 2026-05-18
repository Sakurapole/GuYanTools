import 'dart:convert';

enum ClipboardContentFilter { all, text, image, video, file, localOnly }

enum ClipboardContentKind { text, image, video, file }

enum ClipboardSyncStatus { disabled, starting, running, stopped }

class MultiDeviceClipboardItem {
  final String id;
  final String sourceDeviceId;
  final String sourceDeviceName;
  final String contentType;
  final String? mimeType;
  final String? text;
  final String? fileName;
  final String? assetPath;
  final String? previewPath;
  final int byteSize;
  final String contentHash;
  final String tagsJson;
  final bool localOnly;
  final int createdAt;
  final int updatedAt;

  const MultiDeviceClipboardItem({
    required this.id,
    required this.sourceDeviceId,
    required this.sourceDeviceName,
    required this.contentType,
    required this.byteSize,
    required this.contentHash,
    required this.tagsJson,
    required this.localOnly,
    required this.createdAt,
    required this.updatedAt,
    this.mimeType,
    this.text,
    this.fileName,
    this.assetPath,
    this.previewPath,
  });

  bool get isText => contentType == 'text';
  bool get isImage => contentType == 'image';
  bool get isVideo => tags.contains('video') || contentType == 'video';
  bool get isFile => contentType == 'file' || isImage || isVideo;

  ClipboardContentKind get kind {
    if (isText) return ClipboardContentKind.text;
    if (isImage) return ClipboardContentKind.image;
    if (isVideo) return ClipboardContentKind.video;
    return ClipboardContentKind.file;
  }

  List<String> get tags {
    try {
      final decoded = jsonDecode(tagsJson);
      return decoded is List ? decoded.whereType<String>().toList() : const [];
    } catch (_) {
      return const [];
    }
  }

  String get displayTitle {
    if (isText) {
      final value = text?.trim() ?? '';
      return value.isEmpty ? '文本' : value;
    }
    return fileName ?? contentType;
  }

  MultiDeviceClipboardItem copyWith({
    String? assetPath,
    String? previewPath,
    int? byteSize,
    bool? localOnly,
    int? updatedAt,
  }) {
    return MultiDeviceClipboardItem(
      id: id,
      sourceDeviceId: sourceDeviceId,
      sourceDeviceName: sourceDeviceName,
      contentType: contentType,
      mimeType: mimeType,
      text: text,
      fileName: fileName,
      assetPath: assetPath ?? this.assetPath,
      previewPath: previewPath ?? this.previewPath,
      byteSize: byteSize ?? this.byteSize,
      contentHash: contentHash,
      tagsJson: tagsJson,
      localOnly: localOnly ?? this.localOnly,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'sourceDeviceId': sourceDeviceId,
    'sourceDeviceName': sourceDeviceName,
    'contentType': contentType,
    'mimeType': mimeType,
    'text': text,
    'fileName': fileName,
    'assetPath': assetPath,
    'previewPath': previewPath,
    'byteSize': byteSize,
    'contentHash': contentHash,
    'tagsJson': tagsJson,
    'localOnly': localOnly,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };

  factory MultiDeviceClipboardItem.fromJson(Map<String, dynamic> json) {
    return MultiDeviceClipboardItem(
      id: json['id'] as String,
      sourceDeviceId: json['sourceDeviceId'] as String,
      sourceDeviceName: json['sourceDeviceName'] as String,
      contentType: json['contentType'] as String,
      mimeType: json['mimeType'] as String?,
      text: json['text'] as String?,
      fileName: json['fileName'] as String?,
      assetPath: json['assetPath'] as String?,
      previewPath: json['previewPath'] as String?,
      byteSize: (json['byteSize'] as num?)?.toInt() ?? 0,
      contentHash: json['contentHash'] as String,
      tagsJson: json['tagsJson'] as String? ?? '[]',
      localOnly: json['localOnly'] as bool? ?? false,
      createdAt: (json['createdAt'] as num?)?.toInt() ?? 0,
      updatedAt: (json['updatedAt'] as num?)?.toInt() ?? 0,
    );
  }
}

class UpsertMultiDeviceClipboardItemInput {
  final String id;
  final String sourceDeviceId;
  final String sourceDeviceName;
  final String contentType;
  final String? mimeType;
  final String? text;
  final String? fileName;
  final String? assetPath;
  final String? previewPath;
  final int? byteSize;
  final String contentHash;
  final String? tagsJson;
  final bool? localOnly;
  final int? createdAt;

  const UpsertMultiDeviceClipboardItemInput({
    required this.id,
    required this.sourceDeviceId,
    required this.sourceDeviceName,
    required this.contentType,
    required this.contentHash,
    this.mimeType,
    this.text,
    this.fileName,
    this.assetPath,
    this.previewPath,
    this.byteSize,
    this.tagsJson,
    this.localOnly,
    this.createdAt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'sourceDeviceId': sourceDeviceId,
    'sourceDeviceName': sourceDeviceName,
    'contentType': contentType,
    'mimeType': mimeType,
    'text': text,
    'fileName': fileName,
    'assetPath': assetPath,
    'previewPath': previewPath,
    'byteSize': byteSize,
    'contentHash': contentHash,
    'tagsJson': tagsJson,
    'localOnly': localOnly,
    'createdAt': createdAt,
  };
}

class MultiDeviceClipboardDevice {
  final String id;
  final String name;
  final String platform;
  final String? publicKey;
  final bool trusted;
  final bool isSelf;
  final String? lastAddress;
  final int? lastPort;
  final int? lastSeenAt;
  final int createdAt;
  final int updatedAt;

  const MultiDeviceClipboardDevice({
    required this.id,
    required this.name,
    required this.platform,
    required this.trusted,
    required this.isSelf,
    required this.createdAt,
    required this.updatedAt,
    this.publicKey,
    this.lastAddress,
    this.lastPort,
    this.lastSeenAt,
  });

  MultiDeviceClipboardDevice copyWith({
    String? name,
    String? platform,
    bool? trusted,
    bool? isSelf,
    String? lastAddress,
    int? lastPort,
    int? lastSeenAt,
    int? updatedAt,
  }) {
    return MultiDeviceClipboardDevice(
      id: id,
      name: name ?? this.name,
      platform: platform ?? this.platform,
      publicKey: publicKey,
      trusted: trusted ?? this.trusted,
      isSelf: isSelf ?? this.isSelf,
      lastAddress: lastAddress ?? this.lastAddress,
      lastPort: lastPort ?? this.lastPort,
      lastSeenAt: lastSeenAt ?? this.lastSeenAt,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'platform': platform,
    'publicKey': publicKey,
    'trusted': trusted,
    'isSelf': isSelf,
    'lastAddress': lastAddress,
    'lastPort': lastPort,
    'lastSeenAt': lastSeenAt,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };

  factory MultiDeviceClipboardDevice.fromJson(Map<String, dynamic> json) {
    return MultiDeviceClipboardDevice(
      id: json['id'] as String,
      name: json['name'] as String,
      platform: json['platform'] as String? ?? 'android',
      publicKey: json['publicKey'] as String?,
      trusted: json['trusted'] as bool? ?? false,
      isSelf: json['isSelf'] as bool? ?? false,
      lastAddress: json['lastAddress'] as String?,
      lastPort: (json['lastPort'] as num?)?.toInt(),
      lastSeenAt: (json['lastSeenAt'] as num?)?.toInt(),
      createdAt: (json['createdAt'] as num?)?.toInt() ?? 0,
      updatedAt: (json['updatedAt'] as num?)?.toInt() ?? 0,
    );
  }
}

class UpsertMultiDeviceClipboardDeviceInput {
  final String id;
  final String name;
  final String? platform;
  final String? publicKey;
  final bool? trusted;
  final bool? isSelf;
  final String? lastAddress;
  final int? lastPort;
  final int? lastSeenAt;

  const UpsertMultiDeviceClipboardDeviceInput({
    required this.id,
    required this.name,
    this.platform,
    this.publicKey,
    this.trusted,
    this.isSelf,
    this.lastAddress,
    this.lastPort,
    this.lastSeenAt,
  });
}

class MultiDeviceClipboardDiscoveredDevice {
  final String id;
  final String name;
  final String platform;
  final String address;
  final int port;
  final String serviceName;
  final int lastSeenAt;

  const MultiDeviceClipboardDiscoveredDevice({
    required this.id,
    required this.name,
    required this.platform,
    required this.address,
    required this.port,
    required this.serviceName,
    required this.lastSeenAt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'platform': platform,
    'address': address,
    'port': port,
    'serviceName': serviceName,
    'lastSeenAt': lastSeenAt,
  };

  factory MultiDeviceClipboardDiscoveredDevice.fromJson(
    Map<String, dynamic> json,
  ) {
    return MultiDeviceClipboardDiscoveredDevice(
      id: json['id'] as String,
      name: json['name'] as String,
      platform: json['platform'] as String? ?? 'desktop',
      address: json['address'] as String,
      port: (json['port'] as num).toInt(),
      serviceName: json['serviceName'] as String? ?? '',
      lastSeenAt: (json['lastSeenAt'] as num?)?.toInt() ?? 0,
    );
  }
}

class MultiDeviceClipboardDeviceStatus {
  final String deviceId;
  final String name;
  final String platform;
  final bool trusted;
  final bool isSelf;
  final String state;
  final bool online;
  final String? lastAddress;
  final int? lastPort;
  final int? lastSeenAt;
  final int? secondsSinceSeen;

  const MultiDeviceClipboardDeviceStatus({
    required this.deviceId,
    required this.name,
    required this.platform,
    required this.trusted,
    required this.isSelf,
    required this.state,
    required this.online,
    this.lastAddress,
    this.lastPort,
    this.lastSeenAt,
    this.secondsSinceSeen,
  });

  bool get isTrustedOnline => state == 'trustedOnline';
  bool get isTrustedOffline => state == 'trustedOffline';
  bool get isAvailable => state == 'available';

  factory MultiDeviceClipboardDeviceStatus.fromJson(
    Map<String, dynamic> json,
  ) {
    return MultiDeviceClipboardDeviceStatus(
      deviceId: json['deviceId'] as String,
      name: json['name'] as String,
      platform: json['platform'] as String? ?? 'desktop',
      trusted: json['trusted'] as bool? ?? false,
      isSelf: json['isSelf'] as bool? ?? false,
      state: json['state'] as String? ?? 'unknown',
      online: json['online'] as bool? ?? false,
      lastAddress: json['lastAddress'] as String?,
      lastPort: (json['lastPort'] as num?)?.toInt(),
      lastSeenAt: (json['lastSeenAt'] as num?)?.toInt(),
      secondsSinceSeen: (json['secondsSinceSeen'] as num?)?.toInt(),
    );
  }
}

class MultiDeviceClipboardPairingRequest {
  final String requestId;
  final String deviceId;
  final String deviceName;
  final String address;
  final int port;
  final String code;
  final int createdAt;

  const MultiDeviceClipboardPairingRequest({
    required this.requestId,
    required this.deviceId,
    required this.deviceName,
    required this.address,
    required this.port,
    required this.code,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
    'requestId': requestId,
    'deviceId': deviceId,
    'deviceName': deviceName,
    'address': address,
    'port': port,
    'code': code,
    'createdAt': createdAt,
  };

  factory MultiDeviceClipboardPairingRequest.fromJson(
    Map<String, dynamic> json,
  ) {
    return MultiDeviceClipboardPairingRequest(
      requestId: json['requestId'] as String,
      deviceId: json['deviceId'] as String,
      deviceName: json['deviceName'] as String,
      address: json['address'] as String,
      port: (json['port'] as num?)?.toInt() ?? 0,
      code: json['code'] as String? ?? '',
      createdAt: (json['createdAt'] as num?)?.toInt() ?? 0,
    );
  }
}

class ClipboardSyncPayload {
  final MultiDeviceClipboardItem item;
  final String? assetBase64;

  const ClipboardSyncPayload({required this.item, this.assetBase64});

  Map<String, dynamic> toJson() => {
    'item': item.toJson(),
    'assetBase64': assetBase64,
  };

  factory ClipboardSyncPayload.fromJson(Map<String, dynamic> json) {
    return ClipboardSyncPayload(
      item: MultiDeviceClipboardItem.fromJson(
        Map<String, dynamic>.from(json['item'] as Map),
      ),
      assetBase64: json['assetBase64'] as String?,
    );
  }
}
