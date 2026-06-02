$ErrorActionPreference = 'Stop'

# NSIS 安装版分发：正式桌面快捷方式应优先指向用户目录中的安装版。
# release\win-unpacked\CoinFlow.exe 仅作为本地打包自测兜底，不作为正式双击入口。

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$ReleaseDir = Join-Path $ProjectRoot 'release'
$InstalledPath = Join-Path $env:LOCALAPPDATA 'Programs\CoinFlow\CoinFlow.exe'

if (-not (Test-Path -LiteralPath $ReleaseDir)) {
  throw "Release directory not found: $ReleaseDir"
}

$UnpackedPath = Join-Path $ReleaseDir 'win-unpacked\CoinFlow.exe'

if (Test-Path -LiteralPath $InstalledPath) {
  $TargetExe = Get-Item -LiteralPath $InstalledPath
} elseif (Test-Path -LiteralPath $UnpackedPath) {
  $TargetExe = Get-Item -LiteralPath $UnpackedPath
} else {
  throw "No CoinFlow executable found. Installed path: $InstalledPath; release path: $UnpackedPath"
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
$Shortcut.Description = 'Open the installed CoinFlow desktop app'

if (Test-Path -LiteralPath $IconPath) {
  $Shortcut.IconLocation = $IconPath
}

$Shortcut.Save()

Write-Host "COINFLOW_SHORTCUT=$ShortcutPath"
Write-Host "COINFLOW_SHORTCUT_TARGET=$($TargetExe.FullName)"
