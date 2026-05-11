import 'package:flutter/material.dart';

@immutable
class AppSpacing extends ThemeExtension<AppSpacing> {
  final double xs;
  final double sm;
  final double md;
  final double lg;
  final double xl;
  final double xxl;

  const AppSpacing({
    this.xs = 4,
    this.sm = 8,
    this.md = 12,
    this.lg = 16,
    this.xl = 24,
    this.xxl = 32,
  });

  @override
  AppSpacing copyWith({
    double? xs,
    double? sm,
    double? md,
    double? lg,
    double? xl,
    double? xxl,
  }) {
    return AppSpacing(
      xs: xs ?? this.xs,
      sm: sm ?? this.sm,
      md: md ?? this.md,
      lg: lg ?? this.lg,
      xl: xl ?? this.xl,
      xxl: xxl ?? this.xxl,
    );
  }

  @override
  AppSpacing lerp(ThemeExtension<AppSpacing>? other, double t) {
    if (other is! AppSpacing) return this;
    return AppSpacing(
      xs: lerpDouble(xs, other.xs, t),
      sm: lerpDouble(sm, other.sm, t),
      md: lerpDouble(md, other.md, t),
      lg: lerpDouble(lg, other.lg, t),
      xl: lerpDouble(xl, other.xl, t),
      xxl: lerpDouble(xxl, other.xxl, t),
    );
  }
}

@immutable
class AppRadius extends ThemeExtension<AppRadius> {
  final double xs;
  final double sm;
  final double md;
  final double pill;

  const AppRadius({this.xs = 4, this.sm = 6, this.md = 8, this.pill = 999});

  @override
  AppRadius copyWith({double? xs, double? sm, double? md, double? pill}) {
    return AppRadius(
      xs: xs ?? this.xs,
      sm: sm ?? this.sm,
      md: md ?? this.md,
      pill: pill ?? this.pill,
    );
  }

  @override
  AppRadius lerp(ThemeExtension<AppRadius>? other, double t) {
    if (other is! AppRadius) return this;
    return AppRadius(
      xs: lerpDouble(xs, other.xs, t),
      sm: lerpDouble(sm, other.sm, t),
      md: lerpDouble(md, other.md, t),
      pill: lerpDouble(pill, other.pill, t),
    );
  }
}

@immutable
class AppElevation extends ThemeExtension<AppElevation> {
  final List<BoxShadow> card;

  const AppElevation({this.card = const []});

  factory AppElevation.forBrightness(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    return AppElevation(
      card: [
        BoxShadow(
          color: (isDark ? Colors.black : const Color(0xFF17202E)).withValues(
            alpha: isDark ? 0.18 : 0.045,
          ),
          blurRadius: 14,
          offset: const Offset(0, 5),
        ),
      ],
    );
  }

  @override
  AppElevation copyWith({List<BoxShadow>? card}) {
    return AppElevation(card: card ?? this.card);
  }

  @override
  AppElevation lerp(ThemeExtension<AppElevation>? other, double t) {
    if (other is! AppElevation) return this;
    return t < 0.5 ? this : other;
  }
}

@immutable
class AppMotion extends ThemeExtension<AppMotion> {
  final Duration fast;
  final Duration normal;

  const AppMotion({
    this.fast = const Duration(milliseconds: 160),
    this.normal = const Duration(milliseconds: 240),
  });

  @override
  AppMotion copyWith({Duration? fast, Duration? normal}) {
    return AppMotion(fast: fast ?? this.fast, normal: normal ?? this.normal);
  }

  @override
  AppMotion lerp(ThemeExtension<AppMotion>? other, double t) {
    if (other is! AppMotion) return this;
    return t < 0.5 ? this : other;
  }
}

@immutable
class AppBreakpoints extends ThemeExtension<AppBreakpoints> {
  final double compact;
  final double medium;
  final double expanded;

  const AppBreakpoints({
    this.compact = 600,
    this.medium = 840,
    this.expanded = 1200,
  });

  @override
  AppBreakpoints copyWith({double? compact, double? medium, double? expanded}) {
    return AppBreakpoints(
      compact: compact ?? this.compact,
      medium: medium ?? this.medium,
      expanded: expanded ?? this.expanded,
    );
  }

  @override
  AppBreakpoints lerp(ThemeExtension<AppBreakpoints>? other, double t) {
    if (other is! AppBreakpoints) return this;
    return AppBreakpoints(
      compact: lerpDouble(compact, other.compact, t),
      medium: lerpDouble(medium, other.medium, t),
      expanded: lerpDouble(expanded, other.expanded, t),
    );
  }
}

double lerpDouble(double a, double b, double t) => a + (b - a) * t;

extension AppTokens on BuildContext {
  AppSpacing get spacing =>
      Theme.of(this).extension<AppSpacing>() ?? const AppSpacing();
  AppRadius get radius =>
      Theme.of(this).extension<AppRadius>() ?? const AppRadius();
  AppElevation get elevation =>
      Theme.of(this).extension<AppElevation>() ??
      AppElevation.forBrightness(Theme.of(this).brightness);
  AppMotion get motion =>
      Theme.of(this).extension<AppMotion>() ?? const AppMotion();
  AppBreakpoints get breakpoints =>
      Theme.of(this).extension<AppBreakpoints>() ?? const AppBreakpoints();
}
