class WebQuotaInfo {
  const WebQuotaInfo({
    required this.usageBytes,
    required this.quotaBytes,
  });

  final int usageBytes;
  final int quotaBytes;
}

Future<WebQuotaInfo> getWebStorageQuota() async =>
    const WebQuotaInfo(usageBytes: 0, quotaBytes: 0);

Future<void> updateWebOfflineServiceWorker(bool enabled) async {}

Future<void> clearBrowserCaches() async {}
