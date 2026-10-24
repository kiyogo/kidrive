import '../../../../imports.dart';
import '../../models/node_model.dart';
import '../../providers/files_providers.dart';
import '../../widgets/desktop/drop_zone.dart';
import '../../widgets/desktop/node_details_pane.dart';
import '../../widgets/shared/files_browser.dart';
import '../../widgets/shared/files_toolbar.dart';
import '../../widgets/shared/rename_sheet.dart';
import '../files_page.dart';


/// Desktop files, laid out for a pointer and a wide window.
///
/// The shell owns the sidebar, so this owns the rest: one slim top bar with
/// the breadcrumb, search, and the view controls all on the same row, a drop
/// zone over the listing, and a details pane on the right that opens when
/// something is selected. None of that exists on a phone, and none of it is
/// the mobile layout stretched.
class FilesPageDesktop extends HookConsumerWidget {
  const FilesPageDesktop({super.key, this.folderId, required this.filter});

  final String? folderId;
  final FilesFilter filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final viewMode = ref.watch(viewModeProvider);
    final selection = ref.watch(selectionProvider);
    final searchController = useTextEditingController();
    // Searching filters the listing already on screen instead of navigating to
    // a separate results page. A wide window has the room, and leaving the
    // folder to see matches means losing the breadcrumb, the selection and the
    // place you were, then having to find your way back.
    final typed = useValueListenable(searchController);
    final term = typed.text.trim();
    final query = FolderQuery(
      parentId: term.isEmpty ? (folderId ?? '') : '',
      filter: filter.wire,
      query: term,
    );
    final listing = ref.watch(folderProvider(query));

    // Details/Preview pane: opens only via context menu "Xem trước",
    // stays open when switching to another file, and closes only via the close button.
    final NodeModel? activeDetailsNode = ref.watch(activeDetailsNodeProvider);

    final nodes = listing.maybeWhen(
      data: (nodes) => nodes,
      orElse: () => const <NodeModel>[],
    );

    return LdDesktopScaffold(
      titleWidget: Align(
        alignment: AlignmentDirectional.centerStart,
        child: selection.isNotEmpty
            ? SelectionActionBar(nodes: nodes)
            : DesktopBreadcrumb(folderId: folderId, filter: filter),
      ),
      search: LdSearchField(
        controller: searchController,
        hint: l10n.search,
        // rebuilt on every keystroke through the controller, so results narrow
        // as it is typed rather than waiting for a submit
        onChanged: (_) {},
      ),
      actions: <Widget>[
        Builder(
          builder: (context) => LdUtilityButton(
            glyph: LdGlyph.sort,
            tooltip: l10n.sortBy,
            onPressed: () =>
                showSortMenu(context, ref, anchor: anchorOf(context)),
          ),
        ),
        LdUtilityButton(
          glyph: viewMode == ViewMode.grid ? LdGlyph.list : LdGlyph.grid,
          tooltip: viewMode == ViewMode.grid ? l10n.viewList : l10n.viewGrid,
          onPressed: () => ref.read(viewModeProvider.notifier).toggle(),
        ),
        if (filter == FilesFilter.browse)
          LdUtilityButton(
            glyph: LdGlyph.folder,
            tooltip: l10n.newFolder,
            onPressed: () =>
                showNewFolderSheet(context, ref, parentId: folderId ?? ''),
          ),
        if (MediaQuery.sizeOf(context).width < 900)
          LdUtilityButton(
            glyph: LdGlyph.upload,
            tooltip: l10n.upload,
            onPressed: () => pickAndUpload(context, ref, folderId ?? ''),
          )
        else
          LdButton(
            label: l10n.upload,
            glyph: LdGlyph.upload,
            compact: true,
            expand: false,
            onPressed: () => pickAndUpload(context, ref, folderId ?? ''),
          ),
      ],
      // Nothing here is allowed to resize the listing.
      //
      // The selection bar used to be a row above the grid and the details pane
      // a column beside it, so selecting a file pushed the grid down and made
      // it narrower at the same time. The tiles reflowed into fewer columns,
      // everything moved, and the file you had just clicked was somewhere else
      // on the screen. Both now float over the listing, which never changes
      // size, so what you were looking at stays exactly where it was.
      body: FilesDropZone(
        folderId: folderId ?? '',
        child: Stack(
          children: <Widget>[
            Positioned.fill(
              child: FilesBrowser(
                query: query,
                topInset: 0,
                emptyGlyph: term.isNotEmpty
                    ? LdGlyph.search
                    : switch (filter) {
                        FilesFilter.starred => LdGlyph.star,
                        FilesFilter.recent => LdGlyph.clock,
                        FilesFilter.browse => LdGlyph.folder,
                      },
                emptyTitle: term.isNotEmpty
                    ? l10n.emptySearchTitle
                    : switch (filter) {
                        FilesFilter.starred => l10n.emptyStarredTitle,
                        FilesFilter.recent => l10n.emptyRecentTitle,
                        FilesFilter.browse => l10n.emptyFolderTitle,
                      },
                emptyBody: term.isNotEmpty
                    ? l10n.emptySearchBody
                    : switch (filter) {
                        FilesFilter.starred => l10n.emptyStarredBody,
                        FilesFilter.recent => l10n.emptyRecentBody,
                        FilesFilter.browse => l10n.emptyFolderBody,
                      },
              ),
            ),
            if (activeDetailsNode != null)
              Positioned(
                top: 0,
                right: 0,
                bottom: 0,
                width: Breakpoints.detailPaneWidth,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: context.surfaces.backgroundPrimary,
                    border: Border(
                      left: BorderSide(color: context.surfaces.strokeOutline),
                    ),
                  ),
                  child: NodeDetailsPane(node: activeDetailsNode),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
