# Local verification helper for gruesome.arcade
#
# built by gruesøme
# SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f
#
# Starts `vercel dev` on an available port, waits for /api/config,
# then runs `npm run doctor` and `npm run smoke` against that BASE_URL.

[CmdletBinding()]
param(
  [int]$StartPort = 3014,
  [int]$MaxTries = 16
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = Resolve-Path (Join-Path $PSScriptRoot '..')

function Test-PortInUse {
  param([int]$Port)
  try {
    $inUse = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    return [bool]$inUse
  } catch {
    return $false
  }
}

$port = $null
for ($i = 0; $i -lt $MaxTries; $i++) {
  $candidate = $StartPort + $i
  if (-not (Test-PortInUse -Port $candidate)) {
    $port = $candidate
    break
  }
}

if (-not $port) {
  throw "Could not find a free port in range $StartPort..$($StartPort + $MaxTries - 1)."
}

Write-Host "Using port: $port"

$job = Start-Job -ArgumentList $repo.Path, $port -ScriptBlock {
  param($r, $p)
  Set-Location $r
  npx vercel dev --listen $p --yes
}

try {
  $deadline = (Get-Date).AddSeconds(90)
  $ready = $false

  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/api/config" -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 600) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  if (-not $ready) {
    throw "Server did not become ready on port $port within 90s."
  }

  Set-Location $repo.Path
  $env:BASE_URL = "http://127.0.0.1:$port"

  npm run doctor
  npm run smoke

  Write-Host "OK: doctor + smoke"
} finally {
  try { Stop-Job $job -Force } catch {}
  try { Remove-Job $job -Force } catch {}
}
