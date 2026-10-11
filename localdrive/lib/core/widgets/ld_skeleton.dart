import 'package:flutter/material.dart';

import 'ld_spinner.dart';

/// Loading placeholders have been replaced 100% with the brand loading spinner.
class LdSkeleton extends StatelessWidget {
  const LdSkeleton({
    super.key,
    this.width,
    this.height = 14,
    this.radius = 6,
    this.shape = BoxShape.rectangle,
    this.border = false,
  });

  /// A circle placeholder
  const LdSkeleton.circle({super.key, required double size})
      : width = size,
        height = size,
        radius = 0,
        shape = BoxShape.circle,
        border = false;

  final double? width;
  final double height;
  final double radius;
  final BoxShape shape;
  final bool border;

  @override
  Widget build(BuildContext context) {
    return const Center(child: LdSpinner());
  }
}

/// The loading stand-in for a file list.
class LdListSkeleton extends StatelessWidget {
  const LdListSkeleton({super.key, this.rows = 7, this.padding});

  final int rows;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 40),
      child: Center(child: LdSpinner()),
    );
  }
}

/// The loading stand-in for the grid view.
class LdGridSkeleton extends StatelessWidget {
  const LdGridSkeleton({
    super.key,
    required this.columns,
    this.tiles = 12,
    this.padding,
  });

  final int columns;
  final int tiles;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 40),
      child: Center(child: LdSpinner()),
    );
  }
}

/// The loading stand-in for a settings or detail screen.
class LdCardSkeleton extends StatelessWidget {
  const LdCardSkeleton({super.key, this.cards = 3});

  final int cards;

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 40),
      child: Center(child: LdSpinner()),
    );
  }
}
