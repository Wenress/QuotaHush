function Get-QuotaHushPythonRuntime {
    param([Parameter(Mandatory)][string]$ServerDir)

    $VenvDir = Join-Path $ServerDir ".venv"
    $PythonExe = Join-Path $VenvDir "Scripts\python.exe"
    if (Test-Path -LiteralPath $PythonExe) {
        & $PythonExe -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)" 2>$null
        if ($LASTEXITCODE -ne 0) {
            $ResolvedServerDir = [IO.Path]::GetFullPath($ServerDir).TrimEnd('\')
            $ResolvedVenvDir = [IO.Path]::GetFullPath($VenvDir).TrimEnd('\')
            if (
                [IO.Path]::GetDirectoryName($ResolvedVenvDir) -ne $ResolvedServerDir -or
                [IO.Path]::GetFileName($ResolvedVenvDir) -ne ".venv"
            ) {
                throw "Refusing to rebuild an unexpected virtual environment path: $ResolvedVenvDir"
            }
            Write-Warning "The existing Python environment is unusable and will be rebuilt."
            Remove-Item -LiteralPath $ResolvedVenvDir -Recurse -Force
        }
    }
    if (-not (Test-Path -LiteralPath $PythonExe)) {
        $Uv = Get-Command uv -ErrorAction SilentlyContinue
        if ($Uv) {
            Write-Host "Creating the Python environment with uv..."
            Push-Location $ServerDir
            try {
                & $Uv.Source sync | Out-Host
                if ($LASTEXITCODE -ne 0) {
                    throw "uv sync failed with exit code $LASTEXITCODE"
                }
            } finally {
                Pop-Location
            }
        } else {
            Write-Host "uv was not found; creating the environment with Python's built-in venv module..."
            $PyLauncher = Get-Command py -ErrorAction SilentlyContinue
            $Python = Get-Command python -ErrorAction SilentlyContinue
            $EnvironmentCreated = $false
            if ($PyLauncher) {
                & $PyLauncher.Source -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)" 2>$null
                if ($LASTEXITCODE -eq 0) {
                    & $PyLauncher.Source -3 -m venv $VenvDir
                    $EnvironmentCreated = $LASTEXITCODE -eq 0
                }
            }
            if (-not $EnvironmentCreated -and $Python) {
                & $Python.Source -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"
                if ($LASTEXITCODE -eq 0) {
                    & $Python.Source -m venv $VenvDir
                    $EnvironmentCreated = $LASTEXITCODE -eq 0
                }
            }
            if (-not $EnvironmentCreated) {
                throw "Python 3.11 or newer was not found on PATH. Install Python or uv, then retry."
            }
        }
    }

    $PythonCommand = "from pathlib import Path; import sys; print(Path(sys._base_executable).with_name('pythonw.exe'))"
    $PythonwExe = & $PythonExe -c $PythonCommand
    if (-not (Test-Path -LiteralPath $PythonwExe)) {
        throw "pythonw.exe not found at $PythonwExe"
    }

    [PSCustomObject]@{
        Python = $PythonExe
        Pythonw = $PythonwExe
        Launcher = Join-Path $ServerDir "run_server.pyw"
    }
}

function Get-QuotaHushRuntimeFile {
    if ($env:LOCALAPPDATA) {
        return Join-Path $env:LOCALAPPDATA "QuotaHush\server.json"
    }
    return Join-Path $env:USERPROFILE ".local\state\quotahush\server.json"
}

function Stop-QuotaHushServer {
    param([Parameter(Mandatory)][string]$ServerDir)

    $ExpectedDir = [IO.Path]::GetFullPath($ServerDir).TrimEnd('\')
    $EscapedDir = [WildcardPattern]::Escape($ExpectedDir)
    $RuntimeFile = Get-QuotaHushRuntimeFile
    $Stopped = $false

    if (Test-Path -LiteralPath $RuntimeFile) {
        try {
            $Runtime = Get-Content -LiteralPath $RuntimeFile -Raw | ConvertFrom-Json
            $RecordedDir = [IO.Path]::GetFullPath([string]$Runtime.server_dir).TrimEnd('\')
            if ([string]::Equals($ExpectedDir, $RecordedDir, [StringComparison]::OrdinalIgnoreCase)) {
                $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$Runtime.pid)" -ErrorAction Stop
                if (
                    $Process.Name -in @("python.exe", "pythonw.exe") -and
                    $Process.CommandLine -like "*$EscapedDir*run_server.pyw*"
                ) {
                    Stop-Process -Id $Process.ProcessId -Force
                    $Stopped = $true
                }
                Remove-Item -LiteralPath $RuntimeFile -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Warning "Could not read runtime metadata from $RuntimeFile"
        }
    }

    if (-not $Stopped) {
        try {
            Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe' OR Name = 'python.exe'" -ErrorAction Stop |
                Where-Object { $_.CommandLine -like "*$EscapedDir*run_server.pyw*" } |
                ForEach-Object {
                    Stop-Process -Id $_.ProcessId -Force
                    $Stopped = $true
                }
        } catch {
            Write-Warning "Could not inspect legacy QuotaHush processes: $($_.Exception.Message)"
        }
    }

    return $Stopped
}

function Wait-QuotaHushServerStop {
    param([int]$TimeoutSeconds = 10)

    $Deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $Deadline) {
        $Client = [Net.Sockets.TcpClient]::new()
        try {
            $Connect = $Client.ConnectAsync("127.0.0.1", 8765)
            if (-not $Connect.Wait(250) -or $Connect.IsFaulted) {
                return
            }
        } catch {
            return
        } finally {
            $Client.Dispose()
        }
        Start-Sleep -Milliseconds 250
    }
    throw "QuotaHush server did not stop within $TimeoutSeconds seconds."
}
