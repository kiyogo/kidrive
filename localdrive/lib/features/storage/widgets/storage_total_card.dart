import '../../../imports.dart';
import '../../auth/controller/session_controller.dart';
import '../models/account_storage_model.dart';

class StorageTotalCard extends ConsumerWidget {
  const StorageTotalCard({super.key, required this.storage});

  final AccountStorageModel storage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final user = ref.watch(currentUserProvider);

    final quota = storage.quotaBytes > 0
        ? storage.quotaBytes
        : (storage.totalBytes > 0
            ? storage.totalBytes
            : ((user?.quotaBytes ?? 0) > 0 ? user!.quotaBytes : 0));
    final used = storage.usedBytes > 0
        ? storage.usedBytes
        : (user?.quotaBytesUsed ?? 0);
    final isUnlimited = storage.isUnlimited || quota <= 0;
    final isOverQuota = storage.isOverQuota || (!isUnlimited && quota > 0 && used > quota);
    final effectiveLimit = (isUnlimited && storage.totalBytes > 0) ? storage.totalBytes : quota;
    final free = effectiveLimit > used ? (effectiveLimit - used) : 0;
    final percent = effectiveLimit > 0 ? (used / effectiveLimit).clamp(0.0, 1.0) : 0.0;
    final isWarn = percent >= 0.90 || isOverQuota;
    const caption = 'Bộ nhớ tài khoản';

    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: context.surfaces.backgroundElevated,
        borderRadius: LdRadii.cardRadius,
        border: Border.all(
          color: isOverQuota
              ? const Color(0x66EF4444)
              : context.surfaces.strokeOutline,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isOverQuota
                      ? const Color(0x1FEF4444)
                      : LdColors.wash(LdColors.accentPrimary, 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  isOverQuota ? 'Vượt quá hạn ngạch' : caption,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: isOverQuota
                        ? const Color(0xFFEF4444)
                        : LdColors.accentPrimary,
                  ),
                ),
              ),
              Text(
                isUnlimited
                    ? 'Gói Không giới hạn'
                    : '${l10n.storage} ${LdFormat.bytes(context, effectiveLimit)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: isOverQuota
                          ? const Color(0xFFEF4444)
                          : context.surfaces.foregroundSecondary,
                      fontWeight: FontWeight.w500,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: <Widget>[
              Text(
                LdFormat.bytes(context, used),
                style: Theme.of(context).textTheme.displayLarge?.copyWith(
                      fontSize: 34,
                      fontWeight: FontWeight.w800,
                      color: isOverQuota ? const Color(0xFFEF4444) : null,
                    ),
              ),
              const SizedBox(width: 8),
              Text(
                effectiveLimit > 0
                    ? '/ ${LdFormat.bytes(context, effectiveLimit)}'
                    : (isUnlimited ? '/ Không giới hạn' : ''),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: isOverQuota
                          ? const Color(0xFFEF4444)
                          : context.surfaces.foregroundSecondary,
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Progress Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Container(
              height: 10,
              width: double.infinity,
              color: context.surfaces.backgroundSunken,
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: isOverQuota ? 1.0 : percent.clamp(used > 0 ? 0.01 : 0.0, 1.0),
                child: Container(
                  decoration: BoxDecoration(
                    color: isOverQuota
                        ? const Color(0xFFEF4444)
                        : (isWarn
                            ? LdColors.accentWarning
                            : LdColors.accentPrimary),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Text(
                l10n.sidebarStorageUsed(LdFormat.bytes(context, used)),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: context.surfaces.foregroundSecondary,
                      fontWeight: FontWeight.w500,
                    ),
              ),
              Text(
                isOverQuota
                    ? l10n.sidebarStorageFree('0 B')
                    : l10n.sidebarStorageFree(LdFormat.bytes(context, free)),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: isOverQuota
                          ? const Color(0xFFEF4444)
                          : context.surfaces.foregroundSecondary,
                      fontWeight: FontWeight.w500,
                    ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
