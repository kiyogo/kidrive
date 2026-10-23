$ErrorActionPreference = "Continue"

# 1. Xác định thư mục đồng bộ Local Drive
$userProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
$localDriveFolder = Join-Path $userProfile "Local Drive"
if (-not (Test-Path $localDriveFolder)) {
    New-Item -ItemType Directory -Path $localDriveFolder -Force | Out-Null
}

# 2. Xác định icon
$appDataLocal = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$candidates = @(
    (Join-Path $appDataLocal "Programs\Local Drive\app_icon.ico"),
    (Join-Path $appDataLocal "Programs\LocalDrive\app_icon.ico"),
    (Join-Path $appDataLocal "LocalDrive\app_icon.ico"),
    "E:\DATA\source\Nas\LocalDrive\windows-installer\app_icon.ico"
)

$iconPath = ""
foreach ($cand in $candidates) {
    if (Test-Path $cand) {
        $iconPath = $cand
        break
    }
}

# 3. Gỡ bỏ triệt để ổ đĩa ký tự L: (để không còn hiện chữ (L:), không hiện NTFS và không hiện thanh dung lượng đỏ)
try { cmd.exe /c "subst L: /D 2>nul" } catch {}
try { cmd.exe /c "net use L: /delete /y 2>nul" } catch {}
try { cmd.exe /c "net use * /delete /y 2>nul" } catch {}
try { Get-SmbMapping | Where-Object LocalPath -eq 'L:' | Remove-SmbMapping -Force -ErrorAction SilentlyContinue } catch {}

# Xóa cấu hình DriveIcons L trong Registry
$regPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\L",
    "HKCU:\Software\Classes\Applications\Explorer.exe\Drives\L",
    "HKCU:\Network\L"
)
foreach ($rp in $regPaths) {
    if (Test-Path $rp) {
        Remove-Item -Path $rp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 4. Tạo Network Location Shortcut chuẩn (như KiyoVN, không có chữ cái ổ, không có thanh dung lượng, không có NTFS)
$appDataRoaming = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
$netShortcuts = Join-Path $appDataRoaming "Microsoft\Windows\Network Shortcuts"
if (-not (Test-Path $netShortcuts)) {
    New-Item -ItemType Directory -Path $netShortcuts -Force | Out-Null
}

# Xóa các biến thể cũ nếu có
foreach ($oldName in @("Local Drive", "Kiyo Drive")) {
    $oldP = Join-Path $netShortcuts $oldName
    if (Test-Path $oldP) {
        cmd.exe /c "attrib -h -s -r `"$oldP\*.*`" 2>nul"
        cmd.exe /c "attrib -r `"$oldP`" 2>nul"
        Remove-Item -Path $oldP -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Tạo thư mục Network Location KiyoDrive
$kdDir = Join-Path $netShortcuts "KiyoDrive"
if (-not (Test-Path $kdDir)) {
    New-Item -ItemType Directory -Path $kdDir -Force | Out-Null
}

# Gỡ bỏ thuộc tính cũ trước khi ghi file
cmd.exe /c "attrib -h -s -r `"$kdDir\*.*`" 2>nul"
cmd.exe /c "attrib -r `"$kdDir`" 2>nul"

# Tạo desktop.ini
$iniPath = Join-Path $kdDir "desktop.ini"
$iniLines = @(
    "[.ShellClassInfo]",
    "CLSID2={0AFACED1-E828-11D1-9187-B532F1E9575D}",
    "Flags=2",
    "ConfirmFileOp=0"
)
if ($iconPath) {
    $iniLines += "IconFile=$iconPath"
    $iniLines += "IconIndex=0"
    $iniLines += "IconResource=$iconPath,0"
}
[IO.File]::WriteAllText($iniPath, ($iniLines -join "`r`n") + "`r`n", [Text.Encoding]::ASCII)

# Đặt thuộc tính cho desktop.ini (+h +s) và thư mục (+r)
cmd.exe /c "attrib +h +s `"$iniPath`""
cmd.exe /c "attrib +r `"$kdDir`""

# Tạo shortcut target.lnk trỏ vào thư mục Local Drive
$lnkPath = Join-Path $kdDir "target.lnk"
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($lnkPath)
$sc.TargetPath = $localDriveFolder
$sc.WorkingDirectory = $localDriveFolder
if ($iconPath) {
    $sc.IconLocation = "$iconPath,0"
}
$sc.Description = "KiyoDrive"
$sc.Save()

# 5. Thông báo Shell cập nhật giao diện
$signature = @"
[DllImport("shell32.dll")]
public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
"@
try {
    $type = Add-Type -MemberDefinition $signature -Name "Win32Shell_$(Get-Random)" -Namespace "ShellNotify" -PassThru
    $type::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
} catch {}

Write-Host "HOÀN TẤT: Đã thiết lập Network Location 'KiyoDrive' chuẩn (không ổ đĩa L:, không NTFS, không thanh dung lượng)!"
