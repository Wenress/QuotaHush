param(
    [Parameter(Mandatory)]
    [string]$ExecutablePath,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$TaskName = "QuotaHushServer"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValue = "QuotaHush Companion"
$StartupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "QuotaHush Companion.lnk"
$ResolvedExecutable = [IO.Path]::GetFullPath($ExecutablePath)
$InstallDirectory = Split-Path -Parent $ResolvedExecutable
$WatchdogPath = Join-Path $InstallDirectory "watchdog.ps1"
$PowerShellExecutable = Join-Path $PSHOME "powershell.exe"
$DataDirectory = Join-Path $env:LOCALAPPDATA "QuotaHush"
$StopPath = Join-Path $DataDirectory "watchdog.stop"
$WatchdogArguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + `
    $WatchdogPath + '" -ExecutablePath "' + $ResolvedExecutable + '"'

if ($Remove) {
    New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
    Set-Content -LiteralPath $StopPath -Value "stop" -Encoding ASCII
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $RunKey -Name $RunValue -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $StartupShortcut -Force -ErrorAction SilentlyContinue
    exit 0
}

if (-not (Test-Path -LiteralPath $ResolvedExecutable -PathType Leaf)) {
    throw "QuotaHush executable was not found: $ResolvedExecutable"
}
if (-not (Test-Path -LiteralPath $WatchdogPath -PathType Leaf)) {
    throw "QuotaHush watchdog was not found: $WatchdogPath"
}
if (-not (Test-Path -LiteralPath $PowerShellExecutable -PathType Leaf)) {
    throw "Windows PowerShell was not found: $PowerShellExecutable"
}

New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
Remove-Item -LiteralPath $StopPath -Force -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction -Execute $PowerShellExecutable `
    -Argument $WatchdogArguments -WorkingDirectory $InstallDirectory
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
        -Settings $Settings -Description "QuotaHush local Companion" `
        -Force -ErrorAction Stop | Out-Null
    if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
        throw "Task Scheduler did not retain the QuotaHush task."
    }
    Remove-ItemProperty -Path $RunKey -Name $RunValue -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $StartupShortcut -Force -ErrorAction SilentlyContinue
} catch {
    # Some managed Windows accounts deny per-user scheduled-task creation.
    # In that case retain automatic startup through the standard user Run key.
    New-Item -Path $RunKey -Force | Out-Null
    New-ItemProperty -Path $RunKey -Name $RunValue -PropertyType String `
        -Value ('"' + $PowerShellExecutable + '" ' + $WatchdogArguments) -Force | Out-Null
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($StartupShortcut)
    $Shortcut.TargetPath = $PowerShellExecutable
    $Shortcut.Arguments = $WatchdogArguments
    $Shortcut.WorkingDirectory = $InstallDirectory
    $Shortcut.WindowStyle = 7
    $Shortcut.Description = "QuotaHush local Companion"
    $Shortcut.Save()
}

Start-Process -FilePath $PowerShellExecutable -ArgumentList $WatchdogArguments `
    -WorkingDirectory $InstallDirectory -WindowStyle Hidden
