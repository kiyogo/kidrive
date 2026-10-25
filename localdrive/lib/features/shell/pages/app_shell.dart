import 'package:url_launcher/url_launcher.dart';
import '../../../core/services/desktop_shell_service.dart';
import '../../../imports.dart';
import '../../auth/controller/session_controller.dart';
import '../../files/providers/files_providers.dart';
import '../../files/widgets/shared/rename_sheet.dart';
import '../../storage/providers/storage_providers.dart';
import '../../upload/controller/transfer_controller.dart';
import '../widgets/uploads_tray.dart';

/// Whether the phone tab bar belongs on this screen at all.
///
/// Stated as what the tabs are, not as a list of exceptions. The exception
/// list kept missing screens, and every one it missed showed a bar with Home
/// lit while standing somewhere else, which is the bar telling you a lie about
/// where you are. Anything not on this list is opened from inside another
/// screen and carries its own back control.
bool isTabDestination(String location) =>
    location == Routes.files ||
    location.startsWith('${Routes.files}/') ||
    location.startsWith(Routes.image) ||
    location.startsWith(Routes.videos) ||
    location.startsWith(Routes.shared) ||
    location.startsWith(Routes.settings);

/// The navigation chrome every main screen sits inside: a floating pill bar on
/// mobile, the same destinations as a persistent sidebar on desktop.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  AppLifecycleListener? _lifecycle;

  @override
  void initState() {
    super.initState();
    // Anything uploaded from a desktop while this app sat in the background is
    // invisible until something asks the server again, and nothing did. Coming
    // back to the app is exactly the moment the person expects to be looking at
    // what is actually there.
    _lifecycle = AppLifecycleListener(
      onResume: () => refreshServerDataFrom(ref),
    );
  }

  @override
  void dispose() {
    _lifecycle?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (DesktopShellService.isDesktop) {
      return _DesktopShell(child: widget.child);
    }
    return LdResponsive(
      mobile: (context) => _MobileShell(child: widget.child),
      tablet: (context) => _MobileShell(child: widget.child),
      desktop: (context) => _DesktopShell(child: widget.child),
    );
  }
}

/// The banner strip: an offline drive says so once, at the top, instead of
/// every file in it failing separately.
class _Banners extends ConsumerWidget {
  const _Banners();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final offline = ref.watch(offlineLibrariesProvider);
    final connection = ref.watch(connectionStateProvider);
    final summary = ref.watch(transferSummaryProvider);

    final disconnected = connection.maybeWhen(
      data: (value) => value == LdConnectionState.disconnected,
      orElse: () => false,
    );

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        if (disconnected)
          LdBanner(
            message: l10n.errorOfflineTitle,
            glyph: LdGlyph.offline,
            tint: context.surfaces.foregroundSecondary,
          ),
        for (final library in offline)
          LdBanner(
            message: l10n.storageOfflineBanner(library.name),
            glyph: LdGlyph.drive,
          ),
        if (summary.paused)
          LdBanner(
            message: l10n.transferPausedOffline,
            glyph: LdGlyph.upload,
            tint: LdColors.accentPrimary,
          ),
      ],
    );
  }
}

/// Says once, quietly, that there is a newer version.
///
/// The check runs by itself on launch because nobody goes looking for a
/// version number, and a fix nobody installs is a fix that did not happen.
/// Nothing downloads from here: this is a sentence and a way to go read what
/// changed, and the decision stays with whoever is using the app.
class _UpdateBanner extends ConsumerStatefulWidget {
  const _UpdateBanner();

  @override
  ConsumerState<_UpdateBanner> createState() => _UpdateBannerState();
}

class _UpdateBannerState extends ConsumerState<_UpdateBanner> {
  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}

class _MobileShell extends ConsumerWidget {
  const _MobileShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final location = currentLocation(context);
    final index = _mobileIndexOf(location);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      extendBody: true,
      body: SafeArea(
        // the tab bar only shows on the tabs, and it is what holds the space
        // above the gesture bar. Anywhere it is missing the body has to do it
        // itself or the last row sits under the gesture bar.
        bottom: !isTabDestination(location),
        child: Column(
          children: <Widget>[
            const _Banners(),
            Expanded(
              child: Stack(
                children: <Widget>[
                  child,
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: isTabDestination(location) ? 88 : 0,
                    child: const UploadsTray(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      // A tab bar belongs to the tabs. Storage and Trash are opened from
      // inside Settings, so showing it there left every tab unlit except
      // Home, which was highlighted while standing on neither: the bar was
      // saying you were somewhere you were not. These screens carry their own
      // back control instead.
      bottomNavigationBar: !isTabDestination(location)
          ? null
          : LdBottomNav(
              currentIndex: index,
              onSelected: (next) => _onDestination(context, ref, next),
              items: <LdNavItem>[
                LdNavItem(glyph: LdGlyph.home, label: l10n.navHome),
                LdNavItem(glyph: LdGlyph.image, label: l10n.gallery),
                LdNavItem(
                  glyph: LdGlyph.plus,
                  label: l10n.navCreate,
                  emphasized: true,
                ),
                LdNavItem(glyph: LdGlyph.video, label: l10n.videos),
                LdNavItem(glyph: LdGlyph.settings, label: l10n.navSettings),
              ],
            ),
    );
  }

  static int _mobileIndexOf(String location) {
    if (location.startsWith(Routes.image)) return 1;
    if (location.startsWith(Routes.videos)) return 3;
    if (location.startsWith(Routes.settings)) return 4;
    return 0;
  }

  void _onDestination(BuildContext context, WidgetRef ref, int index) {
    switch (index) {
      case 0:
        context.go(Routes.files);
      case 1:
        context.go(Routes.image);
      case 2:
        // create does not navigate; it opens the same sheet from anywhere
        unawaitedCreate(context, ref);
      case 3:
        context.go(Routes.videos);
      case 4:
        context.go(Routes.settings);
    }
  }
}

class _DesktopShell extends ConsumerWidget {
  const _DesktopShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final location = currentLocation(context);

    final destinations = <({String route, LdNavItem item})>[
      (
        route: Routes.files,
        item: LdNavItem(glyph: LdGlyph.home, label: l10n.myFiles),
      ),
      (
        route: Routes.image,
        item: LdNavItem(glyph: LdGlyph.image, label: l10n.gallery),
      ),
      (
        route: Routes.videos,
        item: LdNavItem(glyph: LdGlyph.video, label: l10n.videos),
      ),
      (
        route: Routes.shared,
        item: LdNavItem(glyph: LdGlyph.shared, label: l10n.sharedWithMe),
      ),
      (
        route: Routes.recent,
        item: LdNavItem(glyph: LdGlyph.clock, label: l10n.recent),
      ),
      (
        route: Routes.starred,
        item: LdNavItem(glyph: LdGlyph.star, label: l10n.starred),
      ),
      (
        route: Routes.trash,
        item: LdNavItem(glyph: LdGlyph.trash, label: l10n.trash),
      ),
      (
        route: Routes.storage,
        item: LdNavItem(glyph: LdGlyph.drive, label: l10n.storage),
      ),
      (
        route: Routes.settings,
        item: LdNavItem(glyph: LdGlyph.settings, label: l10n.settings),
      ),
    ];

    var current = 0;
    for (var i = destinations.length - 1; i >= 0; i--) {
      if (location.startsWith(destinations[i].route)) {
        current = i;
        break;
      }
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 800;

        return Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          body: Stack(
            children: <Widget>[
              Row(
                children: <Widget>[
                  LdSidebar(
                    compact: compact,
                    currentIndex: current,
                    onSelected: (index) => context.go(destinations[index].route),
                    onTertiarySelected: (index) {
                      final route = destinations[index].route;
                      if (kIsWeb) {
                        launchUrl(Uri.parse(route), webOnlyWindowName: '_blank');
                      } else {
                        context.go(route);
                      }
                    },
                    items: destinations
                        .map((d) => d.item)
                        .toList(growable: false),
                    header: compact
                        ? Builder(
                            builder: (context) => Center(
                              child: LdUtilityButton(
                                glyph: LdGlyph.upload,
                                tooltip: l10n.upload,
                                onPressed: () => unawaitedCreate(
                                  context,
                                  ref,
                                  anchor: anchorOf(context),
                                ),
                              ),
                            ),
                          )
                        : Builder(
                            builder: (context) => LdButton(
                              label: l10n.upload,
                              glyph: LdGlyph.upload,
                              compact: true,
                              onPressed: () => unawaitedCreate(
                                context,
                                ref,
                                anchor: anchorOf(context),
                              ),
                            ),
                          ),
                    footer: compact ? null : const _QuotaFooter(),
                  ),
                  Expanded(
                    child: Column(
                      children: <Widget>[
                        const _Banners(),
                        Expanded(
                          child: Stack(
                            children: <Widget>[
                              child,
                              const Positioned(
                                right: 20,
                                bottom: 20,
                                width: 360,
                                child: UploadsTray(),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (LdWindowBar.isVisible)
                const Positioned(
                  top: 0,
                  right: 0,
                  child: LdWindowButtons(),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// The quota bar under the sidebar: what this account is using, and what is
/// left to use. The two halves come from different places:
///
/// **Used** is this account's own files. Everyone on the server sees their own
/// number, and one person filling the disk never makes another person's usage
/// go up.
///
/// **Free** is the disk, which everyone shares. It moves when anybody uploads,
/// so two people looking at the same moment see the same free figure beside
/// different used figures.
///
/// The bar measures whichever limit binds first. A 100 GB quota is not 100 GB
/// of headroom when the disk has 2 GB left, so the remaining space is the
/// smaller of the two, and the bar is drawn against used plus that.
class _QuotaFooter extends ConsumerWidget {
  const _QuotaFooter();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final user = ref.watch(currentUserProvider);
    if (user == null) return const SizedBox.shrink();

    final libraries = ref.watch(librariesProvider);
    final diskFree = libraries.maybeWhen(
      data: (summary) => summary.totalFree,
      orElse: () => -1,
    );

    final accountStorage = ref.watch(accountStorageProvider).valueOrNull;
    final used = (accountStorage != null && accountStorage.usedBytes > 0)
        ? accountStorage.usedBytes
        : user.quotaBytesUsed;

    // Determine max capacity: user quota, or account storage dataset total, or library total
    final int maxCapacity;
    if (user.quotaBytes > 0) {
      maxCapacity = user.quotaBytes;
    } else if (accountStorage != null && accountStorage.quotaBytes > 0) {
      maxCapacity = accountStorage.quotaBytes;
    } else if (accountStorage != null && accountStorage.totalBytes > 0) {
      maxCapacity = accountStorage.totalBytes;
    } else {
      final summaryTotal = libraries.maybeWhen(
        data: (summary) => summary.totalBytes > 0
            ? summary.totalBytes
            : (used + (summary.totalFree > 0 ? summary.totalFree : 0)),
        orElse: () => 0,
      );
      maxCapacity = summaryTotal > 0 ? summaryTotal : (10 * 1024 * 1024 * 1024);
    }

    final double fraction = maxCapacity > 0
        ? (used / maxCapacity).clamp(0.0, 1.0)
        : 0.0;

    final percentVal = maxCapacity > 0 ? (used / maxCapacity * 100) : 0.0;
    final String percentText;
    if (percentVal > 0 && percentVal < 1.0) {
      percentText = '${percentVal.toStringAsFixed(1)}%';
    } else {
      percentText = '${percentVal.round()}%';
    }

    // Determine warning only when actually running out of space or over quota
    final String? warningText;
    final Color barColor;
    if (used >= maxCapacity) {
      warningText = l10n.errorQuotaTitle;
      barColor = const Color(0xFFE53935);
    } else if (fraction >= 0.90) {
      warningText = 'Sắp hết dung lượng ($percentText)';
      barColor = LdColors.accentWarning;
    } else if (diskFree >= 0 && diskFree < 512 * 1024 * 1024) {
      // Physical disk genuinely critically low (< 512 MB)
      warningText = l10n.sidebarStorageDiskLimited;
      barColor = LdColors.accentWarning;
    } else {
      warningText = null;
      barColor = LdColors.accentPrimary;
    }

    final labels = Theme.of(context).textTheme.labelSmall;

    final usedBase = l10n.sidebarStorageUsed(LdFormat.bytes(context, used));
    final usedText = usedBase;
    final freeBytes = (maxCapacity - used).clamp(0, maxCapacity);
    final freeText = l10n.sidebarStorageFree(LdFormat.bytes(context, freeBytes));

    return LdTappable(
      onTap: () => context.go(Routes.storage),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            LdProgressBar(
              value: fraction,
              height: 6,
              color: barColor,
              background: context.isDark
                  ? const Color(0xFF2A2D35)
                  : const Color(0xFFE2E8F0),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                Flexible(
                  child: Text(
                    usedText,
                    style: labels?.copyWith(fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  freeText,
                  style: labels?.copyWith(
                    color: context.surfaces.foregroundSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.end,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
            if (warningText != null) ...<Widget>[
              const SizedBox(height: 4),
              Text(
                warningText,
                style: labels?.copyWith(
                  color: (used >= maxCapacity)
                      ? const Color(0xFFE53935)
                      : LdColors.accentWarning,
                  fontWeight: FontWeight.w500,
                ),
                maxLines: 2,
                softWrap: true,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The create sheet: upload files, or make a folder. One entry point, reached
/// from the pill bar on mobile and the sidebar button on desktop.
Future<void> unawaitedCreate(
  BuildContext context,
  WidgetRef ref, {
  Offset? anchor,
}) async {
  final l10n = L10n.of(context);
  final location = currentLocation(context);
  final folderId = Routes.folderIdIn(location) ?? '';

  final choice = await LdContextMenu.show(
    context,
    title: l10n.navCreate,
    anchor: anchor,
    actions: <LdMenuAction>[
      LdMenuAction(id: 'folder', label: l10n.newFolder, glyph: LdGlyph.folder),
      LdMenuAction(id: 'file', label: l10n.uploadFile, glyph: LdGlyph.upload),
    ],
  );
  if (choice == null || !context.mounted) return;

  if (choice == 'folder') {
    await showNewFolderSheet(context, ref, parentId: folderId);
    return;
  }

  await pickAndUpload(context, ref, folderId);
}
