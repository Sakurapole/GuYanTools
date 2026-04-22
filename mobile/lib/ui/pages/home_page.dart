import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/models/todo_model.dart';
import '../../core/theme/app_colors.dart';
import '../../state/todo_store.dart';
import '../../state/theme_provider.dart';

/// My Day — 首页待办事项列表
/// 参照 Stitch my_day_todo 设计稿
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final themeProvider = context.read<ThemeProvider>();

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // ── 顶栏 ──
          SliverAppBar(
            floating: true,
            snap: true,
            backgroundColor: Colors.transparent,
            flexibleSpace: ClipRRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                child: Container(
                  color: isDark
                      ? const Color(0xFF020617).withValues(alpha: 0.6)
                      : Colors.white.withValues(alpha: 0.7),
                ),
              ),
            ),
            leading: IconButton(
              icon: const Icon(Icons.menu),
              onPressed: () {},
            ),
            title: Text('My Day', style: TextStyle(color: cs.primary)),
            actions: [
              IconButton(
                icon: Icon(isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
                onPressed: () => themeProvider.toggleTheme(),
              ),
            ],
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 16),
                  // ── Hero 问候 ──
                  _buildGreeting(context),
                  const SizedBox(height: 24),
                  // ── 昨日提示卡 ──
                  _buildYesterdayCard(context),
                  const SizedBox(height: 32),
                  // ── Today's Focus 标题 ──
                  _buildSectionHeader(context),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),

          // ── 任务列表 ──
          Consumer<TodoStore>(
            builder: (context, store, _) => SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              sliver: SliverList.separated(
                itemCount: store.items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final item = store.items[index];
                  return Dismissible(
                    key: Key(item.id),
                    direction: DismissDirection.endToStart,
                    onDismissed: (_) => store.removeItem(item.id),
                    background: Container(
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.only(right: 20),
                      decoration: BoxDecoration(
                        color: cs.error.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.delete_outline, color: cs.error),
                    ),
                    child: _buildTaskItem(context, item, store),
                  );
                },
              ),
            ),
          ),

          // ── Bento 双卡 ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 120),
              child: _buildBentoCards(context),
            ),
          ),
        ],
      ),

      // ── FAB ──
      floatingActionButton: _buildFAB(context),
    );
  }

  // ── 问候区 ──
  Widget _buildGreeting(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final now = DateTime.now();
    final hour = now.hour;
    final greeting = hour < 12 ? '早上好' : (hour < 18 ? '下午好' : '晚上好');
    final weekdays = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    final dateStr = '${now.year}年${now.month}月${now.day}日 ${weekdays[now.weekday]}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: TextSpan(
            style: Theme.of(context).textTheme.headlineLarge,
            children: [
              TextSpan(text: '$greeting, '),
              TextSpan(
                text: 'Architect',
                style: TextStyle(
                  foreground: Paint()
                    ..shader = LinearGradient(
                      colors: [cs.primary, cs.secondaryContainer],
                    ).createShader(const Rect.fromLTWH(0, 0, 200, 40)),
                ),
              ),
              const TextSpan(text: '.'),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Text(
          dateStr.toUpperCase(),
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: cs.onSurfaceVariant.withValues(alpha: 0.7),
                letterSpacing: 1.5,
              ),
        ),
      ],
    );
  }

  // ── 昨日未完成提示卡 ──
  Widget _buildYesterdayCard(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border(
          left: BorderSide(color: cs.primary, width: 3),
        ),
        boxShadow: [AppColors.ambientShadow(isDark)],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: cs.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.history, size: 14, color: cs.primary),
                const SizedBox(width: 6),
                Text(
                  '待处理回顾',
                  style: TextStyle(
                    color: cs.primary,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            '完成昨天的蓝图？',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: cs.onSurface,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            '你还有 3 个昨天的任务等待你的处理。',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: AppColors.signatureGradient,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: TextButton(
                    onPressed: () {},
                    child: const Text(
                      '带到今天',
                      style: TextStyle(
                        color: Color(0xFF00354A),
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Container(
                decoration: BoxDecoration(
                  color: cs.surfaceContainerHighest.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: TextButton(
                  onPressed: () {},
                  child: Text(
                    '忽略',
                    style: TextStyle(
                      color: cs.onSurface,
                      fontWeight: FontWeight.w500,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Section Header ──
  Widget _buildSectionHeader(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final store = context.watch<TodoStore>();

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          "今日焦点",
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: cs.onSurface.withValues(alpha: 0.9),
                fontWeight: FontWeight.w700,
              ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: cs.surfaceContainerLow,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            '${store.doneCount} / ${store.totalCount}',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: cs.onSurfaceVariant,
                ),
          ),
        ),
      ],
    );
  }

  // ── 任务项 ──
  Widget _buildTaskItem(BuildContext context, TodoItem item, TodoStore store) {
    final cs = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: () => store.toggleDone(item.id),
      child: AnimatedOpacity(
        opacity: item.done ? 0.5 : 1.0,
        duration: const Duration(milliseconds: 300),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: item.done ? cs.surfaceContainerLow : cs.surfaceContainer,
            borderRadius: BorderRadius.circular(12),
            border: item.done
                ? null
                : Border.all(color: AppColors.ghostBorder(Theme.of(context).brightness == Brightness.dark)),
          ),
          child: Row(
            children: [
              // Checkbox
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: item.done ? cs.primary : Colors.transparent,
                  border: item.done
                      ? null
                      : Border.all(
                          color: _priorityColor(item.priority).withValues(alpha: 0.4),
                          width: 2,
                        ),
                ),
                child: item.done
                    ? Icon(Icons.check, size: 16, color: cs.onPrimary)
                    : null,
              ),
              const SizedBox(width: 14),
              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      style: TextStyle(
                        color: cs.onSurface,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        decoration: item.done ? TextDecoration.lineThrough : null,
                        decorationColor: cs.primary.withValues(alpha: 0.5),
                      ),
                    ),
                    if (!item.done && (item.dueTime != null || item.hasAttachment)) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          if (item.dueTime != null) ...[
                            Icon(Icons.schedule, size: 12, color: cs.onSurfaceVariant.withValues(alpha: 0.7)),
                            const SizedBox(width: 4),
                            Text(
                              item.dueTime!,
                              style: TextStyle(fontSize: 10, color: cs.onSurfaceVariant.withValues(alpha: 0.7)),
                            ),
                            const SizedBox(width: 12),
                          ],
                          if (item.priority == TodoPriority.high) ...[
                            Icon(Icons.sell, size: 12, color: cs.primary),
                            const SizedBox(width: 4),
                            Text(
                              '高优',
                              style: TextStyle(fontSize: 10, color: cs.primary, fontWeight: FontWeight.w600),
                            ),
                          ],
                          if (item.hasAttachment) ...[
                            Icon(Icons.link, size: 12, color: cs.onSurfaceVariant.withValues(alpha: 0.7)),
                            const SizedBox(width: 4),
                            Text(
                              '附件',
                              style: TextStyle(fontSize: 10, color: cs.onSurfaceVariant.withValues(alpha: 0.7)),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _priorityColor(TodoPriority p) {
    switch (p) {
      case TodoPriority.high:
        return AppColors.priorityHigh;
      case TodoPriority.medium:
        return AppColors.priorityMedium;
      case TodoPriority.low:
        return AppColors.priorityLow;
    }
  }

  // ── Bento 双卡 ──
  Widget _buildBentoCards(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Row(
      children: [
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: cs.surfaceContainer,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.auto_awesome, color: cs.tertiary, size: 24),
                const SizedBox(height: 10),
                Text(
                  'AI 洞察',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                    color: cs.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '你的专注巅峰通常在 11:00 AM。',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: cs.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: cs.surfaceContainer,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.cloud, color: cs.primary, size: 24),
                const SizedBox(height: 10),
                Text(
                  '上下文',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                    color: cs.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '20°C 晴。适合散步。',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: cs.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ── FAB ──
  Widget _buildFAB(BuildContext context) {
    final store = context.read<TodoStore>();

    return Padding(
      padding: const EdgeInsets.only(bottom: 64),
      child: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          gradient: AppColors.signatureGradient,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.3),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: FloatingActionButton(
          backgroundColor: Colors.transparent,
          elevation: 0,
          onPressed: () => _showAddDialog(context, store),
          child: const Icon(Icons.add, size: 28, color: Color(0xFF00354A)),
        ),
      ),
    );
  }

  void _showAddDialog(BuildContext context, TodoStore store) {
    final controller = TextEditingController();
    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainer,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: controller,
              autofocus: true,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
              decoration: const InputDecoration(hintText: '添加新任务...'),
              onSubmitted: (text) {
                if (text.trim().isNotEmpty) {
                  store.addItem(TodoItem(
                    id: DateTime.now().millisecondsSinceEpoch.toString(),
                    title: text.trim(),
                  ));
                  Navigator.pop(ctx);
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
