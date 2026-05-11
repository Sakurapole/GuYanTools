import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../design_system/design_system.dart';
import '../../features/clipboard/application/clipboard_controller.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clipboardCount = ref.watch(
      clipboardControllerProvider.select(
        (value) => value.value?.totalCount ?? 0,
      ),
    );
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          const SliverToBoxAdapter(child: AppTopBar(title: 'GuYanTools')),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 112),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _Header(clipboardCount: clipboardCount),
                const SizedBox(height: 16),
                const AppSearchField(hintText: '搜索组件、命令或插件...'),
                const SizedBox(height: 24),
                _WorkbenchGrid(clipboardCount: clipboardCount),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final int clipboardCount;

  const _Header({required this.clipboardCount});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('工作台', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                '8 个组件可用 · $clipboardCount 条剪贴板历史',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
        Row(
          children: [
            _RoundButton(icon: Icons.edit_outlined, color: cs.onSurfaceVariant),
            const SizedBox(width: 8),
            _RoundButton(
              icon: Icons.add,
              color: cs.onPrimary,
              fill: cs.primary,
            ),
          ],
        ),
      ],
    );
  }
}

class _WorkbenchGrid extends StatelessWidget {
  final int clipboardCount;

  const _WorkbenchGrid({required this.clipboardCount});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 3,
              child: _TerminalPreview(onTap: () => context.push('/terminal')),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: _ClipboardSummary(
                count: clipboardCount,
                onTap: () => context.go('/clipboard'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _PluginCard()),
            const SizedBox(width: 12),
            Expanded(
              child: _ShortcutCard(icon: Icons.dns, label: 'SSH'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: const [
            Expanded(
              child: _ShortcutCard(icon: Icons.folder_open, label: 'FTP'),
            ),
            SizedBox(width: 12),
            Expanded(
              child: _ShortcutCard(icon: Icons.language, label: 'Web'),
            ),
            SizedBox(width: 12),
            Expanded(
              child: _ShortcutCard(
                icon: Icons.notifications_outlined,
                label: '通知',
                alert: true,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _TerminalPreview extends StatelessWidget {
  final VoidCallback onTap;

  const _TerminalPreview({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      color: AppColors.terminal,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.terminal, color: cs.primaryContainer, size: 18),
                const SizedBox(width: 8),
                Text(
                  'local-shell',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: AppColors.inverseOnSurface,
                  ),
                ),
                const Spacer(),
                const Icon(
                  Icons.content_copy,
                  color: AppColors.inverseOnSurface,
                  size: 16,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Text(
              'root@guyantools : ~ \$ systemctl status dashboard\n'
              '● dashboard.service - Main Dashboard UI\n'
              'Loaded: loaded (/etc/systemd/system/ui.service)\n'
              'Active: active (running)',
              maxLines: 6,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.inverseOnSurface,
                fontFamily: 'monospace',
                fontSize: 12,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClipboardSummary extends StatelessWidget {
  final int count;
  final VoidCallback onTap;

  const _ClipboardSummary({required this.count, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return AppCard(
      onTap: onTap,
      child: SizedBox(
        height: 178,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _IconTile(icon: Icons.content_paste, color: cs.primary),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: cs.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.sync, size: 12, color: cs.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Text('同步', style: Theme.of(context).textTheme.labelSmall),
                    ],
                  ),
                ),
              ],
            ),
            const Spacer(),
            Text('$count', style: Theme.of(context).textTheme.displayLarge),
            Text('剪贴板历史', style: Theme.of(context).textTheme.labelMedium),
          ],
        ),
      ),
    );
  }
}

class _PluginCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return AppCard(
      child: SizedBox(
        height: 92,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _IconTile(icon: Icons.extension, color: cs.tertiary),
            const Spacer(),
            Text('插件管理', style: Theme.of(context).textTheme.titleMedium),
            Text('3 个需更新', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _ShortcutCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool alert;

  const _ShortcutCard({
    required this.icon,
    required this.label,
    this.alert = false,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return AppCard(
      child: SizedBox(
        height: 80,
        child: Stack(
          children: [
            if (alert)
              Positioned(
                top: 0,
                right: 0,
                child: Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(
                    color: cs.error,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _IconTile(icon: icon, color: cs.primary),
                  const SizedBox(height: 8),
                  Text(
                    label,
                    style: Theme.of(
                      context,
                    ).textTheme.labelMedium?.copyWith(color: cs.onSurface),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IconTile extends StatelessWidget {
  final IconData icon;
  final Color color;

  const _IconTile({required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: cs.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(icon, size: 19, color: color),
    );
  }
}

class _RoundButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final Color? fill;

  const _RoundButton({required this.icon, required this.color, this.fill});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: fill ?? cs.surfaceContainer,
        shape: BoxShape.circle,
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.25)),
      ),
      child: Icon(icon, size: 20, color: color),
    );
  }
}
