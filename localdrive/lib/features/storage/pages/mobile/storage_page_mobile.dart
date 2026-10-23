import '../../../../imports.dart';
import '../../providers/storage_providers.dart';
import '../../widgets/account_breakdown_section.dart';
import '../../widgets/storage_total_card.dart';

/// Storage page on mobile: clean Account Storage Dashboard with quota,
/// progress bar, file category breakdown, and plan status.
class StoragePageMobile extends ConsumerWidget {
  const StoragePageMobile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final storageAsync = ref.watch(accountStorageProvider);

    return Column(
      children: <Widget>[
        LdPageHeader(
          title: l10n.storage,
          onBack: () => context.go(Routes.settings),
        ),
        Expanded(
          child: LdRefresh(
            onRefresh: () async {
              ref.invalidate(accountStorageProvider);
              await ref.read(accountStorageProvider.future);
            },
            child: LdAsync<AccountStorageModel>(
              value: storageAsync,
              errorCopy: LdFormat.errorCopy(context),
              onRetry: () => ref.invalidate(accountStorageProvider),
              loading: const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: LdSpinner()),
              ),
              data: (storage) => ListView(
                padding: EdgeInsets.fromLTRB(
                  context.pagePadding,
                  0,
                  context.pagePadding,
                  120,
                ),
                children: <Widget>[
                  StorageTotalCard(storage: storage),
                  const SizedBox(height: 20),
                  AccountBreakdownSection(storage: storage),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
