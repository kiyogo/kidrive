import 'package:flutter/material.dart';

import '../constants/ld_colors.dart';
import '../constants/ld_radii.dart';
import '../theme/ld_theme.dart';
import 'ld_bottom_sheet.dart';
import 'ld_icons.dart';
import 'ld_responsive.dart';
import 'ld_tappable.dart';

/// One row in a context menu.
class LdMenuAction {
  const LdMenuAction({
    required this.id,
    required this.label,
    required this.glyph,
    this.destructive = false,
    this.enabled = true,
    this.trailing,
  });

  final String id;
  final String label;
  final LdGlyph glyph;
  final bool destructive;
  final bool enabled;

  /// a toggle state, such as the offline switch
  final Widget? trailing;
}

/// Where to hang a menu that was opened from a button rather than a right
/// click.
///
/// A desktop menu opens at the thing that opened it, so this reads the
/// button's own position off the tree. Pass the context of a Builder sitting
/// directly above the button, not the one that built the whole screen, or the
/// menu lands at the top of the page.
Offset anchorOf(BuildContext context) {
  final box = context.findRenderObject() as RenderBox?;
  if (box == null || !box.hasSize) return Offset.zero;
  final origin = box.localToGlobal(Offset.zero);
  final mediaQuery = MediaQuery.maybeOf(context);
  final screenWidth = mediaQuery?.size.width ?? 800;
  // If the button is in the right half of the screen, anchor at its bottom right;
  // otherwise at its bottom left.
  if (origin.dx > screenWidth / 2) {
    return box.localToGlobal(Offset(box.size.width, box.size.height));
  }
  return box.localToGlobal(Offset(0, box.size.height));
}

/// Replaces PopupMenuButton: a bottom sheet on mobile and tablet, a small
/// branded floating panel anchored to the pointer on desktop.
abstract final class LdContextMenu {
  static Future<String?> show(
    BuildContext context, {
    required String title,
    required List<LdMenuAction> actions,
    String? subtitle,
    Offset? anchor,
  }) {
    if (LdDeviceScope.of(context).isDesktop && anchor != null) {
      return _showFloating(context, actions: actions, anchor: anchor);
    }
    return LdBottomSheet.show<String>(
      context,
      title: title,
      subtitle: subtitle,
      scrollable: true,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          for (final action in actions)
            _MenuRow(
              action: action,
              onTap: () => Navigator.of(context).pop(action.id),
            ),
        ],
      ),
    );
  }

  static Future<String?> _showFloating(
    BuildContext context, {
    required List<LdMenuAction> actions,
    required Offset anchor,
  }) {
    final overlay =
        Overlay.of(context).context.findRenderObject()! as RenderBox;
    final size = overlay.size;

    // keep the panel on screen and aligned naturally to the anchor
    const panelWidth = 240.0;
    final estimatedHeight = actions.length * 46.0 + 12;
    final left = (anchor.dx > size.width / 2 || anchor.dx + panelWidth > size.width)
        ? (anchor.dx - panelWidth).clamp(8.0, size.width - panelWidth - 8)
        : anchor.dx.clamp(8.0, size.width - panelWidth - 8);
    final top = (anchor.dy + estimatedHeight > size.height)
        ? (anchor.dy - estimatedHeight).clamp(8.0, size.height - estimatedHeight - 8)
        : anchor.dy.clamp(8.0, size.height - estimatedHeight - 8);

    return showGeneralDialog<String>(
      context: context,
      barrierColor: Colors.transparent,
      barrierDismissible: true,
      barrierLabel: 'menu',
      transitionDuration: Duration.zero,
      pageBuilder: (context, _, _) => const SizedBox.shrink(),
      transitionBuilder: (context, _, _, _) {
        return Stack(
          children: <Widget>[
            Positioned(
              left: left.toDouble(),
              top: top.toDouble(),
              child: Material(
                color: Colors.transparent,
                child: Container(
                  width: panelWidth,
                  // a flat fill and a one pixel stroke, like every other
                  // surface in the app. The stroke is what separates it
                  // from what is behind it, not a shadow
                  decoration: BoxDecoration(
                    color: context.surfaces.backgroundElevated,
                    borderRadius: LdRadii.tileRadius,
                    border: Border.all(color: context.surfaces.strokeOutline),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  // a long menu near the bottom of a short window would
                  // otherwise run off the screen with no way to reach the
                  // last row
                  constraints: BoxConstraints(maxHeight: size.height - 16),
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        for (final action in actions)
                          _MenuRow(
                            action: action,
                            dense: true,
                            onTap: () =>
                                Navigator.of(context).pop(action.id),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({
    required this.action,
    required this.onTap,
    this.dense = false,
  });

  final LdMenuAction action;
  final VoidCallback onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final color = !action.enabled
        ? context.surfaces.foregroundMuted
        : action.destructive
            ? LdColors.accentWarning
            : context.surfaces.foregroundPrimary;

    return LdTappable(
      onTap: action.enabled ? onTap : null,
      enabled: action.enabled,
      borderRadius: LdRadii.chipRadius,
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: dense ? 14 : 4,
          vertical: dense ? 11 : 14,
        ),
        child: Row(
          children: <Widget>[
            LdIcon(action.glyph, size: 19, color: color),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                action.label,
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyLarge!.copyWith(
                      color: color,
                    ),
              ),
            ),
            if (action.trailing != null) action.trailing!,
          ],
        ),
      ),
    );
  }
}
