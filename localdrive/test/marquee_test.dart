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
}
