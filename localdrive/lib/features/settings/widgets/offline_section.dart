import '../../../imports.dart';
import '../../offline/controller/offline_controller.dart';
import '../../offline/controller/web_offline_controller.dart';

/// Downloads on this device.
///
/// Deliberately separate from the server storage screen: this number is about
/// the phone or laptop in front of you and has nothing to do with the server's
/// own disks. Someone looking at a nearly full device needs to know what this
/// app is keeping locally, and that answer is not on the server screen.
class OfflineSection extends ConsumerWidget {
  const OfflineSection({super.key});

  /// The choices the warning threshold offers. Round numbers, because nobody
  /// wants to type a byte count.
  static const List<int> capChoices = <int>[
    512 * 1024 * 1024,
    1024 * 1024 * 1024,
    2 * 1024 * 1024 * 1024,
    5 * 1024 * 1024 * 1024,
    10 * 1024 * 1024 * 1024,
    0,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (kIsWeb) {
      return const _WebOfflineSection();
    }

    final l10n = L10n.of(context);
    final usage = ref.watch(offlineUsageProvider);

    return ListView(
      padding: EdgeInsets.fromLTRB(
        context.pagePadding,
        16,
        context.pagePadding,
        120,
      ),
      children: <Widget>[
        Text(
          l10n.offlineDownloadsBody,
          style: Theme.of(context).textTheme.bodySmall!.copyWith(
                color: context.surfaces.foregroundSecondary,
              ),
        ),
        const SizedBox(height: 20),
        LdAsync<OfflineUsage>(
          value: usage,
          errorCopy: LdFormat.errorCopy(context),
          onRetry: () => ref.invalidate(offlineUsageProvider),
          loading: const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: LdSpinner()),
          ),
          data: (data) => _Usage(usage: data),
        ),
      ],
    );
  }
}

class _Usage extends ConsumerWidget {
  const _Usage({required this.usage});

  final OfflineUsage usage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);

    if (usage.fileCount == 0) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 30),
        child: LdEmptyState(
          title: l10n.offlineNothingKept,
          message: l10n.offlineMakeAvailable,
          glyph: LdGlyph.offlineReady,
        ),
      );
    }

    // Measured here rather than read off the breakpoint. This sits inside the
    // settings detail pane, so what matters is the room this component has,
    // not how wide the window is.
    return LayoutBuilder(
      builder: (context, constraints) => constraints.maxWidth >= 620
          ? _wide(context, ref, l10n)
          : _narrow(context, ref, l10n),
    );
  }

  /// Two columns: what is stored on the left, what to do about it on the right.
  ///
  /// Stacked, the phone layout puts a full width card above a loose list above
  /// six radio rows above a destructive button the width of the window. On a
  /// desktop that reads as a form nobody laid out, and a full width delete
  /// button looks like a banner rather than something to press.
  Widget _wide(BuildContext context, WidgetRef ref, L10n l10n) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Expanded(
          flex: 3,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              _summary(context, l10n),
              if (usage.byFolder.isNotEmpty) ...<Widget>[
                const SizedBox(height: 20),
                _breakdown(context, l10n),
              ],
            ],
          ),
        ),
        const SizedBox(width: 24),
        Expanded(
          flex: 2,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              _capGroup(context, ref, l10n),
              const SizedBox(height: 20),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: LdButton.destructive(
                  label: l10n.offlineClearAll,
                  glyph: LdGlyph.trash,
                  compact: true,
                  expand: false,
                  onPressed: () => _clear(context, ref, l10n),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _narrow(BuildContext context, WidgetRef ref, L10n l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _summary(context, l10n),
        if (usage.byFolder.isNotEmpty) ...<Widget>[
          const SizedBox(height: 22),
          _breakdown(context, l10n),
        ],
        const SizedBox(height: 22),
        _capGroup(context, ref, l10n),
        const SizedBox(height: 22),
        LdButton.destructive(
          label: l10n.offlineClearAll,
          glyph: LdGlyph.trash,
          onPressed: () => _clear(context, ref, l10n),
        ),
      ],
    );
  }

  Widget _summary(BuildContext context, L10n l10n) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.surfaces.backgroundElevated,
        borderRadius: LdRadii.cardRadius,
        border: Border.all(
          color:
              usage.overCap ? LdColors.accentPrimary : context.surfaces.strokeOutline,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            LdFormat.bytes(context, usage.totalBytes),
            style: Theme.of(context).textTheme.displaySmall,
          ),
          const SizedBox(height: 4),
          Text(
            l10n.offlineFilesKept(usage.fileCount),
            style: Theme.of(context).textTheme.bodySmall!.copyWith(
                  color: context.surfaces.foregroundSecondary,
                ),
          ),
          if (usage.softCapBytes > 0) ...<Widget>[
            const SizedBox(height: 18),
            LdProgressBar(value: usage.capFraction),
            const SizedBox(height: 8),
            Text(
              '${l10n.offlineSoftCapLabel} '
              '${LdFormat.bytes(context, usage.softCapBytes)}',
              style: Theme.of(context).textTheme.labelSmall!.copyWith(
                    color: usage.overCap
                        ? LdColors.accentPrimary
                        : context.surfaces.foregroundSecondary,
                  ),
            ),
          ],
        ],
      ),
    );
  }

  /// Where the space went, by the folder it was marked from.
  ///
  /// In a bordered card rather than loose rows, so it reads as one table
  /// instead of text floating under the number above it.
  Widget _breakdown(BuildContext context, L10n l10n) {
    return Container(
      decoration: BoxDecoration(
        color: context.surfaces.backgroundElevated,
        borderRadius: LdRadii.cardRadius,
        border: Border.all(color: context.surfaces.strokeOutline),
      ),
      child: Column(
        children: <Widget>[
          for (var i = 0; i < usage.byFolder.length; i++) ...<Widget>[
            if (i > 0)
              Divider(
                height: 1,
                thickness: 1,
                indent: 16,
                color: context.surfaces.strokeOutline,
              ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: <Widget>[
                  LdIcon(
                    usage.byFolder[i].nodeId.isEmpty
                        ? LdGlyph.file
                        : LdGlyph.folder,
                    size: 18,
                    color: context.surfaces.foregroundSecondary,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      usage.byFolder[i].name.isEmpty
                          ? l10n.offlineChosenIndividually
                          : usage.byFolder[i].name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Text(
                    LdFormat.bytes(context, usage.byFolder[i].bytes),
                    style: Theme.of(context).textTheme.labelSmall!.copyWith(
                          color: context.surfaces.foregroundSecondary,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _capGroup(BuildContext context, WidgetRef ref, L10n l10n) {
    return LdSettingGroup(
      title: l10n.offlineSoftCapLabel,
      children: <Widget>[
        for (final choice in OfflineSection.capChoices)
          LdRadioRow(
            label: choice == 0
                ? l10n.offlineNoLimit
                : LdFormat.bytes(context, choice),
            selected: usage.softCapBytes == choice,
            onTap: () =>
                ref.read(offlineControllerProvider.notifier).setSoftCap(choice),
          ),
      ],
    );
  }

  Future<void> _clear(BuildContext context, WidgetRef ref, L10n l10n) async {
    final confirmed = await LdBottomSheet.confirm(
      context,
      title: l10n.offlineClearAll,
      message: l10n.offlineClearAllConfirm,
      confirmLabel: l10n.actionRemove,
      cancelLabel: l10n.actionCancel,
      destructive: true,
    );
    if (!confirmed) return;
    await ref.read(offlineControllerProvider.notifier).clearAll();
    if (context.mounted) {
      LdToast.success(context, l10n.offlineCleared);
    }
  }
}

class _WebOfflineSection extends ConsumerWidget {
  const _WebOfflineSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final webOffline = ref.watch(webOfflineControllerProvider);

    return ListView(
      padding: EdgeInsets.fromLTRB(
        context.pagePadding,
        16,
        context.pagePadding,
        120,
      ),
      children: <Widget>[
        ConstrainedBox(
          constraints:
              const BoxConstraints(maxWidth: Breakpoints.contentMaxWidth),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              LdSettingGroup(
                title: l10n.offlineDownloadsTitle,
                children: <Widget>[
                  LdSettingRow(
                    label: l10n.offlineWebEnableTitle,
                    description: l10n.offlineWebEnableSubtitle,
                    glyph: LdGlyph.offlineReady,
                    trailing: LdSwitch(
                      value: webOffline.enabled,
                      onChanged: (val) => ref
                          .read(webOfflineControllerProvider.notifier)
                          .setEnabled(val),
                    ),
                    onTap: () => ref
                        .read(webOfflineControllerProvider.notifier)
                        .setEnabled(!webOffline.enabled),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              // All subsections always visible; dimmed when feature is off
              AnimatedOpacity(
                opacity: webOffline.enabled ? 1.0 : 0.4,
                duration: const Duration(milliseconds: 250),
                child: IgnorePointer(
                  ignoring: !webOffline.enabled,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      // 1. Dung luong
                      LdSettingGroup(
                        title: l10n.offlineStorageTitle,
                        children: <Widget>[
                          Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 4, vertical: 10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: <Widget>[
                                // Usage number + label
                                Text(
                                  LdFormat.bytes(
                                      context, webOffline.usageBytes),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineLarge,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  l10n.offlineStorageCachedCount(
                                      webOffline.cachedCount),
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall!
                                      .copyWith(
                                        color: context.surfaces
                                            .foregroundSecondary,
                                      ),
                                ),
                                if (webOffline.quotaBytes > 0) ...<Widget>[
                                  const SizedBox(height: 14),
                                  LdProgressBar(value: webOffline.quotaFraction),
                                  const SizedBox(height: 8),
                                  Text(
                                    l10n.offlineStorageUsed(
                                      LdFormat.bytes(
                                          context, webOffline.usageBytes),
                                      LdFormat.bytes(
                                          context, webOffline.quotaBytes),
                                    ),
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelSmall!
                                        .copyWith(
                                          color: context
                                              .surfaces.foregroundSecondary,
                                        ),
                                  ),
                                ],
                                const SizedBox(height: 14),
                                Align(
                                  alignment: AlignmentDirectional.centerStart,
                                  child: LdButton.destructive(
                                    label: l10n.offlineClearCache,
                                    glyph: LdGlyph.trash,
                                    compact: true,
                                    expand: false,
                                    onPressed: () =>
                                        _clearCache(context, ref, l10n),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      LdSettingGroup(
                        title: l10n.offlineSyncTitle,
                        children: <Widget>[
                          LdSettingRow(
                            glyph: LdGlyph.drive,
                            label: l10n.offlineSyncSmartCacheTitle,
                            description: l10n.offlineSyncSmartCacheBody,
                          ),
                          LdSettingRow(
                            glyph: LdGlyph.offlineReady,
                            label: l10n.offlineSyncBrowsingTitle,
                            description: l10n.offlineSyncBrowsingBody,
                          ),
                          LdSettingRow(
                            glyph: LdGlyph.server,
                            label: l10n.offlineSyncReconnectTitle,
                            description: l10n.offlineSyncReconnectBody,
                          ),
                          LdSettingRow(
                            glyph: LdGlyph.device,
                            label: l10n.offlineSyncPwaTitle,
                            description: l10n.offlineSyncPwaBody,
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      LdSettingGroup(
                        title: l10n.offlineSecurityTitle,
                        children: <Widget>[
                          LdSettingRow(
                            glyph: LdGlyph.lock,
                            label: l10n.offlineSecuritySandboxTitle,
                            description: l10n.offlineSecuritySandboxBody,
                          ),
                          LdSettingRow(
                            glyph: LdGlyph.logout,
                            label: l10n.offlineSecurityWipeTitle,
                            description: l10n.offlineSecurityWipeBody,
                          ),
                          LdSettingRow(
                            glyph: LdGlyph.info,
                            label: l10n.offlineSecuritySharedTitle,
                            description: l10n.offlineSecuritySharedBody,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _clearCache(
      BuildContext context, WidgetRef ref, L10n l10n) async {
    final confirmed = await LdBottomSheet.confirm(
      context,
      title: l10n.offlineClearCache,
      message: l10n.offlineClearCacheConfirm,
      confirmLabel: l10n.actionRemove,
      cancelLabel: l10n.actionCancel,
      destructive: true,
    );
    if (!confirmed) return;
    await ref.read(webOfflineControllerProvider.notifier).clearCache();
    if (context.mounted) {
      LdToast.success(context, l10n.offlineCacheCleared);
    }
  }
}
