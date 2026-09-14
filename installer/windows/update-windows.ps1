param(
    [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [Parameter(Mandatory)][uri]$InstallerUrl,
    [Parameter(Mandatory)][uri]$ChecksumsUrl
)

$ErrorActionPreference = "Stop"
$Mutex = [Threading.Mutex]::new($false, "Local\QuotaHushUpdate")
$HasMutex = $false

function Assert-GitHubUrl {
    param([Parameter(Mandatory)][uri]$Url)
    if ($Url.Scheme -ne "https" -or $Url.Host -ne "github.com") {
        throw "Refusing an update URL that is not hosted on https://github.com."
    }
}

try {
    try {
        $HasMutex = $Mutex.WaitOne(0)
    } catch [Threading.AbandonedMutexException] {
        $HasMutex = $true
    }
    if (-not $HasMutex) { exit 0 }

    Assert-GitHubUrl -Url $InstallerUrl
    Assert-GitHubUrl -Url $ChecksumsUrl

    $DataDirectory = Join-Path $env:LOCALAPPDATA "QuotaHush"
    $UpdateDirectory = Join-Path $DataDirectory "updates\$Version"
    $LogPath = Join-Path $DataDirectory "logs\updater.log"
    $InstallerName = "QuotaHush-Setup-x64-$Version.exe"
    $InstallerPath = Join-Path $UpdateDirectory $InstallerName
    $ChecksumsPath = Join-Path $UpdateDirectory "SHA256SUMS.txt"

    New-Item -ItemType Directory -Path $UpdateDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path (Split-Path $LogPath) -Force | Out-Null
    Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format o) downloading QuotaHush $Version"

    Invoke-WebRequest -UseBasicParsing -Uri $InstallerUrl -OutFile $InstallerPath
    Invoke-WebRequest -UseBasicParsing -Uri $ChecksumsUrl -OutFile $ChecksumsPath

    $Pattern = '^([0-9a-fA-F]{64})\s+\*?' + [regex]::Escape($InstallerName) + '$'
    $ChecksumLine = Get-Content -LiteralPath $ChecksumsPath |
        Where-Object { $_ -match $Pattern } |
        Select-Object -First 1
    if (-not $ChecksumLine) {
        throw "The release checksum file does not contain $InstallerName."
    }
    $ExpectedHash = ([regex]::Match($ChecksumLine, $Pattern).Groups[1].Value).ToLowerInvariant()
    $ActualHash = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ActualHash -ne $ExpectedHash) {
        throw "The downloaded installer failed SHA-256 verification."
    }

    Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format o) verified QuotaHush $Version; starting setup"
    $Setup = Start-Process -FilePath $InstallerPath -ArgumentList @(
        "/VERYSILENT",
        "/SUPPRESSMSGBOXES",
        "/NORESTART",
        "/CLOSEAPPLICATIONS"
    ) -Wait -PassThru
    if ($Setup.ExitCode -ne 0) {
        throw "QuotaHush setup exited with code $($Setup.ExitCode)."
    }
    Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format o) installed QuotaHush $Version"
} catch {
    try {
        $LogDirectory = Join-Path $env:LOCALAPPDATA "QuotaHush\logs"
        New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
        Add-Content -LiteralPath (Join-Path $LogDirectory "updater.log") `
            -Value "$(Get-Date -Format o) update failed: $($_.Exception.Message)"
    } catch {}
    exit 1
} finally {
    if ($HasMutex) { $Mutex.ReleaseMutex() }
    $Mutex.Dispose()
}
