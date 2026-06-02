$ErrorActionPreference = 'Stop'

# NSIS 安装版 + 自动更新分发：本次打包产物包含安装包、自动更新元数据与中间套包。
# 本脚本清理 release\ 历史残留，只保留「当前版本」自动更新所需的文件：
#   - CoinFlow-Setup-<version>.exe            安装包（也是家人下载的安装文件）
#   - CoinFlow-Setup-<version>.exe.blockmap   增量更新差分索引
#   - latest.yml                              electron-updater 读取的更新清单
#   - win-unpacked\                           打包中间产物（开发自测用）
# 这三个文件 + 安装包就是需要上传到「国内对象存储」供自动更新下载的内容。

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
$Version = $PackageJson.version
$SetupName = "CoinFlow-Setup-$Version.exe"
$SetupPath = Join-Path $ReleaseDir $SetupName

if (-not (Test-Path -LiteralPath $SetupPath)) {
  throw "Current installer not found: $SetupPath"
}

# 需要保留的文件（仅当前版本 + 更新清单）
$KeepFiles = @(
  $SetupName,
  "$SetupName.blockmap",
  'latest.yml'
)

# 1. 删除 release\ 下除 win-unpacked 之外的所有目录
Get-ChildItem -LiteralPath $ReleaseDir -Directory |
  Where-Object { $_.Name -ne 'win-unpacked' } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
    Write-Host "COINFLOW_RELEASE_REMOVED=$($_.FullName)"
  }

# 2. 删除 release\ 根目录下不在保留清单中的散落文件
#    （旧版安装包、旧版 blockmap、builder-debug.yml 等）
Get-ChildItem -LiteralPath $ReleaseDir -File |
  Where-Object { $KeepFiles -notcontains $_.Name } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Host "COINFLOW_RELEASE_REMOVED=$($_.FullName)"
  }

Write-Host "COINFLOW_RELEASE_CURRENT=$SetupPath"
