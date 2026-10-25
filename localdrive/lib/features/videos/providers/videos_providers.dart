import 'package:flutter/foundation.dart';
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

class VideosController extends AutoDisposeAsyncNotifier<List<NodeModel>> {
  int _offset = 0;
  bool _hasMore = true;
  bool _isLoadingMore = false;
  int _totalCount = 0;

  bool get hasMore => _hasMore;
  bool get isLoadingMore => _isLoadingMore;
  int get totalCount => _totalCount;

  static int get batchSize {
    switch (defaultTargetPlatform) {
      case TargetPlatform.windows:
      case TargetPlatform.linux:
      case TargetPlatform.macOS:
        return 150;
      default:
        return 50;
    }
  }

  @override
  Future<List<NodeModel>> build() async {
    final sort = ref.watch(videosSortProvider);
    ref.keepAlive();

    _offset = 0;
    _hasMore = true;
    _isLoadingMore = false;

    final paged = await ref.watch(filesDbProvider).listPaged(
          filter: NodeFilter.video,
          sortBy: SortBy.fromWire(sort.by.wire),
          descending: sort.descending,
          limit: batchSize,
          offset: 0,
        );

    final filtered = paged.nodes.where((n) {
      final name = n.name.toLowerCase();
      return !name.endsWith('.ts') && !name.endsWith('.tsx');
    }).toList();

    _offset = paged.nextOffset;
    _hasMore = paged.hasMore;
    _totalCount = paged.total;
    videosMemoryCache = filtered;
    return filtered;
  }

  Future<void> loadMore() async {
    if (!_hasMore || _isLoadingMore) return;
    _isLoadingMore = true;

    try {
      final sort = ref.read(videosSortProvider);
      final paged = await ref.read(filesDbProvider).listPaged(
            filter: NodeFilter.video,
            sortBy: SortBy.fromWire(sort.by.wire),
            descending: sort.descending,
            limit: batchSize,
            offset: _offset,
          );

      final nextVideos = paged.nodes.where((n) {
        final name = n.name.toLowerCase();
        return !name.endsWith('.ts') && !name.endsWith('.tsx');
      }).toList();

      final current = state.value ?? <NodeModel>[];
      final seenIds = {for (final n in current) n.id};
      final combined = List<NodeModel>.of(current);
      for (final vid in nextVideos) {
        if (!seenIds.contains(vid.id)) {
          seenIds.add(vid.id);
          combined.add(vid);
        }
      }

      _offset = paged.nextOffset;
      _hasMore = paged.hasMore && nextVideos.isNotEmpty;
      _totalCount = paged.total > 0 ? paged.total : combined.length;
      videosMemoryCache = combined;
      state = AsyncData(combined);
    } catch (_) {
      // Keep existing data
    } finally {
      _isLoadingMore = false;
    }
  }
}

/// All video clips this account can reach, in an infinite streaming batch.
final videosProvider =
    AsyncNotifierProvider.autoDispose<VideosController, List<NodeModel>>(
  VideosController.new,
);
