import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/storage_keys.dart';
import '../../../core/db/local_db.dart';
import '../../../core/services/core_providers.dart';
import '../web/web_offline_helper.dart';

class WebOfflineState {
  const WebOfflineState({
    required this.enabled,
    required this.cachedCount,
    required this.usageBytes,
    required this.quotaBytes,
    required this.loading,
  });

  final bool enabled;
  final int cachedCount;
  final int usageBytes;
  final int quotaBytes;
  final bool loading;

  double get quotaFraction =>
      quotaBytes <= 0 ? 0.0 : (usageBytes / quotaBytes).clamp(0.0, 1.0);

  WebOfflineState copyWith({
    bool? enabled,
    int? cachedCount,
    int? usageBytes,
    int? quotaBytes,
    bool? loading,
  }) {
    return WebOfflineState(
      enabled: enabled ?? this.enabled,
      cachedCount: cachedCount ?? this.cachedCount,
      usageBytes: usageBytes ?? this.usageBytes,
      quotaBytes: quotaBytes ?? this.quotaBytes,
      loading: loading ?? this.loading,
    );
  }

  static const WebOfflineState initial = WebOfflineState(
    enabled: false,
    cachedCount: 0,
    usageBytes: 0,
    quotaBytes: 0,
    loading: true,
  );
}

class WebOfflineController extends Notifier<WebOfflineState> {
  LocalDb get _db => ref.read(localDbProvider);

  @override
  WebOfflineState build() {
    state = WebOfflineState.initial;
    unawaited(_load());
    return state;
  }

  Future<void> _load() async {
    final raw = await ref
        .read(secureStoreProvider)
        .readString(StorageKeys.webOfflineEnabled);
    final enabled = raw == 'true';

    var cachedCount = 0;
    try {
      cachedCount = (await _db.select(_db.cachedNodes).get()).length;
    } catch (_) {}

    final quota = await getWebStorageQuota();

    state = WebOfflineState(
      enabled: enabled,
      cachedCount: cachedCount,
      usageBytes: quota.usageBytes,
      quotaBytes: quota.quotaBytes,
      loading: false,
    );
  }

  Future<void> refresh() => _load();

  Future<void> setEnabled(bool value) async {
    state = state.copyWith(enabled: value);
    await ref
        .read(secureStoreProvider)
        .writeString(StorageKeys.webOfflineEnabled, value ? 'true' : 'false');
    await updateWebOfflineServiceWorker(value);
    await _load();
  }

  Future<void> clearCache() async {
    await _db.wipe();
    await clearBrowserCaches();
    await _load();
  }
}

final webOfflineControllerProvider =
    NotifierProvider<WebOfflineController, WebOfflineState>(
  WebOfflineController.new,
);
