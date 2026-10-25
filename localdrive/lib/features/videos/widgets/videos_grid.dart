import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';

import '../../../imports.dart';
import '../../files/models/node_model.dart';
import '../providers/videos_providers.dart';
import 'video_tile.dart';

/// The grid layout for video items.
class VideosGrid extends ConsumerWidget {
  const VideosGrid({
    super.key,
    required this.nodes,
    required this.columns,
    required this.selection,
    required this.onOpen,
    required this.onToggleSelect,
  });

  final List<NodeModel> nodes;
  final int columns;
  final Set<String> selection;
  final void Function(NodeModel node) onOpen;
  final void Function(NodeModel node) onToggleSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.metrics.pixels >=
            notification.metrics.maxScrollExtent - 600) {
          ref.read(videosProvider.notifier).loadMore();
        }
        return false;
      },
      child: CustomScrollView(
        cacheExtent: 1500,
        slivers: <Widget>[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(13, 13, 13, 13),
            sliver: SliverMasonryGrid.count(
              crossAxisCount: columns,
              mainAxisSpacing: 13,
              crossAxisSpacing: 13,
              childCount: nodes.length,
              itemBuilder: (context, index) {
                final node = nodes[index];
                return VideoTile(
                  node: node,
                  selected: selection.contains(node.id),
                  selecting: selection.isNotEmpty,
                  onOpen: () => onOpen(node),
                  onToggleSelect: () => onToggleSelect(node),
                );
              },
            ),
          ),
          if (ref.watch(videosProvider.notifier).hasMore)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: LdSpinner()),
              ),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }
}
