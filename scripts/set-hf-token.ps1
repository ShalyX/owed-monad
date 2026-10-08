# Run locally in PowerShell. Never paste the token into chat, git or shared logs.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$secret = Read-Host 'Paste your Hugging Face token (input hidden)' -AsSecureString
if ($null -eq $secret -or $secret.Length -lt 8) { throw 'No valid token was entered.' }
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if ($token -notmatch '^hf_[A-Za-z0-9_\-]+$') { throw 'Token does not look like an HF user token.' }
  $envpath = Join-Path $root '.env'
  $contents = "HF_TOKEN=$token" + [Environment]::NewLine + "HF_WHISPER_MODEL=openai/whisper-large-v3" + [Environment]::NewLine + "HF_GEMMA_MODEL=google/gemma-3-12b-it" + [Environment]::NewLine
  [IO.File]::WriteAllText($envpath, $contents, (New-Object System.Text.UTF8Encoding($false)))
  Write-Output "Saved to the Git-ignored .env file. Token was not printed."
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Variable token -ErrorAction SilentlyContinue
}
