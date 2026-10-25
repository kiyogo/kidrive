import '../../../imports.dart';
import '../../files/models/node_model.dart';
import '../../files/providers/files_providers.dart';
import '../../files/widgets/shared/node_actions.dart';
import '../../offline/controller/offline_controller.dart';

/// A card for one video in the videos grid.
class VideoTile extends HookConsumerWidget {
  const VideoTile({
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

    final initialRatio = (node.imageWidth > 0 && node.imageHeight > 0)
        ? (node.imageWidth / node.imageHeight)
        : null;
    final ratio = (initialRatio ?? (16 / 9)).clamp(0.2, 5.0);

    return AspectRatio(
      aspectRatio: ratio,
      child: LdTappable(
        onTap: selecting ? onToggleSelect : onOpen,
        onLongPress: onToggleSelect,
        onSecondaryTap: (pos) => showNodeActions(context, ref, node, pos),
        borderRadius: LdRadii.tileRadius,
        child: AnimatedContainer(
          duration: LdMotion.tapFade,
          curve: LdMotion.curve,
          padding: EdgeInsets.all(selected ? 6 : 0),
          child: Stack(
            fit: StackFit.expand,
            children: <Widget>[
              // Video thumbnail with center play overlay
              ClipRRect(
                borderRadius: LdRadii.tileRadius,
                clipBehavior: Clip.antiAlias,
                child: Stack(
                  fit: StackFit.expand,
                  children: <Widget>[
                    if (node.hasThumbnail)
                      LdRemoteImage(
                        url: db.thumbnailUrl(node.id),
                        headers: db.authHeaders,
                        tint: LdColors.fileMedia,
                        fit: BoxFit.cover,
                      )
                    else
                      const ColoredBox(color: Color(0xFF141424)),
                    Center(
                      child: Container(
                        width: 44,
                        height: 44,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.5),
                          shape: BoxShape.circle,
                        ),
                        child: const LdIcon(
                          LdGlyph.play,
                          size: 20,
                          color: Colors.white,
                          mirrorInRtl: false,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Bottom info bar (Play glyph + Name + Size)
              PositionedDirectional(
                bottom: 0,
                start: 0,
                end: 0,
                child: ClipRRect(
                  borderRadius: BorderRadius.vertical(
                    bottom: Radius.circular(LdRadii.tileRadius.topRight.x),
                  ),
                  child: Container(
                    padding: const EdgeInsetsDirectional.fromSTEB(8, 6, 8, 6),
                    color: Colors.black.withValues(alpha: 0.65),
                    child: Row(
                      children: <Widget>[
                        const LdIcon(
                          LdGlyph.play,
                          size: 14,
                          color: Colors.white,
                          mirrorInRtl: false,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            node.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelMedium!
                                .copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w500,
                                ),
                          ),
                        ),
                        if (node.sizeBytes > 0) ...<Widget>[
                          const SizedBox(width: 6),
                          Text(
                            LdFormat.bytes(context, node.sizeBytes),
                            style: Theme.of(context).textTheme.labelSmall!
                                .copyWith(color: Colors.white70),
                          ),
                        ],
                      ],
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

              if (selected)
                DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: LdRadii.tileRadius,
                    border: Border.all(color: LdColors.accentPrimary, width: 2),
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
        border: Border.all(
          color: context.surfaces.backgroundPrimary,
          width: 1.5,
        ),
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
            : context.surfaces.backgroundPrimary.withValues(alpha: 0.8),
        shape: BoxShape.circle,
        border: Border.all(
          color: selected
              ? LdColors.accentPrimary
              : context.surfaces.foregroundSecondary,
          width: 1.5,
        ),
      ),
      child: selected
          ? LdIcon(
              LdGlyph.check,
              size: 13,
              color: context.surfaces.backgroundElevated,
              strokeWidth: 2.4,
            )
          : null,
    );
  }
}
