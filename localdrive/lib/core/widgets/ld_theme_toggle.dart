import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/ld_colors.dart';
import '../constants/ld_radii.dart';
import '../services/core_providers.dart';
import '../theme/ld_theme.dart';
import '../../l10n/generated/app_localizations.dart';
import 'ld_tappable.dart';

/// The light/dark/system theme switch, matching the style of LdLanguageToggle.
class LdThemeToggle extends ConsumerWidget {
  const LdThemeToggle({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final themeMode = ref.watch(themeModeProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    if (compact) {
      return Container(
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: context.surfaces.backgroundElevated,
          borderRadius: LdRadii.pillRadius,
          border: Border.all(color: context.surfaces.strokeOutline),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            LdTappable(
              onTap: () =>
                  ref.read(themeModeProvider.notifier).set(ThemeMode.light),
              borderRadius: LdRadii.pillRadius,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: !isDark ? LdColors.accentPrimary : Colors.transparent,
                  borderRadius: LdRadii.pillRadius,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(
                      Icons.light_mode_outlined,
                      size: 15,
                      color: !isDark
                          ? Colors.white
                          : context.surfaces.foregroundSecondary,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      l10n.themeLight,
                      style: Theme.of(context).textTheme.labelSmall!.copyWith(
                            color: !isDark
                                ? Colors.white
                                : context.surfaces.foregroundSecondary,
                            fontWeight:
                                !isDark ? FontWeight.w600 : FontWeight.w500,
                          ),
                    ),
                  ],
                ),
              ),
            ),
            LdTappable(
              onTap: () =>
                  ref.read(themeModeProvider.notifier).set(ThemeMode.dark),
              borderRadius: LdRadii.pillRadius,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: isDark ? LdColors.accentPrimary : Colors.transparent,
                  borderRadius: LdRadii.pillRadius,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(
                      Icons.dark_mode_outlined,
                      size: 15,
                      color: isDark
                          ? Colors.white
                          : context.surfaces.foregroundSecondary,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      l10n.themeDark,
                      style: Theme.of(context).textTheme.labelSmall!.copyWith(
                            color: isDark
                                ? Colors.white
                                : context.surfaces.foregroundSecondary,
                            fontWeight:
                                isDark ? FontWeight.w600 : FontWeight.w500,
                          ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    // Full form: Light, Dark, System
    final modes = <({ThemeMode mode, String label, IconData icon})>[
      (mode: ThemeMode.light, label: l10n.themeLight, icon: Icons.light_mode_outlined),
      (mode: ThemeMode.dark, label: l10n.themeDark, icon: Icons.dark_mode_outlined),
      (mode: ThemeMode.system, label: l10n.themeSystem, icon: Icons.brightness_auto_outlined),
    ];

    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: context.surfaces.backgroundElevated,
          borderRadius: LdRadii.pillRadius,
          border: Border.all(color: context.surfaces.strokeOutline),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            for (final item in modes)
              LdTappable(
                onTap: () => ref.read(themeModeProvider.notifier).set(item.mode),
                borderRadius: LdRadii.pillRadius,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: item.mode == themeMode
                        ? LdColors.accentPrimary
                        : Colors.transparent,
                    borderRadius: LdRadii.pillRadius,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Icon(
                        item.icon,
                        size: 15,
                        color: item.mode == themeMode
                            ? Colors.white
                            : context.surfaces.foregroundSecondary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        item.label,
                        style: Theme.of(context).textTheme.labelLarge!.copyWith(
                              color: item.mode == themeMode
                                  ? Colors.white
                                  : context.surfaces.foregroundSecondary,
                            ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
