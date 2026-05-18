import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme_controller.dart';
import '../../design_system/design_system.dart';
import '../../features/clipboard/application/clipboard_controller.dart';
import '../../features/clipboard/application/clipboard_state.dart';
import '../../features/clipboard/domain/clipboard_models.dart';
import '../widgets/input_dialogs.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  bool _keepSessions = true;
  bool _localEncryption = true;

  @override
  Widget build(BuildContext context) {
    final themeMode = ref.watch(themeModeProvider);
    final clipboard = ref.watch(clipboardControllerProvider);
    final isLight = themeMode == ThemeMode.light;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          const SliverToBoxAdapter(child: AppTopBar(title: 'GuYanTools')),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 112),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                Text('设置', style: Theme.of(context).textTheme.displayLarge),
                const SizedBox(height: 4),
                Text('全局偏好与功能配置', style: Theme.of(context).textTheme.bodyLarge),
                const SizedBox(height: 24),
                AppSettingSection(
                  title: '通用',
                  icon: Icons.tune,
                  children: [
                    const AppSettingRow(title: '首页组件布局', showChevron: true),
                    AppSettingRow(
                      title: '浅色模式',
                      trailing: Switch(
                        value: isLight,
                        onChanged: (value) => ref
                            .read(themeModeProvider.notifier)
                            .setThemeMode(
                              value ? ThemeMode.light : ThemeMode.dark,
                            ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                AppSettingSection(
                  title: '终端',
                  icon: Icons.terminal,
                  children: [
                    const AppSettingRow(
                      title: '默认 Shell',
                      value: '/bin/zsh',
                      showChevron: true,
                    ),
                    const AppSettingRow(title: '快捷命令管理', showChevron: true),
                    AppSettingRow(
                      title: '保留会话',
                      subtitle: '后台运行时保持连接活跃',
                      trailing: Switch(
                        value: _keepSessions,
                        onChanged: (value) =>
                            setState(() => _keepSessions = value),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                clipboard.when(
                  loading: () => const AppSettingSection(
                    title: '剪贴板',
                    icon: Icons.content_paste_outlined,
                    children: [AppSettingRow(title: '正在加载剪贴板配置')],
                  ),
                  error: (error, stackTrace) => AppSettingSection(
                    title: '剪贴板',
                    icon: Icons.content_paste_outlined,
                    children: [
                      AppSettingRow(
                        title: '剪贴板初始化失败',
                        subtitle: error.toString(),
                      ),
                    ],
                  ),
                  data: (clipboardState) =>
                      _ClipboardSettingsSection(state: clipboardState),
                ),
                const SizedBox(height: 16),
                AppSettingSection(
                  title: '插件与安全',
                  icon: Icons.security,
                  children: [
                    const AppSettingRow(title: '插件权限', showChevron: true),
                    AppSettingRow(
                      title: '本地加密',
                      subtitle: '使用设备密码保护敏感数据',
                      trailing: Switch(
                        value: _localEncryption,
                        onChanged: (value) =>
                            setState(() => _localEncryption = value),
                      ),
                    ),
                  ],
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClipboardSettingsSection extends ConsumerWidget {
  final ClipboardUiState state;

  const _ClipboardSettingsSection({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(clipboardControllerProvider.notifier);

    return AppSettingSection(
      title: '剪贴板',
      icon: Icons.content_paste_outlined,
      children: [
        AppSettingRow(
          title: '多设备剪贴板',
          subtitle: state.syncRunning ? 'mDNS 发现与同步接收已启动' : '使用局域网发现、配对和同步',
          trailing: Switch(
            value: state.syncEnabled,
            onChanged: controller.setSyncEnabled,
          ),
        ),
        if (state.error != null)
          AppSettingRow(title: '剪贴板状态', subtitle: state.error),
        AppSettingRow(
          title: '局域网发现',
          subtitle: state.syncRunning
              ? _syncDiscoverySummary(state)
              : '开启多设备剪贴板后会自动监听局域网设备',
          value: state.syncRunning ? '运行中' : '未启动',
          trailing: IconButton(
            tooltip: '刷新设备',
            icon: const Icon(Icons.refresh),
            onPressed: state.syncRunning ? () => controller.refreshAll() : null,
          ),
        ),
        AppSettingRow(
          title: '手动输入 IP 配对',
          subtitle: 'mDNS 被拦截时，可输入 192.168.0.49 或 192.168.0.49:49649',
          showChevron: true,
          onTap: state.syncRunning
              ? () => _showManualPairingDialog(context, ref)
              : null,
        ),
        AppSettingRow(
          title: '设备名称',
          value: state.deviceName,
          showChevron: true,
          onTap: () => _showDeviceNameDialog(context, ref, state),
        ),
        AppSettingRow(
          title: '历史上限',
          value: '${state.historyLimit} 条',
          showChevron: true,
          onTap: () => _showHistoryLimitDialog(context, ref, state),
        ),
        AppSettingRow(
          title: '最大同步大小',
          subtitle: '超过上限的文件只保留本机记录',
          value: _formatBytes(state.maxSyncBytes),
          showChevron: true,
          onTap: () => _showMaxSyncSizeDialog(context, ref, state),
        ),
        AppSettingRow(
          title: 'Android 后台同步',
          subtitle: state.syncEnabled
              ? '前台服务保持 HTTP 接收、mDNS 发现和通知读取按钮'
              : '需先开启多设备剪贴板',
          trailing: Switch(
            value: state.syncEnabled && state.backgroundSyncEnabled,
            onChanged: state.syncEnabled
                ? controller.setBackgroundSyncEnabled
                : null,
          ),
        ),
        AppSettingRow(
          title: '添加读取剪贴板快捷方式',
          subtitle: '添加桌面快捷方式，用透明前台页读取系统剪贴板',
          showChevron: true,
          onTap: controller.installReadShortcut,
        ),
        AppSettingRow(title: '本地记录', value: '${state.totalCount} 条'),
        _DeviceList(state: state),
      ],
    );
  }
}

class _DeviceList extends ConsumerWidget {
  final ClipboardUiState state;

  const _DeviceList({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(clipboardControllerProvider.notifier);
    final available = state.deviceStatuses
        .where((device) => device.state == 'available')
        .toList();
    final devices = state.deviceStatuses
        .where(
          (device) =>
              !device.isSelf &&
              (device.state == 'trustedOnline' ||
                  device.state == 'trustedOffline' ||
                  device.state == 'unknown'),
        )
        .toList();
    final requests = state.pairingRequests;

    return Column(
      children: [
        if (requests.isEmpty && available.isEmpty && devices.isEmpty)
          AppSettingRow(
            title: state.syncRunning ? '正在监听局域网设备' : '设备发现未启动',
            subtitle: state.syncRunning
                ? '没有发现可配对设备时，请确认两端都已开启同步且网络可访问'
                : '开启后会显示可配对设备和收到的配对请求',
          ),
        for (final request in requests)
          AppSettingRow(
            title: '${request.deviceName} 请求配对',
            subtitle: '验证码 ${request.code}',
            trailing: Wrap(
              spacing: 4,
              children: [
                IconButton(
                  tooltip: '拒绝',
                  icon: const Icon(Icons.close),
                  onPressed: () => controller.rejectPairing(request.requestId),
                ),
                IconButton(
                  tooltip: '允许',
                  icon: const Icon(Icons.check),
                  onPressed: () => controller.approvePairing(request.requestId),
                ),
              ],
            ),
          ),
        for (final device in available)
          AppSettingRow(
            title: device.name,
            subtitle: _deviceStatusSubtitle(device),
            trailing: FilledButton.tonal(
              onPressed: () =>
                  _startPairing(context, controller, device.deviceId),
              child: const Text('配对'),
            ),
          ),
        if (devices.isNotEmpty)
          AppSettingRow(
            title: '已保存设备',
            subtitle: '已配对设备会自动收发剪贴板，未信任设备需要重新配对',
            value: '${devices.length} 台',
          ),
        for (final device in devices)
          AppSettingRow(
            title: device.name,
            subtitle: _deviceStatusSubtitle(device),
            trailing: IconButton(
              tooltip: '忘记设备',
              icon: const Icon(Icons.link_off),
              onPressed: () => controller.forgetDevice(device.deviceId),
            ),
          ),
      ],
    );
  }
}

String _syncDiscoverySummary(ClipboardUiState state) {
  final pending = state.pairingRequests.length;
  final available = state.deviceStatuses
      .where((device) => device.state == 'available')
      .length;
  final online = state.deviceStatuses
      .where((device) => device.state == 'trustedOnline')
      .length;
  final offline = state.deviceStatuses
      .where((device) => device.state == 'trustedOffline')
      .length;
  if (pending > 0) return '$pending 个配对请求待处理';
  if (available > 0) return '发现 $available 台可配对设备';
  if (online + offline > 0) return '$online 在线 · $offline 离线';
  return '正在监听局域网设备';
}

String _deviceStatusSubtitle(MultiDeviceClipboardDeviceStatus device) {
  final endpoint = device.lastAddress == null
      ? ''
      : '${device.lastAddress}${device.lastPort == null ? '' : ':${device.lastPort}'}';
  return [
    _deviceStatusLabel(device),
    device.platform,
    endpoint,
    _lastSeenLabel(device),
  ].where((value) => value.isNotEmpty).join(' · ');
}

String _deviceStatusLabel(MultiDeviceClipboardDeviceStatus device) {
  return switch (device.state) {
    'trustedOnline' => '在线',
    'trustedOffline' => '离线',
    'available' => '可配对',
    _ => device.trusted ? '已信任' : '未信任',
  };
}

String _lastSeenLabel(MultiDeviceClipboardDeviceStatus device) {
  final seconds = device.secondsSinceSeen;
  if (seconds == null) return '';
  if (seconds <= 5) return '刚刚发现';
  if (seconds < 60) return '$seconds 秒前';
  if (seconds < 3600) return '${(seconds / 60).round()} 分钟前';
  return '${(seconds / 3600).round()} 小时前';
}

Future<void> _startPairing(
  BuildContext context,
  ClipboardController controller,
  String deviceId,
) async {
  try {
    final request = await controller.startPairing(deviceId);
    if (!context.mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('已发送配对请求，验证码 ${request.code}')));
  } catch (error) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('发起配对失败：$error')));
  }
}

Future<void> _showManualPairingDialog(
  BuildContext context,
  WidgetRef ref,
) async {
  final endpoint = await showDialog<String>(
    context: context,
    builder: (_) => const AetherTextInputDialog(
      title: '手动配对',
      hintText: '192.168.0.49 或 192.168.0.49:49649',
      confirmLabel: '配对',
      keyboardType: TextInputType.url,
      normalize: _normalizeManualPairingEndpoint,
    ),
  );
  if (endpoint == null || endpoint.isEmpty) return;
  await _afterDialogDismissed();
  try {
    final request = await ref
        .read(clipboardControllerProvider.notifier)
        .startPairingByEndpoint(endpoint);
    if (!context.mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('已发送配对请求，验证码 ${request.code}')));
  } catch (error) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('手动配对失败：$error')));
  }
}

String _normalizeManualPairingEndpoint(String value) => value.trim();

Future<void> _showDeviceNameDialog(
  BuildContext context,
  WidgetRef ref,
  ClipboardUiState state,
) async {
  final value = await showDialog<String>(
    context: context,
    builder: (_) => AetherTextInputDialog(
      title: '设备名称',
      initialValue: state.deviceName,
      normalize: (value) => value.trim(),
    ),
  );
  if (value != null) {
    await _afterDialogDismissed();
    await ref.read(clipboardControllerProvider.notifier).setDeviceName(value);
  }
}

Future<void> _showHistoryLimitDialog(
  BuildContext context,
  WidgetRef ref,
  ClipboardUiState state,
) async {
  final rawValue = await showDialog<String>(
    context: context,
    builder: (_) => AetherTextInputDialog(
      title: '历史上限',
      initialValue: state.historyLimit.toString(),
      keyboardType: TextInputType.number,
      normalize: (value) => value.trim(),
    ),
  );
  final value = rawValue == null ? null : int.tryParse(rawValue);
  if (value != null) {
    await _afterDialogDismissed();
    await ref.read(clipboardControllerProvider.notifier).setHistoryLimit(value);
  }
}

Future<void> _showMaxSyncSizeDialog(
  BuildContext context,
  WidgetRef ref,
  ClipboardUiState state,
) async {
  double mb = state.maxSyncBytes / 1024 / 1024;
  final value = await showDialog<int>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('最大同步大小'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Slider(
              min: 1,
              max: 1024,
              divisions: 1023,
              value: mb.clamp(1, 1024),
              label: '${mb.round()} MB',
              onChanged: (value) => setState(() => mb = value),
            ),
            Text('${mb.round()} MB，最大 1 GB'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context, rootNavigator: true).pop(),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(
              context,
              rootNavigator: true,
            ).pop((mb * 1024 * 1024).round()),
            child: const Text('保存'),
          ),
        ],
      ),
    ),
  );
  if (value != null) {
    await _afterDialogDismissed();
    await ref.read(clipboardControllerProvider.notifier).setMaxSyncBytes(value);
  }
}

Future<void> _afterDialogDismissed() {
  return Future<void>.delayed(const Duration(milliseconds: 180));
}

String _formatBytes(int bytes) {
  if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
  if (bytes < 1024 * 1024 * 1024) {
    return '${(bytes / 1024 / 1024).round()} MB';
  }
  return '${(bytes / 1024 / 1024 / 1024).toStringAsFixed(1)} GB';
}
