$ErrorActionPreference = 'Stop'
# Run as the Windows user who owns the Owed checkout. No administrator account or public port needed.
$name = 'Owed Private Tunnel'
$recovery = Join-Path $PSScriptRoot 'ensure-vps-tunnel.ps1'
if (-not (Test-Path $recovery)) { throw 'Owed recovery script was not found.' }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $recovery + '"')
$everyMinute = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
  Set-ScheduledTask -TaskName $name -Action $action -Trigger @($everyMinute, $atLogon) -Settings $settings | Out-Null
} else {
  Register-ScheduledTask -TaskName $name -Action $action -Trigger @($everyMinute, $atLogon) -Settings $settings -Description 'Reconnect Owed localhost tunnel when it drops, without exposing VPS ports.' | Out-Null
}
Write-Output 'Owed private tunnel recovery installed for each user login and every minute.'
Get-ScheduledTaskInfo -TaskName $name | Format-List NextRunTime, LastRunTime, LastTaskResult
