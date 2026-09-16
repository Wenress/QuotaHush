param(
    [Parameter(Mandatory)]
    [string]$ExecutablePath,
    [ValidateRange(1, 60)]
    [int]$InitialRestartDelaySeconds = 2,
    [ValidateRange(5, 300)]
    [int]$MaximumRestartDelaySeconds = 60,
    [ValidateRange(10, 3600)]
    [int]$StableRunSeconds = 60
)

$ErrorActionPreference = "Stop"
$ResolvedExecutable = [IO.Path]::GetFullPath($ExecutablePath)
$WorkingDirectory = Split-Path -Parent $ResolvedExecutable
$DataDirectory = Join-Path $env:LOCALAPPDATA "QuotaHush"
$LogDirectory = Join-Path $DataDirectory "logs"
$LogPath = Join-Path $LogDirectory "watchdog.log"
$RuntimePath = Join-Path $DataDirectory "watchdog.json"
$StopPath = Join-Path $DataDirectory "watchdog.stop"
$Mutex = [Threading.Mutex]::new($false, "Local\QuotaHushCompanionWatchdog")
$HasMutex = $false
$CurrentProcessId = $PID

function Write-WatchdogLog {
    param([Parameter(Mandatory)][string]$Message)
    try {
        New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
        if ((Test-Path -LiteralPath $LogPath) -and
            (Get-Item -LiteralPath $LogPath).Length -gt 1MB) {
            $PreviousLog = "$LogPath.1"
            Remove-Item -LiteralPath $PreviousLog -Force -ErrorAction SilentlyContinue
            Move-Item -LiteralPath $LogPath -Destination $PreviousLog -Force
        }
        Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format o) $Message"
    } catch {}
}

function Write-WatchdogRuntime {
    param([int]$ChildProcessId = 0)
    try {
        New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
        $TemporaryPath = "$RuntimePath.tmp"
        @{
            pid = $CurrentProcessId
            child_pid = $ChildProcessId
            executable = $ResolvedExecutable
        } | ConvertTo-Json -Compress | Set-Content -LiteralPath $TemporaryPath -Encoding UTF8
        Move-Item -LiteralPath $TemporaryPath -Destination $RuntimePath -Force
    } catch {
        Write-WatchdogLog "failed to write runtime metadata: $($_.Exception.Message)"
    }
}

function Remove-OwnRuntime {
    try {
        if (-not (Test-Path -LiteralPath $RuntimePath)) { return }
        $Runtime = Get-Content -LiteralPath $RuntimePath -Raw | ConvertFrom-Json
        if ([int]$Runtime.pid -eq $CurrentProcessId) {
            Remove-Item -LiteralPath $RuntimePath -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

try {
    try {
        $HasMutex = $Mutex.WaitOne(0)
    } catch [Threading.AbandonedMutexException] {
        $HasMutex = $true
    }
    if (-not $HasMutex) { exit 0 }

    Write-WatchdogRuntime
    Write-WatchdogLog "watchdog started for $ResolvedExecutable"
    $RestartDelaySeconds = $InitialRestartDelaySeconds

    while (-not (Test-Path -LiteralPath $StopPath)) {
        if (-not (Test-Path -LiteralPath $ResolvedExecutable -PathType Leaf)) {
            Write-WatchdogLog "companion executable is missing; watchdog is stopping"
            break
        }

        $StartedAt = [DateTime]::UtcNow
        $ExitCode = $null
        try {
            $Child = Start-Process -FilePath $ResolvedExecutable `
                -WorkingDirectory $WorkingDirectory -PassThru
            Write-WatchdogRuntime -ChildProcessId $Child.Id
            $Child.WaitForExit()
            $ExitCode = $Child.ExitCode
        } catch {
            Write-WatchdogLog "failed to start or monitor companion: $($_.Exception.Message)"
        }
        Write-WatchdogRuntime

        if (Test-Path -LiteralPath $StopPath) { break }

        $RunSeconds = ([DateTime]::UtcNow - $StartedAt).TotalSeconds
        $ExitDescription = if ($null -eq $ExitCode) { "unknown" } else { [string]$ExitCode }
        Write-WatchdogLog "companion exited code=$ExitDescription runtime_seconds=$([math]::Round($RunSeconds, 1)); restarting in $RestartDelaySeconds seconds"

        $DelayMilliseconds = $RestartDelaySeconds * 1000
        for ($Waited = 0; $Waited -lt $DelayMilliseconds; $Waited += 250) {
            if (Test-Path -LiteralPath $StopPath) { break }
            Start-Sleep -Milliseconds 250
        }
        if (Test-Path -LiteralPath $StopPath) { break }

        if ($RunSeconds -ge $StableRunSeconds) {
            $RestartDelaySeconds = $InitialRestartDelaySeconds
        } else {
            $RestartDelaySeconds = [math]::Min(
                $MaximumRestartDelaySeconds,
                [math]::Max($InitialRestartDelaySeconds, $RestartDelaySeconds * 2)
            )
        }
    }
} catch {
    Write-WatchdogLog "watchdog failed: $($_.Exception.Message)"
    exit 1
} finally {
    Write-WatchdogLog "watchdog stopped"
    Remove-OwnRuntime
    if ($HasMutex) { $Mutex.ReleaseMutex() }
    $Mutex.Dispose()
}
