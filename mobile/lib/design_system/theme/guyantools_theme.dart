import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../tokens/app_tokens.dart';

class GuYanTheme {
  GuYanTheme._();

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final scheme = isLight
        ? const ColorScheme.light(
            primary: AppColors.primary,
            primaryContainer: AppColors.primaryContainer,
            secondary: AppColors.secondary,
            secondaryContainer: AppColors.secondaryContainer,
            tertiary: AppColors.tertiary,
            tertiaryContainer: AppColors.tertiaryContainer,
            error: AppColors.error,
            errorContainer: AppColors.errorContainer,
            surface: AppColors.lightSurface,
            onSurface: AppColors.lightOnSurface,
            onSurfaceVariant: AppColors.lightOnSurfaceVariant,
            outline: AppColors.lightOutline,
            outlineVariant: AppColors.lightOutlineVariant,
            onPrimary: AppColors.lightOnPrimary,
            onSecondary: AppColors.lightOnSecondary,
            surfaceContainerLowest: AppColors.lightSurfaceContainerLowest,
            surfaceContainerLow: AppColors.lightSurfaceContainerLow,
            surfaceContainer: AppColors.lightSurfaceContainer,
            surfaceContainerHigh: AppColors.lightSurfaceContainerHigh,
            surfaceContainerHighest: AppColors.lightSurfaceContainerHighest,
            surfaceBright: AppColors.lightSurfaceBright,
            surfaceDim: AppColors.lightSurfaceDim,
            inverseSurface: AppColors.inverseSurface,
            onInverseSurface: AppColors.inverseOnSurface,
          )
        : const ColorScheme.dark(
            primary: AppColors.primaryContainer,
            primaryContainer: AppColors.primary,
            secondary: AppColors.secondaryContainer,
            secondaryContainer: AppColors.secondary,
            tertiary: AppColors.tertiaryContainer,
            tertiaryContainer: AppColors.tertiary,
            error: AppColors.errorContainer,
            errorContainer: AppColors.error,
            surface: AppColors.darkSurface,
            onSurface: AppColors.darkOnSurface,
            onSurfaceVariant: AppColors.darkOnSurfaceVariant,
            outline: AppColors.darkOutline,
            outlineVariant: AppColors.darkOutlineVariant,
            onPrimary: AppColors.darkOnPrimary,
            onSecondary: AppColors.darkOnSecondary,
            surfaceContainerLowest: AppColors.darkSurfaceContainerLowest,
            surfaceContainerLow: AppColors.darkSurfaceContainerLow,
            surfaceContainer: AppColors.darkSurfaceContainer,
            surfaceContainerHigh: AppColors.darkSurfaceContainerHigh,
            surfaceContainerHighest: AppColors.darkSurfaceContainerHighest,
            surfaceBright: AppColors.darkSurfaceBright,
            surfaceDim: AppColors.darkSurfaceDim,
            inverseSurface: AppColors.inverseSurface,
            onInverseSurface: AppColors.inverseOnSurface,
          );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: isLight
          ? AppColors.lightBackground
          : AppColors.darkBackground,
      textTheme: _textTheme(brightness),
      extensions: <ThemeExtension<dynamic>>[
        const AppSpacing(),
        const AppRadius(),
        AppElevation.forBrightness(brightness),
        const AppMotion(),
        const AppBreakpoints(),
      ],
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: isLight
            ? AppColors.lightSurfaceContainerLowest
            : AppColors.darkSurfaceContainer,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLowest,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(
            color: scheme.outlineVariant.withValues(
              alpha: isLight ? 0.3 : 0.45,
            ),
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(
            color: scheme.outlineVariant.withValues(
              alpha: isLight ? 0.3 : 0.45,
            ),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: scheme.primary),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 12,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
    );
  }

  static TextTheme _textTheme(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final onSurface = isLight
        ? AppColors.lightOnSurface
        : AppColors.darkOnSurface;
    final onSurfaceVariant = isLight
        ? AppColors.lightOnSurfaceVariant
        : AppColors.darkOnSurfaceVariant;

    TextStyle base({
      required double size,
      required FontWeight weight,
      required double height,
      required Color color,
    }) {
      return TextStyle(
        fontFamily: 'Inter',
        fontSize: size,
        fontWeight: weight,
        height: height,
        color: color,
      );
    }

    return TextTheme(
      displayLarge: base(
        size: 32,
        weight: FontWeight.w700,
        height: 1.25,
        color: onSurface,
      ),
      displayMedium: base(
        size: 24,
        weight: FontWeight.w700,
        height: 1.33,
        color: onSurface,
      ),
      headlineLarge: base(
        size: 24,
        weight: FontWeight.w700,
        height: 1.33,
        color: onSurface,
      ),
      headlineMedium: base(
        size: 22,
        weight: FontWeight.w700,
        height: 1.32,
        color: onSurface,
      ),
      headlineSmall: base(
        size: 20,
        weight: FontWeight.w600,
        height: 1.4,
        color: onSurface,
      ),
      titleLarge: base(
        size: 20,
        weight: FontWeight.w600,
        height: 1.4,
        color: onSurface,
      ),
      titleMedium: base(
        size: 16,
        weight: FontWeight.w600,
        height: 1.5,
        color: onSurface,
      ),
      titleSmall: base(
        size: 14,
        weight: FontWeight.w600,
        height: 1.42,
        color: onSurface,
      ),
      bodyLarge: base(
        size: 16,
        weight: FontWeight.w400,
        height: 1.5,
        color: onSurfaceVariant,
      ),
      bodyMedium: base(
        size: 14,
        weight: FontWeight.w400,
        height: 1.42,
        color: onSurfaceVariant,
      ),
      bodySmall: base(
        size: 12,
        weight: FontWeight.w400,
        height: 1.33,
        color: onSurfaceVariant,
      ),
      labelLarge: base(
        size: 14,
        weight: FontWeight.w600,
        height: 1.42,
        color: onSurface,
      ),
      labelMedium: base(
        size: 12,
        weight: FontWeight.w500,
        height: 1.33,
        color: onSurfaceVariant,
      ),
      labelSmall: base(
        size: 11,
        weight: FontWeight.w600,
        height: 1.3,
        color: onSurfaceVariant,
      ),
    );
  }
}
