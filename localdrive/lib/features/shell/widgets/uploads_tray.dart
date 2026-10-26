import 'dart:async';

import '../../../imports.dart';
import '../../upload/controller/transfer_controller.dart';

/// The persistent uploads tray: dismissible, but not losable.
///
/// It shows aggregate state, and tapping it opens the full queue where a
/// failed item shows its specific reason and its own retry, never a generic
/// "something went wrong" covering the whole batch.
class UploadsTray extends ConsumerStatefulWidget {
  const UploadsTray({super.key});

  @override
  ConsumerState<UploadsTray> createState() => _UploadsTrayState();
}

class _UploadsTrayState extends ConsumerState<UploadsTray> {
  bool _lingering = false;
  Timer? _lingerTimer;

  @override
  void dispose() {
    _lingerTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final summary = ref.watch(transferSummaryProvider);
    if (summary.isEmpty) return const SizedBox.shrink();

    final done = summary.completed == summary.total && !summary.needsAttention;
    if (!done) {
      _lingerTimer?.cancel();
      _lingering = true;
    } else if (_lingering && (_lingerTimer == null || !_lingerTimer!.isActive)) {
      _lingerTimer = Timer(const Duration(seconds: 3), () {
        if (mounted) {
          setState(() => _lingering = false);
        }
      });
    }

    if (done && !_lingering) return const SizedBox.shrink();

    final pct = done ? 100 : (summary.progress * 100).round().clamp(0, 100);
    final barColor = summary.needsAttention
        ? LdColors.accentWarning
        : done
            ? const Color(0xFF10B981)
            : LdColors.accentPrimary;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: LdTappable(
        onTap: () => context.push(Routes.transfers),
        borderRadius: LdRadii.cardRadius,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.surfaces.backgroundElevated,
            borderRadius: LdRadii.cardRadius,
            border: Border.all(
              color: summary.needsAttention
                  ? LdColors.accentWarning
                  : context.surfaces.strokeOutline,
            ),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x66000000),
                blurRadius: 22,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  LdIcon(
                    summary.needsAttention
                        ? LdGlyph.warning
                        : done
                            ? LdGlyph.check
                            : LdGlyph.upload,
                    size: 18,
                    color: barColor,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      l10n.transfersSummary(summary.completed, summary.total),
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ),
                  Text(
                    '$pct%',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: barColor,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(width: 6),
                  LdIcon(
                    LdGlyph.chevronRight,
                    size: 16,
                    color: context.surfaces.foregroundSecondary,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              LdProgressBar(
                value: done ? 1.0 : summary.progress,
                color: barColor,
              ),
              if (summary.needsAttention) ...<Widget>[
                const SizedBox(height: 8),
                Text(
                  l10n.transfersNeedAttention(summary.failed),
                  style: Theme.of(context).textTheme.bodySmall!.copyWith(
                        color: LdColors.accentWarning,
                      ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
