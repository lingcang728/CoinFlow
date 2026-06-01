$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$PackageJsonPath = Join-Path $ProjectRoot 'package.json'
$ReleaseDir = Join-Path $ProjectRoot 'release'

if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
  throw "package.json not found: $PackageJsonPath"
}

if (-not (Test-Path -LiteralPath $ReleaseDir)) {
  throw "Release directory not found: $ReleaseDir"
}

$PackageJson = Get-Content -Raw -LiteralPath $PackageJsonPath | ConvertFrom-Json
$PreferredPortablePath = Join-Path $ReleaseDir "CoinFlow-$($PackageJson.version)-portable.exe"
$FallbackUnpackedPath = Join-Path $ReleaseDir 'win-unpacked\CoinFlow.exe'

if (Test-Path -LiteralPath $PreferredPortablePath) {
  $TargetExe = Get-Item -LiteralPath $PreferredPortablePath
} else {
  $TargetExe = Get-ChildItem -LiteralPath $ReleaseDir -File -Filter 'CoinFlow-*-portable.exe' |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
}

if (-not $TargetExe -and (Test-Path -LiteralPath $FallbackUnpackedPath)) {
  $TargetExe = Get-Item -LiteralPath $FallbackUnpackedPath
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
