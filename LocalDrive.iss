#define MyAppName "Local Drive"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Local Drive"
#define MyAppURL "https://github.com/MultiX0/LocalDrive"
#define MyAppExeName "localdrive.exe"

[Setup]
AppId={{E68A8D29-577C-4C18-97F7-C1E91FA5D91C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=e:\DATA\source\Nas\LocalDrive\dist-inno
OutputBaseFilename=LocalDrive-Setup
SetupIconFile=e:\DATA\source\Nas\LocalDrive\windows-installer\app_icon.ico
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
LanguageDetectionMethod=none
UsePreviousLanguage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "vietnamese"; MessagesFile: "compiler:Languages\Vietnamese.isl"
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"

[CustomMessages]
english.AutoStartDesc=Start Local Drive automatically on Windows startup
english.AutoStartGroup=Additional tasks:
english.KiyoDriveTask=Show KiyoDrive in File Explorer (This PC)
vietnamese.AutoStartDesc=Tự động khởi động cùng Windows khi bật máy
vietnamese.AutoStartGroup=Tác vụ bổ sung:
vietnamese.KiyoDriveTask=Hiển thị ổ KiyoDrive trong This PC (Vị trí mạng)
arabic.AutoStartDesc=تشغيل Local Drive تلقائياً عند بدء تشغيل Windows
arabic.AutoStartGroup=مهام إضافية:
arabic.KiyoDriveTask=إظهار KiyoDrive في مستكشف الملفات (مواقع الشبكة)

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "{cm:AutoStartDesc}"; GroupDescription: "{cm:AutoStartGroup}"
Name: "kiyodrive"; Description: "{cm:KiyoDriveTask}"; GroupDescription: "{cm:AutoStartGroup}"; Flags: checkedonce

[Files]
Source: "e:\DATA\source\Nas\LocalDrive\windows-inno-pkg\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "e:\DATA\source\Nas\LocalDrive\windows-installer\app_icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{userappdata}\Microsoft\Windows\Network Shortcuts\KiyoDrive"; Attribs: readonly; Tasks: kiyodrive

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Windows\Network Shortcuts\KiyoDrive\target"; Filename: "{%USERPROFILE}\Local Drive"; IconFilename: "{app}\app_icon.ico"; Comment: "KiyoDrive"; Tasks: kiyodrive

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "LocalDrive"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: autostart; Flags: uninsdeletevalue
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\K\DefaultLabel"; ValueType: string; ValueData: "KiDrive"; Tasks: kiyodrive; Flags: uninsdeletekey noerror
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\K\DefaultIcon"; ValueType: string; ValueData: "{app}\app_icon.ico,0"; Tasks: kiyodrive; Flags: uninsdeletekey noerror
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\K\DefaultLabel"; ValueType: string; ValueData: "KiDrive"; Tasks: kiyodrive; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\K\DefaultIcon"; ValueType: string; ValueData: "{app}\app_icon.ico,0"; Tasks: kiyodrive; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\Explorer.exe\Drives\K\DefaultLabel"; ValueType: string; ValueData: "KiDrive"; Tasks: kiyodrive; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\Explorer.exe\Drives\K\DefaultIcon"; ValueType: string; ValueData: "{app}\app_icon.ico,0"; Tasks: kiyodrive; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\Explorer.exe\DriveIcons\K\DefaultLabel"; ValueType: string; ValueData: "KiDrive"; Tasks: kiyodrive; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\Explorer.exe\DriveIcons\K\DefaultIcon"; ValueType: string; ValueData: "{app}\app_icon.ico,0"; Tasks: kiyodrive; Flags: uninsdeletekey

[Code]
procedure SHChangeNotify(wEventId: LongInt; uFlags: Cardinal; dwItem1, dwItem2: LongInt);
  external 'SHChangeNotify@shell32.dll stdcall';

function DefineDosDeviceW(dwFlags: DWORD; lpDeviceName: String; lpTargetPath: String): Boolean;
  external 'DefineDosDeviceW@kernel32.dll stdcall';

procedure CurStepChanged(CurStep: TSetupStep);
var
  NetFolder, OldNetFolder, IniFile, IniContent, TargetDir: string;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    // Unmount any mapped drive L: so no red capacity bar or NTFS appears
    Exec('cmd.exe', '/c subst L: /D 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('cmd.exe', '/c net use L: /delete /y 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    RegDeleteKeyIncludingSubkeys(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Explorer\MountPoints2\##localhost#c$#Users');

    // Delete old variants from Network Shortcuts
    OldNetFolder := ExpandConstant('{userappdata}\Microsoft\Windows\Network Shortcuts\Local Drive');
    DelTree(OldNetFolder, True, True, True);
    OldNetFolder := ExpandConstant('{userappdata}\Microsoft\Windows\Network Shortcuts\Kiyo Drive');
    DelTree(OldNetFolder, True, True, True);

    if WizardIsTaskSelected('kiyodrive') then
    begin
      TargetDir := ExpandConstant('{%USERPROFILE}\Local Drive');
      ForceDirectories(TargetDir);

      // Copy icon and write autorun.inf
      FileCopy(ExpandConstant('{app}\app_icon.ico'), TargetDir + '\app_icon.ico', False);
      Exec('attrib', '+h "' + TargetDir + '\app_icon.ico"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

      IniFile := TargetDir + '\autorun.inf';
      IniContent := '[autorun]' + #13#10 +
                    'icon=app_icon.ico,0' + #13#10 +
                    'label=KiDrive' + #13#10;
      SaveStringToFile(IniFile, IniContent, False);
      Exec('attrib', '+h +s "' + IniFile + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

      // Mount Drive K:
      DefineDosDeviceW(0, 'K:', TargetDir);
      Exec('cmd.exe', '/c subst K: /D 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec('cmd.exe', '/c subst K: "' + TargetDir + '" 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

      // Setup desktop.ini for KiyoDrive Network Location
      NetFolder := ExpandConstant('{userappdata}\Microsoft\Windows\Network Shortcuts\KiyoDrive');
      ForceDirectories(NetFolder);
      IniFile := NetFolder + '\desktop.ini';
      IniContent := '[.ShellClassInfo]' + #13#10 +
                    'CLSID2={0AFACED1-E828-11D1-9187-B532F1E9575D}' + #13#10 +
                    'Flags=2' + #13#10 +
                    'ConfirmFileOp=0' + #13#10 +
                    'IconFile=' + ExpandConstant('{app}\app_icon.ico') + #13#10 +
                    'IconIndex=0' + #13#10 +
                    'IconResource=' + ExpandConstant('{app}\app_icon.ico') + ',0' + #13#10;
      SaveStringToFile(IniFile, IniContent, False);
      Exec('attrib', '+h +s "' + IniFile + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec('attrib', '+r "' + NetFolder + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end
    else
    begin
      NetFolder := ExpandConstant('{userappdata}\Microsoft\Windows\Network Shortcuts\KiyoDrive');
      DelTree(NetFolder, True, True, True);
    end;

    // Setup and publish KiyoVN network share (SMB)
    if DirExists('E:\DATA\KiyoVN') then
      Exec('cmd.exe', '/c net share KiyoVN="E:\DATA\KiyoVN" /GRANT:Everyone,FULL /Y 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
    else if WizardIsTaskSelected('kiyodrive') then
      Exec('cmd.exe', '/c net share KiyoVN="' + TargetDir + '" /GRANT:Everyone,FULL /Y 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    SHChangeNotify($08000000, 0, 0, 0);
    SHChangeNotify($00000040, 0, 0, 0);
  end;
end;

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
