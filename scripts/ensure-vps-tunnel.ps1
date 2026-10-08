$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$connection = Join-Path $base 'connect-vps.ps1'
$logFolder = Join-Path $env:LOCALAPPDATA 'Owed'
$logPath = Join-Path $logFolder 'tunnel-health.log'
try {
  & $connection -NoBrowser | Out-Null
  $status = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5
  if (-not ($status.ok -and $status.app -eq 'Owed')) {
    throw 'Owed health check did not return an expected response.'
  }
} catch {
  New-Item -ItemType Directory -Force -Path $logFolder | Out-Null
  $time = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
  $message = "[$time] Owed tunnel recovery failed: $($_.Exception.Message)"
  Add-Content -LiteralPath $logPath -Value $message -Encoding UTF8
  if ((Get-Item $logPath).Length -gt 120000) {
    $tail = @(Get-Content $logPath -Tail 150)
    Set-Content -LiteralPath $logPath -Value $tail -Encoding UTF8
  }
  exit 1
}
