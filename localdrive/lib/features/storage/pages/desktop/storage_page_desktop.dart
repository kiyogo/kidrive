import '../../../../imports.dart';
import '../../providers/storage_providers.dart';
import '../../widgets/account_breakdown_section.dart';
import '../../widgets/storage_total_card.dart';

/// Storage page on desktop: clean Account Storage Dashboard with quota,
/// progress bar, file category breakdown, and plan status.
class StoragePageDesktop extends ConsumerWidget {
  const StoragePageDesktop({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final storageAsync = ref.watch(accountStorageProvider);

    return LdDesktopScaffold(
      title: l10n.storage,
      actions: <Widget>[
        LdUtilityButton(
          glyph: LdGlyph.refresh,
          tooltip: l10n.actionRefresh,
          onPressed: () {
            ref.invalidate(accountStorageProvider);
          },
        ),
      ],
      body: LdAsync<AccountStorageModel>(
        value: storageAsync,
        errorCopy: LdFormat.errorCopy(context),
        onRetry: () => ref.invalidate(accountStorageProvider),
        loading: const Padding(
          padding: EdgeInsets.symmetric(vertical: 40),
          child: Center(child: LdSpinner()),
        ),
        data: (storage) => SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 960),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  StorageTotalCard(storage: storage),
                  const SizedBox(height: 20),
                  AccountBreakdownSection(storage: storage),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
