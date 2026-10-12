import '../../../../imports.dart';
import '../../../files/models/node_model.dart';
import '../../../files/widgets/shared/node_actions.dart';
import '../../../share/widgets/share_sheet.dart';
import '../../providers/videos_providers.dart';
import '../../widgets/videos_grid.dart';
import '../../widgets/videos_sort_sheet.dart';

/// The videos browser on mobile.
class VideosPageMobile extends HookConsumerWidget {
  const VideosPageMobile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final videos = ref.watch(videosProvider);
    final effectiveVideos =
        (videos.isLoading && !videos.hasValue && videosMemoryCache != null)
        ? AsyncData<List<NodeModel>>(videosMemoryCache!)
        : videos;

    final columns = useState(2);
    final selection = useState(<String>{});

    void toggle(NodeModel node) {
      final next = <String>{...selection.value};
      if (!next.remove(node.id)) next.add(node.id);
      selection.value = next;
    }

    final count = effectiveVideos.maybeWhen(
      data: (nodes) => nodes.length,
      orElse: () => 0,
    );

    return LdScaffold(
      safeAreaBottom: false,
      title: selection.value.isEmpty
          ? l10n.videos
          : l10n.gallerySelected(selection.value.length),
      subtitle: selection.value.isEmpty ? l10n.videosSummary(count) : null,
      showBack: selection.value.isNotEmpty,
      onBack: () => selection.value = <String>{},
      actions: <Widget>[
        if (selection.value.isEmpty)
          LdUtilityButton(
            glyph: LdGlyph.sort,
            tooltip: l10n.gallerySortTitle,
            onPressed: () => showVideosSortSheet(context, ref),
          )
        else ...<Widget>[
          LdUtilityButton(
            glyph: LdGlyph.download,
            tooltip: l10n.download,
            onPressed: () async {
              final nodes = _selected(videos, selection.value);
              await downloadNodes(context, ref, nodes);
              selection.value = <String>{};
            },
          ),
          LdUtilityButton(
            glyph: LdGlyph.shared,
            tooltip: l10n.actionShare,
            onPressed: () async {
              final nodes = _selected(videos, selection.value);
              if (nodes.length != 1) {
                LdToast.show(context, message: l10n.shareOneAtATime);
                return;
              }
              await showShareSheet(context, ref, nodes.first);
            },
          ),
        ],
      ],
      body: LdRefresh(
        onRefresh: () async => ref.invalidate(videosProvider),
        child: LdAsync<List<NodeModel>>(
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
                  title: l10n.videosEmptyTitle,
                  message: l10n.videosEmptyBody,
                  glyph: LdGlyph.video,
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
      ),
    );
  }

  static List<NodeModel> _selected(
    AsyncValue<List<NodeModel>> stream,
    Set<String> ids,
  ) {
    return stream.maybeWhen(
      data: (nodes) => nodes.where((n) => ids.contains(n.id)).toList(),
      orElse: () => const <NodeModel>[],
    );
  }
}
