import '../../../../imports.dart';
import '../../../files/models/node_model.dart';
import '../../../files/widgets/shared/node_actions.dart';
import '../../../share/widgets/share_sheet.dart';
import '../../providers/videos_providers.dart';
import '../../widgets/videos_grid.dart';
import '../../widgets/videos_sort_sheet.dart';

/// The videos browser on desktop.
class VideosPageDesktop extends HookConsumerWidget {
  const VideosPageDesktop({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);

    useEffect(() {
      ref.invalidate(videosProvider);
      return null;
    }, const []);

    final videos = ref.watch(videosProvider);
    final effectiveVideos =
        (videos.isLoading && !videos.hasValue && videosMemoryCache != null)
        ? AsyncData<List<NodeModel>>(videosMemoryCache!)
        : videos;
    final sort = ref.watch(videosSortProvider);

    final columns = useState(4);
    final selection = useState(<String>{});

    void toggle(NodeModel node) {
      final next = <String>{...selection.value};
      if (!next.remove(node.id)) next.add(node.id);
      selection.value = next;
    }

    final selected = effectiveVideos.maybeWhen(
      data: (nodes) =>
          nodes.where((node) => selection.value.contains(node.id)).toList(),
      orElse: () => const <NodeModel>[],
    );

    final count = effectiveVideos.maybeWhen(
      data: (nodes) => nodes.length,
      orElse: () => 0,
    );

    return LdDesktopScaffold(
      title: l10n.videos,
      subtitle: selection.value.isEmpty
          ? l10n.videosSummary(count)
          : l10n.gallerySelected(selection.value.length),
      actions: <Widget>[
        if (selection.value.isNotEmpty) ...<Widget>[
          LdButton.secondary(
            label: l10n.download,
            glyph: LdGlyph.download,
            compact: true,
            expand: false,
            onPressed: () async {
              await downloadNodes(context, ref, selected);
              selection.value = <String>{};
            },
          ),
          const SizedBox(width: 8),
          if (selected.length == 1)
            LdButton.secondary(
              label: l10n.actionShare,
              glyph: LdGlyph.shared,
              compact: true,
              expand: false,
              onPressed: () => showShareSheet(context, ref, selected.first),
            ),
          const SizedBox(width: 8),
          LdButton.text(
            label: l10n.actionDeselect,
            onPressed: () => selection.value = <String>{},
          ),
          const SizedBox(width: 16),
        ],
        _SizeSlider(
          columns: columns.value,
          onChanged: (value) => columns.value = value,
        ),
        const SizedBox(width: 16),
        LdButton.secondary(
          label: videoSortLabel(l10n, sort.by),
          glyph: sort.descending ? LdGlyph.arrowDown : LdGlyph.arrowUp,
          compact: true,
          expand: false,
          onPressed: () => showVideosSortSheet(context, ref),
        ),
      ],
      body: LdAsync<List<NodeModel>>(
        value: effectiveVideos,
        errorCopy: LdFormat.errorCopy(context),
        onRetry: () => ref.invalidate(videosProvider),
        loading: const Padding(
          padding: EdgeInsets.symmetric(vertical: 40),
          child: Center(child: LdSpinner()),
        ),
        data: (nodes) {
          if (nodes.isEmpty) {
            return Center(
              child: LdEmptyState(
                glyph: LdGlyph.video,
                title: l10n.videosEmptyTitle,
                message: l10n.videosEmptyBody,
              ),
            );
          }

          return VideosGrid(
            nodes: nodes,
            columns: columns.value,
            selection: selection.value,
            onOpen: (node) => context.push(Routes.previewOf(node.id)),
            onToggleSelect: toggle,
          );
        },
      ),
    );
  }
}

class _SizeSlider extends StatelessWidget {
  const _SizeSlider({required this.columns, required this.onChanged});

  final int columns;
  final ValueChanged<int> onChanged;

  static const List<int> steps = <int>[3, 4, 5];

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: L10n.of(context).galleryColumns,
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: context.surfaces.backgroundElevated,
          borderRadius: LdRadii.pillRadius,
          border: Border.all(color: context.surfaces.strokeOutline),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            for (final step in steps)
              LdTappable(
                onTap: () => onChanged(step),
                borderRadius: LdRadii.pillRadius,
                child: AnimatedContainer(
                  duration: LdMotion.tapFade,
                  width: 30,
                  height: 26,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: step == columns
                        ? LdColors.accentPrimary
                        : Colors.transparent,
                    borderRadius: LdRadii.pillRadius,
                  ),
                  child: CustomPaint(
                    size: const Size.square(13),
                    painter: _GridGlyph(
                      cells: step >= 5 ? 3 : 2,
                      color: step == columns
                          ? context.surfaces.foregroundPrimary
                          : context.surfaces.foregroundSecondary,
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

class _GridGlyph extends CustomPainter {
  const _GridGlyph({required this.cells, required this.color});

  final int cells;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final gap = size.width * 0.16;
    final cell = (size.width - gap * (cells - 1)) / cells;

    for (var x = 0; x < cells; x++) {
      for (var y = 0; y < cells; y++) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(x * (cell + gap), y * (cell + gap), cell, cell),
            Radius.circular(cell * 0.22),
          ),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _GridGlyph old) =>
      old.cells != cells || old.color != color;
}
