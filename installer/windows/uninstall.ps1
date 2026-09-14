$ErrorActionPreference = "Stop"

$InstallDirectory = Join-Path $env:LOCALAPPDATA "Programs\QuotaHush"
$InstallExecutable = Join-Path $InstallDirectory "quotahush-server.exe"

$AutostartScript = Join-Path $InstallDirectory "manage-autostart.ps1"
if (Test-Path -LiteralPath $AutostartScript) {
    & $AutostartScript -ExecutablePath $InstallExecutable -Remove
} else {
    Unregister-ScheduledTask -TaskName "QuotaHushServer" -Confirm:$false -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
        -Name "QuotaHush Companion" -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Startup")) `
        "QuotaHush Companion.lnk") -Force -ErrorAction SilentlyContinue
}
Get-Process -Name "quotahush-server" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and [IO.Path]::GetFullPath($_.Path) -eq [IO.Path]::GetFullPath($InstallExecutable) } |
    Stop-Process -Force

if (Test-Path -LiteralPath $InstallDirectory) {
    $Resolved = (Resolve-Path -LiteralPath $InstallDirectory).Path
    $ExpectedParent = (Resolve-Path -LiteralPath (Join-Path $env:LOCALAPPDATA "Programs")).Path
    if (-not $Resolved.StartsWith($ExpectedParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove an unexpected installation directory: $Resolved"
    }
    Remove-Item -LiteralPath $Resolved -Recurse -Force
}

Write-Host "QuotaHush Companion removed. Provider configuration was preserved."
