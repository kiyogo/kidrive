import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_endpoints.dart';
import '../../../core/constants/storage_keys.dart';
import '../../../core/enums/file_category.dart';
import '../../../core/services/core_providers.dart';
import '../../files/models/node_model.dart';
import '../../files/providers/files_providers.dart';

/// How the videos list is ordered.
enum VideosSort {
  added('created'),
  modified('updated'),
  name('name'),
  size('size');

  const VideosSort(this.wire);

  final String wire;

  static VideosSort fromWire(String? raw) => VideosSort.values.firstWhere(
    (sort) => sort.wire == raw,
    orElse: () => VideosSort.added,
  );

  bool get defaultDescending => this != VideosSort.name;
}

/// The current ordering for videos, remembered per device.
class VideosSortController
    extends Notifier<({VideosSort by, bool descending})> {
  @override
  ({VideosSort by, bool descending}) build() {
    _restore();
    return (by: VideosSort.added, descending: true);
  }

  Future<void> _restore() async {
    final store = ref.read(secureStoreProvider);
    final saved = await store.readString(StorageKeys.videosSort);
    if (saved == null || saved.isEmpty) return;
    final by = VideosSort.fromWire(saved);
    state = (
      by: by,
      descending: await store.readBool(StorageKeys.videosSortDescending),
    );
  }

  Future<void> set(VideosSort by) async {
    final descending = state.by == by
        ? !state.descending
        : by.defaultDescending;
    state = (by: by, descending: descending);

    final store = ref.read(secureStoreProvider);
    await store.writeString(StorageKeys.videosSort, by.wire);
    await store.writeBool(StorageKeys.videosSortDescending, descending);
  }
}

final videosSortProvider =
    NotifierProvider<VideosSortController, ({VideosSort by, bool descending})>(
      VideosSortController.new,
    );

List<NodeModel>? videosMemoryCache;

/// All video clips this account can reach, in one flat stream.
final videosProvider = FutureProvider.autoDispose<List<NodeModel>>((ref) async {
  final sort = ref.watch(videosSortProvider);
  ref.keepAlive();

  final list = await ref
      .watch(filesDbProvider)
      .list(
        filter: NodeFilter.video,
        sortBy: SortBy.fromWire(sort.by.wire),
        descending: sort.descending,
        limit: 100000,
      );
  videosMemoryCache = list;
  return list;
});
