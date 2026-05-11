import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/theme/app_colors.dart';

class MainShell extends StatefulWidget {
  final String location;
  final Widget child;

  const MainShell({super.key, required this.location, required this.child});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  @override
  Widget build(BuildContext context) {
    final currentIndex = _indexForLocation(widget.location);
    return Scaffold(
      extendBody: true,
      body: widget.child,
      bottomNavigationBar: _BottomNav(currentIndex: currentIndex),
    );
  }

  int _indexForLocation(String location) {
    if (location.startsWith('/clipboard')) return 1;
    if (location.startsWith('/settings')) return 2;
    return 0;
  }
}

class _BottomNav extends StatelessWidget {
  final int currentIndex;

  const _BottomNav({required this.currentIndex});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.glassPanel(isDark),
            border: Border(
              top: BorderSide(color: AppColors.ghostBorder(isDark)),
            ),
            boxShadow: [AppColors.cardShadow(isDark)],
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _NavItem(
                    index: 0,
                    currentIndex: currentIndex,
                    icon: Icons.home_outlined,
                    activeIcon: Icons.home,
                    label: '首页',
                    location: '/',
                  ),
                  _NavItem(
                    index: 1,
                    currentIndex: currentIndex,
                    icon: Icons.content_paste_outlined,
                    activeIcon: Icons.content_paste,
                    label: '剪贴板',
                    location: '/clipboard',
                  ),
                  _NavItem(
                    index: 2,
                    currentIndex: currentIndex,
                    icon: Icons.settings_outlined,
                    activeIcon: Icons.settings,
                    label: '设置',
                    location: '/settings',
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final int index;
  final int currentIndex;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final String location;

  const _NavItem({
    required this.index,
    required this.currentIndex,
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.location,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final active = index == currentIndex;

    return InkWell(
      key: ValueKey('nav-$index'),
      onTap: () => context.go(location),
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: active ? cs.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              active ? activeIcon : icon,
              size: 22,
              color: active ? const Color(0xFF005573) : cs.onSurfaceVariant,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: active ? const Color(0xFF005573) : cs.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
