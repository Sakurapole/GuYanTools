import 'package:flutter/services.dart';

class ClipboardPlatformChannel {
  static const _channel = MethodChannel('guyantools/clipboard');

  Future<String?> readText() async {
    final result = await _channel.invokeMethod<String>('readText');
    return result?.isEmpty == true ? null : result;
  }

  Future<String?> takePendingReadText() async {
    final result = await _channel.invokeMethod<String>('takePendingReadText');
    return result?.isEmpty == true ? null : result;
  }

  Future<void> installReadShortcut() {
    return _channel.invokeMethod<void>('installReadShortcut');
  }

  Future<void> writeText(String text) {
    return _channel.invokeMethod<void>('writeText', {'text': text});
  }

  Future<void> writeFile(String path, {String? mimeType}) {
    return _channel.invokeMethod<void>('writeFile', {
      'path': path,
      'mimeType': mimeType,
    });
  }
}
