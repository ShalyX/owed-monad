$ErrorActionPreference = 'Stop'
$ssh = 'C:\Program Files\Git\usr\bin\ssh.exe'
if (-not (Test-Path $ssh)) {throw 'Git SSH client not found'}
$listening = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  $p = Start-Process -FilePath $ssh -ArgumentList @('-N','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-L','127.0.0.1:3001:127.0.0.1:3001','caraxes-vps') -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 15
if (-not $health.ok -or $health.inferenceProvider -ne 'private-vps') {throw 'Owed VPS endpoint is not healthy'}
Write-Output 'Owed is ready at http://localhost:3001 (private SSH tunnel).'
Start-Process 'http://localhost:3001'
