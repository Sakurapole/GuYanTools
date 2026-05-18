import '../bridge/frb_generated.dart';

class RustBridgeInitializer {
  static Future<void>? _initFuture;

  const RustBridgeInitializer._();

  static Future<void> ensureInitialized() {
    return _initFuture ??= RustLib.init();
  }
}
