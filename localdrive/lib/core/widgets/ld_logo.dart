import 'package:flutter/widgets.dart';

/// The onboarding step the mark has reached. Each step brings one more layer
/// to life, so the logo builds itself up as a progress narrative rather than
/// sitting there as a static image.
enum LdLogoStage {
  /// welcome: a closed folder, at rest
  closed,

  /// connect to a server: the sheet rises out of the opening
  connected,

  /// language: the sync arc draws in
  syncing,

  /// sign in: the node fills solid, marking the mark complete
  complete,
}

/// The Local Drive mark.
///
/// Solid layered panels rather than a thin outline: a back panel carrying the
/// tab, a sheet peeking out of the opening, and a front panel over it. Still
/// flat and still fast, with no gradients and no shadows, but built from
/// enough shapes to have real visual weight at any size.
class LdLogo extends StatelessWidget {
  const LdLogo({
    super.key,
    this.size = 96,
    this.stage = LdLogoStage.complete,
    this.animate = false,
  });

  final double size;
  final LdLogoStage stage;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(
        size: Size.square(size),
        painter: _LogoPainter(
          stage: stage,
          progress: 1.0,
        ),
      ),
    );
  }
}

/// The mark's palette.
abstract final class LdMarkColors {
  static const Color backTop = Color(0xFF1E40AF);
  static const Color backBottom = Color(0xFF1D4ED8);
  static const Color sheetTop = Color(0xFFFFFFFF);
  static const Color sheetBottom = Color(0xFFE2E8F0);
  static const Color frontTop = Color(0xFF3B82F6);
  static const Color frontBottom = Color(0xFF2563EB);
  static const Color cloud = Color(0xFFFFFFFF);
}

class _LogoPainter extends CustomPainter {
  const _LogoPainter({required this.stage, required this.progress});

  final LdLogoStage stage;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    // authored on a 64 by 64 box, matching mark.svg
    final unit = size.width / 64;
    canvas.save();
    canvas.scale(unit);

    final step = stage.index;

    // logo-back: the folder back and its modern rounded tab
    final backShader = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [LdMarkColors.backTop, LdMarkColors.backBottom],
    ).createShader(const Rect.fromLTWH(0, 12, 64, 39));
    canvas.drawPath(_backPanel(), Paint()..shader = backShader);

    // logo-sheet: the contents, rising out of the opening once connected
    if (step >= LdLogoStage.connected.index) {
      final rising =
          step == LdLogoStage.connected.index ? progress : 1.0;
      canvas.save();
      canvas.translate(0, 6 * (1 - rising));
      canvas.clipRect(const Rect.fromLTWH(0, 0, 64, 51));
      final sheetShader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [LdMarkColors.sheetTop, LdMarkColors.sheetBottom],
      ).createShader(const Rect.fromLTWH(0, 19, 64, 24));
      canvas.drawPath(
        _sheet(),
        Paint()
          ..shader = sheetShader
          ..color = Color.fromRGBO(255, 255, 255, rising),
      );
      canvas.restore();
    }

    // logo-front: vibrant azure front flap
    final frontShader = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [LdMarkColors.frontTop, LdMarkColors.frontBottom],
    ).createShader(const Rect.fromLTWH(0, 25, 64, 26));
    canvas.drawPath(_frontPanel(), Paint()..shader = frontShader);

    // subtle top edge highlight on front flap
    canvas.drawPath(
      _frontHighlight(),
      Paint()..color = const Color(0x40FFFFFF),
    );

    // logo-cloud: the bold, crisp cloud silhouette
    if (step >= LdLogoStage.connected.index) {
      final alpha =
          step == LdLogoStage.connected.index ? (0.75 * progress) : 1.0;
      canvas.drawPath(
        _cloud(),
        Paint()..color = Color.fromRGBO(255, 255, 255, alpha),
      );
    }

    // syncing indicator
    if (step == LdLogoStage.syncing.index) {
      canvas.drawCircle(
        const Offset(44, 32),
        3,
        Paint()..color = const Color(0xFF60A5FA),
      );
      canvas.drawCircle(
        const Offset(44, 32),
        3,
        Paint()
          ..color = const Color(0xFFFFFFFF)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );
    }

    canvas.restore();
  }

  /// Modern rounded folder back with Apple-style smooth tab.
  static Path _backPanel() => Path()
    ..moveTo(11, 12)
    ..lineTo(24, 12)
    ..cubicTo(27, 12, 29, 17, 33, 17)
    ..lineTo(53, 17)
    ..cubicTo(56, 17, 58, 19, 58, 22)
    ..lineTo(58, 46)
    ..cubicTo(58, 49, 56, 51, 53, 51)
    ..lineTo(11, 51)
    ..cubicTo(8, 51, 6, 49, 6, 46)
    ..lineTo(6, 17)
    ..cubicTo(6, 14, 8, 12, 11, 12)
    ..close();

  /// Crisp light sheet peeking out of the folder opening.
  static Path _sheet() => Path()
    ..moveTo(15, 19)
    ..lineTo(49, 19)
    ..cubicTo(51, 19, 52, 20, 52, 22)
    ..lineTo(52, 43)
    ..lineTo(12, 43)
    ..lineTo(12, 22)
    ..cubicTo(12, 20, 13, 19, 15, 19)
    ..close();

  /// Sleek front flap.
  static Path _frontPanel() => Path()
    ..moveTo(11, 25)
    ..lineTo(53, 25)
    ..cubicTo(56, 25, 58, 27, 58, 30)
    ..lineTo(58, 46)
    ..cubicTo(58, 49, 56, 51, 53, 51)
    ..lineTo(11, 51)
    ..cubicTo(8, 51, 6, 49, 6, 46)
    ..lineTo(6, 30)
    ..cubicTo(6, 27, 8, 25, 11, 25)
    ..close();

  /// Subtle top rim highlight.
  static Path _frontHighlight() => Path()
    ..moveTo(11, 25)
    ..lineTo(53, 25)
    ..cubicTo(56, 25, 58, 27, 58, 30)
    ..lineTo(58, 31)
    ..cubicTo(58, 28, 56, 26, 53, 26)
    ..lineTo(11, 26)
    ..cubicTo(8, 26, 6, 28, 6, 31)
    ..lineTo(6, 30)
    ..cubicTo(6, 27, 8, 25, 11, 25)
    ..close();

  /// Bold, crystal-clear white cloud silhouette.
  static Path _cloud() => Path()
    ..moveTo(25, 46)
    ..cubicTo(21.7, 46, 19, 43.3, 19, 40)
    ..cubicTo(19, 37.4, 21.2, 35.2, 24.2, 34.5)
    ..cubicTo(24.5, 30.5, 28.2, 28, 32, 28)
    ..cubicTo(35.8, 28, 39.5, 30.5, 39.8, 34.5)
    ..cubicTo(42.8, 35.2, 45, 37.4, 45, 40)
    ..cubicTo(45, 43.3, 42.3, 46, 39, 46)
    ..close();

  @override
  bool shouldRepaint(_LogoPainter old) =>
      old.stage != stage || old.progress != progress;
}

/// The mark beside the wordmark, for the sidebar header and the About screen.
class LdWordmark extends StatelessWidget {
  const LdWordmark({super.key, required this.title, this.markSize = 30});

  final String title;
  final double markSize;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        LdLogo(size: markSize, animate: false),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: DefaultTextStyle.of(context).style,
          ),
        ),
      ],
    );
  }
}
