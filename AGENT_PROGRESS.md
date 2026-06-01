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
