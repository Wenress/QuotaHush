# Places a shortcut in the user's Startup folder so the QuotaHush local
# server starts silently (no console window) at every login. Doesn't
# require Task Scheduler permissions.
#
# Prefer install_task.ps1 instead: Windows deliberately throttles
# Startup-folder shortcuts by several minutes after boot/login, while
# Task Scheduler tasks are not subject to that delay.
#
# Uses the base interpreter's pythonw.exe with the source launcher so the
# process stays windowless without an intermediate wrapper.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\windows_common.ps1"

$ServerDir = $PSScriptRoot
$Runtime = Get-QuotaHushPythonRuntime -ServerDir $ServerDir

$Startup = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $Startup "QuotaHushServer.lnk"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Runtime.Pythonw
$Shortcut.Arguments = "`"$($Runtime.Launcher)`""
$Shortcut.WorkingDirectory = $ServerDir
$Shortcut.WindowStyle = 7  # minimized
$Shortcut.Description = "QuotaHush local usage server"
$Shortcut.Save()

Write-Host "Shortcut created at $ShortcutPath"

Write-Host "Starting server now..."
[void](Stop-QuotaHushServer -ServerDir $ServerDir)
Wait-QuotaHushServerStop
Start-Process -FilePath $Runtime.Pythonw `
    -ArgumentList "`"$($Runtime.Launcher)`"" `
    -WorkingDirectory $ServerDir -WindowStyle Hidden
Start-Sleep -Seconds 1
Write-Host "Done. Check http://127.0.0.1:8765/health"
