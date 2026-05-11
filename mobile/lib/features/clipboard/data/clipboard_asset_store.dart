import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

class ClipboardAssetStore {
  final Directory directory;

  const ClipboardAssetStore(this.directory);

  Future<String> writeBytes(String fileName, Uint8List bytes) async {
    final safeName = _safeFileName(fileName);
    final target = File(joinPath(directory.path, safeName));
    await target.parent.create(recursive: true);
    await target.writeAsBytes(bytes, flush: true);
    return target.path;
  }

  String _safeFileName(String value) {
    final sanitized = value
        .replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1F]'), '_')
        .trim();
    if (sanitized.isEmpty) {
      return '${DateTime.now().microsecondsSinceEpoch}.bin';
    }
    return sanitized.substring(0, min(sanitized.length, 180));
  }
}

String joinPath(String base, String child) {
  final separator = Platform.pathSeparator;
  if (base.endsWith('/') || base.endsWith(r'\')) return '$base$child';
  return '$base$separator$child';
}

String basename(String path) {
  final normalized = path.replaceAll(r'\', '/');
  final index = normalized.lastIndexOf('/');
  return index == -1 ? normalized : normalized.substring(index + 1);
}

String extension(String fileName) {
  final base = basename(fileName);
  final index = base.lastIndexOf('.');
  return index <= 0 ? '' : base.substring(index);
}
