import 'dart:js_interop';
import 'package:web/web.dart' as web;

class WebQuotaInfo {
  const WebQuotaInfo({
    required this.usageBytes,
    required this.quotaBytes,
  });

  final int usageBytes;
  final int quotaBytes;
}

Future<WebQuotaInfo> getWebStorageQuota() async {
  try {
    final storage = web.window.navigator.storage;
    final estimate = await storage.estimate().toDart;
    final usage = estimate.usage;
    final quota = estimate.quota;
    return WebQuotaInfo(
      usageBytes: usage.toInt(),
      quotaBytes: quota.toInt(),
    );
  } catch (_) {
    return const WebQuotaInfo(usageBytes: 0, quotaBytes: 0);
  }
}

Future<void> updateWebOfflineServiceWorker(bool enabled) async {
  try {
    final sw = web.window.navigator.serviceWorker;
    if (enabled) {
      await sw.register('ld_sw.js'.toJS).toDart;
    } else {
      final registrations = await sw.getRegistrations().toDart;
      for (var i = 0; i < registrations.length; i++) {
        final reg = registrations[i];
        await reg.unregister().toDart;
      }
      await clearBrowserCaches();
    }
  } catch (_) {}
}

Future<void> clearBrowserCaches() async {
  try {
    final caches = web.window.caches;
    final keys = await caches.keys().toDart;
    for (var i = 0; i < keys.length; i++) {
      final key = keys[i];
      await caches.delete(key.toDart).toDart;
    }
  } catch (_) {}
}
