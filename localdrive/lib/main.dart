import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/constants/ld_colors.dart';
import 'core/services/core_providers.dart';
import 'core/services/desktop_shell_service.dart';
import 'core/services/fullscreen_service.dart';
import 'core/services/secure_store_service.dart';
import 'core/widgets/ld_error_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FullscreenService.instance.init();

  // libmpv, loaded once before anything asks for a player. video_player had no
  // Windows implementation at all, and the community one handed the URL to
  // Media Foundation, which pulled the whole file down before showing a frame.
  if (!kIsWeb) {
    MediaKit.ensureInitialized();
  }

  // removes the /#/ from web urls. this is only half the fix: Caddy also
  // serves index.html for any path that is not a real asset, or a refresh on
  // /files/abc123 would 404. see the routing section of the plan.
  usePathUrlStrategy();

  // Prevent WebGL texture cache thrashing and black rectangles in CanvasKit
  // when viewing high-resolution gallery grids and file lists.
  PaintingBinding.instance.imageCache.maximumSizeBytes = 512 << 20; // 512 MB
  PaintingBinding.instance.imageCache.maximumSize = 1000;

  // Disables the browser's default right-click context menu on web so the app's
  // own file actions menu appears cleanly without being obscured.
  if (kIsWeb) {
    BrowserContextMenu.disableContextMenu();
  }

  // nothing unstyled ever reaches the screen, including the frame that a
  // widget error would otherwise paint red
  ErrorWidget.builder = (details) {
    if (kDebugMode) {
      debugPrint('widget error: ${details.exceptionAsString()}');
    }
    return const _GlobalErrorSurface();
  };

  // a desktop window is resizable and a phone is not; asking a desktop
  // platform about orientation is meaningless and throws on some of them
  if (!kIsWeb && !DesktopShellService.isDesktop) {
    await _lockOrientations();
  }

  if (!kIsWeb) {
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: LdColors.backgroundPrimary,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
    );
  }

  final prefs = await SharedPreferences.getInstance();
  runApp(
    ProviderScope(
      overrides: <Override>[
        secureStoreProvider.overrideWithValue(SecureStoreService(prefs: prefs)),
      ],
      child: const LocalDriveApp(),
    ),
  );

  // The desktop window starts hidden so there is no flash of default chrome.
  DesktopShellService.showWindow();
}

Future<void> _lockOrientations() async {
  await SystemChrome.setPreferredOrientations(<DeviceOrientation>[
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
}

/// The branded surface behind the global ErrorWidget.builder override, for an
/// error no screen anticipated. It cannot reach Localizations, since the
/// failure may be above them, so it stays wordless rather than hardcoding
/// English.
class _GlobalErrorSurface extends StatelessWidget {
  const _GlobalErrorSurface();

  @override
  Widget build(BuildContext context) {
    return const Material(
      color: LdColors.backgroundPrimary,
      child: LdErrorState(
        kind: LdErrorKind.unexpected,
        title: '',
        compact: true,
      ),
    );
  }
}
