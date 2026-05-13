import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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
    final cs = Theme.of(context).colorScheme;

    return Material(
      color: cs.surface,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.32)),
          ),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 64,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _NavItem(
                    index: 0,
                    currentIndex: currentIndex,
                    icon: Icons.home_outlined,
                    label: '首页',
                    location: '/',
                  ),
                ),
                Expanded(
                  child: _NavItem(
                    index: 1,
                    currentIndex: currentIndex,
                    icon: Icons.content_paste_outlined,
                    label: '剪贴板',
                    location: '/clipboard',
                  ),
                ),
                Expanded(
                  child: _NavItem(
                    index: 2,
                    currentIndex: currentIndex,
                    icon: Icons.settings_outlined,
                    label: '设置',
                    location: '/settings',
                  ),
                ),
              ],
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
  final String label;
  final String location;

  const _NavItem({
    required this.index,
    required this.currentIndex,
    required this.icon,
    required this.label,
    required this.location,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final active = index == currentIndex;
    final color = active ? cs.primary : cs.onSurfaceVariant;

    return InkWell(
      key: ValueKey('nav-$index'),
      onTap: () => context.go(location),
      borderRadius: BorderRadius.zero,
      child: AnimatedContainer(
        key: ValueKey('nav-container-$index'),
        duration: const Duration(milliseconds: 160),
        decoration: const BoxDecoration(color: Colors.transparent),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 22, color: color),
            const SizedBox(height: 2),
            Text(
              label,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: color,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
