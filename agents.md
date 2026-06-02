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
   - 自 V1.0.5 起，发行形态为**安装版（electron-builder `nsis` target，一键安装、`perMachine:false` 安装到用户目录），并支持自动更新（`electron-updater`）**。打包产物在 `release/` 下：`CoinFlow-Setup-<version>.exe`（安装包）、`CoinFlow-Setup-<version>.exe.blockmap`（增量更新差分）、`latest.yml`（更新清单）、`win-unpacked/`（中间产物）。
   - 每次修复或功能开发完成后，必须运行 `npm run build:desktop` 重新打包，并确保生成的安装包能正常安装、启动，用以校验成果。
   - 每次重新打包前必须同步递增 `package.json` 与 `package-lock.json` 中的版本号（例如 `1.0.4` → `1.0.5`）。自动更新依赖版本号比较，**版本号只能递增，不可回退或复用**。
   - 每次重新打包后，必须立即清理旧版打包残留物；`release/` 只保留**当前版本**的 `CoinFlow-Setup-<version>.exe`、其 `.blockmap`、`latest.yml` 与 `win-unpacked/`，删除历史安装包、历史 blockmap 与 `builder-debug.yml` 等调试文件。
   - **数据持久化（关键）**：正式安装版使用 Electron 默认 `userData`（`%APPDATA%\CoinFlow`）存放账本 IndexedDB。自动更新只替换程序文件、不触碰该目录，因此**升级后数据始终保留、无需任何手动迁移**。禁止把 `userData` 改到程序安装目录内（否则更新会丢数据）。
   - **自动更新发布**：`package.json` 的 `build.publish`（`provider: generic`）指向「国内对象存储」的固定网址（当前为腾讯云 COS：`https://coinflow-1408718786.cos.ap-shanghai.myqcloud.com/`，**注意桶名是 `coinflow-1408718786`，文件直接放桶根目录，不要写成 `coinflow/` 子目录**）。家人端点击「关于 → 检查更新」即可自动下载安装。
   - 🔔 **每次打包后必须手动上传 3 个文件到 COS 桶根目录（缺一不可）**：
     1. `latest.yml`（**必须覆盖上传**，否则检测不到新版本）
     2. `CoinFlow-Setup-<version>.exe`（安装包）
     3. `CoinFlow-Setup-<version>.exe.blockmap`（增量更新差分）
     上传是**手动步骤**，打包命令不会自动完成。**AI 代理在每次成功打包后，必须主动提醒凌苍去 COS 上传这 3 个文件，并列出本次的具体文件名**；不要默认已上传。详见根目录《自动更新发布指南.md》。

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

* **V1.0.5 (当前)**：发行形态改为 NSIS 一键安装版并接入自动更新（`electron-updater` + 国内对象存储 generic 源）；「关于」面板新增「检查更新」按钮，可一键下载安装并重启。数据回归 `%APPDATA%\CoinFlow`，更新永不丢失、零手动迁移。
* **V1.0.4**：面向老旧/低配设备的性能优化（自动「精简渲染」模式，关闭毛玻璃模糊与图表动画）。曾短暂尝试绿色免安装文件夹（`dir` target）+ 程序目录数据本地化，因不便于自动更新与跨版本保留数据，于 V1.0.5 改为安装版方案。
* **V1.0.1**：修复添加记录日期选择器切换月份后弹层误关闭的问题；从本版本开始，每次打包必须同步递增版本号并生成对应版本的 `.exe`。
* **V1.0.0**：已完成 IndexedDB 数据持久化、数字滚动动效、Chart.js 各式图表、GitHub 月历热力图，以及适配凌苍原有账单的 Excel 拆分导入导出功能。
* **V1.1.0 (迁移中)**：迁移为 Electron-first / desktop-only 的本地桌面记账应用，移动端 PWA 形态仅保留为遗留参考，不再作为产品目标。
