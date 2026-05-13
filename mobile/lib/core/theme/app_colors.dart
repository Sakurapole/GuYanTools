import 'package:flutter/material.dart';

/// Aether Terminal design tokens from the Stitch mobile specification.
class AppColors {
  AppColors._();

  static const Color primary = Color(0xFF006689);
  static const Color primaryContainer = Color(0xFF66CCFF);
  static const Color secondary = Color(0xFF00658B);
  static const Color secondaryContainer = Color(0xFF42C2FD);
  static const Color tertiary = Color(0xFF845400);
  static const Color tertiaryContainer = Color(0xFFFCB24A);
  static const Color error = Color(0xFFBA1A1A);
  static const Color errorContainer = Color(0xFFFFDAD6);

  static const Color lightBackground = Color(0xFFF9F9FF);
  static const Color lightSurface = Color(0xFFF9F9FF);
  static const Color lightSurfaceDim = Color(0xFFD1DAEE);
  static const Color lightSurfaceBright = Color(0xFFF9F9FF);
  static const Color lightSurfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color lightSurfaceContainerLow = Color(0xFFF0F3FF);
  static const Color lightSurfaceContainer = Color(0xFFE7EEFF);
  static const Color lightSurfaceContainerHigh = Color(0xFFDFE8FC);
  static const Color lightSurfaceContainerHighest = Color(0xFFDAE3F6);
  static const Color lightOnSurface = Color(0xFF131C2A);
  static const Color lightOnSurfaceVariant = Color(0xFF3E484E);
  static const Color lightOutline = Color(0xFF6E787F);
  static const Color lightOutlineVariant = Color(0xFFBEC8D0);
  static const Color lightOnPrimary = Color(0xFF00354A);
  static const Color lightOnSecondary = Color(0xFFFFFFFF);
  static const Color inverseSurface = Color(0xFF28313F);
  static const Color inverseOnSurface = Color(0xFFEBF1FF);
  static const Color terminal = Color(0xFF101827);

  static const Color darkBackground = Color(0xFF101827);
  static const Color darkSurface = Color(0xFF131C2A);
  static const Color darkSurfaceDim = Color(0xFF101827);
  static const Color darkSurfaceBright = Color(0xFF28313F);
  static const Color darkSurfaceContainerLowest = Color(0xFF0D1421);
  static const Color darkSurfaceContainerLow = Color(0xFF17202E);
  static const Color darkSurfaceContainer = Color(0xFF202B3A);
  static const Color darkSurfaceContainerHigh = Color(0xFF28313F);
  static const Color darkSurfaceContainerHighest = Color(0xFF354152);
  static const Color darkOnSurface = Color(0xFFEBF1FF);
  static const Color darkOnSurfaceVariant = Color(0xFFBEC8D0);
  static const Color darkOutline = Color(0xFF9BA7B0);
  static const Color darkOutlineVariant = Color(0xFF465360);
  static const Color darkOnPrimary = Color(0xFF00354A);
  static const Color darkOnSecondary = Color(0xFFFFFFFF);

  static const LinearGradient signatureGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primaryContainer, secondaryContainer],
  );

  static Color glassPanel(bool isDark) => isDark
      ? darkSurfaceContainer.withValues(alpha: 0.78)
      : lightSurfaceContainerLowest.withValues(alpha: 0.82);

  static Color ghostBorder(bool isDark) => isDark
      ? darkOutlineVariant.withValues(alpha: 0.35)
      : lightOutlineVariant.withValues(alpha: 0.5);

  static BoxShadow cardShadow(bool isDark) => BoxShadow(
    color: (isDark ? Colors.black : const Color(0xFF17202E)).withValues(
      alpha: isDark ? 0.18 : 0.04,
    ),
    blurRadius: 12,
    offset: const Offset(0, 4),
  );

  static BoxShadow ambientShadow(bool isDark) => cardShadow(isDark);
}
