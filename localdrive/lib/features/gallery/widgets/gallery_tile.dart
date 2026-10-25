import '../../../imports.dart';
import '../../files/models/node_model.dart';
import '../../files/providers/files_providers.dart';
import '../../files/widgets/shared/node_actions.dart';
import '../../offline/controller/offline_controller.dart';

/// One picture in the grid. Holds its own aspect ratio from the server's
/// recorded dimensions, so the masonry lays itself out correctly before a
/// single thumbnail has arrived, instead of reflowing as they load.
class GalleryTile extends ConsumerWidget {
  const GalleryTile({
    super.key,
    required this.node,
    required this.onOpen,
    required this.onToggleSelect,
    this.selected = false,
    this.selecting = false,
  });

  final NodeModel node;
  final VoidCallback onOpen;
  final VoidCallback onToggleSelect;
  final bool selected;
  final bool selecting;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final db = ref.watch(filesDbProvider);
    final offline = ref.watch(isOfflineProvider(node.id));

    return AspectRatio(
      aspectRatio: node.aspectRatio,
      child: LdTappable(
        onTap: selecting ? onToggleSelect : onOpen,
        onLongPress: onToggleSelect,
        onSecondaryTap: (pos) => showNodeActions(context, ref, node, pos),
        borderRadius: LdRadii.tileRadius,
        child: AnimatedContainer(
          duration: LdMotion.tapFade,
          curve: LdMotion.curve,
          // a selected tile shrinks slightly inside its own slot, which reads
          // as picking it up rather than as a border appearing around it
          padding: EdgeInsets.all(selected ? 8 : 0),
          child: Stack(
            fit: StackFit.expand,
            children: <Widget>[
              ClipRRect(
                borderRadius: LdRadii.tileRadius,
                clipBehavior: Clip.antiAlias,
                child: ColoredBox(
                  color: context.surfaces.backgroundElevated,
                  child: Hero(
                    // the same tag the full screen viewer uses, so opening a
                    // picture grows it out of its own tile
                    tag: 'gallery-${node.id}',
                    child: node.hasThumbnail
                        ? LdRemoteImage(
                            url: db.thumbnailUrl(node.id),
                            headers: db.authHeaders,
                            tint: node.category.tint,
                          )
                        : Center(
                            child: LdIcon(
                              LdGlyph.image,
                              size: 26,
                              color: context.surfaces.foregroundMuted,
                            ),
                          ),
                  ),
                ),
              ),

              if (offline && !selecting)
                const PositionedDirectional(
                  top: 8,
                  end: 8,
                  child: _OfflineDot(),
                ),

              if (selecting)
                PositionedDirectional(
                  top: 8,
                  end: 8,
                  child: _SelectionMark(selected: selected),
                ),

              // the selected state needs to read at a glance across a grid of
              // forty, so it is a wash as well as a mark
              if (selected)
                DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: LdRadii.tileRadius,
                    border: Border.all(
                      color: LdColors.accentPrimary,
                      width: 2,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OfflineDot extends StatelessWidget {
  const _OfflineDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 18,
      height: 18,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: LdColors.accentPrimary,
        shape: BoxShape.circle,
        border: Border.all(color: context.surfaces.backgroundPrimary, width: 1.5),
      ),
      child: LdIcon(
        LdGlyph.check,
        size: 10,
        color: context.surfaces.backgroundElevated,
        strokeWidth: 2.4,
      ),
    );
  }
}

class _SelectionMark extends StatelessWidget {
  const _SelectionMark({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: LdMotion.tapFade,
      width: 22,
      height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: selected
            ? LdColors.accentPrimary
            : context.surfaces.backgroundPrimary.withValues(alpha: 0.55),
        shape: BoxShape.circle,
        border: Border.all(
          color: selected ? LdColors.accentPrimary : context.surfaces.foregroundMuted,
          width: 1.5,
        ),
      ),
      child: selected
          ? LdIcon(
              LdGlyph.check,
              size: 12,
              color: context.surfaces.backgroundElevated,
              strokeWidth: 2.4,
            )
          : null,
    );
  }
}
