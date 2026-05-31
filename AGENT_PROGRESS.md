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

- Stage 0 is complete when the desktop-only direction is committed.
- Next stage: rebuild the desktop AppShell around left sidebar, main workspace, top toolbar, and right quick-add panel.
