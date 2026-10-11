import 'package:flutter/widgets.dart';

/// The whole palette. Two brand accents, six file type tones, nothing else.
abstract final class LdColors {
  // dark palette
  static const Color darkBackgroundPrimary = Color(0xFF141414);
  static const Color darkBackgroundElevated = Color(0xFF202020);
  static const Color darkBackgroundSunken = Color(0xFF0E0E0E);
  static const Color darkForegroundPrimary = Color(0xFFFFFFFF);
  static const Color darkForegroundSecondary = Color(0xFF909090);
  static const Color darkForegroundMuted = Color(0xFF434343);
  static const Color darkStrokeOutline = Color(0xFF3D3D3D);

  // light palette
  static const Color lightBackgroundPrimary = Color(0xFFF6F7F9);
  static const Color lightBackgroundElevated = Color(0xFFFFFFFF);
  static const Color lightBackgroundSunken = Color(0xFFECEEF1);
  static const Color lightForegroundPrimary = Color(0xFF111111);
  static const Color lightForegroundSecondary = Color(0xFF666666);
  static const Color lightForegroundMuted = Color(0xFF9E9E9E);
  static const Color lightStrokeOutline = Color(0xFFE1E4E8);

  // default surfaces (for backwards compatibility)
  static const Color backgroundPrimary = darkBackgroundPrimary;
  static const Color backgroundElevated = darkBackgroundElevated;
  static const Color backgroundSunken = darkBackgroundSunken;

  // text and icons (for backwards compatibility)
  static const Color foregroundPrimary = darkForegroundPrimary;
  static const Color foregroundSecondary = darkForegroundSecondary;
  static const Color foregroundMuted = darkForegroundMuted;

  static const Color strokeOutline = darkStrokeOutline;

  /// the one interactive accent: active tab, progress, links, primary cta
  static const Color accentPrimary = Color(0xFF4C8DFF);

  /// doubles as destructive and permission denied, keeping the palette to two
  static const Color accentWarning = Color(0xFFEE7759);

  // file type tones, see the design system section of the plan
  static const Color fileDocument = accentPrimary;
  static const Color fileSpreadsheet = Color(0xFF4CAF6D);
  static const Color filePresentation = Color(0xFFE8935C);
  static const Color filePdf = Color(0xFFE5646B);
  static const Color fileCode = Color(0xFF9B7BEF);
  static const Color fileMedia = Color(0xFF4CC6C6);
  static const Color fileNeutral = foregroundSecondary;

  /// folder recolor swatches, a fixed row rather than an open wheel so the
  /// browser never turns into a rainbow
  static const Map<String, Color> folderSwatches = <String, Color>{
    'neutral': Color(0xFF6E6E6E),
    'blue': accentPrimary,
    'green': fileSpreadsheet,
    'orange': filePresentation,
    'red': filePdf,
    'purple': fileCode,
    'teal': fileMedia,
  };

  /// the darker companion shade behind every layered icon's front panel
  static Color backPanel(Color front, [Color? sunken]) =>
      Color.lerp(front, sunken ?? backgroundSunken, 0.55) ?? front;

  /// a low-alpha wash of an accent, for a selected row or a badge fill
  static Color wash(Color base, [double opacity = 0.14]) =>
      base.withValues(alpha: opacity);
}
