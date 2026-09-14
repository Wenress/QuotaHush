# Registers a Task Scheduler task that starts the QuotaHush local server
# silently (no console window) at user logon.
#
# Runs the source launcher directly with the base interpreter's pythonw.exe.
# This keeps the server windowless while making the actual server process the
# Task Scheduler action, so Stop-ScheduledTask terminates it reliably.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\windows_common.ps1"

$TaskName = "QuotaHushServer"
$ServerDir = $PSScriptRoot
$Runtime = Get-QuotaHushPythonRuntime -ServerDir $ServerDir

$Action = New-ScheduledTaskAction -Execute $Runtime.Pythonw `
    -Argument "`"$($Runtime.Launcher)`"" `
    -WorkingDirectory $ServerDir

$Trigger = New-ScheduledTaskTrigger -AtLogOn

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
[void](Stop-QuotaHushServer -ServerDir $ServerDir)
Wait-QuotaHushServerStop
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Settings $Settings -Description "Local usage server for QuotaHush clients" `
    -Force | Out-Null

Write-Host "Task '$TaskName' registered. Starting it now..."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 1
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
