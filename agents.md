# CoinFlow 开发者规范与代理维护指南 (agents.md)

欢迎参与 CoinFlow 的开发维护。本指南为后续接手的 AI 代理人定义了核心的代码修改规范、工程控制和提交流程。请务必严格遵守以下准则。

---

## 🛑 核心开发原则

0. **产品方向：Electron-first / Desktop-only**：
   - CoinFlow 从现在开始只面向 Windows Electron 桌面端维护，浏览器直开 `index.html` 仅作为开发调试兜底。
   - 旧 PWA、移动端底部导航、手机宽度 app shell、触感数字键盘和 iOS 式滑动页面转场均视为遗留实现，不再作为正式产品目标。
   - 新增或修复功能时，优先保证桌面端本地记账、IndexedDB 持久化、Excel/CSV/HTML 导入导出和高 DPI 使用体验。

1. **每次修改必须 Git Commit & 存档**：
   - 任何代理人在对代码进行增删、Bug 修复或功能迭代后，必须执行 Git Commit，并在提交信息中写明修改细节（如 `feat: 优化导航栏转场稳定性`、`fix: 防止 Adblock 插件对样式的破坏`）。
   - 每次代码变更完成并验证后，必须同步更新 [task.md](file:///C:/Users/15pro/.gemini/antigravity/brain/413be84f-a7ee-47c5-8015-d13ef25850f7/task.md) 或是写明任务进度状态。

2. **样式抗干扰性保证 (Anti-Interference)**：
   - 界面整体采用深色磨砂玻璃风（#0a0a0f 起始），可能会受到浏览器第三方插件（如 Dark Reader、Adblock、沙盒样式注入）的篡改。
   - 所有关键性的颜色、背景毛玻璃效果、文字显隐属性等，应当在 CSS 类中使用更具体的选择器，并必要时标注 `!important`，确保在用户浏览器存在各种插件时，外观仍完美一致，不受影响。

3. **导航与路由稳定性**：
   - 应用为单页 SPA 架构，正式导航应使用桌面左侧栏与顶部工具栏，不再依赖 bottom-nav。
   - 页面切换必须处理好连续快速点击的状态一致性，防止多个页面同时处于 `.active` 状态或页面重叠。

4. **每次修复后必须重新打包**：
   - 自 V1.0.4 起，发行形态为**绿色免安装文件夹（electron-builder `dir` target）**，不再生成自解压便携 `.exe`，也不使用安装版(NSIS)。打包产物为 `release/win-unpacked/` 整套绿色文件夹，内含 `CoinFlow.exe`。
   - 每次修复或功能开发完成后，必须运行 `npm run build:desktop` 重新打包，并确保 `release/win-unpacked/CoinFlow.exe` 能双击正常开启，用以校验成果。
   - 每次重新打包前必须同步递增 `package.json` 与 `package-lock.json` 中的版本号（例如 `1.0.3` → `1.0.4`）。
   - 每次重新打包后，必须立即清理旧版打包残留物；`release/` 目录中只保留当前的 `win-unpacked/` 绿色文件夹，删除历史便携 `.exe`、安装包与 `builder-debug.yml` 等调试文件，避免堆积。
   - **数据存储为程序目录本地化（绿色软件）**：打包版（`app.isPackaged`）会把全部数据（含账本 IndexedDB）写入程序目录下的 `CoinFlowData/`（便携场景用 `PORTABLE_EXECUTABLE_DIR`，绿色文件夹用可执行文件所在目录）。因此「删除整个程序文件夹」即可彻底清除应用与全部数据，禁止改回写入 `%APPDATA%`。修改 `desktop/main.js` 中 userData 路径逻辑时需保持此约定。
   - **分发给他人时务必使用不含 `CoinFlowData/` 的干净副本**，避免把本机账本数据一同发出。

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

* **V1.0.4 (当前)**：面向老旧/低配设备的性能优化（自动「精简渲染」模式，关闭毛玻璃模糊与图表动画）；发行形态改为绿色免安装文件夹（`dir` target），数据本地化到程序目录 `CoinFlowData/`，实现「删文件夹即彻底卸载」。
* **V1.0.1**：修复添加记录日期选择器切换月份后弹层误关闭的问题；从本版本开始，每次打包必须同步递增版本号并生成对应版本的 `.exe`。
* **V1.0.0**：已完成 IndexedDB 数据持久化、数字滚动动效、Chart.js 各式图表、GitHub 月历热力图，以及适配凌苍原有账单的 Excel 拆分导入导出功能。
* **V1.1.0 (迁移中)**：迁移为 Electron-first / desktop-only 的本地桌面记账应用，移动端 PWA 形态仅保留为遗留参考，不再作为产品目标。
