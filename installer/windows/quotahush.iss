#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

#ifndef CompanionExe
  #define CompanionExe "..\..\build\windows\quotahush-server.exe"
#endif

#ifndef OutputDir
  #define OutputDir "..\..\build"
#endif

#define RepositoryRoot "..\.."

[Setup]
AppId={{80780AF9-4E5E-4FC9-825B-E7218F75FA05}
AppName=QuotaHush Companion
AppVersion={#AppVersion}
AppPublisher=QuotaHush contributors
AppPublisherURL=https://wenress.github.io/QuotaHush/
AppSupportURL=https://github.com/Wenress/QuotaHush/issues
AppUpdatesURL=https://github.com/Wenress/QuotaHush/releases/latest
DefaultDirName={localappdata}\Programs\QuotaHush
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=QuotaHush-Setup-x64-{#AppVersion}
SetupIconFile=quotahush.ico
UninstallDisplayName=QuotaHush Companion
UninstallDisplayIcon={app}\quotahush-server.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppVersion}
VersionInfoCompany=QuotaHush contributors
VersionInfoDescription=QuotaHush Companion installer
VersionInfoProductName=QuotaHush Companion
VersionInfoProductVersion={#AppVersion}

[Files]
Source: "{#CompanionExe}"; DestDir: "{app}"; DestName: "quotahush-server.exe"; Flags: ignoreversion
Source: "{#RepositoryRoot}\.var.env.example"; DestDir: "{localappdata}\QuotaHush"; DestName: ".var.env"; Flags: onlyifdoesntexist uninsneveruninstall
Source: "{#RepositoryRoot}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#RepositoryRoot}\PRIVACY.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "manage-process.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "verify-health.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "QuotaHush Companion"; ValueData: """{app}\quotahush-server.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\quotahush-server.exe"; WorkingDir: "{app}"; Flags: runhidden nowait; AfterInstall: VerifyCompanion
Filename: "{sys}\notepad.exe"; Parameters: """{localappdata}\QuotaHush\.var.env"""; Description: "Configure optional DeepSeek and Z.AI API keys"; Flags: postinstall skipifsilent unchecked

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\manage-process.ps1"" -ExecutablePath ""{app}\quotahush-server.exe"""; Flags: runhidden waituntilterminated; RunOnceId: "StopQuotaHush"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM "quotahush-server.exe"', '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

procedure VerifyCompanion;
var
  ResultCode: Integer;
begin
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\verify-health.ps1') + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
  begin
    RaiseException('QuotaHush was installed, but the local Companion did not become healthy.');
  end;
end;
