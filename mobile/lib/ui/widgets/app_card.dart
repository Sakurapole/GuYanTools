import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// 毛玻璃应用卡片组件
/// 参照 Stitch all_apps_gallery glass-card 设计
class AppCard extends StatefulWidget {
  final String name;
  final IconData icon;
  final dynamic iconStyle; // _AppIconStyle from apps_page
  final VoidCallback? onTap;

  const AppCard({
    super.key,
    required this.name,
    required this.icon,
    required this.iconStyle,
    this.onTap,
  });

  @override
  State<AppCard> createState() => _AppCardState();
}

class _AppCardState extends State<AppCard> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: widget.onTap,
        onTapDown: (_) => setState(() => _isHovered = true),
        onTapCancel: () => setState(() => _isHovered = false),
        onTapUp: (_) => setState(() => _isHovered = false),
        borderRadius: BorderRadius.circular(16),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: _isHovered
                ? cs.surfaceContainerHighest
                : (isDark ? cs.surfaceContainer : cs.surfaceContainerLow),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: cs.outlineVariant.withValues(alpha: isDark ? 0.34 : 0.26),
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedScale(
                scale: _isHovered ? 1.06 : 1.0,
                duration: const Duration(milliseconds: 200),
                child: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    gradient: _isGradient ? AppColors.signatureGradient : null,
                    color: _isGradient ? null : cs.surfaceContainerLowest,
                    boxShadow: [AppColors.ambientShadow(isDark)],
                  ),
                  child: Icon(widget.icon, size: 28, color: _iconColor(cs)),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                widget.name,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: cs.onSurface,
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  bool get _isGradient => widget.iconStyle.toString().contains('gradient');

  Color _iconColor(ColorScheme cs) {
    final style = widget.iconStyle.toString();
    if (style.contains('gradient')) return const Color(0xFF00354A);
    if (style.contains('secondary')) return cs.primary;
    if (style.contains('tertiary')) return cs.tertiary;
    if (style.contains('error')) return cs.error;
    if (style.contains('primary')) return cs.primary;
    return cs.onSurfaceVariant;
  }
}
