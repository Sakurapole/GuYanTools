import 'package:flutter/material.dart';

/// "Lucid Architect" 设计系统色彩 Token
/// 主色调 #66CCFF，支持 Light / Dark 双主题
class AppColors {
  AppColors._();

  // ── 品牌色 (共享) ──────────────────────────────
  static const Color primary = Color(0xFF66CCFF);
  static const Color primaryContainer = Color(0xFF3EABDC);
  static const Color secondary = Color(0xFF66CCFF);
  static const Color secondaryContainer = Color(0xFF00A6E0);
  static const Color tertiary = Color(0xFFBDC2FF);
  static const Color tertiaryContainer = Color(0xFF00055C);
  static const Color error = Color(0xFFFFB4AB);
  static const Color errorContainer = Color(0xFF93000A);

  // ── 渐变 ────────────────────────────────────
  static const LinearGradient signatureGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primary, secondaryContainer],
  );

  // ── Dark Theme ────────────────────────────────
  static const Color darkSurface = Color(0xFF0C1324);
  static const Color darkSurfaceDim = Color(0xFF0C1324);
  static const Color darkSurfaceBright = Color(0xFF33394C);
  static const Color darkSurfaceContainerLowest = Color(0xFF070D1F);
  static const Color darkSurfaceContainerLow = Color(0xFF151B2D);
  static const Color darkSurfaceContainer = Color(0xFF191F31);
  static const Color darkSurfaceContainerHigh = Color(0xFF23293C);
  static const Color darkSurfaceContainerHighest = Color(0xFF2E3447);
  static const Color darkOnSurface = Color(0xFFDCE1FB);
  static const Color darkOnSurfaceVariant = Color(0xFFC6C6CD);
  static const Color darkOutline = Color(0xFF909097);
  static const Color darkOutlineVariant = Color(0xFF45464D);
  static const Color darkOnPrimary = Color(0xFF00354A);
  static const Color darkOnSecondary = Color(0xFF00354A);
  static const Color darkBackground = Color(0xFF0C1324);

  // ── Light Theme ───────────────────────────────
  static const Color lightSurface = Color(0xFFF8F9FC);
  static const Color lightSurfaceDim = Color(0xFFE8EAF0);
  static const Color lightSurfaceBright = Color(0xFFFFFFFF);
  static const Color lightSurfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color lightSurfaceContainerLow = Color(0xFFF2F4F8);
  static const Color lightSurfaceContainer = Color(0xFFECEEF4);
  static const Color lightSurfaceContainerHigh = Color(0xFFE4E7EE);
  static const Color lightSurfaceContainerHighest = Color(0xFFDCDFE8);
  static const Color lightOnSurface = Color(0xFF1A1C24);
  static const Color lightOnSurfaceVariant = Color(0xFF44474E);
  static const Color lightOutline = Color(0xFF74777F);
  static const Color lightOutlineVariant = Color(0xFFC4C6D0);
  static const Color lightOnPrimary = Color(0xFFFFFFFF);
  static const Color lightOnSecondary = Color(0xFFFFFFFF);
  static const Color lightBackground = Color(0xFFF8F9FC);

  // ── Priority Colors ───────────────────────────
  static const Color priorityHigh = Color(0xFFFF6B6B);
  static const Color priorityMedium = Color(0xFFFFAA33);
  static const Color priorityLow = Color(0xFF66CCFF);

  // ── Glass Panel ───────────────────────────────
  static Color glassPanel(bool isDark) => isDark
      ? const Color(0xFF2E3447).withValues(alpha: 0.6)
      : Colors.white.withValues(alpha: 0.75);

  static Color ghostBorder(bool isDark) => isDark
      ? const Color(0xFF45464D).withValues(alpha: 0.15)
      : const Color(0xFF000000).withValues(alpha: 0.06);

  static BoxShadow ambientShadow(bool isDark) => BoxShadow(
        color: isDark
            ? const Color(0xFF070D1F).withValues(alpha: 0.4)
            : const Color(0xFF000000).withValues(alpha: 0.08),
        blurRadius: 40,
        offset: const Offset(0, 20),
      );
}
