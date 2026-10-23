import 'dart:async';
import 'dart:ffi';
import 'dart:io' show Platform;
import 'dart:typed_data';

import 'package:bitsdojo_window/bitsdojo_window.dart';
import 'package:ffi/ffi.dart';
import 'package:flutter/services.dart';

import 'desktop_shell_service.dart';

// Native function definitions for user32.dll
typedef _GetWindowPlacementNative = Int32 Function(IntPtr hWnd, Pointer<Uint8> lpwndpl);
typedef _GetWindowPlacementDart = int Function(int hWnd, Pointer<Uint8> lpwndpl);

typedef _SetWindowPlacementNative = Int32 Function(IntPtr hWnd, Pointer<Uint8> lpwndpl);
typedef _SetWindowPlacementDart = int Function(int hWnd, Pointer<Uint8> lpwndpl);

typedef _MonitorFromWindowNative = IntPtr Function(IntPtr hwnd, Uint32 dwFlags);
typedef _MonitorFromWindowDart = int Function(int hwnd, int dwFlags);

typedef _GetMonitorInfoWNative = Int32 Function(IntPtr hMonitor, Pointer<Uint8> lpmi);
typedef _GetMonitorInfoWDart = int Function(int hMonitor, Pointer<Uint8> lpmi);

typedef _SetWindowPosNative = Int32 Function(
    IntPtr hWnd, IntPtr hWndInsertAfter, Int32 X, Int32 Y, Int32 cx, Int32 cy, Uint32 uFlags);
typedef _SetWindowPosDart = int Function(
    int hWnd, int hWndInsertAfter, int X, int Y, int cx, int cy, int uFlags);

class FullscreenService {
  FullscreenService._();
  static final FullscreenService instance = FullscreenService._();

  final _controller = StreamController<bool>.broadcast();
  Stream<bool> get onFullscreenChange => _controller.stream;

  bool _isFullscreen = false;
  bool _wasMaximized = false;
  bool _initialized = false;

  Pointer<Uint8>? _savedPlacement;
  DynamicLibrary? _user32;
  _GetWindowPlacementDart? _getWindowPlacement;
  _SetWindowPlacementDart? _setWindowPlacement;
  _MonitorFromWindowDart? _monitorFromWindow;
  _GetMonitorInfoWDart? _getMonitorInfoW;
  _SetWindowPosDart? _setWindowPos;

  bool get isFullscreen => _isFullscreen;

  void init() {
    if (_initialized) return;
    _initialized = true;

    if (Platform.isWindows) {
      try {
        _user32 = DynamicLibrary.open('user32.dll');
        _getWindowPlacement = _user32!.lookupFunction<_GetWindowPlacementNative, _GetWindowPlacementDart>('GetWindowPlacement');
        _setWindowPlacement = _user32!.lookupFunction<_SetWindowPlacementNative, _SetWindowPlacementDart>('SetWindowPlacement');
        _monitorFromWindow = _user32!.lookupFunction<_MonitorFromWindowNative, _MonitorFromWindowDart>('MonitorFromWindow');
        _getMonitorInfoW = _user32!.lookupFunction<_GetMonitorInfoWNative, _GetMonitorInfoWDart>('GetMonitorInfoW');
        _setWindowPos = _user32!.lookupFunction<_SetWindowPosNative, _SetWindowPosDart>('SetWindowPos');
      } catch (_) {}
    }

    HardwareKeyboard.instance.addHandler(_handleKeyEvent);
  }

  bool _handleKeyEvent(KeyEvent event) {
    if (event is! KeyDownEvent) return false;

    if (event.logicalKey == LogicalKeyboardKey.f11) {
      unawaited(toggleFullscreen());
      return true;
    }

    if (event.logicalKey == LogicalKeyboardKey.escape && _isFullscreen) {
      unawaited(exitFullscreen());
      return true;
    }

    return false;
  }

  void dispose() {
    HardwareKeyboard.instance.removeHandler(_handleKeyEvent);
    if (_savedPlacement != null) {
      calloc.free(_savedPlacement!);
      _savedPlacement = null;
    }
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
    if (_isFullscreen) return;
    _isFullscreen = true;
    _controller.add(true);

    try {
      if (Platform.isAndroid || Platform.isIOS) {
        await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      } else if (Platform.isWindows && DesktopShellService.hasWindow) {
        final hwnd = appWindow.handle;
        if (hwnd != null &&
            _setWindowPos != null &&
            _getMonitorInfoW != null &&
            _monitorFromWindow != null &&
            _getWindowPlacement != null) {
          _wasMaximized = appWindow.isMaximized;
          // Save current placement (sizeof(WINDOWPLACEMENT) = 44)
          _savedPlacement ??= calloc<Uint8>(44);
          _savedPlacement!.asTypedList(44).buffer.asByteData().setUint32(0, 44, Endian.little);
          _getWindowPlacement!(hwnd, _savedPlacement!);

          // Get monitor rect (sizeof(MONITORINFO) = 40)
          final hMonitor = _monitorFromWindow!(hwnd, 2 /* MONITOR_DEFAULTTONEAREST */);
          final mi = calloc<Uint8>(40);
          mi.asTypedList(40).buffer.asByteData().setUint32(0, 40, Endian.little);
          if (_getMonitorInfoW!(hMonitor, mi) != 0) {
            final bd = mi.asTypedList(40).buffer.asByteData();
            final left = bd.getInt32(4, Endian.little);
            final top = bd.getInt32(8, Endian.little);
            final right = bd.getInt32(12, Endian.little);
            final bottom = bd.getInt32(16, Endian.little);
            final width = right - left;
            final height = bottom - top;

            _setWindowPos!(hwnd, 0, left, top, width, height, 0x0040 /* SWP_SHOWWINDOW */ | 0x0020 /* SWP_FRAMECHANGED */);
          }
          calloc.free(mi);
        } else {
          _wasMaximized = appWindow.isMaximized;
          if (!appWindow.isMaximized) {
            appWindow.maximize();
          }
        }
      } else if (DesktopShellService.hasWindow) {
        _wasMaximized = appWindow.isMaximized;
        if (!appWindow.isMaximized) {
          appWindow.maximize();
        }
      }
    } catch (_) {}
  }

  Future<void> exitFullscreen() async {
    if (!_isFullscreen) return;
    _isFullscreen = false;
    _controller.add(false);

    try {
      if (Platform.isAndroid || Platform.isIOS) {
        await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      } else if (Platform.isWindows && DesktopShellService.hasWindow && _savedPlacement != null && _setWindowPlacement != null) {
        final hwnd = appWindow.handle;
        if (hwnd != null) {
          _setWindowPlacement!(hwnd, _savedPlacement!);
          _setWindowPos?.call(hwnd, 0, 0, 0, 0, 0, 0x0001 /* SWP_NOSIZE */ | 0x0002 /* SWP_NOMOVE */ | 0x0020 /* SWP_FRAMECHANGED */);
          calloc.free(_savedPlacement!);
          _savedPlacement = null;
        }
      } else if (DesktopShellService.hasWindow) {
        if (!_wasMaximized && appWindow.isMaximized) {
          appWindow.restore();
        }
      }
    } catch (_) {}
  }
}
