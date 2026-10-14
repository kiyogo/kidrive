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
    this.primaryBytes,
    this.height = 8,
    this.warnAbove = 0.9,
  });

  final int usedBytes;
  final int totalBytes;
  final String usedLabel;
  final String freeLabel;
  final int? primaryBytes;
  final double height;
  final double warnAbove;

  @override
  Widget build(BuildContext context) {
    final fraction = totalBytes <= 0 ? 0.0 : (usedBytes / totalBytes).clamp(0.0, 1.0);
    final color = fraction >= warnAbove
        ? LdColors.accentWarning
        : LdColors.accentPrimary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (primaryBytes != null && primaryBytes! > 0 && totalBytes > 0)
          RepaintBoundary(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(height),
              clipBehavior: Clip.antiAlias,
              child: Stack(
                children: <Widget>[
                  Container(
                    height: height,
                    color: LdColors.wash(LdColors.foregroundPrimary, 0.08),
                  ),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final totalW = constraints.maxWidth * fraction;
                      final primaryFraction = (primaryBytes! / totalBytes).clamp(0.0, 1.0);
                      final primaryW = constraints.maxWidth * primaryFraction;
                      return Stack(
                        children: <Widget>[
                          Container(
                            height: height,
                            width: totalW,
                            decoration: BoxDecoration(
                              color: fraction >= warnAbove
                                  ? LdColors.accentWarning
                                  : LdColors.wash(LdColors.accentPrimary, 0.4),
                              borderRadius: BorderRadius.circular(height),
                            ),
                          ),
                          Container(
                            height: height,
                            width: primaryW < 3 && primaryBytes! > 0 ? 3 : primaryW,
                            decoration: BoxDecoration(
                              color: LdColors.accentPrimary,
                              borderRadius: BorderRadius.circular(height),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          )
        else
          LdProgressBar(value: fraction, height: height, color: color),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Flexible(child: Text(usedLabel, style: Theme.of(context).textTheme.bodySmall)),
            const SizedBox(width: 8),
            Text(freeLabel, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ],
    );
  }
}
