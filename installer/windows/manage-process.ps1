param(
    [Parameter(Mandatory)]
    [string]$ExecutablePath
)

$ErrorActionPreference = "Stop"
$ExpectedPath = [IO.Path]::GetFullPath($ExecutablePath)

Get-Process -Name "quotahush-server" -ErrorAction SilentlyContinue |
    Where-Object {
        try {
            $_.Path -and [IO.Path]::GetFullPath($_.Path) -eq $ExpectedPath
        } catch {
            $false
        }
    } |
    Stop-Process -Force
