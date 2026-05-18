import 'package:flutter/material.dart';

import '../tokens/app_tokens.dart';

class AppTopBar extends StatelessWidget {
  final String title;
  final VoidCallback? onBack;
  final Widget? trailing;

  const AppTopBar({super.key, required this.title, this.onBack, this.trailing});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.surface,
      child: Container(
        padding: EdgeInsets.fromLTRB(
          8,
          MediaQuery.of(context).padding.top + 8,
          8,
          10,
        ),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: cs.outlineVariant.withValues(alpha: 0.32),
            ),
          ),
        ),
        child: Row(
          children: [
            IconButton(
              icon: Icon(
                onBack == null ? Icons.menu_rounded : Icons.arrow_back_rounded,
              ),
              color: cs.onSurfaceVariant,
              onPressed: onBack ?? () {},
            ),
            Expanded(
              child: Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(color: cs.primary),
              ),
            ),
            trailing ??
                IconButton(
                  icon: const Icon(Icons.more_vert_rounded),
                  color: cs.onSurfaceVariant,
                  onPressed: () {},
                ),
          ],
        ),
      ),
    );
  }
}

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final VoidCallback? onTap;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final radius = context.radius.md;

    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
          color: cs.outlineVariant.withValues(alpha: isDark ? 0.34 : 0.26),
        ),
        boxShadow: context.elevation.card,
      ),
      child: child,
    );

    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius),
        child: card,
      ),
    );
  }
}

class AppSearchField extends StatelessWidget {
  final String hintText;
  final ValueChanged<String>? onChanged;

  const AppSearchField({super.key, required this.hintText, this.onChanged});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return TextField(
      onChanged: onChanged,
      style: Theme.of(
        context,
      ).textTheme.bodyMedium?.copyWith(color: cs.onSurface),
      decoration: InputDecoration(
        hintText: hintText,
        prefixIcon: Icon(Icons.search, color: cs.outline),
        fillColor: cs.surfaceContainerLowest,
      ),
    );
  }
}

class AppFilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const AppFilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return ActionChip(
      label: Text(label),
      onPressed: onTap,
      backgroundColor: selected
          ? cs.secondaryContainer
          : cs.surfaceContainerLow,
      side: BorderSide(
        color: selected
            ? Colors.transparent
            : cs.outlineVariant.withValues(alpha: 0.5),
      ),
      labelStyle: Theme.of(context).textTheme.labelMedium?.copyWith(
        color: selected ? cs.onSecondary : cs.onSurfaceVariant,
        fontWeight: FontWeight.w600,
      ),
      shape: const StadiumBorder(),
    );
  }
}

class AppSettingSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<Widget> children;

  const AppSettingSection({
    super.key,
    required this.title,
    required this.icon,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: cs.surfaceContainerLow,
              border: Border(
                bottom: BorderSide(
                  color: cs.outlineVariant.withValues(alpha: 0.25),
                ),
              ),
            ),
            child: Row(
              children: [
                Icon(icon, color: cs.primary, size: 18),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: cs.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          ...children,
        ],
      ),
    );
  }
}

class AppSettingRow extends StatelessWidget {
  final String title;
  final String? subtitle;
  final String? value;
  final bool showChevron;
  final Widget? trailing;
  final VoidCallback? onTap;

  const AppSettingRow({
    super.key,
    required this.title,
    this.subtitle,
    this.value,
    this.showChevron = false,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ],
              ),
            ),
            if (value != null)
              Text(value!, style: Theme.of(context).textTheme.bodyMedium),
            if (trailing != null) trailing!,
            if (showChevron)
              Icon(Icons.chevron_right, color: cs.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class AppStateView extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;

  const AppStateView({
    super.key,
    required this.icon,
    required this.title,
    this.message,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return AppCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 28),
        child: Column(
          children: [
            Icon(icon, color: cs.outline, size: 32),
            const SizedBox(height: 10),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            if (message != null) ...[
              const SizedBox(height: 4),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
