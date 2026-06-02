$ErrorActionPreference = 'Stop'

# 绿色免安装(dir)分发：桌面快捷方式直接指向 release\win-unpacked\CoinFlow.exe，
# 即解压即用的绿色文件夹中的可执行文件。

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$ReleaseDir = Join-Path $ProjectRoot 'release'

if (-not (Test-Path -LiteralPath $ReleaseDir)) {
  throw "Release directory not found: $ReleaseDir"
}

$UnpackedPath = Join-Path $ReleaseDir 'win-unpacked\CoinFlow.exe'

if (Test-Path -LiteralPath $UnpackedPath) {
  $TargetExe = Get-Item -LiteralPath $UnpackedPath
} else {
  # 兜底：兼容历史遗留的便携 exe
  $TargetExe = Get-ChildItem -LiteralPath $ReleaseDir -File -Filter 'CoinFlow-*-portable.exe' |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
}

if (-not $TargetExe) {
  throw "No CoinFlow executable found in: $ReleaseDir"
}

$DesktopDir = [Environment]::GetFolderPath('DesktopDirectory')
if ([string]::IsNullOrWhiteSpace($DesktopDir)) {
  throw 'Unable to resolve the Windows desktop directory.'
}

$ShortcutPath = Join-Path $DesktopDir 'CoinFlow.lnk'
$IconPath = Join-Path $ProjectRoot 'assets\icons\icon.ico'
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetExe.FullName
$Shortcut.WorkingDirectory = $TargetExe.DirectoryName
$Shortcut.Description = 'Open the latest packaged CoinFlow desktop app'

if (Test-Path -LiteralPath $IconPath) {
  $Shortcut.IconLocation = $IconPath
}

$Shortcut.Save()

Write-Host "COINFLOW_SHORTCUT=$ShortcutPath"
Write-Host "COINFLOW_SHORTCUT_TARGET=$($TargetExe.FullName)"
