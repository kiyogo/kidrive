import 'dart:async';
import 'dart:js_interop';
import 'package:web/web.dart' as web;

class FullscreenService {
  FullscreenService._();
  static final FullscreenService instance = FullscreenService._();

  final _controller = StreamController<bool>.broadcast();
  Stream<bool> get onFullscreenChange => _controller.stream;

  JSFunction? _listener;
  JSFunction? _keyListener;

  bool get isFullscreen {
    try {
      return web.document.fullscreenElement != null;
    } catch (_) {
      return false;
    }
  }

  void init() {
    if (_listener == null) {
      _listener = ((web.Event _) {
        _controller.add(isFullscreen);
      }).toJS;
      web.document.addEventListener('fullscreenchange', _listener!);
      web.document.addEventListener('webkitfullscreenchange', _listener!);
    }

    if (_keyListener == null) {
      _keyListener = ((web.KeyboardEvent event) {
        if (event.key == 'F11') {
          event.preventDefault();
          unawaited(toggleFullscreen());
        }
      }).toJS;
      web.window.addEventListener('keydown', _keyListener!);
    }
  }

  void dispose() {
    if (_listener != null) {
      web.document.removeEventListener('fullscreenchange', _listener!);
      web.document.removeEventListener('webkitfullscreenchange', _listener!);
      _listener = null;
    }
    if (_keyListener != null) {
      web.window.removeEventListener('keydown', _keyListener!);
      _keyListener = null;
    }
    _controller.close();
  }

  Future<void> toggleFullscreen() async {
    try {
      if (isFullscreen) {
        web.document.exitFullscreen();
      } else {
        web.document.documentElement?.requestFullscreen();
      }
    } catch (_) {}
  }

  Future<void> enterFullscreen() async {
    try {
      if (!isFullscreen) {
        web.document.documentElement?.requestFullscreen();
      }
    } catch (_) {}
  }

  Future<void> exitFullscreen() async {
    try {
      if (isFullscreen) {
        web.document.exitFullscreen();
      }
    } catch (_) {}
  }
}
