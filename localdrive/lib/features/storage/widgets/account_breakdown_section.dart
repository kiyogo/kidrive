import '../../../../imports.dart';
import '../../auth/controller/session_controller.dart';
import '../models/account_storage_model.dart';

class AccountBreakdownSection extends ConsumerWidget {
  const AccountBreakdownSection({super.key, required this.storage});

  final AccountStorageModel storage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final isDesktop = context.isDesktop;

    final items = [
      _CategoryItem(
        label: 'Hình ảnh',
        glyph: LdGlyph.image,
        bytes: storage.images.bytes,
        count: storage.images.count,
        color: const Color(0xFF3B82F6),
        bg: const Color(0x1F3B82F6),
      ),
      _CategoryItem(
        label: 'Video',
        glyph: LdGlyph.video,
        bytes: storage.videos.bytes,
        count: storage.videos.count,
        color: const Color(0xFF8B5CF6),
        bg: const Color(0x1F8B5CF6),
      ),
      _CategoryItem(
        label: 'Tài liệu',
        glyph: LdGlyph.file,
        bytes: storage.documents.bytes,
        count: storage.documents.count,
        color: const Color(0xFFF59E0B),
        bg: const Color(0x1FF59E0B),
      ),
      _CategoryItem(
        label: 'Âm thanh',
        glyph: LdGlyph.music,
        bytes: storage.audio.bytes,
        count: storage.audio.count,
        color: const Color(0xFF10B981),
        bg: const Color(0x1F10B981),
      ),
      _CategoryItem(
        label: 'Tệp khác',
        glyph: LdGlyph.folder,
        bytes: storage.other.bytes,
        count: storage.other.count,
        color: const Color(0xFF64748B),
        bg: const Color(0x1F64748B),
      ),
      _CategoryItem(
        label: 'Thùng rác',
        glyph: LdGlyph.trash,
        bytes: storage.trash.bytes,
        count: storage.trash.count,
        color: const Color(0xFFEF4444),
        bg: const Color(0x1FEF4444),
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Text(
            'Chi tiết lưu trữ theo loại tệp',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: context.surfaces.foregroundSecondary,
            ),
          ),
        ),
        GridView.builder(
          physics: const NeverScrollableScrollPhysics(),
          shrinkWrap: true,
          itemCount: items.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: isDesktop ? 3 : 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            mainAxisExtent: 74,
          ),
          itemBuilder: (context, index) {
            final item = items[index];
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: context.surfaces.backgroundElevated,
                borderRadius: LdRadii.cardRadius,
                border: Border.all(color: context.surfaces.strokeOutline),
              ),
              child: Row(
                children: <Widget>[
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: item.bg,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Center(
                      child: LdIcon(
                        item.glyph,
                        size: 20,
                        color: item.color,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        Text(
                          item.label,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${LdFormat.bytes(context, item.bytes)}, ${item.count} tệp',
                          style: TextStyle(
                            fontSize: 11,
                            color: context.surfaces.foregroundSecondary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        ),
        const SizedBox(height: 20),
        // Account Details Card
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: context.surfaces.backgroundElevated,
            borderRadius: LdRadii.cardRadius,
            border: Border.all(color: context.surfaces.strokeOutline),
          ),
          child: Row(
            children: <Widget>[
              LdAvatar(
                name: user?.displayName.isNotEmpty == true
                    ? user!.displayName
                    : (user?.username ?? 'Admin'),
                seed: user?.avatarSeed ?? '',
                size: 44,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      user?.displayName.isNotEmpty == true
                          ? user!.displayName
                          : (user?.username ?? 'Tài khoản'),
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '@${user?.username ?? 'admin'}, ${user?.isAdmin == true ? 'Quản trị viên' : 'Thành viên'}',
                      style: TextStyle(
                        fontSize: 12,
                        color: context.surfaces.foregroundSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0x1810B981),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Container(
                      width: 7,
                      height: 7,
                      decoration: const BoxDecoration(
                        color: Color(0xFF10B981),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Text(
                      'Đồng bộ an toàn',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF10B981),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CategoryItem {
  const _CategoryItem({
    required this.label,
    required this.glyph,
    required this.bytes,
    required this.count,
    required this.color,
    required this.bg,
  });

  final String label;
  final LdGlyph glyph;
  final int bytes;
  final int count;
  final Color color;
  final Color bg;
}
