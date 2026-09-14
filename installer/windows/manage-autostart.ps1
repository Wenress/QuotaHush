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

if ($Remove) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $RunKey -Name $RunValue -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $StartupShortcut -Force -ErrorAction SilentlyContinue
    exit 0
}

if (-not (Test-Path -LiteralPath $ResolvedExecutable -PathType Leaf)) {
    throw "QuotaHush executable was not found: $ResolvedExecutable"
}

$Action = New-ScheduledTaskAction -Execute $ResolvedExecutable `
    -WorkingDirectory (Split-Path -Parent $ResolvedExecutable)
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

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
        -Value ('"' + $ResolvedExecutable + '"') -Force | Out-Null
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($StartupShortcut)
    $Shortcut.TargetPath = $ResolvedExecutable
    $Shortcut.WorkingDirectory = Split-Path -Parent $ResolvedExecutable
    $Shortcut.WindowStyle = 7
    $Shortcut.Description = "QuotaHush local Companion"
    $Shortcut.Save()
}
