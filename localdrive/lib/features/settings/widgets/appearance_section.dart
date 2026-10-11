import '../../../imports.dart';

/// The appearance/theme choice: System, Light, or Dark.
class AppearanceSection extends ConsumerWidget {
  const AppearanceSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final current = ref.watch(themeModeProvider);

    return ListView(
      padding: EdgeInsets.all(context.pagePadding),
      children: <Widget>[
        ConstrainedBox(
          constraints:
              const BoxConstraints(maxWidth: Breakpoints.contentMaxWidth),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              LdRadioRow(
                label: l10n.themeSystem,
                subtitle: l10n.themeSubtitle,
                selected: current == ThemeMode.system,
                onTap: () =>
                    ref.read(themeModeProvider.notifier).set(ThemeMode.system),
              ),
              LdRadioRow(
                label: l10n.themeLight,
                selected: current == ThemeMode.light,
                onTap: () =>
                    ref.read(themeModeProvider.notifier).set(ThemeMode.light),
              ),
              LdRadioRow(
                label: l10n.themeDark,
                selected: current == ThemeMode.dark,
                onTap: () =>
                    ref.read(themeModeProvider.notifier).set(ThemeMode.dark),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
