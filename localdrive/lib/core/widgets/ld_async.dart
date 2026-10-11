import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'ld_empty_state.dart';
import 'ld_error_state.dart';
import 'ld_icons.dart';
import 'ld_spinner.dart';

/// Renders an AsyncValue exhaustively, every time.
///
/// The error branch is always LdErrorState with a real retry, and an empty
/// data branch is always LdEmptyState. This widget exists so no screen can
/// quietly skip either one.
class LdAsync<T> extends StatefulWidget {
  const LdAsync({
    super.key,
    required this.value,
    required this.data,
    required this.errorCopy,
    required this.onRetry,
    this.loading,
    this.isEmpty,
    this.empty,
    this.compact = false,
    this.skipLoadingOnRefresh = true,
    this.loadingDebounce = const Duration(milliseconds: 120),
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;

  /// localized copy, handed in so this widget holds no English
  final LdErrorCopy errorCopy;
  final VoidCallback onRetry;
  final Widget? loading;

  /// what counts as nothing to show for this particular T
  final bool Function(T data)? isEmpty;
  final Widget Function()? empty;
  final bool compact;
  final bool skipLoadingOnRefresh;
  final Duration loadingDebounce;

  @override
  State<LdAsync<T>> createState() => _LdAsyncState<T>();
}

class _LdAsyncState<T> extends State<LdAsync<T>> {
  Timer? _debounceTimer;
  bool _showLoading = false;

  @override
  void initState() {
    super.initState();
    _handleValue(widget.value);
  }

  @override
  void didUpdateWidget(covariant LdAsync<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _handleValue(widget.value);
    }
  }

  void _handleValue(AsyncValue<T> val) {
    if (val.hasValue || val.hasError) {
      _debounceTimer?.cancel();
      _debounceTimer = null;
      _showLoading = false;
      return;
    }

    if (widget.loadingDebounce == Duration.zero) {
      _showLoading = true;
    } else if (!_showLoading && _debounceTimer == null) {
      _debounceTimer = Timer(widget.loadingDebounce, () {
        if (mounted) {
          setState(() {
            _showLoading = true;
          });
        }
      });
    }
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _debounceTimer = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final value = widget.value;

    if (value.hasValue) {
      final result = value.value;
      if (result != null) {
        if (widget.isEmpty != null && widget.isEmpty!(result as T)) {
          return widget.empty?.call() ??
              LdEmptyState(
                title: widget.errorCopy.title(LdErrorKind.notFound),
                glyph: LdGlyph.folder,
                compact: widget.compact,
              );
        }
        return widget.data(result as T);
      }
      return widget.empty?.call() ??
          LdEmptyState(
            title: widget.errorCopy.title(LdErrorKind.notFound),
            glyph: LdGlyph.folder,
            compact: widget.compact,
          );
    }

    if (value.hasError) {
      return LdErrorState.from(
        value.error!,
        copy: widget.errorCopy,
        onRetry: widget.onRetry,
        compact: widget.compact,
      );
    }

    if (!_showLoading) {
      return const SizedBox.shrink();
    }

    return widget.loading ?? const Center(child: LdSpinner());
  }
}

/// A slim variant for something inline, such as a count in a header, where a
/// full error state would be out of scale.
class LdAsyncInline<T> extends StatelessWidget {
  const LdAsyncInline({
    super.key,
    required this.value,
    required this.data,
    this.fallback = const SizedBox.shrink(),
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final Widget fallback;

  @override
  Widget build(BuildContext context) => value.maybeWhen(
        data: data,
        orElse: () => fallback,
      );
}
