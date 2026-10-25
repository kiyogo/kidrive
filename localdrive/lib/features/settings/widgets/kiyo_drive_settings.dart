import 'dart:io' show Directory, Platform, Process;
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
    try {
      return Directory('K:\\').existsSync();
    } catch (_) {
      return false;
    }
  }

  static Future<void> setDriveVisible(bool visible) async {
    if (!isAvailable()) return;
    final kd = _networkShortcutPath;
    final target = _localDriveFolder;

    if (visible) {
      final script = '''
        \$target = '$target';
        \$kd = '$kd';
        if (-not (Test-Path \$target)) { New-Item -ItemType Directory -Path \$target -Force | Out-Null }

        cmd.exe /c "subst K: /D 2>nul"
        cmd.exe /c "subst K: `"\$target`""
        cmd.exe /c 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\K\\DefaultLabel" /ve /t REG_SZ /d "KiDrive" /f 2>nul'
        cmd.exe /c 'reg add "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\K\\DefaultLabel" /ve /t REG_SZ /d "KiDrive" /f 2>nul'
        cmd.exe /c 'reg add "HKCU\\Software\\Classes\\Applications\\Explorer.exe\\Drives\\K\\DefaultLabel" /ve /t REG_SZ /d "KiDrive" /f 2>nul'
        cmd.exe /c 'reg add "HKCU\\Software\\Classes\\Applications\\Explorer.exe\\DriveIcons\\K\\DefaultLabel" /ve /t REG_SZ /d "KiDrive" /f 2>nul'

        # Tim app_icon.ico
        \$appData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData)
        \$progFiles = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ProgramFiles)
        \$candidates = @(
          (Join-Path \$progFiles "Local Drive\\app_icon.ico"),
          (Join-Path \$appData "Programs\\Local Drive\\app_icon.ico"),
          (Join-Path \$appData "Programs\\LocalDrive\\app_icon.ico"),
          (Join-Path \$appData "LocalDrive\\app_icon.ico"),
          (Join-Path \$target "app_icon.ico"),
          "E:\\DATA\\source\\Nas\\LocalDrive\\windows-installer\\app_icon.ico"
        )
        \$foundIcon = ""
        foreach (\$c in \$candidates) {
          if (Test-Path \$c) { \$foundIcon = \$c; break }
        }
        if (\$foundIcon -ne "") {
          \$iconWithIndex = if (\$foundIcon -match ',') { \$foundIcon } else { "\$foundIcon,0" }
          \$targetIco = Join-Path \$target "app_icon.ico"
          if (-not (Test-Path \$targetIco)) {
            Copy-Item -Path \$foundIcon -Destination \$targetIco -Force -ErrorAction SilentlyContinue
          }
          cmd.exe /c "attrib +h `"\$targetIco`" 2>nul"
          cmd.exe /c "reg add `"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\K\\DefaultIcon`" /ve /t REG_SZ /d `"\$iconWithIndex`" /f 2>nul"
          cmd.exe /c "reg add `"HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\K\\DefaultIcon`" /ve /t REG_SZ /d `"\$iconWithIndex`" /f 2>nul"
          cmd.exe /c "reg add `"HKCU\\Software\\Classes\\Applications\\Explorer.exe\\Drives\\K\\DefaultIcon`" /ve /t REG_SZ /d `"\$iconWithIndex`" /f 2>nul"
          cmd.exe /c "reg add `"HKCU\\Software\\Classes\\Applications\\Explorer.exe\\DriveIcons\\K\\DefaultIcon`" /ve /t REG_SZ /d `"\$iconWithIndex`" /f 2>nul"

          \$autorun = Join-Path \$target "autorun.inf"
          "[autorun]`r`nicon=app_icon.ico,0`r`nlabel=KiDrive`r`n" | Set-Content -Path \$autorun -Encoding ASCII -Force
          cmd.exe /c "attrib +h +s `"\$autorun`" 2>nul"
        }

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
    } else {
      final script = '''
        cmd.exe /c "subst K: /D 2>nul"
        cmd.exe /c 'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\K" /f 2>nul'
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
    if (!checkExists()) {
      await setDriveVisible(true);
    }
    if (checkExists()) {
      await Process.run('explorer.exe', ['K:\\']);
    } else {
      await Process.run('explorer.exe', [folder]);
    }
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
