$ErrorActionPreference = "Stop"

$InstallDirectory = Join-Path $env:LOCALAPPDATA "Programs\QuotaHush"
$InstallExecutable = Join-Path $InstallDirectory "quotahush-server.exe"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValue = "QuotaHush Companion"

Remove-ItemProperty -Path $RunKey -Name $RunValue -ErrorAction SilentlyContinue
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
