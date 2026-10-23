import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:localdrive/features/files/widgets/desktop/marquee_selection.dart';

void main() {
  testWidgets('a drag on the scrollbar gutter does not start a marquee',
      (tester) async {
    bool marqueeStarted = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MarqueeSelection(
            onChanged: (ids, additive) => marqueeStarted = true,
            onStart: () => marqueeStarted = true,
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              itemCount: 50,
              itemBuilder: (context, index) => MarqueeItem(
                id: 'item_$index',
                child: SizedBox(
                  height: 50,
                  child: Text('Item $index'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    // Drag on the right edge where the scrollbar gutter sits
    final scrollGesture = await tester.startGesture(
      const Offset(795, 50),
      kind: PointerDeviceKind.mouse,
    );
    await tester.pump();
    await scrollGesture.moveBy(const Offset(0, 100));
    await tester.pump();
    await scrollGesture.up();
    await tester.pumpAndSettle();

    expect(marqueeStarted, isFalse,
        reason: 'Dragging the scrollbar must not trigger marquee selection');

    // Drag on empty space inside the listing
    final marqueeGesture = await tester.startGesture(
      const Offset(10, 50),
      kind: PointerDeviceKind.mouse,
    );
    await tester.pump();
    await marqueeGesture.moveBy(const Offset(50, 50));
    await tester.pump();
    await marqueeGesture.up();
    await tester.pumpAndSettle();

    expect(marqueeStarted, isTrue,
        reason: 'Dragging on empty space should start marquee selection');
  });

  testWidgets('marquee selects multiple grid items it overlaps', (tester) async {
    Set<String> selectedIds = <String>{};
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MarqueeSelection(
            onChanged: (ids, additive) => selectedIds = ids,
            onStart: () => selectedIds = <String>{},
            child: GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
                childAspectRatio: 1.0,
              ),
              itemCount: 2,
              itemBuilder: (context, index) => MarqueeItem(
                id: 'item_$index',
                child: Container(
                  color: Colors.blue,
                  child: Text('Item $index'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    // Initial pump
    await tester.pumpAndSettle();

    // Drag from empty space at bottom across both items (from x=600 to x=200, covering item_0 at 16..392 and item_1 at 408..784)
    final gesture = await tester.startGesture(
      const Offset(600, 500),
      kind: PointerDeviceKind.mouse,
    );
    await tester.pump();
    await gesture.moveTo(const Offset(200, 50));
    await tester.pump();
    
    // Find render boxes of items
    final item0Finder = find.text('Item 0');
    final item1Finder = find.text('Item 1');
    final render0 = tester.renderObject(item0Finder) as RenderBox;
    final render1 = tester.renderObject(item1Finder) as RenderBox;
    expect(render0.hasSize, isTrue);
    expect(render1.hasSize, isTrue);
    await gesture.up();
    await tester.pumpAndSettle();

    expect(selectedIds, containsAll(<String>['item_0', 'item_1']));
  });

  testWidgets('marquee selection works when parent rebuilds dynamically on selection change', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: _DynamicGridTestWidget(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Drag from empty space across both items
    final gesture = await tester.startGesture(
      const Offset(600, 500),
      kind: PointerDeviceKind.mouse,
    );
    await tester.pump();
    await gesture.moveTo(const Offset(200, 50));
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();

    final state = tester.state<_DynamicGridTestWidgetState>(find.byType(_DynamicGridTestWidget));
    expect(state.selection, containsAll(<String>['item_0', 'item_1']));
  });

  testWidgets('MarqueeItem updates registry when widget.id changes (didUpdateWidget)', (tester) async {
    Set<String> selected = <String>{};
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: _ReorderableMarqueeWidget(
            onChanged: (ids) => selected = ids,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Reorder/change IDs
    final state = tester.state<_ReorderableMarqueeWidgetState>(find.byType(_ReorderableMarqueeWidget));
    state.updateIds(<String>['file_alpha', 'file_beta']);
    await tester.pumpAndSettle();

    // Drag marquee across both
    final gesture = await tester.startGesture(
      const Offset(600, 500),
      kind: PointerDeviceKind.mouse,
    );
    await tester.pump();
    await gesture.moveTo(const Offset(200, 50));
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();

    expect(selected, containsAll(<String>['file_alpha', 'file_beta']));
    expect(selected, isNot(contains('item_0')));
    expect(selected, isNot(contains('item_1')));
  });
}

class _ReorderableMarqueeWidget extends StatefulWidget {
  const _ReorderableMarqueeWidget({required this.onChanged});
  final ValueChanged<Set<String>> onChanged;

  @override
  State<_ReorderableMarqueeWidget> createState() => _ReorderableMarqueeWidgetState();
}

class _ReorderableMarqueeWidgetState extends State<_ReorderableMarqueeWidget> {
  List<String> ids = <String>['item_0', 'item_1'];

  void updateIds(List<String> next) {
    setState(() => ids = next);
  }

  @override
  Widget build(BuildContext context) {
    return MarqueeSelection(
      onStart: () {},
      onChanged: (selected, additive) => widget.onChanged(selected),
      child: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
          childAspectRatio: 1.0,
        ),
        itemCount: ids.length,
        itemBuilder: (context, index) {
          final id = ids[index];
          // Without key on MarqueeItem to test that didUpdateWidget updates registration properly
          return MarqueeItem(
            id: id,
            child: Container(
              color: Colors.blue,
              child: Text(id),
            ),
          );
        },
      ),
    );
  }
}

class _DynamicGridTestWidget extends StatefulWidget {
  const _DynamicGridTestWidget();

  @override
  State<_DynamicGridTestWidget> createState() => _DynamicGridTestWidgetState();
}

class _DynamicGridTestWidgetState extends State<_DynamicGridTestWidget> {
  Set<String> selection = <String>{};

  @override
  Widget build(BuildContext context) {
    return MarqueeSelection(
      onStart: () {},
      onChanged: (ids, additive) {
        setState(() {
          selection = ids;
        });
      },
      child: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
          childAspectRatio: 1.0,
        ),
        itemCount: 2,
        itemBuilder: (context, index) {
          final id = 'item_$index';
          final selected = selection.contains(id);
          return MarqueeItem(
            id: id,
            child: Container(
              color: selected ? Colors.red : Colors.blue,
              child: Text('Item $index ($selected)'),
            ),
          );
        },
      ),
    );
  }
}
