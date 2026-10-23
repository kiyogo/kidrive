class CategoryStat {
  const CategoryStat({this.bytes = 0, this.count = 0});

  final int bytes;
  final int count;

  factory CategoryStat.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const CategoryStat();
    return CategoryStat(
      bytes: (json['bytes'] as num?)?.toInt() ?? 0,
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }
}

class AccountStorageModel {
  const AccountStorageModel({
    required this.quotaBytes,
    required this.usedBytes,
    required this.freeBytes,
    required this.usagePercent,
    this.serverTotalUsed = 0,
    required this.images,
    required this.videos,
    required this.documents,
    required this.audio,
    required this.other,
    required this.trash,
  });

  final int quotaBytes;
  final int usedBytes;
  final int freeBytes;
  final double usagePercent;
  final int serverTotalUsed;
  final CategoryStat images;
  final CategoryStat videos;
  final CategoryStat documents;
  final CategoryStat audio;
  final CategoryStat other;
  final CategoryStat trash;

  factory AccountStorageModel.fromJson(Map<String, dynamic> json) {
    final cats = json['categories'] as Map<String, dynamic>? ?? {};
    return AccountStorageModel(
      quotaBytes: (json['quota_bytes'] as num?)?.toInt() ?? (10 * 1024 * 1024 * 1024),
      usedBytes: (json['used_bytes'] as num?)?.toInt() ?? 0,
      freeBytes: (json['free_bytes'] as num?)?.toInt() ?? (10 * 1024 * 1024 * 1024),
      usagePercent: (json['usage_percent'] as num?)?.toDouble() ?? 0.0,
      serverTotalUsed: (json['server_total_used'] as num?)?.toInt() ?? 0,
      images: CategoryStat.fromJson(cats['images'] as Map<String, dynamic>?),
      videos: CategoryStat.fromJson(cats['videos'] as Map<String, dynamic>?),
      documents: CategoryStat.fromJson(cats['documents'] as Map<String, dynamic>?),
      audio: CategoryStat.fromJson(cats['audio'] as Map<String, dynamic>?),
      other: CategoryStat.fromJson(cats['other'] as Map<String, dynamic>?),
      trash: CategoryStat.fromJson(cats['trash'] as Map<String, dynamic>?),
    );
  }
}
