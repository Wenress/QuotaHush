$ErrorActionPreference = "Stop"

$SourceDirectory = $PSScriptRoot
$SourceExecutable = Join-Path $SourceDirectory "quotahush-server.exe"
if (-not (Test-Path -LiteralPath $SourceExecutable)) {
    throw "quotahush-server.exe was not found next to this installer."
}

$InstallDirectory = Join-Path $env:LOCALAPPDATA "Programs\QuotaHush"
$InstallExecutable = Join-Path $InstallDirectory "quotahush-server.exe"
$ConfigDirectory = Join-Path $env:LOCALAPPDATA "QuotaHush"
$ConfigFile = Join-Path $ConfigDirectory ".var.env"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValue = "QuotaHush Companion"

Get-Process -Name "quotahush-server" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and [IO.Path]::GetFullPath($_.Path) -eq [IO.Path]::GetFullPath($InstallExecutable) } |
    Stop-Process -Force

New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $ConfigDirectory -Force | Out-Null
Copy-Item -LiteralPath $SourceExecutable -Destination $InstallExecutable -Force
Copy-Item -LiteralPath (Join-Path $SourceDirectory "uninstall.ps1") -Destination (Join-Path $InstallDirectory "uninstall.ps1") -Force

if (-not (Test-Path -LiteralPath $ConfigFile)) {
    Copy-Item -LiteralPath (Join-Path $SourceDirectory ".var.env.example") -Destination $ConfigFile
}

New-Item -Path $RunKey -Force | Out-Null
New-ItemProperty -Path $RunKey -Name $RunValue -PropertyType String `
    -Value ('"' + $InstallExecutable + '"') -Force | Out-Null
Start-Process -FilePath $InstallExecutable -WorkingDirectory $InstallDirectory

$Healthy = $false
for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $Response = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 1
        if ($Response.status -eq "ok" -and $Response.product -eq "QuotaHush") {
            $Healthy = $true
            break
        }
    } catch {}
}
if (-not $Healthy) {
    throw "QuotaHush was installed, but the local companion did not become healthy."
}

Write-Host "QuotaHush Companion installed successfully."
Write-Host "Configuration: $ConfigFile"
