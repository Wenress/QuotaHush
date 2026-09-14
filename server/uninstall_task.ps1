$ErrorActionPreference = "Stop"
. "$PSScriptRoot\windows_common.ps1"

$TaskName = "QuotaHushServer"
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
[void](Stop-QuotaHushServer -ServerDir $PSScriptRoot)
Write-Host "QuotaHush tasks removed (if they existed)."
