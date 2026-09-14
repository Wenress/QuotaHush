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
Source: "verify-health.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Run]
Filename: "{sys}\schtasks.exe"; Parameters: "/Create /TN ""QuotaHushServer"" /TR ""{app}\quotahush-server.exe"" /SC ONLOGON /F"; Flags: runhidden waituntilterminated
Filename: "{sys}\schtasks.exe"; Parameters: "/Run /TN ""QuotaHushServer"""; Flags: runhidden waituntilterminated; AfterInstall: VerifyCompanion

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""QuotaHushServer"""; Flags: runhidden waituntilterminated; RunOnceId: "StopQuotaHush"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""QuotaHushServer"" /F"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveQuotaHushTask"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "QuotaHushServer"', '', SW_HIDE,
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
