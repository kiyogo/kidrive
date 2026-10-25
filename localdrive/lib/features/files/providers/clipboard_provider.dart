import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/node_model.dart';

enum ClipboardAction { cut, copy }

class ClipboardState {
  const ClipboardState({required this.action, required this.nodes});
  final ClipboardAction action;
  final List<NodeModel> nodes;
}

class ClipboardNotifier extends Notifier<ClipboardState?> {
  @override
  ClipboardState? build() => null;

  void cut(List<NodeModel> nodes) {
    state = ClipboardState(action: ClipboardAction.cut, nodes: nodes);
  }

  void copy(List<NodeModel> nodes) {
    state = ClipboardState(action: ClipboardAction.copy, nodes: nodes);
  }

  void clear() {
    state = null;
  }
}

final fileClipboardProvider =
    NotifierProvider<ClipboardNotifier, ClipboardState?>(ClipboardNotifier.new);
