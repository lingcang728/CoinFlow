# CoinFlow Agent Progress

## Desktop-Only Migration Baseline

- Date: 2026-05-31
- Product direction: Electron-first, desktop-only, local-first personal finance dashboard for Windows.
- Browser mode: development fallback only; not a formal product target.
- Legacy direction: PWA/mobile app shell, bottom navigation, phone-width layout, mobile add page, haptic keypad, and iOS slide transitions are migration sources only.
- Protected working tree state observed before edits:
  - `implementation_plan.md` is deleted in the working tree and was not modified by this agent.
  - `CoinFlow.png` is untracked and used as the visual reference only.

## Primary Repository Structure

- `index.html`: SPA shell and page containers.
- `css/style.css`: existing global visual system and legacy mobile shell styles.
- `js/app.js`: router and app initialization.
- `js/dashboard.js`: dashboard data rendering.
- `js/add-record.js`: record entry flow.
- `js/transactions.js`: bill list and edit flow.
- `js/statistics.js`: statistics charts and heatmap.
- `js/budget.js`: budget settings modal.
- `desktop/main.js`: Electron window, custom `coinflow://` protocol, smoke test, and save IPC.
- `desktop/preload.js`: safe preload bridge for file saving.
- `vendor/`: local Chart.js, idb, and xlsx runtime files.

## Current Stage

- Stage 0 complete in commit `066878b`: desktop-only direction documented.
- Stage 1 complete in working tree: `index.html` now uses `desktop-shell` with sidebar, topbar, main workspace, and right quick-add panel; `bottom-nav` and `page-add` are removed from the active DOM.
- Stage 2 complete in working tree: `js/app.js` uses direct desktop page switching for dashboard, transactions, and statistics; `navigateToPage('add')` focuses quick add instead of opening a page.
- Stage 3 complete in working tree: `js/add-record.js` exposes `CoinFlowRecordForm` mounted in `#desktop-record-form`, uses a normal amount input, keyboard submit/reset, compact categories, date picker, and no mobile keypad.
- Stage 4 complete in working tree: dashboard uses desktop budget summary, doughnut/legend, recent records, ledger preview, and category budget progress.
- Stage 5 complete in working tree: transactions page uses desktop filter/search controls and high-density grouped rows.
- Stage 6 complete in working tree: statistics, budget modal, and date picker are styled for the desktop shell.
- Stage 7 complete in working tree: source Electron smoke, Playwright viewport checks, desktop build, and packaged smoke screenshot all passed.
- 2026-05-31 follow-up: Electron smoke was rewritten because the previous fixed `%TEMP%\coinflow-smoke.png` path could leave stale screenshot evidence and the renderer workflow did not prove each capture came from the current run.
- New smoke behavior:
  - Creates a unique `runId` per execution and writes screenshots under a unique temp directory.
  - Clears the smoke IndexedDB state and writes deterministic budget/transaction data before validation.
  - Saves one record through the live quick-add UI, then verifies the expected transaction count.
  - Captures dashboard, transactions, statistics, date picker, and layout viewport evidence after renderer idle.
  - Performs and discards a compositor warm-up capture before writing each screenshot so packaged Electron does not save the previous visual frame.
  - Deletes each screenshot target before capture, then validates file size and modification time after writing.
  - Writes `started.json`, `result.json`, or `error.json` in the run-specific screenshot directory, so packaged smoke can be verified even when stdout is unavailable.
  - Emits `COINFLOW_SMOKE_STAGE`, `COINFLOW_SMOKE_RESULT`, `COINFLOW_SMOKE_SCREENSHOT`, and `COINFLOW_SMOKE_SCREENSHOTS`.

## Verification Evidence

- `node --check` passed for edited JavaScript entry points.
- `npm run smoke:desktop` passed with saved record, date picker, exports, rapid navigation, no renderer errors, no `bottom-nav`, and no `page-add`.
- Latest source smoke run passed with `runId=20260531145314-41832` and fresh screenshots in `C:\Users\15pro\AppData\Local\Temp\coinflow-smoke-20260531145314-41832`.
- Latest packaged smoke run passed with `runId=20260531150222-46696`; `result.json` confirmed 13 deterministic records, successful CSV/Excel/HTML exports, 4 named screenshots, 3 viewport screenshots, and 0 horizontal-overflow layout failures.
- Playwright fallback viewport checks passed for `1366x768`, `1280x800`, and `1180x720`: no horizontal overflow, exactly one active desktop page, no legacy mobile navigation.
- Latest visual comparison used `CoinFlow.png`, `C:\Users\15pro\AppData\Local\Temp\coinflow-smoke.png`, and `C:\Users\15pro\AppData\Local\Temp\coinflow-packaged-smoke-final.png`.
- `npm run build:desktop` generated `release/CoinFlow-1.0.0-portable.exe`.
- Packaged app smoke launched `release/win-unpacked/CoinFlow.exe` with `COINFLOW_SMOKE_TEST=1` and produced `C:\Users\15pro\AppData\Local\Temp\coinflow-packaged-smoke-final.png` with no lingering CoinFlow process.

## 2026-05-31 Visual Bugfix Pass

- Fixed screenshot-reported desktop spacing and overflow issues across dashboard, transactions, statistics, quick-add date picker, and exported HTML report.
- Reworked dashboard category legend sizing so percentages and amounts no longer collide in narrow desktop cards.
- Fixed over-budget summary logic: remaining budget can now display negative money and negative percentage instead of forcing the ratio to `0%`.
- Restored smoother dashboard amount/percentage animation with cancellable animation frames, and restored doughnut chart update animation.
- Hardened statistics chart rendering against resize/plugin timing errors that could break or loop chart drawing.
- Added import/export icons and replaced the export caret with a styled SVG chevron/dropdown state.
- Updated smoke data to include an over-budget scenario (`totalSpent=5475`, `totalBudget=2800`) so the negative remaining-budget layout is covered by regression screenshots.
- Verification:
  - `node --check` passed for `desktop/main.js`, `js/dashboard.js`, `js/charts.js`, `js/transactions.js`, and `js/export-html.js`.
  - Source `npm run smoke:desktop` passed with `runId=20260531160232-42656`, successful CSV/Excel/HTML exports, visible date picker, no renderer messages, and no horizontal overflow at `1366x768`, `1280x800`, or `1180x720`.
  - Playwright Edge screenshot verified the exported HTML report at `C:\Users\15pro\AppData\Local\Temp\coinflow-report-check-20260531-overbudget.png`.
  - `npm run build:desktop` regenerated `release/CoinFlow-1.0.0-portable.exe` and `release/win-unpacked/CoinFlow.exe`.
  - Packaged smoke passed from `release/win-unpacked/CoinFlow.exe` with `runId=20260531161020-44888`, successful exports, no renderer messages, and no horizontal overflow in all checked viewports.

## 2026-06-01 Statistics Layout Scroll Fix

- Fixed the statistics page card layout so the heatmap, trend chart, and rank card use natural vertical space instead of being compressed into a fixed viewport grid.
- Restored vertical scrolling on `#page-statistics .desktop-page-stack`; source and packaged smoke now assert that the statistics panel can scroll.
- Hardened Chart.js font configuration with Windows Chinese font fallbacks so canvas-rendered labels stay readable on the desktop build.
- Verification:
  - `node --check` passed for `desktop/main.js` and `js/charts.js`.
  - Source `npm run smoke:desktop` passed with `runId=20260601025918-35740`; statistics scroll state was `clientHeight=714`, `scrollHeight=1308`, `maxScrollTop=594`, `canScroll=true`, `scrolled=true`.
  - `npm run build:desktop` regenerated `release/CoinFlow-1.0.0-portable.exe` and `release/win-unpacked/CoinFlow.exe`.
  - Packaged smoke passed from `release/win-unpacked/CoinFlow.exe` with `runId=20260601030529-18416`, successful exports, no renderer messages, and the same statistics scroll assertion passing.

## 2026-06-01 Desktop Scaling and Smoke Pipe Fix

- Fixed dashboard doughnut legend scaling with container queries, `clamp()` sizing, auto-fitting legend rows, and content-width numeric columns so category names can shrink without clipping amounts or percentages.
- Changed the quick-add panel to a compact-width drawer below 1500px, with close/backdrop controls and automatic close when navigating to dashboard, transactions, or statistics.
- Added resize observers for chart containers so Chart.js recalculates after continuous desktop resizing.
- Expanded Electron smoke coverage to `1920x1080`, `1600x900`, `1440x900`, `1366x768`, `1280x800`, and `1180x720`; smoke now asserts no horizontal overflow, no clipped doughnut legend values, and quick-add auto-close at compact width.
- Fixed packaged smoke `EPIPE: broken pipe` dialogs by replacing smoke `console.log/error` calls with guarded stdout/stderr writes; `result.json` remains the source of truth when a GUI process loses its console pipe.
- Verification:
  - `node --check` passed for `desktop/main.js`, `js/app.js`, `js/dashboard.js`, and `js/charts.js`.
  - Source `npm run smoke:desktop` passed with `runId=20260601034151-43664`; all six layout viewports reported `horizontalOverflow=false`, `legendIssues=[]`, and quick-add auto-close passed.
  - `npm run build:desktop` regenerated `release/CoinFlow-1.0.0-portable.exe` and `release/win-unpacked/CoinFlow.exe`.
  - Packaged smoke passed from `release/win-unpacked/CoinFlow.exe` with `runId=20260601034453-39328`, successful CSV/Excel/HTML exports, all six layout checks passing, quick-add auto-close passing, and no lingering CoinFlow process.

## 2026-06-01 Date Picker Month Navigation Fix

- Fixed the add-record date picker so month navigation clicks resolve through the full event path, allowing the previous/next month buttons to work even when the click lands on the arrow glyph or nested button content.
- Added a smoke regression check for the exact补记 flow: open the picker at `2026-06-01`, click previous month to `2026年05月`, choose `2026-05-15`, reopen the picker, and confirm next month returns to `2026年06月`.
- Increased the smoke watchdog from 45 seconds to 90 seconds because the added rendered date-picker regression pushed packaged Electron smoke close to the old timeout while still completing normally.
- Verification:
  - `node --check` passed for `desktop/main.js` and `js/date-picker.js`.
  - Source `npm run smoke:desktop` passed with `runId=20260601035814-9032`; `datePickerMonthNavigation` reported `initialMonth=2026年06月`, `afterPrevMonth=2026年05月`, `selectedValue=2026-05-15`, `afterNextMonth=2026年06月`, and `rendererMessages=[]`.
  - `npm run build:desktop` regenerated `release/CoinFlow-1.0.0-portable.exe` and `release/win-unpacked/CoinFlow.exe`.
  - Packaged smoke passed from `release/win-unpacked/CoinFlow.exe` with `runId=20260601040110-26680`; result file was `C:\Users\15pro\AppData\Local\Temp\coinflow-packaged-smoke-20260601120109\result.json`, with the same date-picker month navigation assertions passing, `RendererMessages=0`, and six layout checks passing.

## 2026-06-01 Date Picker Close Regression and Version Rule

- Fixed the real user-facing date picker regression where clicking previous/next month rebuilt the calendar DOM, then the global outside-click listener treated the same click as external and closed the picker.
- The picker now stops propagation for internal trigger/popover clicks and the global outside-click guard checks the composed event path, so month navigation stays open while still closing on genuine outside clicks.
- Strengthened smoke coverage: `datePickerMonthNavigation` now asserts `visibleAfterPrev=true` and `visibleAfterNext=true`, not only that the hidden input can be changed programmatically.
- Added the requested `agents.md` rule that every desktop rebuild must increment `package.json` and `package-lock.json` versions before packaging, so `.exe` artifacts no longer remain on stale version numbers.
- Bumped the application version from `1.0.0` to `1.0.1`.
- Verification:
  - `node --check` passed for `desktop/main.js` and `js/date-picker.js`.
  - Source `npm run smoke:desktop` passed with `runId=20260601041440-43428`; `visibleAfterPrev=true`, `afterPrevMonth=2026年05月`, `selectedValue=2026-05-15`, `visibleAfterNext=true`, `afterNextMonth=2026年06月`, and `rendererMessages=[]`.
  - `npm run build:desktop` generated `release\CoinFlow-1.0.1-portable.exe` and refreshed `release\win-unpacked\CoinFlow.exe`.
  - Packaged smoke passed from `release\win-unpacked\CoinFlow.exe` with `runId=20260601041740-33504`; result file was `C:\Users\15pro\AppData\Local\Temp\coinflow-packaged-smoke-20260601121739\result.json`, with `VisibleAfterPrev=True`, `VisibleAfterNext=True`, `DatePickerSelected=2026-05-15`, `RendererMessages=0`, and six layout checks passing.

## 2026-06-01 Release Artifact Cleanup Rule

- Added the requested `agents.md` rule that after producing a new desktop installer, agents must remove old version installers and stale packaging leftovers so `release/` does not accumulate obsolete packages.
- Current cleanup audit found `release\CoinFlow-1.0.0-portable.exe` as the stale portable installer after the `1.0.1` build.
- Deleted the stale `1.0.0` portable installer and kept the current `release\CoinFlow-1.0.1-portable.exe`, current `release\win-unpacked\`, and current `builder-debug.yml`.

## 2026-06-01 Minimum Window and Transaction Spacing Fix

- Changed the Electron default `BrowserWindow` size from `1440x900` to the supported minimum `1180x720`, while keeping the existing `minWidth` and `minHeight` guards unchanged.
- Fixed the desktop transaction detail list spacing by overriding the legacy mobile row padding with higher-specificity desktop rules, widening row/header horizontal padding, preserving tabular amount alignment, and applying the same right-alignment protection to dashboard ledger amounts.
- Bumped the application version from `1.0.1` to `1.0.2`.
- Cleaned stale release output after packaging, removing `release\CoinFlow-1.0.1-portable.exe` and keeping only `release\CoinFlow-1.0.2-portable.exe`, current `release\win-unpacked\`, and current `builder-debug.yml`.
- Verification:
  - Source `npm run smoke:desktop` passed with `runId=20260601043500-40552`; initial launch rendered at the new compact default with `innerWidth=1168`, `innerHeight=685`, no horizontal overflow, no renderer messages, and the transaction screenshot showed widened row padding.
  - Smoke layout checks passed at `1920x1080`, `1600x900`, `1440x900`, `1366x768`, `1280x800`, and `1180x720`.
  - `npm run build:desktop` generated `release\CoinFlow-1.0.2-portable.exe` and refreshed `release\win-unpacked\CoinFlow.exe`.
  - Portable smoke launched `release\CoinFlow-1.0.2-portable.exe` directly with `runId=20260601043918-23824`; `result.json` confirmed successful save/export checks, `RendererMessages=0`, `LayoutFailures=0`, default `InitialWidth=1168`, `InitialHeight=685`, and no lingering CoinFlow process.

## 2026-06-01 Desktop Shortcut and Decimal Amount Input Fix

- Added a post-build desktop shortcut workflow: `scripts\update-desktop-shortcut.ps1` creates or updates `C:\Users\15pro\Desktop\CoinFlow.lnk` to point at the current packaged portable EXE, and `npm run shortcut:desktop` can refresh it manually.
- Added `scripts\clean-release-artifacts.ps1` and wired `postbuild:desktop` so each desktop build removes stale portable installers before updating the shortcut.
- Changed the add-record amount control from Chromium `type=number` to a text-based decimal input, preserving caret position while allowing `.` / Chinese punctuation decimal input and limiting amounts to 8 integer digits plus 2 decimals.
- Added Electron smoke coverage for keyboard decimal entry: typing `6`, `.`, `5` must produce `6.5`, keep the caret at the end, and normalize to `6.50` on blur.
- Bumped the application version from `1.0.2` to `1.0.3`.
- Verification:
  - `node --check` passed for `js/add-record.js` and `desktop/main.js`.
  - Source `npm run smoke:desktop` passed with `runId=20260601143227-12388`; `amountDecimalKeyboardInput` reported `type=text`, `typedValue=6.5`, `normalizedValue=6.50`, `selectionStart=3`, `selectionEnd=3`, with `RendererMessages=0`.
  - `npm run build:desktop` generated `release\CoinFlow-1.0.3-portable.exe`, refreshed `release\win-unpacked\CoinFlow.exe`, removed stale `release\CoinFlow-1.0.2-portable.exe`, and updated `C:\Users\15pro\Desktop\CoinFlow.lnk` to target `release\CoinFlow-1.0.3-portable.exe`.
  - Portable smoke launched `release\CoinFlow-1.0.3-portable.exe` directly with `runId=20260601143604-20828`; `result.json` confirmed successful save/export checks, decimal amount keyboard entry, `RendererMessages=0`, `LayoutFailures=0`, and no lingering CoinFlow process.

## 2026-06-02 Low-End Performance Mode and Green-Folder Distribution

- Audited the whole renderer/main process for crash and slowdown risks. No crash hazards found (charts destroyed/reused via WeakMap, no setInterval, listeners bound once, XLSX lazy-loaded). Main slowdown sources on old PCs: 23 `backdrop-filter: blur()` declarations plus per-cell blur on up to 31 heatmap cells, eager chart animations, and the self-extracting portable EXE re-unpacking ~353MB to %TEMP% on every launch.
- Added `js/perf.js` (loaded synchronously in `<head>` to avoid FOUC): auto-detects low-end devices (`navigator.deviceMemory <= 4` or `hardwareConcurrency <= 2`) and adds `html.perf-lite`; exposes `window.CoinFlowPerf.{isLite,prefersReducedMotion,setLite}` with a `localStorage` manual override.
- Added a `perf-lite` CSS block to `css/desktop.css` that disables all `backdrop-filter` blur (falls back to opaque backgrounds matching the existing `@supports not (backdrop-filter)` design), trims heavy shadows, and shortens animations; also honored `prefers-reduced-motion`.
- Gated chart entry animations in `js/charts.js` behind `chartsLite()` (perf-lite or reduced-motion), and removed the per-cell `backdrop-filter: blur(4px)` from the statistics heatmap in `js/statistics.js` (negligible visual change, removes up to 31 stacked blur layers).
- Switched distribution from self-extracting portable EXE to a green/no-install folder: `package.json` `build.win.target` `portable` → `dir`, removed the `portable` artifact block, and changed `build:desktop` to `electron-builder --win dir`.
- Made packaged data program-directory-local in `desktop/main.js`: when `app.isPackaged`, `userData` is set to `<PORTABLE_EXECUTABLE_DIR | dirname(execPath)>/CoinFlowData`, so deleting the program folder removes the app and all data (no `%APPDATA%` residue, no installer).
- Updated `scripts/clean-release-artifacts.ps1` and `scripts/update-desktop-shortcut.ps1` for the `win-unpacked` green folder (no portable EXE), and updated the `agents.md` packaging rule + backlog (V1.0.4) to document green-folder distribution and folder-local data.
- Migrated the existing local ledger non-destructively: copied `%APPDATA%\CoinFlow` (≈340 transactions in `coinflow_app_0.indexeddb.leveldb`) into `release\win-unpacked\CoinFlowData`; the original AppData profile is left intact as a backup.
- Bumped the application version from `1.0.3` to `1.0.4`.
- Verification:
  - `node --check` passed for `desktop/main.js`, `js/perf.js`, `js/charts.js`, `js/statistics.js`.
  - Source `npm run smoke:desktop` passed all stages (dashboard/transactions/statistics render, date-picker month navigation, decimal amount entry, quick-add auto-close, exports) and all six layout checks (1920x1080 → 1180x720) with `COINFLOW_SMOKE_RESULT` success.
  - `npm run build:desktop` produced `release\win-unpacked\CoinFlow.exe`; postbuild cleanup removed `builder-debug.yml` and stale `CoinFlow-1.0.3-portable.exe`, leaving `release/` with only `win-unpacked/`; desktop shortcut retargeted to `release\win-unpacked\CoinFlow.exe`. `app.asar` confirmed to include the updated `js\perf.js`, `desktop\main.js`, `js\charts.js`.
  - Launched packaged `release\win-unpacked\CoinFlow.exe`: stayed alive after 7s (no crash), wrote 5 fresh files into `win-unpacked\CoinFlowData` and 0 into `%APPDATA%\CoinFlow`, confirming folder-local data storage. Recommend a manual visual check that the migrated ledger records appear.

## 2026-06-02 NSIS Installer + In-App Auto-Update (electron-updater)

- Reversed the short-lived green-folder (`dir`) distribution in favor of an NSIS one-click installer with in-app auto-update, per the owner's decision (data must survive every rebuild/update with zero manual migration; family needs painless one-click updates; mainland-China-friendly download source).
- `package.json`: bumped `1.0.4` → `1.0.5`; `build.win.target` `dir` → `nsis`; added `nsis` block (`oneClick:true`, `perMachine:false`, `createDesktopShortcut`, `createStartMenuShortcut`, `deleteAppDataOnUninstall:false`, `artifactName: CoinFlow-Setup-${version}.exe`); added `build.publish` (provider `generic`, placeholder CDN url for 国内对象存储); `build:desktop` `--win dir` → `--win nsis`; added `electron-updater` dependency (installed, resolved ^6.8.3).
- `desktop/main.js`: removed the packaged folder-local `userData` override so data lives in the default `%APPDATA%\CoinFlow` again (auto-update never touches it → data always preserved). Integrated `electron-updater`: `wireAutoUpdater()` forwards `checking/available/download-progress/downloaded/error` to all renderers via `coinflow:update-status`; IPC handlers `coinflow:get-app-info`, `coinflow:check-update` (no-op `{state:'dev'}` when not packaged), `coinflow:quit-and-install`.
- `desktop/preload.js`: exposed `coinflowDesktop.getAppInfo()` and `coinflowUpdater.{check,quitAndInstall,onStatus}`.
- UI: added an "关于 CoinFlow" modal (`#modal-about`) with version display + "检查更新" button + status line + "立即重启并安装" button; new `js/about.js` drives the check/download/restart flow and degrades gracefully in dev/browser; `js/app.js` "关于" sidebar button now opens the modal; added `.about-*` styles to `css/desktop.css`.
- `scripts/clean-release-artifacts.ps1`: rewritten to keep only the current `CoinFlow-Setup-<version>.exe` + `.blockmap` + `latest.yml` + `win-unpacked/`, removing stale installers/blockmaps and `builder-debug.yml`.
- Updated `agents.md` packaging rule (#4) + backlog (V1.0.5) to the NSIS + auto-update model and the `%APPDATA%` data-persistence contract. Added `自动更新发布指南.md` (one-time OSS setup + per-release upload steps + first-install + caveats).
- Removed the obsolete green-folder family ZIP (`Desktop\CoinFlow-给家人-v1.0.4.zip`); the family distributable is now the installer.
- Verification:
  - `node --check` passed for `desktop/main.js`, `desktop/preload.js`, `js/about.js`, `js/app.js`.
  - Source `npm run smoke:desktop` passed all stages and all six layout checks with `COINFLOW_SMOKE_RESULT` success (electron-updater require + new About modal did not regress boot/layout).
  - `npm run build:desktop` produced `release\CoinFlow-Setup-1.0.5.exe` (~98 MB), `CoinFlow-Setup-1.0.5.exe.blockmap`, and `latest.yml` (version 1.0.5, sha512, size); postbuild left `release/` with only those three files + `win-unpacked/`. (First build attempt failed with EACCES on `win-unpacked\CoinFlow.exe` due to lingering CoinFlow processes from the earlier launch check; killed them and the rebuild succeeded.)
  - Ran the installer: installed to `%LOCALAPPDATA%\Programs\CoinFlow\CoinFlow.exe` (per-user), auto-launched (4 processes, no crash), and the existing ledger in `%APPDATA%\CoinFlow` was present → confirms data preserved with no migration.
  - Auto-update download/install path is wired but not end-to-end tested: it requires the real OSS `publish.url` and a published newer version. With the placeholder URL, "检查更新" surfaces a graceful error状态 rather than crashing.

## 2026-06-02 Configure Tencent COS Auto-Update Endpoint (1.0.6)

- Replaced the placeholder `build.publish[0].url` with the owner's Tencent COS bucket: `https://coinflow-140871786.cos.ap-shanghai.myqcloud.com/coinflow/` (trailing slash kept).
- Bumped `1.0.5` → `1.0.6` (agents.md requires increment per repackage; the prior 1.0.5 build had the placeholder URL baked in, so a new number cleanly distinguishes the first COS-enabled release).
- `npm run build:desktop` produced `release\CoinFlow-Setup-1.0.6.exe` (~98 MB) + `.blockmap` + `latest.yml`; cleanup removed the stale 1.0.5 installer/blockmap and `builder-debug.yml`.
- Verified the update wiring:
  - `release\win-unpacked\resources\app-update.yml` → `url: https://coinflow-140871786.cos.ap-shanghai.myqcloud.com/coinflow/` (base the updater fetches).
  - `latest.yml`: `version: 1.0.6`, `path`/`files[].url` = `CoinFlow-Setup-1.0.6.exe` (relative); resolves against the base to `.../coinflow/CoinFlow-Setup-1.0.6.exe`. sha512/size match the built installer.
  - Installed 1.0.6: launches (4 procs, no crash), `%APPDATA%\CoinFlow` ledger intact, and the installed `app-update.yml` points at COS.
- Files to upload to COS `coinflow/` prefix: `latest.yml`, `CoinFlow-Setup-1.0.6.exe`, `CoinFlow-Setup-1.0.6.exe.blockmap` (only these; no source/keys/win-unpacked).

## 2026-06-02 Sidebar Brand Centering Fix + 1.0.7 (Update-Chain Dry Run)

- Fixed the dashboard sidebar brand: `.sidebar-brand` was left-aligned (default `flex-start`), making the CoinFlow logo+wordmark look off; added `justify-content: center` so the logo+text block is horizontally centered in the sidebar. Verified via a dev smoke dashboard screenshot.
- `agents.md`: rule #4 now explicitly states uploading the 3 update files to COS is a manual step the build does NOT perform, and **the AI agent must proactively remind 凌苍 to upload them (with the concrete filenames) after every successful build**. Saved matching long-term memory so the reminder persists across sessions.
- Bumped `1.0.6` → `1.0.7`; `npm run build:desktop` produced `release\CoinFlow-Setup-1.0.7.exe` (~98 MB) + `.blockmap` + `latest.yml`; cleanup removed the stale 1.0.6 artifacts.
- Verified: `latest.yml` → version 1.0.7, relative `path`/`url` `CoinFlow-Setup-1.0.7.exe`, sha512/size match the installer; `app-update.yml` → COS base URL. Boot-checked packaged 1.0.7 (win-unpacked, not installed) → launches, 4 procs, no crash.
- Deliberately did NOT install 1.0.7 — the machine keeps the installed 1.0.6 as the older baseline for the live 1.0.6→1.0.7 update test.
- Update-chain status: COS endpoint reachable but `coinflow/` currently empty (HEAD returns 404 for `latest.yml` and the installer) — the owner has not uploaded yet. Full live test requires uploading 1.0.7's 3 files to COS, then clicking 关于 → 检查更新 on the installed 1.0.6. (Agent cannot upload to COS / no credentials.)

## 2026-06-02 Dynamic Categories + Generic Bill Import (1.1.0)

- Added a persistent IndexedDB `categories` store (`DB_VERSION=2`) and new `js/categories.js` service. Default 8 categories are still seeded, but category metadata is now durable and can be extended by imports or the new manager UI.
- Added offline icon/color matching for imported categories: smoke verified `股票 → 📈`, `车子 → 🚗`, `房贷 → 🏠`, and `红包 → 🧧`.
- Added generic CSV/XLSX detail import ahead of the legacy parsers. Files with date/category/amount/note-style columns now preserve their original category names and auto-create missing categories; legacy Lingcang wide Excel and Alipay keyword CSV remain as fallbacks.
- Added a desktop category management modal from the sidebar: create, rename, adjust emoji/color, hide/restore, and delete unused custom categories. Categories already used by transactions are hidden instead of deleting history.
- Rewired dashboard, transactions, statistics, budget settings, CSV/Excel export, and HTML report export to use dynamic category metadata and inline color styles instead of fixed `.bg-*` class assumptions.
- Budget behavior changed for dynamic categories: new/imported categories default to budget `0`, and "智能均分剩余" now evenly allocates across current visible categories.
- Fixed `自动更新发布指南.md` to match the current COS root publish URL in `package.json` / `agents.md`.
- Bumped `1.0.9` → `1.1.0`.
- Verification:
  - `node --check` passed for `js/categories.js`, `js/category-manager.js`, `js/db.js`, `js/excel.js`, `js/app.js`, `js/add-record.js`, `js/budget.js`, `js/dashboard.js`, `js/transactions.js`, `js/statistics.js`, `js/export-html.js`, and `desktop/main.js`.
  - Source `npm run smoke:desktop` passed with `runId=20260602071124-11604`; generic import created 4 dynamic categories, category manager create/delete flow passed, CSV/Excel/HTML exports succeeded, renderer messages were empty, statistics scroll passed, date picker and amount input regressions passed, and six layout checks from `1920x1080` to `1180x720` had no horizontal overflow.
  - `npm run build:desktop` produced `release\CoinFlow-Setup-1.1.0.exe`, `release\CoinFlow-Setup-1.1.0.exe.blockmap`, `release\latest.yml`, and refreshed `release\win-unpacked\`; cleanup removed stale `1.0.9` artifacts and `builder-debug.yml`.
  - Silent installer validation installed `1.1.0` to `%LOCALAPPDATA%\Programs\CoinFlow`, and installed smoke passed with `runId=20260602071323-27252`; installed `app-update.yml` points to `https://coinflow-1408718786.cos.ap-shanghai.myqcloud.com/`. Validation-launched CoinFlow processes were stopped afterward.
- Files to upload to COS Bucket root: `latest.yml`, `CoinFlow-Setup-1.1.0.exe`, `CoinFlow-Setup-1.1.0.exe.blockmap`.

## 2026-06-02 Category Icon Matching Stability + Scroll Fix (1.1.2)

- Reworked category icon matching from first substring hit to scored matching: exact names, prefix/suffix matches, longer keywords, and specific conflict cases now win over broad matches.
- Expanded common category keywords, including `牛奶`/`酸奶` → `🥛`, `房贷`/`房贷还款` → `🏠`, `车子` → `🚗`, `车险` → `🛡️`, and `公交车` → `🚌`.
- Unknown category names now fall back to a neutral `🏷️` icon with a deterministic color instead of a random unrelated emoji.
- Fixed the category manager debounce race by flushing auto-match before save, so typing a name and immediately clicking save still persists the matched icon/color.
- Made the category manager list explicitly scrollable inside a fixed-height desktop modal, and made the quick-add category grid scroll with stable labels so newly created categories are not clipped.
- Updated `scripts/update-desktop-shortcut.ps1` for the current NSIS installer model: the desktop shortcut now prefers `%LOCALAPPDATA%\Programs\CoinFlow\CoinFlow.exe`; `release\win-unpacked\CoinFlow.exe` remains only a local validation fallback.
- Bumped `1.1.0` → `1.1.2`. Version `1.1.1` was built during validation, then superseded by `1.1.2` after the shortcut maintenance fix.
- Verification:
  - `node --check` passed for `js/categories.js`, `js/category-manager.js`, and `desktop/main.js`.
  - Source `npm run smoke:desktop` passed with `runId=20260602081050-10664`; icon matching passed, category manager auto-match passed, list scroll `maxScrollTop=195`, layout failures `0`, renderer messages `0`.
  - Final `npm run build:desktop` produced `release\CoinFlow-Setup-1.1.2.exe`, `release\CoinFlow-Setup-1.1.2.exe.blockmap`, `release\latest.yml`, and refreshed `release\win-unpacked\`; cleanup removed stale `1.1.1` artifacts and `builder-debug.yml`.
  - Final packaged smoke passed from `release\win-unpacked\CoinFlow.exe` with `runId=20260602081947-32784`; icon matching passed, category auto-match passed, category list scrolled, layout failures `0`, renderer messages `0`.
  - Silent installer validation installed `1.1.2` to `%LOCALAPPDATA%\Programs\CoinFlow`; installed `app.asar` reports version `1.1.2`, `app-update.yml` points to `https://coinflow-1408718786.cos.ap-shanghai.myqcloud.com/`, and the desktop shortcut target is `%LOCALAPPDATA%\Programs\CoinFlow\CoinFlow.exe`.
  - Final installed smoke passed with `runId=20260602082109-4068`; icon matching passed, category auto-match passed, category list scrolled, layout failures `0`, renderer messages `0`.
- Files to upload to COS Bucket root: `latest.yml`, `CoinFlow-Setup-1.1.2.exe`, `CoinFlow-Setup-1.1.2.exe.blockmap`.
