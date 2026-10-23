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
    bool isContextMenu = false,
  }) {
    if (LdDeviceScope.of(context).isDesktop && anchor != null) {
      return _showFloating(
        context,
        actions: actions,
        anchor: anchor,
        isContextMenu: isContextMenu,
      );
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
    bool isContextMenu = false,
  }) {
    final rootOverlay =
        Overlay.maybeOf(context, rootOverlay: true) ?? Overlay.of(context);
    final renderBox = rootOverlay.context.findRenderObject() as RenderBox?;
    final size = renderBox?.size ?? MediaQuery.sizeOf(context);

    // keep the panel on screen and aligned naturally to the anchor
    const panelWidth = 240.0;
    final estimatedHeight = actions.length * 46.0 + 12;

    final maxLeft = (size.width - panelWidth - 8.0).clamp(8.0, double.infinity);
    final maxTop = (size.height - estimatedHeight - 8.0).clamp(8.0, double.infinity);

    final double left;
    final double top;

    if (isContextMenu) {
      // Right-click context menus: anchor is the cursor coordinate.
      // Open with top-left at the cursor unless it overflows screen edges.
      if (anchor.dx + panelWidth > size.width - 8.0) {
        left = (anchor.dx - panelWidth).clamp(8.0, maxLeft);
      } else {
        left = anchor.dx.clamp(8.0, maxLeft);
      }

      if (anchor.dy + estimatedHeight > size.height - 8.0) {
        top = (anchor.dy - estimatedHeight).clamp(8.0, maxTop);
      } else {
        top = anchor.dy.clamp(8.0, maxTop);
      }
    } else {
      // Button dropdown menus (from anchorOf):
      left = (anchor.dx > size.width / 2 || anchor.dx + panelWidth > size.width - 8.0)
          ? (anchor.dx - panelWidth).clamp(8.0, maxLeft)
          : anchor.dx.clamp(8.0, maxLeft);
      top = (anchor.dy + estimatedHeight > size.height - 8.0)
          ? (anchor.dy - estimatedHeight).clamp(8.0, maxTop)
          : anchor.dy.clamp(8.0, maxTop);
    }

    return showGeneralDialog<String>(
      context: context,
      barrierColor: Colors.transparent,
      barrierDismissible: true,
      barrierLabel: 'menu',
      transitionDuration: Duration.zero,
      pageBuilder: (context, _, _) => const SizedBox.shrink(),
      transitionBuilder: (dialogContext, _, _, _) {
        return Stack(
          children: <Widget>[
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => Navigator.of(dialogContext).pop(),
                onSecondaryTap: () => Navigator.of(dialogContext).pop(),
                onSecondaryTapDown: (_) => Navigator.of(dialogContext).pop(),
                child: const ColoredBox(color: Colors.transparent),
              ),
            ),
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
                    color: dialogContext.surfaces.backgroundElevated,
                    borderRadius: LdRadii.tileRadius,
                    border: Border.all(color: dialogContext.surfaces.strokeOutline),
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
                                Navigator.of(dialogContext).pop(action.id),
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
