import 'package:flutter/material.dart';

import '../constants/ld_colors.dart';
import '../constants/ld_motion.dart';

/// The one progress bar, used for uploads, downloads, and quota.
class LdProgressBar extends StatelessWidget {
  const LdProgressBar({
    super.key,
    required this.value,
    this.height = 6,
    this.color,
    this.background,
    this.indeterminate = false,
  });

  /// zero to one; ignored when indeterminate
  final double value;
  final double height;
  final Color? color;
  final Color? background;
  final bool indeterminate;

  @override
  Widget build(BuildContext context) {
    final track = background ?? LdColors.wash(LdColors.foregroundPrimary, 0.08);
    final fill = color ?? LdColors.accentPrimary;

    if (indeterminate) {
      return _IndeterminateBar(height: height, color: fill, track: track);
    }

    return RepaintBoundary(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(height),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: <Widget>[
            Container(height: height, color: track),
            LayoutBuilder(
              builder: (context, constraints) => AnimatedContainer(
                duration: LdMotion.standard,
                curve: LdMotion.curve,
                height: height,
                width: constraints.maxWidth * value.clamp(0.0, 1.0),
                decoration: BoxDecoration(
                  color: fill,
                  borderRadius: BorderRadius.circular(height),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IndeterminateBar extends StatelessWidget {
  const _IndeterminateBar({
    required this.height,
    required this.color,
    required this.track,
  });

  final double height;
  final Color color;
  final Color track;

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(height),
        clipBehavior: Clip.antiAlias,
        child: SizedBox(
          height: height,
          child: Stack(
            children: <Widget>[
              Container(color: track),
              FractionallySizedBox(
                widthFactor: 0.5,
                child: Container(
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(height),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A used and free bar with its own numbers, one per library on the Storage
/// screen.
class LdUsageBar extends StatelessWidget {
  const LdUsageBar({
    super.key,
    required this.usedBytes,
    required this.totalBytes,
    required this.usedLabel,
    required this.freeLabel,
    this.warnAbove = 0.9,
  });

  final int usedBytes;
  final int totalBytes;
  final String usedLabel;
  final String freeLabel;
  final double warnAbove;

  @override
  Widget build(BuildContext context) {
    final fraction = totalBytes <= 0 ? 0.0 : usedBytes / totalBytes;
    final color = fraction >= warnAbove
        ? LdColors.accentWarning
        : LdColors.accentPrimary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        LdProgressBar(value: fraction, height: 8, color: color),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Text(usedLabel, style: Theme.of(context).textTheme.bodySmall),
            Text(freeLabel, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ],
    );
  }
}
