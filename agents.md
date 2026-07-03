# CoinFlow 开发者规范与代理维护指南 (agents.md)

欢迎参与 CoinFlow 的开发维护。本指南为后续接手的 AI 代理人定义了核心的代码修改规范、工程控制和提交流程。请务必严格遵守以下准则。

---

## 🛑 核心开发原则

0. **产品方向：Electron-first / Desktop-only**：
   - CoinFlow 从现在开始只面向 Windows Electron 桌面端维护，浏览器直开 `index.html` 仅作为开发调试兜底。
   - 旧 PWA、移动端底部导航、手机宽度 app shell、触感数字键盘和 iOS 式滑动页面转场均视为遗留实现，不再作为正式产品目标。
   - 新增或修复功能时，优先保证桌面端本地记账、Documents JSON 账本持久化、Excel/CSV/HTML 导入导出和高 DPI 使用体验。

1. **每次修改必须 Git Commit & 存档**：
   - 任何代理人在对代码进行增删、Bug 修复或功能迭代后，必须执行 Git Commit，并在提交信息中写明修改细节（如 `feat: 优化导航栏转场稳定性`、`fix: 防止 Adblock 插件对样式的破坏`）。
   - 每个独立修复、功能批次或文档规则变更完成并验证后，必须立刻单独 `git commit`；禁止把多个不相关改动攒成一个大提交。
   - 重新打包前，必须确认前面的代码/文档改动都已经按批次提交；版本号与 `release/` 产物作为最后的发布提交单独存档。
   - 每次代码变更完成并验证后，必须同步更新 [task.md](file:///C:/Users/15pro/.gemini/antigravity/brain/413be84f-a7ee-47c5-8015-d13ef25850f7/task.md) 或是写明任务进度状态。

2. **样式抗干扰性保证 (Anti-Interference)**：
   - 界面整体采用深色磨砂玻璃风（#0a0a0f 起始），可能会受到浏览器第三方插件（如 Dark Reader、Adblock、沙盒样式注入）的篡改。
   - 所有关键性的颜色、背景毛玻璃效果、文字显隐属性等，应当在 CSS 类中使用更具体的选择器，并必要时标注 `!important`，确保在用户浏览器存在各种插件时，外观仍完美一致，不受影响。

3. **导航与路由稳定性**：
   - 应用为单页 SPA 架构，正式导航应使用桌面左侧栏与顶部工具栏，不再依赖 bottom-nav。
   - 页面切换必须处理好连续快速点击的状态一致性，防止多个页面同时处于 `.active` 状态或页面重叠。

4. **每次修复后必须重新打包**：
   - 自 V1.0.5 起，发行形态为**安装版（electron-builder `nsis` target，一键安装、`perMachine:false` 安装到用户目录），并支持自动更新（`electron-updater`）**。打包产物在 `release/` 下：`CoinFlow-Setup-<version>.exe`（安装包）、`CoinFlow-Setup-<version>.exe.blockmap`（增量更新差分）、`latest.yml`（更新清单）、`win-unpacked/`（中间产物）。
   - 每次修复或功能开发完成后，必须运行 `npm run build:desktop` 重新打包，并确保生成的安装包能正常安装、启动，用以校验成果。
   - 每次重新打包前必须同步递增 `package.json` 与 `package-lock.json` 中的版本号（例如 `1.0.4` → `1.0.5`）。自动更新依赖版本号比较，**版本号只能递增，不可回退或复用**。
   - 每次重新打包后，必须立即清理旧版打包残留物；`release/` 只保留**当前版本**的 `CoinFlow-Setup-<version>.exe`、其 `.blockmap`、`latest.yml` 与 `win-unpacked/`，删除历史安装包、历史 blockmap 与 `builder-debug.yml` 等调试文件。
   - **数据持久化（关键）**：正式安装版使用 `Documents\CoinFlow\Ledger\coinflow-ledger.json` 作为权威账本文件；Electron `userData` / IndexedDB 仅作为窗口状态、缓存、浏览器兜底或旧数据迁移源。自动更新只替换程序文件、不触碰 Documents 账本，因此**升级后数据始终保留**。禁止把账本改到程序安装目录内（否则更新或卸载会丢数据）。
   - **自动更新发布**：`package.json` 的 `build.publish` 使用 GitHub Releases（`provider: github`，公开仓库 `lingcang728/CoinFlow`）作为唯一新更新源。`npm run build:desktop` 只做本地打包（`--publish never`），`npm run release:desktop` 在设置 `GH_TOKEN` 后自动创建 GitHub draft Release 并上传更新资产。
   - 🔔 **每次发布必须确保 GitHub Release 含 3 个文件（缺一不可）**：
     1. `latest.yml`（必须是当前版本，否则检测不到新版本）
     2. `CoinFlow-Setup-<version>.exe`（安装包）
     3. `CoinFlow-Setup-<version>.exe.blockmap`（增量更新差分）
     `electron-builder` 的 GitHub provider 默认生成 draft Release；家人端看不到 draft，必须人工确认后发布。已安装的 1.1.x 存量客户端仍指向旧 COS 更新源，无法自动迁移到 GitHub；1.1.6 需手动重装一次，之后才走 GitHub 自动更新。

---

## 🛠️ Git 提交流程规范

当你对代码进行修改后，请依次运行以下命令完成存档：

```powershell
# 1. 检查修改的文件
git status

# 2. 将修改存入暂存区
git add .

# 3. 提交更改，Message 需清晰准确
git commit -m "feat/fix: 简要描述你修改的模块和原因"
```

---

## 📅 版本迭代历史与待办 (Backlog)

* **V1.1.7**：稳定性与性能大修——①账本安全加固：Backups\ 每日轮换快照（保留 14 天）、大幅缩水写入前自动落 pre-shrink 快照、损坏文件隔离保存、主进程写入串行化；②修复三类"卡死"：原生 confirm 导致窗口失焦无法输入（改为应用内确认弹窗）、账本首读失败后全应用永久瘫痪（改为可重试）、分类删除竞态清空用户输入导致默认分类无法恢复；③性能：静态表面移除 backdrop-filter 毛玻璃（视觉基本不变）、超预算光晕改 opacity 动画消除空闲持续重绘、月度数据区间缓存、圆环图更新不再重放入场动画并自愈尺寸脱节、主进程渲染日志泄漏修复。
* **V1.1.6 (计划发布)**：弃用腾讯云 COS 更新源，改用 GitHub Releases；存量 1.1.x 客户端需手动安装一次 1.1.6 才能切到 GitHub 自动更新链路。
* **V1.1.5**：权威账本迁移到 `Documents\CoinFlow\Ledger\coinflow-ledger.json`，IndexedDB 仅保留为旧数据迁移源/浏览器兜底。
* **V1.0.5**：发行形态改为 NSIS 一键安装版并接入自动更新（`electron-updater`）；「关于」面板新增「检查更新」按钮，可一键下载安装并重启。
* **V1.0.4**：面向老旧/低配设备的性能优化（自动「精简渲染」模式，关闭毛玻璃模糊与图表动画）。曾短暂尝试绿色免安装文件夹（`dir` target）+ 程序目录数据本地化，因不便于自动更新与跨版本保留数据，于 V1.0.5 改为安装版方案。
* **V1.0.1**：修复添加记录日期选择器切换月份后弹层误关闭的问题；从本版本开始，每次打包必须同步递增版本号并生成对应版本的 `.exe`。
* **V1.0.0**：已完成 IndexedDB 数据持久化、数字滚动动效、Chart.js 各式图表、GitHub 月历热力图，以及适配凌苍原有账单的 Excel 拆分导入导出功能。
* **V1.1.0 (迁移中)**：迁移为 Electron-first / desktop-only 的本地桌面记账应用，移动端 PWA 形态仅保留为遗留参考，不再作为产品目标。
