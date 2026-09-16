$ErrorActionPreference = "Stop"

$InstallDirectory = Join-Path $env:LOCALAPPDATA "Programs\QuotaHush"
$InstallExecutable = Join-Path $InstallDirectory "quotahush-server.exe"
$DataDirectory = Join-Path $env:LOCALAPPDATA "QuotaHush"
$WatchdogStopFile = Join-Path $DataDirectory "watchdog.stop"
$WatchdogRuntimeFile = Join-Path $DataDirectory "watchdog.json"

$AutostartScript = Join-Path $InstallDirectory "manage-autostart.ps1"
if (Test-Path -LiteralPath $AutostartScript) {
    & $AutostartScript -ExecutablePath $InstallExecutable -Remove
} else {
    New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
    Set-Content -LiteralPath $WatchdogStopFile -Value "stop" -Encoding ASCII
    Unregister-ScheduledTask -TaskName "QuotaHushServer" -Confirm:$false -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
        -Name "QuotaHush Companion" -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Startup")) `
        "QuotaHush Companion.lnk") -Force -ErrorAction SilentlyContinue
}
Get-Process -Name "quotahush-server" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and [IO.Path]::GetFullPath($_.Path) -eq [IO.Path]::GetFullPath($InstallExecutable) } |
    Stop-Process -Force

for ($Attempt = 0; $Attempt -lt 20 -and (Test-Path -LiteralPath $WatchdogRuntimeFile); $Attempt++) {
    Start-Sleep -Milliseconds 250
}

if (Test-Path -LiteralPath $InstallDirectory) {
    $Resolved = (Resolve-Path -LiteralPath $InstallDirectory).Path
    $ExpectedParent = (Resolve-Path -LiteralPath (Join-Path $env:LOCALAPPDATA "Programs")).Path
    if (-not $Resolved.StartsWith($ExpectedParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove an unexpected installation directory: $Resolved"
    }
    Remove-Item -LiteralPath $Resolved -Recurse -Force
}

Write-Host "QuotaHush Companion removed. Provider configuration was preserved."
