import 'package:flutter/widgets.dart';

/// Every duration and curve in the app. One standard transition, used
/// everywhere, so nothing animates at an unfamiliar speed.
abstract final class LdMotion {
  /// fade plus a 16px upward slide, the app's one page transition
  static const Duration standard = Duration.zero;
  static const Duration tapFade = Duration.zero;
  static const Duration authStep = Duration.zero;
  static const Duration sheet = Duration.zero;
  static const Duration toast = Duration.zero;
  static const Duration toastVisible = Duration(seconds: 4);
  static const Duration hover = Duration.zero;
  static const Duration spinner = Duration(milliseconds: 1200);

  static const Curve curve = Curves.linear;
  static const Curve emphasized = Curves.linear;

  /// how far the standard transition slides up from
  static const double slideOffset = 0;

  /// the shared enter animation - returns child directly with no transition
  static Widget fadeSlide(Animation<double> animation, Widget child) {
    return child;
  }
}
