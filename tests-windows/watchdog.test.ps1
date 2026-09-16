$ErrorActionPreference = "Stop"

$TestRoot = Join-Path ([IO.Path]::GetTempPath()) `
    ("quotahush-watchdog-test-" + [guid]::NewGuid().ToString("N"))
$PreviousLocalAppData = $env:LOCALAPPDATA
$Supervisor = $null

try {
    New-Item -ItemType Directory -Path $TestRoot | Out-Null
    $env:LOCALAPPDATA = $TestRoot
    $Watchdog = (Resolve-Path `
        (Join-Path $PSScriptRoot "..\installer\windows\watchdog.ps1")).Path
    $DummyExecutable = (Get-Command powershell.exe).Source
    $DummyCommand = @'
$DataDirectory = Join-Path $env:LOCALAPPDATA "QuotaHush"
$RuntimePath = Join-Path $DataDirectory "server.json"
New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
@{ pid = $PID; server_dir = $PSScriptRoot } | ConvertTo-Json -Compress |
    Set-Content -LiteralPath $RuntimePath -Encoding UTF8
Start-Sleep -Milliseconds 750
'@
    $EncodedCommand = [Convert]::ToBase64String(
        [Text.Encoding]::Unicode.GetBytes($DummyCommand))
    $DummyArguments = "-NoProfile -EncodedCommand $EncodedCommand"
    $TestMutex = "Local\QuotaHushCompanionWatchdogTest" + [guid]::NewGuid().ToString("N")
    $Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $Watchdog + `
        '" -ExecutablePath "' + $DummyExecutable + `
        '" -ExecutableArguments "' + $DummyArguments + `
        '" -MutexName "' + $TestMutex + `
        '" -InitialRestartDelaySeconds 1 -MaximumRestartDelaySeconds 5 -StableRunSeconds 10'

    $Supervisor = Start-Process -FilePath (Get-Command powershell.exe).Source `
        -ArgumentList $Arguments -WindowStyle Hidden -PassThru
    $LogPath = Join-Path $TestRoot "QuotaHush\logs\watchdog.log"
    $ObservedRestarts = 0

    for ($Attempt = 0; $Attempt -lt 48; $Attempt++) {
        Start-Sleep -Milliseconds 250
        if (Test-Path -LiteralPath $LogPath) {
            $ObservedRestarts = @(
                Select-String -LiteralPath $LogPath -Pattern "companion exited"
            ).Count
            if ($ObservedRestarts -ge 2) { break }
        }
    }
    if ($ObservedRestarts -lt 2) {
        throw "Expected at least two supervised exits, observed $ObservedRestarts."
    }

    Set-Content -LiteralPath (Join-Path $TestRoot "QuotaHush\watchdog.stop") `
        -Value "stop" -Encoding ASCII
    if (-not $Supervisor.WaitForExit(10000)) {
        Stop-Process -Id $Supervisor.Id -Force
        throw "Watchdog did not stop after the stop signal."
    }
    if ($Supervisor.ExitCode -ne 0) {
        throw "Watchdog exited with code $($Supervisor.ExitCode)."
    }
    if (Test-Path -LiteralPath (Join-Path $TestRoot "QuotaHush\watchdog.json")) {
        throw "Watchdog runtime metadata was not removed."
    }

    Write-Host "Observed $ObservedRestarts supervised process exits."
} finally {
    $env:LOCALAPPDATA = $PreviousLocalAppData
    if ($Supervisor -and -not $Supervisor.HasExited) {
        Stop-Process -Id $Supervisor.Id -Force -ErrorAction SilentlyContinue
    }
    $ResolvedTestRoot = (Resolve-Path -LiteralPath $TestRoot `
        -ErrorAction SilentlyContinue).Path
    $ResolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    if ($ResolvedTestRoot -and
        $ResolvedTestRoot.StartsWith($ResolvedTemp + '\') -and
        (Split-Path -Leaf $ResolvedTestRoot).StartsWith("quotahush-watchdog-test-")) {
        Remove-Item -LiteralPath $ResolvedTestRoot -Recurse -Force
    }
}
