$ErrorActionPreference = 'Stop'

# 绿色免安装(dir)分发：本次打包产物为 release\win-unpacked\ 整套绿色文件夹。
# 本脚本清理 release\ 下的历史残留，只保留当前的 win-unpacked\，
# 避免旧版便携 exe、安装包与构建调试文件持续堆积。

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$ReleaseDir = Join-Path $ProjectRoot 'release'

if (-not (Test-Path -LiteralPath $ReleaseDir)) {
  Write-Host "COINFLOW_RELEASE_CLEANUP=skipped"
  return
}

$UnpackedDir = Join-Path $ReleaseDir 'win-unpacked'
$UnpackedExe = Join-Path $UnpackedDir 'CoinFlow.exe'

if (-not (Test-Path -LiteralPath $UnpackedExe)) {
  throw "Current green build not found: $UnpackedExe"
}

# 1. 删除 release\ 下除 win-unpacked 之外的所有目录（历史套包、安装中间产物等）
Get-ChildItem -LiteralPath $ReleaseDir -Directory |
  Where-Object { $_.Name -ne 'win-unpacked' } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
    Write-Host "COINFLOW_RELEASE_REMOVED=$($_.FullName)"
  }

# 2. 删除 release\ 根目录下所有散落文件（旧版便携 exe、builder-debug.yml 等）
Get-ChildItem -LiteralPath $ReleaseDir -File |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Host "COINFLOW_RELEASE_REMOVED=$($_.FullName)"
  }

Write-Host "COINFLOW_RELEASE_CURRENT=$UnpackedDir"
