$ErrorActionPreference = "Stop"
. "$PSScriptRoot\windows_common.ps1"

$Startup = [Environment]::GetFolderPath('Startup')
$ShortcutPaths = @((Join-Path $Startup "QuotaHushServer.lnk"))
$Removed = $false
foreach ($ShortcutPath in $ShortcutPaths) {
    if (Test-Path -LiteralPath $ShortcutPath) {
        Remove-Item -LiteralPath $ShortcutPath -Force
        Write-Host "Removed $ShortcutPath"
        $Removed = $true
    }
}
if (-not $Removed) {
    Write-Host "No QuotaHush startup shortcut found."
}
[void](Stop-QuotaHushServer -ServerDir $PSScriptRoot)
