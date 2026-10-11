import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../core/theme/ld_theme.dart';
import '../../../core/widgets/ld_responsive.dart';
import '../../../core/constants/ld_radii.dart';
import '../../../core/widgets/ld_logo.dart';
import '../../../core/widgets/ld_content_pane.dart';
import '../../../core/widgets/ld_scaffold.dart';
import '../widgets/about_row.dart';
import '../widgets/update_card.dart';

// About: what version this is and project info.
//
// The version comes from the package rather than a constant in the source,
// so it cannot disagree with what was actually installed.
class AboutPage extends StatefulWidget {
  const AboutPage({super.key, this.embedded = false});

  /// True inside the settings shell, which already draws a header. Without it
  /// the page stacks its own title on the shell's and shows two.
  final bool embedded;

  @override
  State<AboutPage> createState() => _AboutPageState();
}

class _AboutPageState extends State<AboutPage> {
  PackageInfo? _info;

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((info) {
      if (mounted) setState(() => _info = info);
    });
  }

  @override
  Widget build(BuildContext context) {
    final version = _info == null
        ? '...'
        : '${_info!.version} (${_info!.buildNumber})';

    final body = LdContentPane(
      child: ListView(
        // the scaffold pads the header, not the body, so the page has to bring
        // its own or the cards run flush to the window edge
        padding: EdgeInsets.symmetric(horizontal: context.pagePadding),
        children: <Widget>[
          const SizedBox(height: 8),
          Center(
            child: Column(
              children: <Widget>[
                const LdLogo(size: 56),
                const SizedBox(height: 16),
                Text(
                  'Local Drive',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: context.surfaces.foregroundPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  version,
                  style: TextStyle(
                    fontSize: 13,
                    color: context.surfaces.foregroundSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          UpdateCard(version: version),
          const SizedBox(height: 20),
          AboutCard(
            title: 'Project',
            children: const <Widget>[
              AboutRow(
                label: 'Name',
                value: 'Local Drive',
              ),
              AboutRow(
                label: 'Type',
                value: 'Self-hosted Private Cloud',
              ),
            ],
          ),
          const SizedBox(height: 20),
          AboutCard(
            title: 'Legal',
            children: <Widget>[
              const AboutRow(label: 'Licence', value: 'MIT'),
              AboutRow(
                label: 'Open source licences',
                onTap: () => showLicensePage(
                  context: context,
                  applicationName: 'Local Drive',
                  applicationVersion: version,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.surfaces.backgroundElevated,
              borderRadius: BorderRadius.circular(LdRadii.card),
              border: Border.all(color: context.surfaces.strokeOutline),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Local Drive',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: context.surfaces.foregroundPrimary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Local Drive is a self-hosted private cloud storage system. '
                  'Built for a network you control rather than the public internet.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.5,
                    color: context.surfaces.foregroundSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );

    if (widget.embedded) return body;
    return LdScaffold(title: 'About', showBack: true, body: body);
  }
}
