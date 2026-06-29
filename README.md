# CoinFlow

Electron-first Windows desktop bookkeeping app.

CoinFlow stores the authoritative ledger at:

```text
Documents\CoinFlow\Ledger\coinflow-ledger.json
```

IndexedDB is kept only as a browser fallback and legacy migration source. Electron `userData` is not the source of truth for bookkeeping records.

## Setup

```powershell
npm ci
```

## Run

```powershell
npm run dev
```

## Verify

```powershell
npm run smoke:desktop
```

## Build Windows Installer

```powershell
npm run build:desktop
```

## Publish Update

Updates are published through GitHub Releases for `lingcang728/CoinFlow`.

```powershell
$env:GH_TOKEN = '<public_repo PAT>'
npm run release:desktop
```

`electron-builder` creates a draft release by default. Publish the draft after verifying it contains `latest.yml`, `CoinFlow-Setup-<version>.exe`, and `CoinFlow-Setup-<version>.exe.blockmap`.

Installed 1.1.x builds that still point to the old COS update source cannot automatically move to GitHub Releases. Install 1.1.6 manually once; later updates use GitHub.
