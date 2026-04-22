import 'dart:ui';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// Knowledge Base Viewer 页面
/// 参照 Stitch knowledge_base_viewer 设计稿
/// 从 All Apps → Knowledge Base 进入
class KnowledgePage extends StatelessWidget {
  const KnowledgePage({super.key});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: Stack(
        children: [
          // ── 背景光晕 ──
          if (isDark) ...[
            Positioned(
              top: -80,
              left: -80,
              child: Container(
                width: 300,
                height: 300,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: cs.primary.withValues(alpha: 0.04),
                ),
              ),
            ),
            Positioned(
              bottom: 100,
              right: -40,
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: cs.tertiary.withValues(alpha: 0.03),
                ),
              ),
            ),
          ],

          CustomScrollView(
            slivers: [
              // ── 顶栏 ──
              SliverAppBar(
                pinned: true,
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
                  icon: Icon(Icons.arrow_back, color: cs.primary),
                  onPressed: () => Navigator.pop(context),
                ),
                title: Text(
                  'Project Plan.md',
                  style: TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.3,
                    color: cs.onSurface,
                  ),
                ),
                actions: [
                  IconButton(
                    icon: Icon(Icons.edit_outlined, color: cs.onSurfaceVariant.withValues(alpha: 0.6)),
                    onPressed: () {},
                  ),
                  IconButton(
                    icon: Icon(Icons.more_vert, color: cs.onSurfaceVariant.withValues(alpha: 0.6)),
                    onPressed: () {},
                  ),
                ],
              ),

              // ── 内容 ──
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 120),
                  child: _buildContent(context),
                ),
              ),
            ],
          ),

          // ── 底部浮动工具栏 ──
          Positioned(
            left: 0,
            right: 0,
            bottom: 24,
            child: _buildToolbar(context),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── 标签区 ──
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: cs.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '知识库',
                style: TextStyle(
                  color: cs.primary,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              '2小时前更新',
              style: TextStyle(
                fontSize: 12,
                color: cs.onSurfaceVariant.withValues(alpha: 0.6),
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // ── H1 标题 ──
        Text(
          '第一阶段：架构基础',
          style: TextStyle(
            fontFamily: 'Manrope',
            fontSize: 32,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.8,
            color: cs.onSurface,
            height: 1.2,
          ),
        ),
        const SizedBox(height: 16),

        // ── 正文 ──
        Text(
          'Lucid Architect 计划的核心目标是重新定义用户与数字工作空间的交互方式，'
          '通过优先考虑透明度和结构完整性。本文档概述了初始发布阶段的技术要求和设计里程碑。',
          style: TextStyle(
            fontSize: 16,
            height: 1.75,
            color: cs.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 32),

        // ── H2 ──
        Text(
          '设计哲学',
          style: TextStyle(
            fontFamily: 'Manrope',
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: cs.primary,
          ),
        ),
        const SizedBox(height: 12),

        Text(
          '我们利用色调分层和不对称焦点。UI 必须感觉像是从光线中雕刻出的精密仪器。'
          '这意味着从传统网格系统转向流动的、基于深度的布局。',
          style: TextStyle(
            fontSize: 16,
            height: 1.75,
            color: cs.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 16),

        // ── 列表 ──
        ...[
          '深度作为主要导航驱动力。',
          '使用背景变化实现零边框分区。',
          '编辑级排版缩放以提高可读性。',
          '自适应玻璃纹理用于上下文反馈。',
        ].map(
          (item) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '—',
                  style: TextStyle(
                    color: cs.secondaryContainer,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    item,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.6,
                      color: cs.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),

        // ── 引用块 ──
        Container(
          padding: const EdgeInsets.only(left: 20),
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(color: cs.primary, width: 3),
            ),
          ),
          child: Text(
            '"建筑师不用木头和石头建造，而是用光和空间。软件必须反映这种纯粹。"',
            style: TextStyle(
              fontStyle: FontStyle.italic,
              fontSize: 15,
              height: 1.6,
              color: cs.primary.withValues(alpha: 0.8),
            ),
          ),
        ),
        const SizedBox(height: 32),

        // ── H2 ──
        Text(
          '结构里程碑',
          style: TextStyle(
            fontFamily: 'Manrope',
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: cs.primary,
          ),
        ),
        const SizedBox(height: 12),

        Text(
          '为确保顺利推出，我们将实施分为三个核心冲刺。'
          '每个冲刺将专注于堆栈的特定层，从基础表面开始，逐步上升到交互层。',
          style: TextStyle(
            fontSize: 16,
            height: 1.75,
            color: cs.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 20),

        // ── 图片容器 ──
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: 180,
            width: double.infinity,
            decoration: BoxDecoration(
              color: cs.surfaceContainerLow,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Stack(
              children: [
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        cs.primary.withValues(alpha: 0.1),
                        cs.surfaceContainerLow,
                      ],
                    ),
                  ),
                  child: Center(
                    child: Icon(
                      Icons.architecture,
                      size: 48,
                      color: cs.primary.withValues(alpha: 0.3),
                    ),
                  ),
                ),
                Positioned(
                  bottom: 12,
                  left: 12,
                  child: Text(
                    '概念参考：虚空与体量',
                    style: TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                      color: cs.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 32),

        // ── H2 ──
        Text(
          '关键交付物',
          style: TextStyle(
            fontFamily: 'Manrope',
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: cs.primary,
          ),
        ),
        const SizedBox(height: 12),

        ...[
          '响应式玻璃容器的动态布局引擎。',
          '使用 Manrope 和 Inter 的高保真排版系统。',
          '支持背景模糊的上下文感知操作工具栏。',
          '用于复杂 Markdown 方案的高级文档渲染。',
        ].map(
          (item) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '—',
                  style: TextStyle(
                    color: cs.secondaryContainer,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    item,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.6,
                      color: cs.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        Text(
          '预计周五完成最终签核。请在会议前审阅技术附件中的相关插件需求。',
          style: TextStyle(
            fontSize: 16,
            height: 1.75,
            color: cs.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  // ── 底部浮动工具栏 ──
  Widget _buildToolbar(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Center(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: isDark
                  ? const Color(0xFF020617).withValues(alpha: 0.8)
                  : Colors.white.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
              boxShadow: [AppColors.ambientShadow(isDark)],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _toolbarBtn(Icons.zoom_in, cs),
                Container(
                  width: 1,
                  height: 24,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  color: cs.outlineVariant.withValues(alpha: 0.2),
                ),
                _toolbarBtn(Icons.search, cs),
                // 主按钮（渐变）
                Container(
                  width: 48,
                  height: 44,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    gradient: AppColors.signatureGradient,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: cs.primary.withValues(alpha: 0.2),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: IconButton(
                    icon: const Icon(Icons.note_add, size: 22, color: Color(0xFF00354A)),
                    onPressed: () {},
                  ),
                ),
                _toolbarBtn(Icons.bookmarks_outlined, cs),
                Container(
                  width: 1,
                  height: 24,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  color: cs.outlineVariant.withValues(alpha: 0.2),
                ),
                _toolbarBtn(Icons.share_outlined, cs),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _toolbarBtn(IconData icon, ColorScheme cs) {
    return SizedBox(
      width: 44,
      height: 44,
      child: IconButton(
        icon: Icon(icon, size: 22, color: cs.onSurfaceVariant.withValues(alpha: 0.6)),
        onPressed: () {},
      ),
    );
  }
}
