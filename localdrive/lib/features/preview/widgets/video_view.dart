import 'dart:async';

import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../../../core/services/fullscreen_service.dart';
import '../../../imports.dart';
import '../../files/models/node_model.dart';
import '../../files/widgets/shared/node_actions.dart';
import 'media_bits.dart';

/// The video player.
///
/// Built on libmpv rather than the platform's own decoder. video_player has no
/// Windows implementation at all, and the community one hands the URL to Media
/// Foundation, which pulled the whole file down before showing a frame: a clip
/// on a server running on the same machine took seconds to start. libmpv opens
/// a network stream, starts on the first keyframe, and seeks by asking for the
/// byte range it needs, which is what the server has always served.
///
/// The chrome is the app's own. A player that arrives with someone else's
/// buttons is the most obvious seam a person can find.
class VideoView extends StatefulWidget {
  const VideoView({
    super.key,
    this.url = '',
    this.localPath = '',
    this.headers = const <String, String>{},
    this.node,
    this.onBack,
  });

  final String url;
  final String localPath;
  final Map<String, String> headers;
  final NodeModel? node;
  final VoidCallback? onBack;

  @override
  State<VideoView> createState() => _VideoViewState();
}

class _VideoViewState extends State<VideoView> {
  late final Player _player;
  late final VideoController _controller;

  bool _fullscreen = false;
  Object? _error;
  StreamSubscription<String>? _errors;
  StreamSubscription<bool>? _fullscreenSub;

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    _errors = _player.stream.error.listen((message) {
      if (mounted) setState(() => _error = message);
    });

    FullscreenService.instance.init();
    _fullscreen = FullscreenService.instance.isFullscreen;
    _fullscreenSub =
        FullscreenService.instance.onFullscreenChange.listen((isFs) {
      if (mounted) setState(() => _fullscreen = isFs);
    });

    final source = widget.localPath.isNotEmpty
        ? Media(widget.localPath)
        // the token rides in the query string already, so no headers are
        // needed; passing them anyway keeps a signed url working if that
        // ever changes
        : Media(widget.url, httpHeaders: widget.headers);
    unawaited(_player.open(source));
  }

  @override
  void dispose() {
    unawaited(_fullscreenSub?.cancel());
    unawaited(_errors?.cancel());
    unawaited(_player.dispose());
    super.dispose();
  }

  void _toggleFullscreen() {
    unawaited(FullscreenService.instance.toggleFullscreen());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    if (_error != null) {
      return LdErrorState(
        kind: LdErrorKind.unexpected,
        title: l10n.errorUnexpectedTitle,
        message: l10n.errorUnexpectedBody,
      );
    }

    final darkTheme = LdTheme.dark(Localizations.localeOf(context));

    return Theme(
      data: darkTheme,
      child: _Chrome(
        player: _player,
        controller: _controller,
        isFullscreen: _fullscreen,
        onToggleFullscreen: _toggleFullscreen,
        node: widget.node,
        onBack: widget.onBack,
      ),
    );
  }
}

/// Transparent circular button for media player controls with smooth hover.
class _MediaButton extends StatelessWidget {
  const _MediaButton({
    required this.glyph,
    required this.tooltip,
    required this.onPressed,
  });

  final LdGlyph glyph;
  final String tooltip;
  final VoidCallback? onPressed;

  static const double _size = 38;
  static const double _iconSize = 20;

  @override
  Widget build(BuildContext context) {
    Widget button = LdHoverable(
      enabled: onPressed != null,
      builder: (context, hovered) => LdTappable(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(_size / 2),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: _size,
          height: _size,
          decoration: BoxDecoration(
            color: hovered
                ? Colors.white.withValues(alpha: 0.20)
                : Colors.transparent,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: LdIcon(
              glyph,
              size: _iconSize,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );

    if (tooltip.isNotEmpty) {
      button = Tooltip(
        message: tooltip,
        waitDuration: const Duration(milliseconds: 400),
        child: button,
      );
    }

    return button;
  }
}

/// The picture with the app's controls over it.
class _Chrome extends ConsumerStatefulWidget {
  const _Chrome({
    required this.player,
    required this.controller,
    required this.isFullscreen,
    required this.onToggleFullscreen,
    this.node,
    this.onBack,
  });

  final Player player;
  final VideoController controller;
  final bool isFullscreen;
  final VoidCallback onToggleFullscreen;
  final NodeModel? node;
  final VoidCallback? onBack;

  @override
  ConsumerState<_Chrome> createState() => _ChromeState();
}

class _ChromeState extends ConsumerState<_Chrome> {
  bool _visible = true;
  bool _scrubbing = false;
  bool _loop = false;
  bool _menuOpen = false;
  Timer? _idle;
  StreamSubscription<bool>? _completedSub;
  StreamSubscription<bool>? _playingSub;
  Offset? _lastPointerPos;
  double? _aspectRatio;
  StreamSubscription<int?>? _widthSub;
  StreamSubscription<int?>? _heightSub;

  void _syncAspectRatio() {
    final w = widget.player.state.width;
    final h = widget.player.state.height;
    if (w != null && h != null && w > 0 && h > 0) {
      final r = w / h;
      if (_aspectRatio != r) {
        if (mounted) setState(() => _aspectRatio = r);
      }
    } else if (widget.node != null &&
        widget.node!.imageWidth > 0 &&
        widget.node!.imageHeight > 0) {
      final r = widget.node!.imageWidth / widget.node!.imageHeight;
      if (_aspectRatio != r) {
        if (mounted) setState(() => _aspectRatio = r);
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _wake();
    _syncAspectRatio();
    _widthSub = widget.player.stream.width.listen((_) => _syncAspectRatio());
    _heightSub = widget.player.stream.height.listen((_) => _syncAspectRatio());
    _completedSub = widget.player.stream.completed.listen((completed) {
      if (completed) {
        if (_loop) {
          unawaited(widget.player.seek(Duration.zero));
          unawaited(widget.player.play());
        } else {
          // When completed, keep controls visible so user can replay or see info
          if (mounted) _wake();
        }
      }
    });
    _playingSub = widget.player.stream.playing.listen((_) {
      if (mounted) _wake();
    });
  }

  @override
  void didUpdateWidget(_Chrome oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isFullscreen != widget.isFullscreen) {
      _lastPointerPos = null;
      _wake();
    }
    _syncAspectRatio();
  }

  @override
  void dispose() {
    _idle?.cancel();
    unawaited(_widthSub?.cancel());
    unawaited(_heightSub?.cancel());
    unawaited(_completedSub?.cancel());
    unawaited(_playingSub?.cancel());
    super.dispose();
  }

  void _wake() {
    _idle?.cancel();
    if (!mounted) return;
    if (!_visible) {
      setState(() => _visible = true);
    }
    // Never auto-hide while a menu is open or while scrubbing
    if (_menuOpen || _scrubbing) return;

    // Never auto-hide when the video is paused or completed
    final isPlaying = widget.player.state.playing;
    final isCompleted = widget.player.state.completed;
    if (!isPlaying || isCompleted) return;

    // On mobile / tablet: do not auto-hide the controls after waiting
    if (!context.deviceClass.isDesktop) return;

    // Auto-hide when mouse is idle for 1 second on desktop
    final idleTimeout = const Duration(milliseconds: 1000);
    _idle = Timer(idleTimeout, () {
      if (!mounted || _scrubbing || _menuOpen) return;
      if (!widget.player.state.playing || widget.player.state.completed) return;
      setState(() => _visible = false);
    });
  }

  void _togglePlay() {
    final state = widget.player.state;
    if (state.playing) {
      unawaited(widget.player.pause());
    } else {
      // pressing play at the very end replays rather than sitting there
      if (state.duration > Duration.zero &&
          state.position >=
              state.duration - const Duration(milliseconds: 200)) {
        unawaited(widget.player.seek(Duration.zero));
      }
      unawaited(widget.player.play());
    }
    _wake();
  }

  Future<void> _openMenu(BuildContext context, Offset anchor) async {
    _idle?.cancel();
    setState(() {
      _menuOpen = true;
      _visible = true;
    });

    try {
      final l10n = L10n.of(context);
      final loopAction = LdMenuAction(
        id: 'loop',
        label: l10n.actionLoop,
        glyph: LdGlyph.refresh,
        trailing: _loop
            ? const LdIcon(
                LdGlyph.check,
                size: 18,
                color: LdColors.accentPrimary,
              )
            : null,
      );

      if (widget.node != null) {
        await showNodeActions(
          context,
          ref,
          widget.node!,
          anchor,
          alreadyOpen: true,
          extraActions: <LdMenuAction>[loopAction],
          onExtraAction: (id) {
            if (id == 'loop') {
              setState(() => _loop = !_loop);
              unawaited(
                widget.player.setPlaylistMode(
                  _loop ? PlaylistMode.loop : PlaylistMode.none,
                ),
              );
              return true;
            }
            return false;
          },
        );
      } else {
        final choice = await LdContextMenu.show(
          context,
          title: l10n.appName,
          actions: <LdMenuAction>[loopAction],
          anchor: anchor,
        );
        if (choice == 'loop' && mounted) {
          setState(() => _loop = !_loop);
          unawaited(
            widget.player.setPlaylistMode(
              _loop ? PlaylistMode.loop : PlaylistMode.none,
            ),
          );
        }
      }
    } finally {
      if (mounted) {
        setState(() => _menuOpen = false);
        _wake();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      autofocus: true,
      onKeyEvent: (node, event) {
        if (event is KeyDownEvent) {
          if (event.logicalKey == LogicalKeyboardKey.keyF ||
              event.logicalKey == LogicalKeyboardKey.f11) {
            widget.onToggleFullscreen();
            return KeyEventResult.handled;
          }
          if (event.logicalKey == LogicalKeyboardKey.space) {
            _togglePlay();
            return KeyEventResult.handled;
          }
        }
        return KeyEventResult.ignored;
      },
      child: MouseRegion(
        cursor: (_visible ||
                !widget.player.state.playing ||
                widget.player.state.completed)
            ? MouseCursor.defer
            : SystemMouseCursors.none,
        onHover: (event) {
          if (_lastPointerPos != null &&
              (_lastPointerPos! - event.position).distanceSquared < 4.0) {
            return;
          }
          _lastPointerPos = event.position;
          _wake();
        },
        onExit: (_) {
          _lastPointerPos = null;
          if (context.deviceClass.isDesktop &&
              !_scrubbing &&
              !_menuOpen &&
              widget.player.state.playing &&
              !widget.player.state.completed) {
            _idle?.cancel();
            _idle = Timer(const Duration(milliseconds: 600), () {
              if (mounted &&
                  context.deviceClass.isDesktop &&
                  !_scrubbing &&
                  !_menuOpen &&
                  widget.player.state.playing &&
                  !widget.player.state.completed) {
                setState(() => _visible = false);
              }
            });
          }
        },
        child: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            ColoredBox(
              color: Colors.black,
              child: Center(
                child: Video(
                  controller: widget.controller,
                  controls: NoVideoControls,
                  fill: Colors.black,
                  fit: BoxFit.contain,
                  aspectRatio: _aspectRatio ?? (16 / 9),
                ),
              ),
            ),
            // tap anywhere on picture: toggle controls on mobile, toggle play on desktop
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (!context.deviceClass.isDesktop) {
                    setState(() => _visible = !_visible);
                  } else {
                    _togglePlay();
                  }
                },
                onDoubleTap: widget.onToggleFullscreen,
                onSecondaryTapUp: (details) =>
                    _openMenu(context, details.globalPosition),
                child: const SizedBox.expand(),
              ),
            ),
          if (widget.node != null)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: AnimatedOpacity(
                opacity: _visible ? 1 : 0,
                duration: LdMotion.standard,
                curve: LdMotion.curve,
                child: IgnorePointer(
                  ignoring: !_visible,
                  child: _TopScrim(
                    node: widget.node!,
                    onBack: widget.onBack ??
                        () => Navigator.of(context).maybePop(),
                    onMore: (ctx, anchor) => _openMenu(ctx, anchor),
                  ),
                ),
              ),
            ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: AnimatedOpacity(
              opacity: _visible ? 1 : 0,
              duration: LdMotion.standard,
              curve: LdMotion.curve,
              child: IgnorePointer(
                ignoring: !_visible,
                child: _Bar(
                  player: widget.player,
                  isFullscreen: widget.isFullscreen,
                  onToggleFullscreen: widget.onToggleFullscreen,
                  onTogglePlay: _togglePlay,
                  onScrubStart: () => _scrubbing = true,
                  onScrubEnd: () {
                    _scrubbing = false;
                    _wake();
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
}

class _TopScrim extends ConsumerWidget {
  const _TopScrim({
    required this.node,
    required this.onBack,
    required this.onMore,
  });

  final NodeModel node;
  final VoidCallback onBack;
  final void Function(BuildContext context, Offset anchor) onMore;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[
            Colors.black.withValues(alpha: 0.85),
            Colors.transparent,
          ],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: <Widget>[
              _MediaButton(
                glyph: LdGlyph.chevronLeft,
                tooltip: l10n.actionBack,
                onPressed: onBack,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text(
                      node.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    Text(
                      LdFormat.bytes(context, node.sizeBytes),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: Colors.white70,
                          ),
                    ),
                  ],
                ),
              ),
              _MediaButton(
                glyph: LdGlyph.download,
                tooltip: l10n.download,
                onPressed: () =>
                    downloadNodes(context, ref, <NodeModel>[node]),
              ),
              const SizedBox(width: 4),
              Builder(
                builder: (context) => _MediaButton(
                  glyph: LdGlyph.more,
                  tooltip: l10n.moreActions,
                  onPressed: () => onMore(context, anchorOf(context)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Bar extends StatefulWidget {
  const _Bar({
    required this.player,
    required this.isFullscreen,
    required this.onToggleFullscreen,
    required this.onTogglePlay,
    required this.onScrubStart,
    required this.onScrubEnd,
  });

  final Player player;
  final bool isFullscreen;
  final VoidCallback onToggleFullscreen;
  final VoidCallback onTogglePlay;
  final VoidCallback onScrubStart;
  final VoidCallback onScrubEnd;

  @override
  State<_Bar> createState() => _BarState();
}

class _BarState extends State<_Bar>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  late Duration _position;
  late final Ticker _ticker;
  int _lastSyncPosMs = 0;
  int _lastSyncTimeMs = 0;
  bool _isPlaying = false;
  bool _isBackgrounded = false;
  bool _isScrubbing = false;
  StreamSubscription<Duration>? _sub;
  StreamSubscription<bool>? _playingSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _position = widget.player.state.position;
    _isPlaying = widget.player.state.playing;
    _lastSyncPosMs = _position.inMilliseconds;
    _lastSyncTimeMs = DateTime.now().millisecondsSinceEpoch;

    _sub = widget.player.stream.position.listen((pos) {
      if (_isBackgrounded || _isScrubbing) return;
      _lastSyncPosMs = pos.inMilliseconds;
      _lastSyncTimeMs = DateTime.now().millisecondsSinceEpoch;
      if (!_isPlaying || widget.player.state.duration == Duration.zero) {
        if (mounted) setState(() => _position = pos);
      }
    });

    _playingSub = widget.player.stream.playing.listen((playing) {
      if (!mounted) return;
      _isPlaying = playing;
      _lastSyncPosMs = widget.player.state.position.inMilliseconds;
      _lastSyncTimeMs = DateTime.now().millisecondsSinceEpoch;
      if (playing && !_isScrubbing && !_isBackgrounded) {
        if (!_ticker.isActive) _ticker.start();
      } else {
        if (_ticker.isActive) _ticker.stop();
        setState(() => _position = widget.player.state.position);
      }
    });

    // 60 FPS smooth interpolation matching YouTube's exact progress bar behavior
    _ticker = createTicker((_) {
      if (!_isPlaying || _isBackgrounded || _isScrubbing) return;
      final total = widget.player.state.duration;
      final totalMs = total.inMilliseconds;
      if (totalMs <= 0) return;

      if (widget.player.state.buffering) return;

      final now = DateTime.now().millisecondsSinceEpoch;
      final rate = widget.player.state.rate;
      final elapsedMs = (now - _lastSyncTimeMs) * rate;
      final currentMs = (_lastSyncPosMs + elapsedMs).round().clamp(0, totalMs);

      if (mounted) {
        setState(() {
          _position = Duration(milliseconds: currentMs);
        });
      }

      if (currentMs >= totalMs && _ticker.isActive) {
        _ticker.stop();
      }
    });

    if (_isPlaying && !_isBackgrounded) {
      _ticker.start();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _isBackgrounded = true;
      if (_ticker.isActive) _ticker.stop();
    } else if (state == AppLifecycleState.resumed) {
      _isBackgrounded = false;
      _lastSyncPosMs = widget.player.state.position.inMilliseconds;
      _lastSyncTimeMs = DateTime.now().millisecondsSinceEpoch;
      if (mounted) {
        setState(() => _position = widget.player.state.position);
      }
      if (_isPlaying && !_isScrubbing && !_ticker.isActive) {
        _ticker.start();
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    if (_ticker.isActive) _ticker.stop();
    _ticker.dispose();
    unawaited(_sub?.cancel());
    unawaited(_playingSub?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final total = widget.player.state.duration;
    var position = _position;
    if (position > total) position = total;
    final left = total - position;

    return DecoratedBox(
      // a wash rather than a solid bar, so the bottom of the picture is
      // never cut off by a rectangle of chrome
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: <Color>[
            Colors.black.withValues(alpha: 0.90),
            Colors.transparent,
          ],
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 28, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
            MediaScrubber(
              position: position,
              total: total,
              buffer: widget.player.state.buffer,
              backgroundColor: Colors.white.withValues(alpha: 0.25),
              bufferColor: Colors.white.withValues(alpha: 0.45),
              onStart: () {
                _isScrubbing = true;
                if (_ticker.isActive) _ticker.stop();
                widget.onScrubStart();
              },
              onScrubUpdate: (to) {
                _lastSyncPosMs = to.inMilliseconds;
                _lastSyncTimeMs = DateTime.now().millisecondsSinceEpoch;
                if (mounted) setState(() => _position = to);
              },
              onSeek: (to) {
                _lastSyncPosMs = to.inMilliseconds;
                _lastSyncTimeMs = DateTime.now().millisecondsSinceEpoch;
                if (mounted) setState(() => _position = to);
                unawaited(widget.player.seek(to));
              },
              onEnd: () {
                _isScrubbing = false;
                _lastSyncPosMs = _position.inMilliseconds;
                _lastSyncTimeMs = DateTime.now().millisecondsSinceEpoch;
                if (_isPlaying && !_isBackgrounded && !_ticker.isActive) {
                  _ticker.start();
                }
                widget.onScrubEnd();
              },
            ),
            const SizedBox(height: 10),
            Row(
              children: <Widget>[
                StreamBuilder<bool>(
                  stream: widget.player.stream.playing,
                  builder: (context, snapshot) {
                    final playing =
                        snapshot.data ?? widget.player.state.playing;
                    return _MediaButton(
                      glyph: playing ? LdGlyph.pause : LdGlyph.play,
                      tooltip: playing
                          ? l10n.actionPause
                          : l10n.actionPlay,
                      onPressed: widget.onTogglePlay,
                    );
                  },
                ),
                const SizedBox(width: 14),
                // elapsed and total, 100% white as requested
                Text(
                  mediaClock(position),
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                ),
                Text(
                  '  /  ${mediaClock(total)}',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w500,
                      ),
                ),
                const Spacer(),
                Text(
                  '-${mediaClock(left)}',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                ),
                if (context.deviceClass.isDesktop) ...<Widget>[
                  const SizedBox(width: 16),
                  StreamBuilder<double>(
                    stream: widget.player.stream.volume,
                    builder: (context, snapshot) => VolumeControl(
                      volume: snapshot.data ?? widget.player.state.volume,
                      transparent: true,
                      onChanged: (v) =>
                          unawaited(widget.player.setVolume(v)),
                    ),
                  ),
                ],
                const SizedBox(width: 12),
                _MediaButton(
                  glyph: widget.isFullscreen
                      ? LdGlyph.fullscreenExit
                      : LdGlyph.fullscreen,
                  tooltip: widget.isFullscreen
                      ? l10n.actionExitFullscreen
                      : l10n.actionFullscreen,
                  onPressed: widget.onToggleFullscreen,
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
}
