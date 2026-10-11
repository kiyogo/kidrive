import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/services.dart';

class FullscreenService {
  FullscreenService._();
  static final FullscreenService instance = FullscreenService._();

  final _controller = StreamController<bool>.broadcast();
  Stream<bool> get onFullscreenChange => _controller.stream;

  bool _isFullscreen = false;

  bool get isFullscreen => _isFullscreen;

  void init() {}

  void dispose() {
    _controller.close();
  }

  Future<void> toggleFullscreen() async {
    if (_isFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }

  Future<void> enterFullscreen() async {
    _isFullscreen = true;
    _controller.add(true);
    try {
      if (Platform.isAndroid || Platform.isIOS) {
        await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      }
    } catch (_) {}
  }

  Future<void> exitFullscreen() async {
    _isFullscreen = false;
    _controller.add(false);
    try {
      if (Platform.isAndroid || Platform.isIOS) {
        await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      }
    } catch (_) {}
  }
}
