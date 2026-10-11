import '../../../imports.dart';
import '../providers/videos_providers.dart';

/// Shows the sort sheet for videos.
Future<void> showVideosSortSheet(BuildContext context, WidgetRef ref) {
  final l10n = L10n.of(context);
  return LdBottomSheet.show<void>(
    context,
    title: l10n.gallerySortTitle,
    builder: (sheetContext) => const _SortBody(),
  );
}

String videoSortLabel(L10n l10n, VideosSort sort) => switch (sort) {
  VideosSort.added => l10n.gallerySortAdded,
  VideosSort.modified => l10n.gallerySortModified,
  VideosSort.name => l10n.gallerySortName,
  VideosSort.size => l10n.gallerySortSize,
};

class _SortBody extends ConsumerWidget {
  const _SortBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final sort = ref.watch(videosSortProvider);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        for (final option in VideosSort.values)
          _SortRow(
            label: videoSortLabel(l10n, option),
            selected: sort.by == option,
            descending: sort.descending,
            onTap: () => ref.read(videosSortProvider.notifier).set(option),
          ),
      ],
    );
  }
}

class _SortRow extends StatelessWidget {
  const _SortRow({
    required this.label,
    required this.selected,
    required this.descending,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool descending;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return LdTappable(
      onTap: onTap,
      borderRadius: LdRadii.tileRadius,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 13),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Text(
                label,
                style: Theme.of(context).textTheme.bodyMedium!.copyWith(
                  color: selected
                      ? context.surfaces.foregroundPrimary
                      : context.surfaces.foregroundSecondary,
                ),
              ),
            ),
            if (selected)
              LdIcon(
                descending ? LdGlyph.arrowDown : LdGlyph.arrowUp,
                size: 18,
                color: LdColors.accentPrimary,
              ),
          ],
        ),
      ),
    );
  }
}
