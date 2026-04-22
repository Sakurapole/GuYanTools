import 'dart:ui';
import 'package:flutter/material.dart';

import '../widgets/app_card.dart';

/// All Apps Gallery 页面
/// 参照 Stitch all_apps_gallery 设计稿
class AppsPage extends StatefulWidget {
  const AppsPage({super.key});

  @override
  State<AppsPage> createState() => _AppsPageState();
}

class _AppsPageState extends State<AppsPage> {
  String _searchQuery = '';

  static const _apps = [
    _AppData('Web Enhancer', Icons.language, _AppIconStyle.gradient),
    _AppData('Knowledge Base', Icons.library_books, _AppIconStyle.tertiary, route: '/knowledge'),
    _AppData('Clipboard Sync', Icons.content_paste, _AppIconStyle.secondary),
    _AppData('FTP Client', Icons.cloud_upload, _AppIconStyle.neutral),
    _AppData('BiliBili Downloader', Icons.download_for_offline, _AppIconStyle.error),
    _AppData('Image Hosting', Icons.image, _AppIconStyle.primary),
  ];

  List<_AppData> get _filteredApps =>
      _searchQuery.isEmpty ? _apps : _apps.where((a) => a.name.toLowerCase().contains(_searchQuery.toLowerCase())).toList();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

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
            title: Text(
              'Lucid Architect',
              style: TextStyle(
                fontFamily: 'Manrope',
                fontSize: 20,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
                color: cs.onSurface,
              ),
            ),
            actions: [
              IconButton(
                icon: Icon(Icons.dark_mode_outlined, color: cs.primary),
                onPressed: () {},
              ),
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: cs.surfaceContainerHighest,
                  child: Icon(Icons.person, size: 20, color: cs.onSurfaceVariant),
                ),
              ),
            ],
          ),

          // ── 搜索框 ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
              child: Container(
                decoration: BoxDecoration(
                  color: cs.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: TextField(
                  onChanged: (v) => setState(() => _searchQuery = v),
                  style: TextStyle(color: cs.onSurface, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: '搜索模块与插件...',
                    hintStyle: TextStyle(color: cs.onSurfaceVariant.withValues(alpha: 0.4)),
                    prefixIcon: Icon(Icons.search, color: cs.onSurfaceVariant.withValues(alpha: 0.5)),
                    border: InputBorder.none,
                    filled: false,
                    contentPadding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
            ),
          ),

          // ── 标题 ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    '所有应用',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          color: cs.onSurface,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                        ),
                  ),
                  Text(
                    '${_filteredApps.length} 个活跃模块',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 1.0,
                      color: cs.onSurfaceVariant.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── 应用网格 ──
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 14,
                mainAxisSpacing: 14,
                childAspectRatio: 0.95,
              ),
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final app = _filteredApps[index];
                  return AppCard(
                    name: app.name,
                    icon: app.icon,
                    iconStyle: app.iconStyle,
                    onTap: app.route != null
                        ? () => Navigator.pushNamed(context, app.route!)
                        : null,
                  );
                },
                childCount: _filteredApps.length,
              ),
            ),
          ),

          // ── Feature Spotlight ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 120),
              child: _buildSpotlight(context),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSpotlight(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Container(
      height: 160,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [
            cs.surfaceContainerLowest,
            cs.surfaceContainer,
          ],
        ),
      ),
      child: Stack(
        children: [
          // Decorative circle
          Positioned(
            right: -20,
            top: -20,
            child: Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: cs.primary.withValues(alpha: 0.05),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text(
                  '新版本',
                  style: TextStyle(
                    color: cs.primary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '量子矢量引擎已上线。',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: cs.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

enum _AppIconStyle { gradient, secondary, tertiary, neutral, error, primary }

class _AppData {
  final String name;
  final IconData icon;
  final _AppIconStyle iconStyle;
  final String? route;

  const _AppData(this.name, this.icon, this.iconStyle, {this.route});
}
