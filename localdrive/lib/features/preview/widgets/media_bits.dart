import '../../../imports.dart';

/// The seek bar: a thin track, what has buffered behind it, and a handle.
///
/// Shared by the video player and the audio player, because a person who has
/// learned to scrub one has learned to scrub the other, and two scrubbers that
/// behave differently in the same app is a small betrayal.
class MediaScrubber extends StatefulWidget {
  const MediaScrubber({
    super.key,
    required this.position,
    required this.total,
    required this.buffer,
    required this.onStart,
    required this.onSeek,
    required this.onEnd,
    this.onScrubUpdate,
    this.backgroundColor,
    this.bufferColor,
  });

  final Duration position;
  final Duration total;
  final Duration buffer;
  final VoidCallback onStart;
  final ValueChanged<Duration> onSeek;
  final VoidCallback onEnd;
  final ValueChanged<Duration>? onScrubUpdate;
  final Color? backgroundColor;
  final Color? bufferColor;

  @override
  State<MediaScrubber> createState() => _MediaScrubberState();
}

class _MediaScrubberState extends State<MediaScrubber> {
  double? _dragging;
  double? _hoverFraction;
  bool _hovered = false;

  bool get _isActive => _hovered || _dragging != null;

  double get _fraction {
    if (_dragging != null) return _dragging!;
    final total = widget.total.inMilliseconds;
    if (total <= 0) return 0;
    return (widget.position.inMilliseconds / total).clamp(0.0, 1.0);
  }

  void _to(double fraction, {required bool commit}) {
    final clamped = fraction.clamp(0.0, 1.0);
    setState(() => _dragging = clamped);
    final target = Duration(
      milliseconds: (widget.total.inMilliseconds * clamped).round(),
    );
    if (!commit) {
      widget.onScrubUpdate?.call(target);
      return;
    }
    widget.onSeek(target);
    setState(() => _dragging = null);
    widget.onEnd();
  }

  @override
  Widget build(BuildContext context) {
    final bg = widget.backgroundColor ??
        (Theme.of(context).brightness == Brightness.dark
            ? Colors.white.withValues(alpha: 0.25)
            : context.surfaces.backgroundElevated);
    final buf = widget.bufferColor ??
        (Theme.of(context).brightness == Brightness.dark
            ? Colors.white.withValues(alpha: 0.45)
            : context.surfaces.strokeOutline);

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        double at(Offset local) => width <= 0 ? 0 : local.dx / width;

        final trackHeight = _isActive ? 6.0 : 3.5;

        return MouseRegion(
          cursor: SystemMouseCursors.click,
          onEnter: (_) => setState(() => _hovered = true),
          onHover: (d) {
            final f = at(d.localPosition).clamp(0.0, 1.0);
            if (_hoverFraction != f) {
              setState(() => _hoverFraction = f);
            }
          },
          onExit: (_) => setState(() {
            _hovered = false;
            _hoverFraction = null;
          }),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: (d) {
              widget.onStart();
              _to(at(d.localPosition), commit: false);
            },
            onHorizontalDragUpdate: (d) =>
                _to(at(d.localPosition), commit: false),
            onHorizontalDragEnd: (_) => _to(_fraction, commit: true),
            onHorizontalDragCancel: () => setState(() => _dragging = null),
            // a tap on the track jumps there, which is how a scrubber gets used
            // far more often than it gets dragged
            onTapDown: (d) {
              widget.onStart();
              _to(at(d.localPosition), commit: true);
            },
            child: SizedBox(
              height: 24,
              child: Center(
                child: Stack(
                  alignment: Alignment.centerLeft,
                  children: <Widget>[
                    _track(bg, trackHeight),
                    if (widget.total.inMilliseconds > 0)
                      FractionallySizedBox(
                        widthFactor: (widget.buffer.inMilliseconds /
                                widget.total.inMilliseconds)
                            .clamp(0.0, 1.0),
                        child: _track(buf, trackHeight),
                      ),
                    if (_hoverFraction != null && _hoverFraction! > 0)
                      FractionallySizedBox(
                        widthFactor: _hoverFraction!,
                        child: _track(
                          Colors.white.withValues(alpha: 0.22),
                          trackHeight,
                        ),
                      ),
                    FractionallySizedBox(
                      widthFactor: _fraction,
                      child: _track(LdColors.accentPrimary, trackHeight),
                    ),
                    Align(
                      alignment: Alignment(_fraction * 2 - 1, 0),
                      child: AnimatedScale(
                        scale: _isActive ? 1.0 : 0.0,
                        duration: const Duration(milliseconds: 140),
                        curve: Curves.easeOutCubic,
                        child: Container(
                          width: 14,
                          height: 14,
                          decoration: const BoxDecoration(
                            color: LdColors.accentPrimary,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _track(Color color, double height) => AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOutCubic,
        height: height,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(height / 2),
        ),
      );
}

/// Volume, as a speaker that mutes on click and a short slider beside it.
///
/// Only on a pointer platform. A phone has hardware buttons for this and the
/// space is better spent on the picture; putting a 90 point slider in a phone
/// player is how a control bar stops fitting.
class VolumeControl extends StatefulWidget {
  const VolumeControl({
    super.key,
    required this.volume,
    required this.onChanged,
    this.transparent = false,
  });

  /// 0 to 100, which is what libmpv works in
  final double volume;
  final ValueChanged<double> onChanged;
  final bool transparent;

  @override
  State<VolumeControl> createState() => _VolumeControlState();
}

class _VolumeControlState extends State<VolumeControl> {
  /// what to go back to when the speaker is clicked again, so muting is not a
  /// one way trip that loses the level someone had set
  double _restore = 100;

  void _toggleMute() {
    if (widget.volume > 0) {
      _restore = widget.volume;
      widget.onChanged(0);
      return;
    }
    widget.onChanged(_restore <= 0 ? 100 : _restore);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final muted = widget.volume <= 0;
    final trackColor = widget.transparent
        ? Colors.white.withValues(alpha: 0.25)
        : context.surfaces.backgroundElevated;
    final fillColor = widget.transparent
        ? Colors.white
        : context.surfaces.foregroundPrimary;

    final muteButton = widget.transparent
        ? Tooltip(
            message: muted ? l10n.actionUnmute : l10n.actionMute,
            waitDuration: const Duration(milliseconds: 400),
            child: LdHoverable(
              builder: (context, hovered) => LdTappable(
                onTap: _toggleMute,
                borderRadius: BorderRadius.circular(19),
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: hovered
                        ? Colors.white.withValues(alpha: 0.20)
                        : Colors.transparent,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: LdIcon(
                      muted ? LdGlyph.volumeOff : LdGlyph.volume,
                      size: 20,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),
          )
        : LdUtilityButton(
            glyph: muted ? LdGlyph.volumeOff : LdGlyph.volume,
            tooltip: muted ? l10n.actionUnmute : l10n.actionMute,
            onPressed: _toggleMute,
          );

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        muteButton,
        const SizedBox(width: 6),
        SizedBox(
          width: 90,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final width = constraints.maxWidth;
              void set(Offset local) {
                if (width <= 0) return;
                widget.onChanged((local.dx / width).clamp(0.0, 1.0) * 100);
              }

              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (d) => set(d.localPosition),
                onHorizontalDragStart: (d) => set(d.localPosition),
                onHorizontalDragUpdate: (d) => set(d.localPosition),
                child: SizedBox(
                  height: 22,
                  child: Center(
                    child: Stack(
                      alignment: Alignment.centerLeft,
                      children: <Widget>[
                        Container(
                          height: 4,
                          decoration: BoxDecoration(
                            color: trackColor,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        FractionallySizedBox(
                          widthFactor: (widget.volume / 100).clamp(0.0, 1.0),
                          child: Container(
                            height: 4,
                            decoration: BoxDecoration(
                              color: fillColor,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                        Align(
                          alignment: Alignment(
                            (widget.volume / 100).clamp(0.0, 1.0) * 2 - 1,
                            0,
                          ),
                          child: Container(
                            width: 11,
                            height: 11,
                            decoration: BoxDecoration(
                              color: fillColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Hours only when there are hours, so a two minute clip does not read 0:02:14.
String mediaClock(Duration d) {
  final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  if (d.inHours <= 0) return '$minutes:$seconds';
  return '${d.inHours}:$minutes:$seconds';
}
