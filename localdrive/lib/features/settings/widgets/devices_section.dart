import '../../../imports.dart';
import '../../auth/controller/session_controller.dart';
import '../../auth/models/user_model.dart';

final _sessionsProvider = FutureProvider.autoDispose<List<SessionModel>>((ref) {
  return ref.watch(authDbProvider).sessions();
});

class DevicesSection extends ConsumerWidget {
  const DevicesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final sessions = ref.watch(_sessionsProvider);

    return LdRefresh(
      onRefresh: () async {
        ref.invalidate(_sessionsProvider);
        await ref.read(_sessionsProvider.future);
      },
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          context.pagePadding,
          16,
          context.pagePadding,
          120,
        ),
        children: <Widget>[
          LdAsync<List<SessionModel>>(
            value: sessions,
            errorCopy: LdFormat.errorCopy(context),
            onRetry: () => ref.invalidate(_sessionsProvider),
            loading: const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: LdSpinner()),
            ),
            isEmpty: (list) => list.isEmpty,
            empty: () => LdEmptyState(
              title: l10n.emptyDevicesTitle,
              glyph: LdGlyph.device,
              compact: true,
            ),
            data: (list) => Column(
              children: <Widget>[
                for (final device in list.where((s) => !s.isPending))
                  LdNodeListItem(
                    title: device.deviceName,
                    subtitle: l10n.devicesLastSeen(
                      LdFormat.relative(context, device.lastSeenAt),
                    ),
                    glyph: LdGlyph.device,
                    status: device.current ? l10n.devicesThisDevice : null,
                    statusColor: LdColors.accentPrimary,
                    primaryAction: device.current
                        ? null
                        : LdButton.secondary(
                            label: l10n.devicesRevoke,
                            compact: true,
                            onPressed: () async {
                              await ref
                                  .read(authDbProvider)
                                  .revokeSession(device.id);
                              ref.invalidate(_sessionsProvider);
                            },
                          ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
