import 'dart:io' show Platform;

import 'package:bitsdojo_window/bitsdojo_window.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../constants/ld_colors.dart';
import '../constants/ld_motion.dart';
import '../services/desktop_shell_service.dart';
import '../services/fullscreen_service.dart';
import '../theme/ld_theme.dart';
import 'ld_logo.dart';
import 'ld_tappable.dart';

/// The app's own title bar on desktop. The system title bar is removed and
/// replaced rather than styled, since there is no way to make a Windows or
/// Linux one match a dark app.
///
/// macOS keeps its traffic lights, since people rely on them as a platform
/// convention, so this only draws buttons on Windows and Linux and leaves a
/// draggable strip with room for the lights on macOS.
class LdWindowBar extends StatelessWidget {
  const LdWindowBar({super.key, this.title = 'Local Drive'});

  final String title;

  /// Not just "is this a desktop platform": a widget test runs on a desktop
  /// host with no window behind it, and reaching for `appWindow` there throws.
  static bool get isVisible =>
      !kIsWeb &&
      (Platform.isWindows || Platform.isMacOS || Platform.isLinux) &&
      DesktopShellService.hasWindow &&
      !FullscreenService.instance.isFullscreen;

  static const double height = 38;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<bool>(
      stream: FullscreenService.instance.onFullscreenChange,
      initialData: FullscreenService.instance.isFullscreen,
      builder: (context, snapshot) {
        final isFs = snapshot.data ?? FullscreenService.instance.isFullscreen;
        if (!isVisible || isFs) return const SizedBox.shrink();
        final macOS = Platform.isMacOS;

        return SizedBox(
          height: height,
          child: Container(
            // the same surface as everything below it, so the window reads as one
            // piece rather than a dark strip bolted to the top of the app
            color: context.surfaces.backgroundPrimary,
            child: Row(
              children: <Widget>[
                // the traffic lights sit here on macOS, so nothing else may
                if (macOS) const SizedBox(width: 78),
                Expanded(
                  child: MoveWindow(
                    child: Row(
                      children: <Widget>[
                        if (!macOS) ...<Widget>[
                          const SizedBox(width: 12),
                          const LdLogo(size: 18, stage: LdLogoStage.complete),
                          const SizedBox(width: 10),
                        ],
                        Flexible(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelSmall!.copyWith(
                                  color: context.surfaces.foregroundSecondary,
                                ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (!macOS) const LdWindowButtons(),
              ],
            ),
          ),
        );
      },
    );
  }
}

class LdWindowButtons extends StatelessWidget {
  const LdWindowButtons({super.key, this.isDark = false});

  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<bool>(
      stream: FullscreenService.instance.onFullscreenChange,
      initialData: FullscreenService.instance.isFullscreen,
      builder: (context, snapshot) {
        final isFs = snapshot.data ?? FullscreenService.instance.isFullscreen;
        if (!LdWindowBar.isVisible || isFs || Platform.isMacOS) {
          return const SizedBox.shrink();
        }

        return Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            _WindowButton(
              onTap: appWindow.minimize,
              builder: _drawMinimize,
              isDark: isDark,
            ),
            _WindowButton(
              onTap: appWindow.maximizeOrRestore,
              builder: _drawMaximize,
              isDark: isDark,
            ),
            // close hides to the tray rather than quitting: a transfer halfway
            // through has no reason to die because someone clicked the X. Quit is
            // a deliberate choice from the tray menu
            _WindowButton(
              onTap: appWindow.hide,
              danger: true,
              builder: _drawClose,
              isDark: isDark,
            ),
          ],
        );
      },
    );
  }
}

typedef _GlyphPainter = void Function(Canvas canvas, Size size, Paint paint);

class _WindowButton extends StatefulWidget {
  const _WindowButton({
    required this.onTap,
    required this.builder,
    this.danger = false,
    this.isDark = false,
  });

  final VoidCallback onTap;
  final _GlyphPainter builder;
  final bool danger;
  final bool isDark;

  @override
  State<_WindowButton> createState() => _WindowButtonState();
}

class _WindowButtonState extends State<_WindowButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return LdTappable(
      onTap: widget.onTap,
      onHoverChanged: (value) => setState(() => _hovered = value),
      child: AnimatedContainer(
        duration: LdMotion.tapFade,
        width: 46,
        height: LdWindowBar.height,
        alignment: Alignment.center,
        color: _hovered
            ? (widget.danger
                ? LdColors.filePdf
                : (widget.isDark
                    ? Colors.white.withValues(alpha: 0.15)
                    : context.surfaces.backgroundElevated))
            : Colors.transparent,
        child: CustomPaint(
          size: const Size.square(10),
          painter: _GlyphPainterDelegate(
            draw: widget.builder,
            color: widget.isDark
                ? (_hovered ? Colors.white : Colors.white70)
                : (_hovered
                    ? context.surfaces.foregroundPrimary
                    : context.surfaces.foregroundSecondary),
          ),
        ),
      ),
    );
  }
}

class _GlyphPainterDelegate extends CustomPainter {
  const _GlyphPainterDelegate({required this.draw, required this.color});

  final _GlyphPainter draw;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.1
      ..style = PaintingStyle.stroke;
    draw(canvas, size, paint);
  }

  @override
  bool shouldRepaint(_GlyphPainterDelegate oldDelegate) =>
      oldDelegate.color != color || oldDelegate.draw != draw;
}

void _drawMinimize(Canvas canvas, Size size, Paint paint) {
  final y = size.height / 2;
  canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
}

void _drawMaximize(Canvas canvas, Size size, Paint paint) {
  canvas.drawRect(Offset.zero & size, paint);
}

void _drawClose(Canvas canvas, Size size, Paint paint) {
  canvas
    ..drawLine(Offset.zero, Offset(size.width, size.height), paint)
    ..drawLine(Offset(size.width, 0), Offset(0, size.height), paint);
}
