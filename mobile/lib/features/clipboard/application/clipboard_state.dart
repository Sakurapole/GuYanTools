import 'package:freezed_annotation/freezed_annotation.dart';

import '../domain/clipboard_models.dart';

part 'clipboard_state.freezed.dart';

@freezed
abstract class ClipboardUiState with _$ClipboardUiState {
  const ClipboardUiState._();

  const factory ClipboardUiState({
    @Default(<MultiDeviceClipboardItem>[]) List<MultiDeviceClipboardItem> items,
    @Default(<MultiDeviceClipboardDevice>[])
    List<MultiDeviceClipboardDevice> devices,
    @Default(<MultiDeviceClipboardDiscoveredDevice>[])
    List<MultiDeviceClipboardDiscoveredDevice> discoveredDevices,
    @Default(<MultiDeviceClipboardDeviceStatus>[])
    List<MultiDeviceClipboardDeviceStatus> deviceStatuses,
    @Default(<MultiDeviceClipboardPairingRequest>[])
    List<MultiDeviceClipboardPairingRequest> pairingRequests,
    MultiDeviceClipboardDevice? localDevice,
    @Default(ClipboardContentFilter.all) ClipboardContentFilter filter,
    @Default('') String query,
    @Default(false) bool syncEnabled,
    @Default(false) bool backgroundSyncEnabled,
    @Default(false) bool syncRunning,
    @Default(200) int historyLimit,
    @Default(100 * 1024 * 1024) int maxSyncBytes,
    @Default('') String deviceName,
    String? error,
  }) = _ClipboardUiState;

  int get totalCount => items.length;

  List<MultiDeviceClipboardItem> get visibleItems {
    final normalizedQuery = query.trim().toLowerCase();
    return items.where((item) {
      final matchesFilter = switch (filter) {
        ClipboardContentFilter.all => true,
        ClipboardContentFilter.text => item.isText,
        ClipboardContentFilter.image =>
          item.isImage || item.tags.contains('image'),
        ClipboardContentFilter.video => item.isVideo,
        ClipboardContentFilter.file =>
          item.isFile && !item.isImage && !item.isVideo,
        ClipboardContentFilter.localOnly => item.localOnly,
      };
      if (!matchesFilter) return false;
      if (normalizedQuery.isEmpty) return true;
      final haystack = [
        item.text,
        item.fileName,
        item.sourceDeviceName,
        item.mimeType,
        item.tags.join(' '),
      ].whereType<String>().join('\n').toLowerCase();
      return haystack.contains(normalizedQuery);
    }).toList();
  }
}
