import '../../../imports.dart';
import '../providers/storage_providers.dart';

/// One library, with its own used and free numbers, its default marker, and
/// the eject action when it is a removable drive.
class LibraryCard extends ConsumerWidget {
  const LibraryCard({super.key, required this.library, required this.isAdmin});

  final LibraryModel library;
  final bool isAdmin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final online = library.isOnline;
    final libTotal = library.statsKnown ? library.totalBytes : 0;
    final libFree = library.statsKnown ? library.freeBytes : 0;
    final libLocalUsed = isAdmin ? library.bytesUsed : 0;
    final libDiskUsed = libTotal > libFree ? libTotal - libFree : libLocalUsed;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.surfaces.backgroundElevated,
        borderRadius: LdRadii.cardRadius,
        border: Border.all(
          color: online ? context.surfaces.strokeOutline : LdColors.accentWarning,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              LdIcon(
                library.isPooled ? LdGlyph.grid : LdGlyph.drive,
                size: 20,
                color: online
                    ? context.surfaces.foregroundPrimary
                    : LdColors.accentWarning,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      library.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    if (!online) ...<Widget>[
                      const SizedBox(height: 2),
                      Text(
                        l10n.storageOffline,
                        style: Theme.of(context).textTheme.bodySmall!.copyWith(
                              color: LdColors.accentWarning,
                            ),
                      ),
                    ],
                  ],
                ),
              ),
              if (library.isDefault)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: LdColors.wash(LdColors.accentPrimary),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Text(
                    l10n.storageDefault,
                    style: Theme.of(context).textTheme.labelSmall!.copyWith(
                          color: LdColors.accentPrimary,
                          letterSpacing: 0,
                        ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          LdUsageBar(
            usedBytes: libDiskUsed,
            totalBytes: libTotal,
            primaryBytes: libLocalUsed,
            height: 6,
            usedLabel: library.statsKnown
                ? '${LdFormat.bytes(context, libDiskUsed)} trên ${LdFormat.bytes(context, libTotal)}${isAdmin && libLocalUsed > 0 && libDiskUsed > libLocalUsed ? ' (LocalDrive: ${LdFormat.bytes(context, libLocalUsed)})' : ''}'
                : '',
            freeLabel: library.statsKnown
                ? l10n.libraryFreeSpace(
                    LdFormat.bytes(context, library.freeBytes),
                  )
                : l10n.storageOffline,
          ),
          if (isAdmin) ...<Widget>[
            const SizedBox(height: 16),
            Row(
              children: <Widget>[
                if (!library.isDefault && online)
                  Expanded(
                    child: LdButton.secondary(
                      label: l10n.storageSetDefault,
                      compact: true,
                      onPressed: () async {
                        await ref
                            .read(storageDbProvider)
                            .setDefault(library.id);
                        ref.invalidate(librariesProvider);
                      },
                    ),
                  ),
                if (!library.isDefault && online && library.isExternal)
                  const SizedBox(width: 10),
                if (library.isExternal && online)
                  Expanded(
                    child: LdButton.secondary(
                      label: l10n.storageEject,
                      glyph: LdGlyph.eject,
                      compact: true,
                      onPressed: () async {
                        final message = await ref
                            .read(storageDbProvider)
                            .eject(library.id);
                        ref.invalidate(librariesProvider);
                        if (context.mounted) {
                          LdToast.success(
                            context,
                            message.isEmpty
                                ? l10n.storageSafeToUnplug
                                : message,
                          );
                        }
                      },
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
