import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';

import '../constants/ld_motion.dart';

/// The one press affordance in the app: a short opacity fade, never a Material
/// ripple. Every interactive surface wraps in this instead of InkWell.
class LdTappable extends StatefulWidget {
  const LdTappable({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.onLongPressAt,
    this.onSecondaryTap,
    this.onTertiaryTap,
    this.borderRadius,
    this.pressedOpacity = 1.0,
    this.enabled = true,
    this.cursor = SystemMouseCursors.click,
    this.onHoverChanged,
    this.behavior = HitTestBehavior.opaque,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// Long press, with where it happened. Use this rather than [onLongPress]
  /// when the press opens a menu that has to be anchored.
  final ValueChanged<Offset>? onLongPressAt;

  /// Right click on desktop, which is where the context menu opens.
  ///
  /// It carries the point that was clicked, because a desktop menu opens at
  /// the pointer. Without that the caller has nowhere to put the panel and
  /// has to fall back to a sheet, which is not what right click does on a
  /// desktop.
  final ValueChanged<Offset>? onSecondaryTap;

  /// Middle click on desktop / web.
  final VoidCallback? onTertiaryTap;
  final BorderRadius? borderRadius;
  final double pressedOpacity;
  final bool enabled;
  final MouseCursor cursor;
  final ValueChanged<bool>? onHoverChanged;
  final HitTestBehavior behavior;

  @override
  State<LdTappable> createState() => _LdTappableState();
}

class _LdTappableState extends State<LdTappable> {
  bool _pressed = false;

  bool get _interactive =>
      widget.enabled &&
      (widget.onTap != null ||
          widget.onLongPress != null ||
          widget.onLongPressAt != null ||
          widget.onSecondaryTap != null ||
          widget.onTertiaryTap != null);

  void _setPressed(bool value) {
    if (!_interactive || _pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  void didUpdateWidget(LdTappable oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.enabled && _pressed) {
      _pressed = false;
    }
  }

  @override
  void deactivate() {
    _pressed = false;
    super.deactivate();
  }

  @override
  Widget build(BuildContext context) {
    final content = AnimatedOpacity(
      opacity: _pressed ? widget.pressedOpacity : 1,
      duration: LdMotion.tapFade,
      curve: LdMotion.curve,
      child: widget.child,
    );

    final gesture = GestureDetector(
      behavior: widget.behavior,
      onTap: widget.enabled ? widget.onTap : null,
      onLongPress: widget.enabled ? widget.onLongPress : null,
      // a long press is the touch equivalent of a right click, and a menu has
      // to know where it was opened from to point at the thing it acts on
      onLongPressStart: widget.enabled && widget.onLongPressAt != null
          ? (details) => widget.onLongPressAt!(details.globalPosition)
          : null,
      onSecondaryTapUp: widget.enabled && widget.onSecondaryTap != null
          ? (details) => widget.onSecondaryTap!(details.globalPosition)
          : null,
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      onTertiaryTapDown: (_) => _setPressed(false),
      onTertiaryTapUp: (_) {
        _setPressed(false);
        if (widget.enabled) widget.onTertiaryTap?.call();
      },
      onTertiaryTapCancel: () => _setPressed(false),
      child: widget.borderRadius == null
          ? content
          : ClipRRect(borderRadius: widget.borderRadius!, clipBehavior: Clip.antiAlias, child: content),
    );

    if (!_interactive) return gesture;

    return MouseRegion(
      cursor: widget.cursor,
      onEnter: (_) => widget.onHoverChanged?.call(true),
      onExit: (_) {
        _setPressed(false);
        widget.onHoverChanged?.call(false);
      },
      child: Listener(
        onPointerDown: (event) {
          if (event.buttons != kPrimaryMouseButton) {
            _setPressed(false);
          }
        },
        onPointerMove: (event) {
          if (event.buttons == 0 && _pressed) {
            _setPressed(false);
          }
        },
        onPointerUp: (_) => _setPressed(false),
        onPointerCancel: (_) => _setPressed(false),
        child: gesture,
      ),
    );
  }
}
