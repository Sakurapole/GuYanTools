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
            primary: AppColors.primaryContainer,
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
            primaryContainer: AppColors.primaryContainer,
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
      splashFactory: InkRipple.splashFactory,
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
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: scheme.onSurfaceVariant,
          shape: const CircleBorder(),
        ),
      ),
      cardTheme: CardThemeData(
        color: isLight
            ? AppColors.lightSurfaceContainerLowest
            : AppColors.darkSurfaceContainer,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        selectedColor: scheme.secondaryContainer,
        disabledColor: scheme.surfaceContainerHighest.withValues(alpha: 0.48),
        side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.45)),
        shape: const StadiumBorder(),
        labelStyle: TextStyle(
          fontFamily: 'MiSans',
          color: scheme.onSurfaceVariant,
          fontWeight: FontWeight.w500,
        ),
        secondaryLabelStyle: TextStyle(
          fontFamily: 'MiSans',
          color: scheme.onSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLow,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
            color: scheme.outlineVariant.withValues(
              alpha: isLight ? 0.3 : 0.45,
            ),
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
            color: scheme.outlineVariant.withValues(
              alpha: isLight ? 0.3 : 0.45,
            ),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.primary, width: 1.4),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 12,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          textStyle: const TextStyle(
            fontFamily: 'MiSans',
            fontWeight: FontWeight.w600,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          textStyle: const TextStyle(
            fontFamily: 'MiSans',
            fontWeight: FontWeight.w600,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          textStyle: const TextStyle(
            fontFamily: 'MiSans',
            fontWeight: FontWeight.w600,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
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
        fontFamily: 'MiSans',
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
