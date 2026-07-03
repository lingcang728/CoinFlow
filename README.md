# CoinFlow 本地桌面记账

CoinFlow 是一款 **Windows 桌面记账软件**：打开就能记账，所有数据只保存在你自己的电脑里，不联网上传、没有账号注册。适合个人和家庭的日常开销记录。

深色磨砂玻璃界面，左侧导航 + 顶部月份切换，三个主页面：

| 页面 | 用来做什么 |
| --- | --- |
| **看板** | 一眼看到本月花了多少、剩余预算、消费分类占比环形图、最近账单 |
| **明细** | 按月浏览全部账单，支持分类筛选、搜索备注、点击任意一笔修改或删除 |
| **统计** | 每日支出趋势图、消费日历热力图、近半年收支走势、分类排行 |

## 主要功能

- **快速记账**：点侧栏「记账」或按 `Ctrl+N` 呼出面板，输入金额、选分类、选日期即可；常用备注一键填入。
- **预算管理**：设置每月收入、储蓄目标和各分类预算，看板实时显示进度，超支会有红色警示。
- **自定义分类**：新建分类时根据名称**自动匹配图标和配色**（比如输入"奶茶"自动配 🧋），也可以手动改。
- **导入 / 导出**：支持导入 Excel / CSV 账单（含支付宝账单格式），导出 Excel、CSV 或漂亮的 HTML 月度报告。
- **自动更新**：「关于」面板一键检查更新，下载完成后重启即可安装，**升级永远不会丢账本**。

## 你的账本存在哪里？会不会丢？

账本是一个普通的 JSON 文件，存放在你的**文档目录**（不在软件安装目录、也不在缓存目录）：

```text
文档\CoinFlow\Ledger\coinflow-ledger.json
```

这意味着：

- 清理电脑缓存、清理软件垃圾 → **不会碰到账本**；
- 卸载重装、升级新版本 → **账本原地保留**；
- 想备份，直接复制这个文件夹即可；文件用记事本就能打开检查。

软件本身还有四层自动保护：

1. 每次保存前先写临时文件校验，再原子替换，主文件永远不会写坏一半；
2. 上一版账本自动留作 `.bak`；
3. `Ledger\Backups\` 里**每天自动存一份快照，保留最近 14 天**；
4. 如果某次写入会让账单数量骤减一半以上（疑似误删），会先自动加存一份 `pre-shrink` 快照再执行。

就算哪天文件真的损坏了，软件会自动从备份恢复，并把损坏的原文件隔离保存下来供排查，绝不覆盖。

## 安装

到 [Releases 页面](https://github.com/lingcang728/CoinFlow/releases) 下载最新的 `CoinFlow-Setup-<版本号>.exe`，双击即装（一键安装到当前用户目录，不需要管理员权限）。

> 安装包暂未购买代码签名证书，Windows SmartScreen 可能提示"未知发布者"，点「仍要运行」即可。
>
> 提示：仍在使用 1.1.5 及更早版本的用户，旧的更新源已停用，请手动下载安装一次最新版，之后就能正常自动更新了。

---

## 开发者指南

以下内容面向想要修改代码或参与维护的人。

### 技术栈与架构

- **Electron**（主进程 `desktop/main.js` + 预加载桥 `desktop/preload.js`），渲染层为**原生 HTML/CSS/JS**，无框架、无构建步骤。
- 图表用 [Chart.js](https://www.chartjs.org/)，Excel 解析用 SheetJS，全部本地 vendor（`vendor/`），离线可用。
- 账本读写只发生在**主进程**（原子写 + 多级备份），渲染层通过 `coinflow:ledger-*` IPC 访问；渲染进程开启 `contextIsolation` + `sandbox` + 严格 CSP。
- IndexedDB 仅作为浏览器直开 `index.html` 时的开发兜底和旧版本数据迁移源，**不是**桌面端的数据源。

### 目录结构

```text
desktop/   Electron 主进程、预加载桥、冒烟测试（smoke.js）
js/        渲染层各页面模块（看板/明细/统计/记账/预算/分类/导入导出）
css/       样式（style.css 基础 + desktop.css 桌面布局）
vendor/    本地化的第三方库（chart.js / idb / xlsx）
assets/    图标资源
scripts/   打包辅助脚本（清理产物、更新桌面快捷方式）
index.html SPA 壳与页面容器
```

### 常用命令

```powershell
npm ci                 # 安装依赖
npm run dev            # 启动开发版（注意：开发版直接读写真实账本！）
npm run smoke:desktop  # 端到端回归测试（隔离账本目录，含截图与断言，必须全绿）
npm run build:desktop  # 打包 Windows 安装版到 release/
```

调试时如果不想碰真实账本，可以用环境变量把账本指到别处：

```powershell
$env:COINFLOW_LEDGER_DIR = 'D:\temp\coinflow-test'; npm run dev
```

### 发布新版本

1. 递增 `package.json` 和 `package-lock.json` 的版本号（只能递增，不可复用）；
2. `npm run build:desktop` 打包，确认 `release/` 下生成三件套；
3. 发布到 GitHub Releases（自动更新的唯一来源），**三个文件缺一不可**：
   - `latest.yml`
   - `CoinFlow-Setup-<版本号>.exe`
   - `CoinFlow-Setup-<版本号>.exe.blockmap`

   可以手动上传，也可以设置 `GH_TOKEN` 后用 `npm run release:desktop` 自动创建 draft Release——注意 draft 需要人工点击发布后用户才能收到更新。

更多维护规范（提交流程、版本历史）见 [agents.md](agents.md)。
