$ErrorActionPreference = "SilentlyContinue"

for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    Start-Sleep -Milliseconds 300
    $Response = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 1
    if ($Response.status -eq "ok" -and $Response.product -eq "QuotaHush") {
        exit 0
    }
}

exit 1
