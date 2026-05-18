import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design_system/design_system.dart';
import '../../../ui/widgets/input_dialogs.dart';
import '../application/clipboard_controller.dart';
import '../application/clipboard_state.dart';
import '../domain/clipboard_models.dart';

class ClipboardPage extends ConsumerWidget {
  final bool showTopBack;
  final String? focusedItemId;

  const ClipboardPage({
    super.key,
    this.showTopBack = false,
    this.focusedItemId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clipboard = ref.watch(clipboardControllerProvider);

    return Scaffold(
      body: clipboard.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stackTrace) =>
            _ClipboardError(message: error.toString()),
        data: (state) => _ClipboardContent(
          state: state,
          showTopBack: showTopBack,
          focusedItemId: focusedItemId,
        ),
      ),
    );
  }
}

class _ClipboardContent extends ConsumerWidget {
  final ClipboardUiState state;
  final bool showTopBack;
  final String? focusedItemId;

  const _ClipboardContent({
    required this.state,
    required this.showTopBack,
    this.focusedItemId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(clipboardControllerProvider.notifier);
    final items = state.visibleItems;

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: AppTopBar(
            title: 'GuYanTools',
            onBack: showTopBack ? () => Navigator.of(context).pop() : null,
            trailing: IconButton(
              tooltip: '清空',
              icon: const Icon(Icons.delete_sweep_outlined),
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              onPressed: state.totalCount == 0 ? null : controller.clearHistory,
            ),
          ),
        ),
        SliverPadding(
          padding: EdgeInsets.fromLTRB(16, 20, 16, showTopBack ? 24 : 112),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              _ClipboardHeader(state: state),
              const SizedBox(height: 16),
              _ToolBar(state: state),
              const SizedBox(height: 16),
              if (items.isEmpty)
                const AppStateView(
                  icon: Icons.content_paste_off,
                  title: '暂无剪贴板记录',
                  message: '导入文本、图片、视频或文件后会显示在这里。',
                )
              else
                ...items.map(
                  (item) => _ClipboardItemCard(
                    item: item,
                    highlighted: item.id == focusedItemId,
                  ),
                ),
            ]),
          ),
        ),
      ],
    );
  }
}

class _ClipboardHeader extends StatelessWidget {
  final ClipboardUiState state;

  const _ClipboardHeader({required this.state});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final status = state.syncEnabled
        ? '${state.totalCount} 条记录 · 同步${state.syncRunning ? '运行中' : '待启动'}'
        : '${state.totalCount} 条记录 · 同步未开启';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('剪贴板', style: Theme.of(context).textTheme.displayLarge),
        const SizedBox(height: 6),
        Row(
          children: [
            Icon(
              state.syncEnabled ? Icons.cloud_done_outlined : Icons.cloud_off,
              size: 16,
              color: cs.onSurfaceVariant,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                status,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ],
        ),
        if (state.error != null) ...[
          const SizedBox(height: 8),
          Text(
            state.error!,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: cs.error),
          ),
        ],
      ],
    );
  }
}

class _ToolBar extends ConsumerWidget {
  final ClipboardUiState state;

  const _ToolBar({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(clipboardControllerProvider.notifier);
    final cs = Theme.of(context).colorScheme;

    return AppCard(
      padding: const EdgeInsets.all(8),
      color: cs.surfaceContainerLow,
      child: Column(
        children: [
          AppSearchField(
            hintText: '搜索剪贴板内容、文件名或设备...',
            onChanged: controller.setQuery,
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _FilterChip(
                  label: '全部',
                  filter: ClipboardContentFilter.all,
                  state: state,
                ),
                _FilterChip(
                  label: '文本',
                  filter: ClipboardContentFilter.text,
                  state: state,
                ),
                _FilterChip(
                  label: '图片',
                  filter: ClipboardContentFilter.image,
                  state: state,
                ),
                _FilterChip(
                  label: '视频',
                  filter: ClipboardContentFilter.video,
                  state: state,
                ),
                _FilterChip(
                  label: '文件',
                  filter: ClipboardContentFilter.file,
                  state: state,
                ),
                _FilterChip(
                  label: '本机',
                  filter: ClipboardContentFilter.localOnly,
                  state: state,
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _showTextImportDialog(context, ref),
                  icon: const Icon(Icons.text_fields),
                  label: const Text('文本'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final result = await FilePicker.pickFiles(
                      allowMultiple: true,
                    );
                    final paths =
                        result?.paths.whereType<String>().toList() ?? [];
                    if (paths.isNotEmpty) {
                      await controller.importFiles(paths);
                    }
                  },
                  icon: const Icon(Icons.attach_file),
                  label: const Text('文件'),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: '读取当前剪贴板',
                onPressed: controller.importCurrentClipboardForegroundOnly,
                icon: const Icon(Icons.content_paste_go),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends ConsumerWidget {
  final String label;
  final ClipboardContentFilter filter;
  final ClipboardUiState state;

  const _FilterChip({
    required this.label,
    required this.filter,
    required this.state,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: AppFilterChip(
        label: label,
        selected: state.filter == filter,
        onTap: () =>
            ref.read(clipboardControllerProvider.notifier).setFilter(filter),
      ),
    );
  }
}

class _ClipboardItemCard extends ConsumerWidget {
  final MultiDeviceClipboardItem item;
  final bool highlighted;

  const _ClipboardItemCard({required this.item, required this.highlighted});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(clipboardControllerProvider.notifier);
    final cs = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        color: highlighted ? cs.primaryContainer.withValues(alpha: 0.28) : null,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _ItemPreview(item: item),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _TypePill(item: item),
                      if (item.localOnly) ...[
                        const SizedBox(width: 6),
                        const _SmallPill(label: '本机'),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    item.displayTitle,
                    maxLines: item.isText ? 3 : 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${item.sourceDeviceName} · ${_formatBytes(item.byteSize)} · ${_formatTime(item.createdAt)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            Column(
              children: [
                IconButton(
                  tooltip: '应用',
                  onPressed: () => controller.applyItem(item),
                  icon: Icon(Icons.copy_all, color: cs.primary),
                ),
                IconButton(
                  tooltip: '删除',
                  onPressed: () => controller.deleteItem(item.id),
                  icon: Icon(Icons.delete_outline, color: cs.onSurfaceVariant),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ItemPreview extends StatelessWidget {
  final MultiDeviceClipboardItem item;

  const _ItemPreview({required this.item});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final path = item.previewPath ?? item.assetPath;
    if ((item.isImage || item.tags.contains('image')) &&
        path != null &&
        File(path).existsSync()) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(context.radius.md),
        child: Image.file(
          File(path),
          width: 56,
          height: 56,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) =>
              const _IconPreview(icon: Icons.image),
        ),
      );
    }
    return _IconPreview(
      icon: item.isText
          ? Icons.notes
          : item.isVideo
          ? Icons.movie_outlined
          : Icons.insert_drive_file_outlined,
      color: item.isText ? cs.primary : cs.tertiary,
    );
  }
}

class _IconPreview extends StatelessWidget {
  final IconData icon;
  final Color? color;

  const _IconPreview({required this.icon, this.color});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: cs.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(context.radius.md),
      ),
      child: Icon(icon, color: color ?? cs.primary),
    );
  }
}

class _TypePill extends StatelessWidget {
  final MultiDeviceClipboardItem item;

  const _TypePill({required this.item});

  @override
  Widget build(BuildContext context) {
    final label = item.isText
        ? (item.tags.contains('url')
              ? 'URL'
              : item.tags.contains('markdown')
              ? 'Markdown'
              : item.tags.contains('emoji')
              ? '表情文本'
              : '文本')
        : item.isImage
        ? '图片'
        : item.isVideo
        ? '视频'
        : '文件';
    return _SmallPill(label: label);
  }
}

class _SmallPill extends StatelessWidget {
  final String label;

  const _SmallPill({required this.label});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: cs.primaryContainer,
        borderRadius: BorderRadius.circular(context.radius.sm),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}

class _ClipboardError extends StatelessWidget {
  final String message;

  const _ClipboardError({required this.message});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        const SliverToBoxAdapter(child: AppTopBar(title: 'GuYanTools')),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 112),
          sliver: SliverToBoxAdapter(
            child: AppStateView(
              icon: Icons.error_outline,
              title: '剪贴板不可用',
              message: message,
            ),
          ),
        ),
      ],
    );
  }
}

Future<void> _showTextImportDialog(BuildContext context, WidgetRef ref) async {
  final text = await showDialog<String>(
    context: context,
    builder: (_) =>
        const AetherTextInputDialog(title: '导入文本', minLines: 3, maxLines: 8),
  );
  if (text != null && text.isNotEmpty) {
    await Future<void>.delayed(const Duration(milliseconds: 180));
    await ref.read(clipboardControllerProvider.notifier).importText(text);
  }
}

String _formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) {
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }
  return '${(bytes / 1024 / 1024 / 1024).toStringAsFixed(1)} GB';
}

String _formatTime(int seconds) {
  final time = DateTime.fromMillisecondsSinceEpoch(seconds * 1000);
  final now = DateTime.now();
  if (now.difference(time).inMinutes < 1) return '刚刚';
  if (now.difference(time).inHours < 1) {
    return '${now.difference(time).inMinutes} 分钟前';
  }
  if (now.difference(time).inDays < 1) {
    return '${now.difference(time).inHours} 小时前';
  }
  return '${time.month}/${time.day} ${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
}
