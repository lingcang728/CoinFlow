$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$PackageJsonPath = Join-Path $ProjectRoot 'package.json'
$ReleaseDir = Join-Path $ProjectRoot 'release'

if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
  throw "package.json not found: $PackageJsonPath"
}

if (-not (Test-Path -LiteralPath $ReleaseDir)) {
  Write-Host "COINFLOW_RELEASE_CLEANUP=skipped"
  return
}

$PackageJson = Get-Content -Raw -LiteralPath $PackageJsonPath | ConvertFrom-Json
$CurrentPortableName = "CoinFlow-$($PackageJson.version)-portable.exe"
$CurrentPortablePath = Join-Path $ReleaseDir $CurrentPortableName

if (-not (Test-Path -LiteralPath $CurrentPortablePath)) {
  throw "Current portable executable not found: $CurrentPortablePath"
}

Get-ChildItem -LiteralPath $ReleaseDir -File -Filter 'CoinFlow-*-portable.exe' |
  Where-Object { $_.Name -ne $CurrentPortableName } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Host "COINFLOW_RELEASE_REMOVED=$($_.FullName)"
  }

Get-ChildItem -LiteralPath $ReleaseDir -Directory |
  Where-Object { $_.Name -ne 'win-unpacked' } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
    Write-Host "COINFLOW_RELEASE_REMOVED=$($_.FullName)"
  }

Write-Host "COINFLOW_RELEASE_CURRENT=$CurrentPortablePath"
