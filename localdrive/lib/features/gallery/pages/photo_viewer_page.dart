import 'dart:ui' show PointerDeviceKind;

import 'package:bitsdojo_window/bitsdojo_window.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/services.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';

import '../../../imports.dart';
import '../../files/models/node_model.dart';
import '../../files/providers/files_providers.dart';
import '../../files/widgets/shared/node_actions.dart';
import '../../offline/controller/offline_controller.dart';
import '../../share/widgets/share_sheet.dart';
import '../providers/gallery_providers.dart';

/// One picture, full screen, at full quality.
///
/// The grid shows thumbnails because forty full resolution decodes would take
/// a phone down. This screen is the opposite: one image, fetched at its real
/// size, because the entire reason for opening a photo is to look at it
/// properly.
///
/// Swiping sideways moves through the gallery in the order it was showing,
/// which makes it a gallery rather than a list of files that happen to
/// be pictures.
class PhotoViewerPage extends ConsumerStatefulWidget {
  const PhotoViewerPage({
    super.key,
    required this.nodeId,
    this.scopedNodes,
  });

  final String nodeId;
  final List<NodeModel>? scopedNodes;

  @override
  ConsumerState<PhotoViewerPage> createState() => _PhotoViewerPageState();
}

class _PhotoViewerPageState extends ConsumerState<PhotoViewerPage> {
  PageController? _controller;
  int _index = 0;
  String? _currentNodeId;

  @override
  void initState() {
    super.initState();
    _currentNodeId = widget.nodeId;
  }

  /// the chrome hides on a tap, so the picture can be looked at with nothing
  /// on top of it, and comes back on the next tap
  bool _chrome = true;

  void _precacheAdjacent(List<NodeModel> nodes, int index) {
    if (!mounted || nodes.isEmpty) return;
    final db = ref.read(filesDbProvider);

    // 1. Precache lightweight thumbnails for 5 next and 5 previous (fast, instant GPU upload)
    for (var i = 1; i <= 5; i++) {
      if (index + i < nodes.length) {
        final next = nodes[index + i];
        precacheImage(
          LdRemoteImage.provider(
            url: db.thumbnailUrl(next.id),
            headers: db.authHeaders,
          ),
          context,
        );
      }
      if (index - i >= 0) {
        final prev = nodes[index - i];
        precacheImage(
          LdRemoteImage.provider(
            url: db.thumbnailUrl(prev.id),
            headers: db.authHeaders,
          ),
          context,
        );
      }
    }

    // 2. Precache full image ONLY for immediate +1 and -1 (prevents network choke)
    if (index + 1 < nodes.length) {
      final next = nodes[index + 1];
      final local =
          ref.read(offlineLocalPathProvider(next.id)).valueOrNull ?? '';
      precacheImage(
        LdRemoteImage.provider(
          url: db.downloadUrl(next.id, inline: true),
          headers: db.authHeaders,
          localPath: local,
        ),
        context,
      );
    }
    if (index - 1 >= 0) {
      final prev = nodes[index - 1];
      final local =
          ref.read(offlineLocalPathProvider(prev.id)).valueOrNull ?? '';
      precacheImage(
        LdRemoteImage.provider(
          url: db.downloadUrl(prev.id, inline: true),
          headers: db.authHeaders,
          localPath: local,
        ),
        context,
      );
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final darkTheme = LdTheme.dark(Localizations.localeOf(context));
    final isMobile = context.deviceClass == DeviceClass.mobile ||
        defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS;

    final singleNode = ref.watch(nodeProvider(widget.nodeId)).valueOrNull;

    final List<NodeModel> sourceNodes;
    if (widget.scopedNodes != null && widget.scopedNodes!.isNotEmpty) {
      sourceNodes = widget.scopedNodes!;
    } else if (singleNode != null && singleNode.parentId.isNotEmpty) {
      final folderNodes = ref
          .watch(folderProvider(FolderQuery(parentId: singleNode.parentId)))
          .valueOrNull;
      final folderImages = folderNodes
          ?.where((n) => n.category == FileCategory.image)
          .toList();
      if (folderImages != null &&
          folderImages.isNotEmpty &&
          folderImages.any((n) => n.id == widget.nodeId)) {
        sourceNodes = folderImages;
      } else {
        sourceNodes =
            ref.watch(galleryProvider).valueOrNull ?? const <NodeModel>[];
      }
    } else {
      final gallery = ref.watch(galleryProvider);
      sourceNodes = gallery.valueOrNull ?? const <NodeModel>[];
    }

    final targetId = _currentNodeId ?? widget.nodeId;
    final List<NodeModel> effectiveNodes;
    if (sourceNodes.any((n) => n.id == targetId)) {
      effectiveNodes = sourceNodes;
    } else if (singleNode != null) {
      effectiveNodes = <NodeModel>[singleNode];
    } else {
      effectiveNodes = <NodeModel>[
        NodeModel(
          id: widget.nodeId,
          name: '',
          isFolder: false,
          category: FileCategory.image,
          libraryId: '',
        ),
      ];
    }

    if (effectiveNodes.isEmpty) {
      return Theme(
        data: darkTheme,
        child: const Scaffold(
          backgroundColor: Colors.black,
          body: Center(child: LdSpinner(size: 34)),
        ),
      );
    }

    final start = effectiveNodes.indexWhere((n) => n.id == targetId);
    final initial = start < 0 ? 0 : start;

    if (_controller == null) {
      _controller = PageController(initialPage: initial);
      _index = initial;
      _currentNodeId = effectiveNodes[initial].id;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _precacheAdjacent(effectiveNodes, initial);
      });
    } else if (_currentNodeId != null &&
        (_index >= effectiveNodes.length || effectiveNodes[_index].id != _currentNodeId)) {
      final newIdx = effectiveNodes.indexWhere((n) => n.id == _currentNodeId);
      if (newIdx >= 0 && newIdx != _index) {
        _index = newIdx;
        _controller?.jumpToPage(newIdx);
      }
    }

    final current = effectiveNodes[_index.clamp(0, effectiveNodes.length - 1)];
    final l10n = L10n.of(context);

    return Theme(
      data: darkTheme,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: CallbackShortcuts(
              bindings: <ShortcutActivator, VoidCallback>{
                const SingleActivator(LogicalKeyboardKey.arrowLeft): () {
                  if (_index > 0) {
                    _controller?.previousPage(
                      duration: const Duration(milliseconds: 320),
                      curve: Curves.easeOutCubic,
                    );
                  }
                },
                const SingleActivator(LogicalKeyboardKey.arrowRight): () {
                  if (_index < effectiveNodes.length - 1) {
                    _controller?.nextPage(
                      duration: const Duration(milliseconds: 320),
                      curve: Curves.easeOutCubic,
                    );
                  }
                },
                const SingleActivator(LogicalKeyboardKey.escape): () {
                  Navigator.of(context).maybePop();
                },
              },
              child: Focus(
                autofocus: true,
                child: Stack(
                  children: <Widget>[
                    _Pages(
                      nodes: effectiveNodes,
                      controller: _controller!,
                      currentIndex: _index,
                      isMobile: isMobile,
                      onPageChanged: (index) {
                        setState(() {
                          _index = index;
                          if (index >= 0 && index < effectiveNodes.length) {
                            _currentNodeId = effectiveNodes[index].id;
                          }
                        });
                        _precacheAdjacent(effectiveNodes, index);
                      },
                      onTap: () => setState(() => _chrome = !_chrome),
                    ),
                    if (!isMobile && _index > 0)
                      Positioned(
                        left: 16,
                        top: 0,
                        bottom: 0,
                        child: Center(
                          child: AnimatedOpacity(
                            duration: LdMotion.standard,
                            curve: LdMotion.curve,
                            opacity: _chrome ? 1 : 0,
                            child: IgnorePointer(
                              ignoring: !_chrome,
                              child: LdUtilityButton(
                                glyph: LdGlyph.chevronLeft,
                                tooltip: l10n.previewPreviousPage,
                                onPressed: () {
                                  _controller?.previousPage(
                                    duration: const Duration(milliseconds: 320),
                                    curve: Curves.easeOutCubic,
                                  );
                                },
                              ),
                            ),
                          ),
                        ),
                      ),
                    if (!isMobile && _index < effectiveNodes.length - 1)
                      Positioned(
                        right: 16,
                        top: 0,
                        bottom: 0,
                        child: Center(
                          child: AnimatedOpacity(
                            duration: LdMotion.standard,
                            curve: LdMotion.curve,
                            opacity: _chrome ? 1 : 0,
                            child: IgnorePointer(
                              ignoring: !_chrome,
                              child: LdUtilityButton(
                                glyph: LdGlyph.chevronRight,
                                tooltip: l10n.previewNextPage,
                                onPressed: () {
                                  _controller?.nextPage(
                                    duration: const Duration(milliseconds: 320),
                                    curve: Curves.easeOutCubic,
                                  );
                                },
                              ),
                            ),
                          ),
                        ),
                      ),
                    AnimatedOpacity(
                      duration: LdMotion.standard,
                      curve: LdMotion.curve,
                      opacity: _chrome ? 1 : 0,
                      child: IgnorePointer(
                        ignoring: !_chrome,
                        child: _Chrome(
                          node: current,
                          position: _index + 1,
                          total: effectiveNodes.length,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
  }
}

class _Pages extends ConsumerStatefulWidget {
  const _Pages({
    required this.nodes,
    required this.controller,
    required this.currentIndex,
    required this.isMobile,
    required this.onPageChanged,
    required this.onTap,
  });

  final List<NodeModel> nodes;
  final PageController controller;
  final int currentIndex;
  final bool isMobile;
  final ValueChanged<int> onPageChanged;
  final VoidCallback onTap;

  @override
  ConsumerState<_Pages> createState() => _PagesState();
}

class _PagesState extends ConsumerState<_Pages> {
  final Map<int, PhotoViewController> _controllers = <int, PhotoViewController>{};

  PhotoViewController _controllerFor(int index) {
    return _controllers.putIfAbsent(index, () => PhotoViewController());
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final db = ref.watch(filesDbProvider);

    final gallery = ScrollConfiguration(
      behavior: ScrollConfiguration.of(context).copyWith(
        dragDevices: <PointerDeviceKind>{
          PointerDeviceKind.touch,
          PointerDeviceKind.mouse,
          PointerDeviceKind.trackpad,
          PointerDeviceKind.stylus,
        },
      ),
      child: PhotoViewGallery.builder(
        itemCount: widget.nodes.length,
        pageController: widget.controller,
        onPageChanged: widget.onPageChanged,
        scrollPhysics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        backgroundDecoration: const BoxDecoration(
          color: Colors.black,
        ),
        loadingBuilder: (context, event) {
          final node = widget.nodes[widget.currentIndex.clamp(0, widget.nodes.length - 1)];
          return Stack(
            fit: StackFit.expand,
            children: [
              Image(
                image: LdRemoteImage.provider(
                  url: db.thumbnailUrl(node.id),
                  headers: db.authHeaders,
                ),
                fit: BoxFit.contain,
              ),
              const Center(child: LdSpinner(size: 28)),
            ],
          );
        },
        builder: (context, index) {
          final node = widget.nodes[index];
          final local =
              ref.watch(offlineLocalPathProvider(node.id)).valueOrNull ?? '';

          return PhotoViewGalleryPageOptions(
            imageProvider: LdRemoteImage.provider(
              url: db.downloadUrl(node.id, inline: true),
              headers: db.authHeaders,
              localPath: local,
            ),
            filterQuality: FilterQuality.high,
            initialScale: PhotoViewComputedScale.contained,
            minScale: PhotoViewComputedScale.contained,
            maxScale: PhotoViewComputedScale.covered * 5,
            controller: widget.isMobile ? null : _controllerFor(index),
            onTapUp: (context, details, value) => widget.onTap(),
            errorBuilder: (context, error, stack) => LdErrorState(
              kind: LdErrorKind.unexpected,
              title: L10n.of(context).errorUnexpectedTitle,
              message: L10n.of(context).errorUnexpectedBody,
            ),
          );
        },
      ),
    );

    if (widget.isMobile) {
      return gallery;
    }

    final activeController = _controllerFor(widget.currentIndex);
    return ZoomOnScroll(
      controller: activeController,
      child: gallery,
    );
  }
}

/// The bar above and the bar below, both of which get out of the way on a tap.
class _Chrome extends ConsumerWidget {
  const _Chrome({
    required this.node,
    required this.position,
    required this.total,
  });

  final NodeModel node;
  final int position;
  final int total;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final offline = ref.watch(isOfflineProvider(node.id));

    return Column(
      children: <Widget>[
        // a gradient rather than a solid bar, so the picture is never cut off
        // by a rectangle of chrome across the top of it
        _Scrim(
          fromTop: true,
          child: Stack(
            children: <Widget>[
              if (LdWindowBar.isVisible)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 140,
                  height: 36,
                  child: MoveWindow(),
                ),
              SafeArea(
                bottom: false,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    8,
                    6,
                    LdWindowBar.isVisible ? 146 : 8,
                    6,
                  ),
                  child: Row(
                    children: <Widget>[
                      LdUtilityButton(
                        glyph: LdGlyph.chevronLeft,
                        tooltip: l10n.actionBack,
                        onPressed: () => Navigator.of(context).maybePop(),
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
                              l10n.galleryPositionOf(
                                LdFormat.count(context, position),
                                LdFormat.count(context, total),
                              ),
                              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                    color: Colors.white,
                                  ),
                            ),
                          ],
                        ),
                      ),
                      Builder(
                        builder: (context) => LdUtilityButton(
                          glyph: LdGlyph.more,
                          tooltip: l10n.moreActions,
                          onPressed: () => showNodeActions(
                            context,
                            ref,
                            node,
                            anchorOf(context),
                            alreadyOpen: true,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (LdWindowBar.isVisible)
                const Positioned(
                  top: 0,
                  right: 0,
                  child: LdWindowButtons(isDark: true),
                ),
            ],
          ),
        ),
        const Spacer(),
        _Scrim(
          fromTop: false,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  // when it was taken, which is the one fact anyone actually
                  // wants while looking at a photo
                  Text(
                    node.capturedAt > 0
                        ? LdFormat.dateTime(context, node.capturedAt)
                        : LdFormat.bytes(context, node.sizeBytes),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Colors.white,
                        ),
                  ),
                  const SizedBox(height: 12),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      return ScrollConfiguration(
                        behavior: ScrollConfiguration.of(context).copyWith(
                          dragDevices: <PointerDeviceKind>{
                            PointerDeviceKind.touch,
                            PointerDeviceKind.mouse,
                            PointerDeviceKind.trackpad,
                            PointerDeviceKind.stylus,
                          },
                        ),
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          physics: const BouncingScrollPhysics(),
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              minWidth: constraints.maxWidth,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                              children: <Widget>[
                                _Action(
                                  glyph: LdGlyph.shared,
                                  label: l10n.actionShare,
                                  onTap: () => showShareSheet(context, ref, node),
                                ),
                                _Action(
                                  glyph: LdGlyph.download,
                                  label: l10n.download,
                                  onTap: () =>
                                      downloadNodes(context, ref, <NodeModel>[node]),
                                ),
                                if (OfflineController.isSupported)
                                  _Action(
                                    glyph: LdGlyph.offlineReady,
                                    label: offline
                                        ? l10n.offlineRemoveDownload
                                        : l10n.offlineMakeAvailable,
                                    active: offline,
                                    onTap: () async {
                                      final controller = ref.read(
                                        offlineControllerProvider.notifier,
                                      );
                                      if (offline) {
                                        await controller.unmark(node);
                                      } else {
                                        await controller.mark(node);
                                      }
                                    },
                                  ),
                                _Action(
                                  glyph: node.starred
                                      ? LdGlyph.starFilled
                                      : LdGlyph.star,
                                  label: l10n.starred,
                                  active: node.starred,
                                  onTap: () => toggleStar(context, ref, node),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// A gradient behind the chrome, so white text stays readable over a white
/// photo without putting a solid bar across the picture.
class _Scrim extends StatelessWidget {
  const _Scrim({required this.fromTop, required this.child});

  final bool fromTop;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: fromTop ? Alignment.topCenter : Alignment.bottomCenter,
          end: fromTop ? Alignment.bottomCenter : Alignment.topCenter,
          colors: <Color>[
            Colors.black.withValues(alpha: 0.85),
            Colors.transparent,
          ],
        ),
      ),
      child: child,
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({
    required this.glyph,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final LdGlyph glyph;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final color = active ? LdColors.accentPrimary : Colors.white;

    return LdTappable(
      onTap: onTap,
      borderRadius: LdRadii.tileRadius,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            LdIcon(glyph, size: 21, color: color),
            const SizedBox(height: 6),
            Text(
              label,
              maxLines: 1,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: active
                        ? LdColors.accentPrimary
                        : Colors.white,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
