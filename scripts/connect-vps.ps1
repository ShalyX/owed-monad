$ErrorActionPreference = 'Stop'
$ssh = 'C:\Program Files\Git\usr\bin\ssh.exe'
if (-not (Test-Path $ssh)) { throw 'Git SSH client not found' }

function Test-Owed {
  try {
    $h = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5
    return ($h.ok -and $h.app -eq 'Owed' -and $h.inferenceProvider -eq 'private-vps')
  } catch {
    return $false
  }
}
if (-not (Test-Owed)) {
  # Only stop an Owed SSH forwarding process we launched; never another app.
  $listeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    $line = [string]$owner.CommandLine
    if ($owner.Name -notmatch '^ssh\.exe$' -or
        $line -notmatch 'caraxes-vps' -or
        $line -notmatch '127\.0\.0\.1:3001:127\.0\.0\.1:3001') {
      throw "Port 3001 is in use by an unrelated process. Not stopping it."
    }
    Stop-Process -Id $listener.OwningProcess -Force
  }
  $args = @('-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=20',
    '-o', 'ServerAliveCountMax=3', '-L', '127.0.0.1:3001:127.0.0.1:3001', 'caraxes-vps')
  $process = Start-Process -FilePath $ssh -ArgumentList $args -PassThru -WindowStyle Hidden
  $healthy = $false
  for ($i = 0; $i -lt 6; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Owed) { $healthy = $true; break }
    if ($process.HasExited) { break }
  }
  if (-not $healthy) { throw "Could not establish Owed's private connection. The VPS may be temporarily unreachable." }
}
Write-Output 'Owed is ready at http://localhost:3001 (private SSH tunnel).'
Start-Process 'http://localhost:3001'
