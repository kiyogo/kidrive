import '../../../imports.dart';
import '../../auth/controller/session_controller.dart';

/// Opens the sheet for editing the current account's display name.
void showEditNameSheet(BuildContext context, WidgetRef ref) {
  final l10n = L10n.of(context);
  final user = ref.read(currentUserProvider);
  if (user == null) return;
  final controller = TextEditingController(text: user.displayName);
  final error = ValueNotifier<String?>(null);
  final busy = ValueNotifier<bool>(false);

  LdBottomSheet.show<void>(
    context,
    title: 'Đổi tên hiển thị',
    builder: (ctx) {
      return ValueListenableBuilder<bool>(
        valueListenable: busy,
        builder: (ctx, isBusy, _) {
          return ValueListenableBuilder<String?>(
            valueListenable: error,
            builder: (ctx, err, _) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    LdTextField(
                      controller: controller,
                      label: 'Tên hiển thị mới',
                      prefixGlyph: LdGlyph.person,
                      errorText: err,
                      autofocus: true,
                    ),
                    const SizedBox(height: 20),
                    LdButton(
                      label: l10n.actionSave,
                      busy: isBusy,
                      onPressed: () async {
                        final val = controller.text.trim();
                        if (val.isEmpty) {
                          error.value = 'Vui lòng nhập tên hiển thị';
                          return;
                        }
                        busy.value = true;
                        error.value = null;
                        try {
                          await ref.read(sessionProvider.notifier).updateDisplayName(val);
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          if (context.mounted) LdToast.success(context, 'Đã cập nhật tên hiển thị');
                        } on ApiException catch (e) {
                          error.value = e.message;
                        } finally {
                          busy.value = false;
                        }
                      },
                    ),
                  ],
                ),
              );
            },
          );
        },
      );
    },
  );
}

/// Opens the sheet for changing the current account's password.
void showChangePasswordSheet(BuildContext context, WidgetRef ref) {
  final l10n = L10n.of(context);
  final current = TextEditingController();
  final next = TextEditingController();
  final confirm = TextEditingController();
  final error = ValueNotifier<String?>(null);
  final busy = ValueNotifier<bool>(false);

  LdBottomSheet.show<void>(
    context,
    title: l10n.newPassword,
    builder: (ctx) {
      return ValueListenableBuilder<bool>(
        valueListenable: busy,
        builder: (ctx, isBusy, _) {
          return ValueListenableBuilder<String?>(
            valueListenable: error,
            builder: (ctx, err, _) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    LdTextField(
                      controller: current,
                      label: l10n.currentPassword,
                      hint: l10n.passwordHintExisting,
                      obscure: true,
                      prefixGlyph: LdGlyph.lock,
                    ),
                    const SizedBox(height: 12),
                    LdTextField(
                      controller: next,
                      label: l10n.newPassword,
                      hint: l10n.passwordHintNew,
                      obscure: true,
                      prefixGlyph: LdGlyph.lock,
                      helperText: l10n.passwordTooShort,
                    ),
                    const SizedBox(height: 12),
                    LdTextField(
                      controller: confirm,
                      label: l10n.confirmPasswordLabel,
                      hint: l10n.confirmPasswordHint,
                      obscure: true,
                      prefixGlyph: LdGlyph.lock,
                      errorText: err,
                    ),
                    const SizedBox(height: 20),
                    LdButton(
                      label: l10n.actionSave,
                      busy: isBusy,
                      onPressed: () async {
                        if (next.text != confirm.text) {
                          error.value = l10n.passwordsDoNotMatch;
                          return;
                        }
                        if (next.text.length < 6) {
                          error.value = l10n.passwordTooShort;
                          return;
                        }
                        busy.value = true;
                        error.value = null;
                        try {
                          await ref.read(sessionProvider.notifier).changePassword(
                                currentPassword: current.text,
                                newPassword: next.text,
                              );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          if (context.mounted) LdToast.success(context, l10n.passwordChanged);
                        } on ApiException catch (e) {
                          error.value = e.message;
                        } finally {
                          busy.value = false;
                        }
                      },
                    ),
                  ],
                ),
              );
            },
          );
        },
      );
    },
  );
}
