[CmdletBinding()]
param(
  [string]$Bind = "0.0.0.0",
  [int]$Port = 7878
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# 가상환경 자동 활성화
$venvActivate = Join-Path $root ".venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
  Write-Host "가상환경 활성화: $venvActivate" -ForegroundColor Cyan
  & $venvActivate
}

Write-Host "voicewright serve --host $Bind --port $Port" -ForegroundColor Green
& voicewright serve --host $Bind --port $Port
