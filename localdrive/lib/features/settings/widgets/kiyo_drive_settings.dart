import 'dart:io' show Directory, File, Platform, Process;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:path/path.dart' as p;

import '../../../../core/widgets/ld_controls.dart';
import '../../../../core/widgets/ld_icons.dart';

/// Settings row group for KiyoDrive Network Location in Windows File Explorer (This PC).
class KiyoDriveSettingsGroup extends HookWidget {
  const KiyoDriveSettingsGroup({super.key});

  static bool isAvailable() => !kIsWeb && Platform.isWindows;

  static String get _networkShortcutPath {
    final appData = Platform.environment['APPDATA'] ?? '';
    if (appData.isEmpty) return '';
    return p.join(appData, 'Microsoft', 'Windows', 'Network Shortcuts', 'KiyoDrive');
  }

  static String get _localDriveFolder {
    final userProfile = Platform.environment['USERPROFILE'] ?? '';
    return p.join(userProfile, 'Local Drive');
  }

  static bool checkExists() {
    if (!isAvailable()) return false;
    final shortcutDir = _networkShortcutPath;
    if (shortcutDir.isEmpty) return false;
    final lnk = File(p.join(shortcutDir, 'target.lnk'));
    final ini = File(p.join(shortcutDir, 'desktop.ini'));
    return lnk.existsSync() && ini.existsSync();
  }

  static Future<void> setDriveVisible(bool visible) async {
    if (!isAvailable()) return;
    final kd = _networkShortcutPath;
    final target = _localDriveFolder;
    if (kd.isEmpty) return;

    if (visible) {
      final script = '''
        \$kd = '$kd';
        \$target = '$target';
        if (-not (Test-Path \$target)) { New-Item -ItemType Directory -Path \$target -Force | Out-Null }
        if (-not (Test-Path \$kd)) { New-Item -ItemType Directory -Path \$kd -Force | Out-Null }
        cmd.exe /c "attrib -h -s -r `"\$kd\\*.*`" 2>nul"
        cmd.exe /c "attrib -r `"\$kd`" 2>nul"
        \$ini = Join-Path \$kd 'desktop.ini';
        \$lines = @('[.ShellClassInfo]', 'CLSID2={0AFACED1-E828-11D1-9187-B532F1E9575D}', 'Flags=2', 'ConfirmFileOp=0');
        [IO.File]::WriteAllText(\$ini, (\$lines -join "`r`n") + "`r`n", [Text.Encoding]::ASCII);
        cmd.exe /c "attrib +h +s `"\$ini`"";
        cmd.exe /c "attrib +r `"\$kd`"";
        \$wsh = New-Object -ComObject WScript.Shell;
        \$sc = \$wsh.CreateShortcut((Join-Path \$kd 'target.lnk'));
        \$sc.TargetPath = \$target;
        \$sc.WorkingDirectory = \$target;
        \$sc.Description = 'KiyoDrive';
        \$sc.Save();
        try {
          Add-Type -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int w, uint u, IntPtr d1, IntPtr d2);' -Name 'WinNotify' -Namespace 'ShellUtils' -PassThru | Out-Null;
          [ShellUtils.WinNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero);
        } catch {}
      ''';
      await Process.run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
    } else {
      final script = '''
        \$kd = '$kd';
        if (Test-Path \$kd) {
          cmd.exe /c "attrib -h -s -r `"\$kd\\*.*`" 2>nul"
          cmd.exe /c "attrib -r `"\$kd`" 2>nul"
          Remove-Item -Path \$kd -Recurse -Force -ErrorAction SilentlyContinue
        }
        try {
          Add-Type -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int w, uint u, IntPtr d1, IntPtr d2);' -Name 'WinNotify' -Namespace 'ShellUtils' -PassThru | Out-Null;
          [ShellUtils.WinNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero);
        } catch {}
      ''';
      await Process.run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
    }
  }

  static Future<void> openFolder() async {
    if (!isAvailable()) return;
    final folder = _localDriveFolder;
    final dir = Directory(folder);
    if (!dir.existsSync()) {
      dir.createSync(recursive: true);
    }
    await Process.run('explorer.exe', [folder]);
  }

  @override
  Widget build(BuildContext context) {
    if (!isAvailable()) return const SizedBox.shrink();

    final isVisible = useState(checkExists());
    final isWorking = useState(false);

    return LdSettingGroup(
      title: 'Ổ đĩa máy tính (KiyoDrive)',
      children: <Widget>[
        LdSettingRow(
          label: 'Hiển thị KiyoDrive trong This PC',
          description: isVisible.value
              ? 'Đang bật: KiyoDrive hiển thị ở mục Vị trí mạng trong File Explorer'
              : 'Đang tắt: Ẩn KiyoDrive khỏi File Explorer',
          glyph: LdGlyph.drive,
          trailing: LdSwitch(
            value: isVisible.value,
            enabled: !isWorking.value,
            onChanged: (val) async {
              isWorking.value = true;
              isVisible.value = val;
              try {
                await setDriveVisible(val);
              } finally {
                isVisible.value = checkExists();
                isWorking.value = false;
              }
            },
          ),
        ),
        LdSettingRow(
          label: 'Mở thư mục KiyoDrive trên máy tính',
          description: _localDriveFolder,
          glyph: LdGlyph.folder,
          onTap: () => openFolder(),
        ),
        LdSettingRow(
          label: 'Làm mới vị trí mạng & biểu tượng',
          glyph: LdGlyph.refresh,
          onTap: () async {
            isWorking.value = true;
            try {
              await setDriveVisible(true);
            } finally {
              isVisible.value = checkExists();
              isWorking.value = false;
            }
          },
        ),
      ],
    );
  }
}
