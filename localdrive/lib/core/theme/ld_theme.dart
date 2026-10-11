import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../constants/ld_colors.dart';
import '../constants/ld_radii.dart';
import '../constants/ld_typography.dart';

/// Builds the ThemeData the app uses, per locale and brightness.
///
/// The typography swap happens here, once, at the ThemeData level, so every
/// widget that reads `Theme.of(context).textTheme` gets the right face with no
/// exceptions to remember.
abstract final class LdTheme {
  static ThemeData dark(Locale locale) =>
      forLocale(locale, brightness: Brightness.dark);

  static ThemeData light(Locale locale) =>
      forLocale(locale, brightness: Brightness.light);

  static ThemeData forLocale(
    Locale locale, {
    Brightness brightness = Brightness.dark,
  }) {
    final isDark = brightness == Brightness.dark;
    final textTheme =
        LdTypography.forLanguage(locale.languageCode, brightness: brightness);
    final surfaces = isDark ? LdSurfaces.dark : LdSurfaces.light;

    final scheme = isDark
        ? const ColorScheme.dark(
            primary: LdColors.accentPrimary,
            onPrimary: LdColors.darkForegroundPrimary,
            secondary: LdColors.accentPrimary,
            onSecondary: LdColors.darkForegroundPrimary,
            surface: LdColors.darkBackgroundElevated,
            onSurface: LdColors.darkForegroundPrimary,
            error: LdColors.accentWarning,
            onError: LdColors.darkForegroundPrimary,
            outline: LdColors.darkStrokeOutline,
          ).copyWith(surfaceContainerHighest: LdColors.darkBackgroundElevated)
        : const ColorScheme.light(
            primary: LdColors.accentPrimary,
            onPrimary: LdColors.lightBackgroundElevated,
            secondary: LdColors.accentPrimary,
            onSecondary: LdColors.lightBackgroundElevated,
            surface: LdColors.lightBackgroundElevated,
            onSurface: LdColors.lightForegroundPrimary,
            error: LdColors.accentWarning,
            onError: LdColors.lightBackgroundElevated,
            outline: LdColors.lightStrokeOutline,
          ).copyWith(surfaceContainerHighest: LdColors.lightBackgroundSunken);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: surfaces.backgroundPrimary,
      canvasColor: surfaces.backgroundPrimary,
      textTheme: textTheme,
      primaryTextTheme: textTheme,

      // no default material ripple anywhere; every interactive surface uses
      // the tap fade from LdMotion instead
      splashFactory: NoSplash.splashFactory,
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      hoverColor: LdColors.wash(surfaces.foregroundPrimary, 0.04),
      focusColor: LdColors.wash(LdColors.accentPrimary, 0.18),

      dividerTheme: DividerThemeData(
        color: surfaces.strokeOutline,
        thickness: 1,
        space: 1,
      ),

      iconTheme: IconThemeData(
        color: surfaces.foregroundPrimary,
        size: 22,
      ),

      // structural widgets are themed rather than left stock, so nothing
      // unstyled ever reaches the screen
      appBarTheme: AppBarTheme(
        backgroundColor: surfaces.backgroundPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
        iconTheme: IconThemeData(color: surfaces.foregroundPrimary),
        systemOverlayStyle: (isDark
                ? SystemUiOverlayStyle.light
                : SystemUiOverlayStyle.dark)
            .copyWith(
          statusBarColor: Colors.transparent,
          systemNavigationBarColor: surfaces.backgroundPrimary,
          systemNavigationBarIconBrightness:
              isDark ? Brightness.light : Brightness.dark,
        ),
      ),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surfaces.backgroundElevated,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: surfaces.backgroundElevated,
        modalBarrierColor:
            isDark ? const Color(0x99000000) : const Color(0x66000000),
        shape: const RoundedRectangleBorder(borderRadius: LdRadii.sheetRadius),
        elevation: 0,
        showDragHandle: false,
      ),

      cardTheme: CardThemeData(
        color: surfaces.backgroundElevated,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: const RoundedRectangleBorder(borderRadius: LdRadii.cardRadius),
      ),

      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: surfaces.backgroundElevated,
          borderRadius: LdRadii.chipRadius,
          border: Border.all(color: surfaces.strokeOutline),
        ),
        textStyle: textTheme.bodySmall,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        waitDuration: const Duration(milliseconds: 500),
      ),

      scrollbarTheme: ScrollbarThemeData(
        thumbColor: WidgetStatePropertyAll(
          LdColors.wash(surfaces.foregroundSecondary, 0.35),
        ),
        radius: const Radius.circular(4),
        thickness: const WidgetStatePropertyAll(4),
        crossAxisMargin: 2,
      ),

      textSelectionTheme: TextSelectionThemeData(
        cursorColor: LdColors.accentPrimary,
        selectionColor: LdColors.wash(LdColors.accentPrimary, 0.3),
        selectionHandleColor: LdColors.accentPrimary,
      ),

      pageTransitionsTheme: const PageTransitionsTheme(
        builders: <TargetPlatform, PageTransitionsBuilder>{
          TargetPlatform.android: _LdPageTransitions(),
          TargetPlatform.iOS: _LdPageTransitions(),
          TargetPlatform.macOS: _LdPageTransitions(),
          TargetPlatform.windows: _LdPageTransitions(),
          TargetPlatform.linux: _LdPageTransitions(),
        },
      ),

      extensions: <ThemeExtension<dynamic>>[surfaces],
    );
  }
}

/// The standard transition, applied to every route push.
class _LdPageTransitions extends PageTransitionsBuilder {
  const _LdPageTransitions();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    return child;
  }
}

/// Surface decorations reused across the widget kit, exposed as a theme
/// extension so nothing rebuilds a border by hand.
class LdSurfaces extends ThemeExtension<LdSurfaces> {
  const LdSurfaces({
    required this.backgroundPrimary,
    required this.backgroundElevated,
    required this.backgroundSunken,
    required this.foregroundPrimary,
    required this.foregroundSecondary,
    required this.foregroundMuted,
    required this.strokeOutline,
  });

  final Color backgroundPrimary;
  final Color backgroundElevated;
  final Color backgroundSunken;
  final Color foregroundPrimary;
  final Color foregroundSecondary;
  final Color foregroundMuted;
  final Color strokeOutline;

  static const LdSurfaces dark = LdSurfaces(
    backgroundPrimary: LdColors.darkBackgroundPrimary,
    backgroundElevated: LdColors.darkBackgroundElevated,
    backgroundSunken: LdColors.darkBackgroundSunken,
    foregroundPrimary: LdColors.darkForegroundPrimary,
    foregroundSecondary: LdColors.darkForegroundSecondary,
    foregroundMuted: LdColors.darkForegroundMuted,
    strokeOutline: LdColors.darkStrokeOutline,
  );

  static const LdSurfaces light = LdSurfaces(
    backgroundPrimary: LdColors.lightBackgroundPrimary,
    backgroundElevated: LdColors.lightBackgroundElevated,
    backgroundSunken: LdColors.lightBackgroundSunken,
    foregroundPrimary: LdColors.lightForegroundPrimary,
    foregroundSecondary: LdColors.lightForegroundSecondary,
    foregroundMuted: LdColors.lightForegroundMuted,
    strokeOutline: LdColors.lightStrokeOutline,
  );

  BoxDecoration get card => BoxDecoration(
        color: backgroundElevated,
        borderRadius: LdRadii.cardRadius,
        border: Border.all(color: strokeOutline),
      );

  BoxDecoration get tile => BoxDecoration(
        color: backgroundElevated,
        borderRadius: LdRadii.tileRadius,
        border: Border.all(color: strokeOutline),
      );

  BoxDecoration get field => BoxDecoration(
        color: backgroundElevated,
        borderRadius: LdRadii.fieldRadius,
        border: Border.all(color: strokeOutline),
      );

  BoxDecoration get pill => BoxDecoration(
        color: backgroundElevated,
        borderRadius: LdRadii.pillRadius,
        border: Border.all(color: strokeOutline),
      );

  @override
  LdSurfaces copyWith({
    Color? backgroundPrimary,
    Color? backgroundElevated,
    Color? backgroundSunken,
    Color? foregroundPrimary,
    Color? foregroundSecondary,
    Color? foregroundMuted,
    Color? strokeOutline,
  }) =>
      LdSurfaces(
        backgroundPrimary: backgroundPrimary ?? this.backgroundPrimary,
        backgroundElevated: backgroundElevated ?? this.backgroundElevated,
        backgroundSunken: backgroundSunken ?? this.backgroundSunken,
        foregroundPrimary: foregroundPrimary ?? this.foregroundPrimary,
        foregroundSecondary: foregroundSecondary ?? this.foregroundSecondary,
        foregroundMuted: foregroundMuted ?? this.foregroundMuted,
        strokeOutline: strokeOutline ?? this.strokeOutline,
      );

  @override
  LdSurfaces lerp(ThemeExtension<LdSurfaces>? other, double t) {
    if (other is! LdSurfaces) return this;
    return LdSurfaces(
      backgroundPrimary:
          Color.lerp(backgroundPrimary, other.backgroundPrimary, t)!,
      backgroundElevated:
          Color.lerp(backgroundElevated, other.backgroundElevated, t)!,
      backgroundSunken:
          Color.lerp(backgroundSunken, other.backgroundSunken, t)!,
      foregroundPrimary:
          Color.lerp(foregroundPrimary, other.foregroundPrimary, t)!,
      foregroundSecondary:
          Color.lerp(foregroundSecondary, other.foregroundSecondary, t)!,
      foregroundMuted:
          Color.lerp(foregroundMuted, other.foregroundMuted, t)!,
      strokeOutline:
          Color.lerp(strokeOutline, other.strokeOutline, t)!,
    );
  }
}

/// Shorthand every widget uses instead of rebuilding a decoration.
extension LdThemeContext on BuildContext {
  LdSurfaces get surfaces =>
      Theme.of(this).extension<LdSurfaces>() ??
      (Theme.of(this).brightness == Brightness.light
          ? LdSurfaces.light
          : LdSurfaces.dark);
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}
