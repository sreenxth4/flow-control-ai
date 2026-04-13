param(
    [int]$Port = 5000,
    [string]$BindHost = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runPyPath = Join-Path $backendDir "run.py"

if (-not (Test-Path $runPyPath)) {
    throw "run.py not found at: $runPyPath"
}

Write-Host "[Start] Backend directory: $backendDir"

# 1) Stop old backend python processes launched from this backend folder.
$pythonProcesses = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'"
$backendProcesses = $pythonProcesses | Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match "run\.py" -and
    $_.CommandLine -like "*TrafficFlowAnalysis_Learning\\backend*"
}

foreach ($proc in $backendProcesses) {
    try {
        Write-Host "[Stop] Existing backend process PID $($proc.ProcessId)"
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    } catch {
        Write-Host "[Warn] Could not stop PID $($proc.ProcessId): $($_.Exception.Message)"
    }
}

Start-Sleep -Milliseconds 500

# 2) If port is still occupied, handle stale process on same port.
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $ownerPid = $listener.OwningProcess
    $ownerProc = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue

    if ($ownerProc -and $ownerProc.Name -ieq "python.exe") {
        Write-Host "[Stop] Python process on port $Port (PID $ownerPid)"
        Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    } else {
        throw "Port $Port is in use by PID $ownerPid ($($ownerProc.Name)). Stop it first."
    }
}

# 3) Start exactly one backend instance.
$pythonExe = (Get-Command python -ErrorAction Stop).Source
Write-Host "[Run] Starting backend with: $pythonExe run.py"

$proc = Start-Process -FilePath $pythonExe -ArgumentList "run.py" -WorkingDirectory $backendDir -PassThru

try {
    $psProc = Get-Process -Id $proc.Id -ErrorAction Stop
    $psProc.PriorityClass = "High"
    Write-Host "[Tune] Set backend process priority: High"
} catch {
    Write-Host "[Warn] Could not set process priority: $($_.Exception.Message)"
}

Start-Sleep -Seconds 1
if ($proc.HasExited) {
    throw "Backend exited immediately. ExitCode: $($proc.ExitCode)"
}

# 4) Health check with retry.
$healthUrl = "http://${BindHost}:$Port/api/v1/junctions"
$healthy = $false

for ($i = 1; $i -le 20; $i++) {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
        if ($response -and $response.junctions) {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if (-not $healthy) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    throw "Backend started but health check failed: $healthUrl"
}

Write-Host "[OK] Backend running at http://${BindHost}:$Port (PID $($proc.Id))"
Write-Host "[OK] Health endpoint responding: $healthUrl"