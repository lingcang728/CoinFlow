# CoinFlow 零花钱管家 — 大学生智能记账 PWA

> 为凌苍定制的个人记账应用，月收入 3000 元，深色磨砂玻璃风 + 橙金色系

## 技术选型

| 技术 | 选择 | 理由 |
|------|------|------|
| 核心 | HTML + CSS + JavaScript（原生） | 无框架依赖，加载快，易维护 |
| 数据可视化 | Chart.js 4.x（CDN） | 轻量、动画丰富、支持圆环图/柱状图/折线图 |
| Excel 操作 | SheetJS（CDN） | 支持导入/导出 Excel，纯前端实现 |
| 数据存储 | IndexedDB（通过 idb 封装） | 支持结构化数据，容量大，离线可用 |
| 部署形式 | PWA（Service Worker + Manifest） | 可添加到主屏幕，离线可用，全屏体验 |

---

## 项目结构

```
coinflow/
├── index.html              # 单页应用入口
├── manifest.json           # PWA 清单
├── sw.js                   # Service Worker（离线缓存）
├── css/
│   └── style.css           # 全局样式（设计系统 + 组件 + 页面）
├── js/
│   ├── app.js              # 应用入口、路由、页面切换
│   ├── db.js               # IndexedDB 数据层
│   ├── dashboard.js        # 仪表盘页面逻辑
│   ├── add-record.js       # 记账录入页面逻辑
│   ├── transactions.js     # 账单明细页面逻辑
│   ├── statistics.js       # 统计分析页面逻辑
│   ├── charts.js           # Chart.js 图表封装
│   ├── budget.js           # 预算管理逻辑
│   ├── excel.js            # Excel 导入/导出
│   └── utils.js            # 工具函数
└── assets/
    └── icons/              # PWA 图标
```

---

## Proposed Changes

### 1. 设计系统 (Design System)

#### [NEW] [style.css](file:///C:/Users/15pro/.gemini/antigravity/scratch/coinflow/css/style.css)

**深色磨砂玻璃 + 橙金色系设计规范：**

- **背景**：`#0a0a0f`（近黑）渐变到 `#1a1a2e`（深靛蓝）
- **卡片**：`rgba(255, 255, 255, 0.05)` + `backdrop-filter: blur(20px)` + `1px solid rgba(255, 255, 255, 0.08)` 边框
- **主色/强调色**：`#FF8C00`（暗橙）→ `#FFD700`（金色）渐变
- **文字**：主文字 `#f0f0f0`，次要文字 `rgba(255, 255, 255, 0.6)`
- **成功/警告/危险**：`#4CAF50` / `#FFB74D` / `#F44336`（预算状态用）
- **字体**：Google Fonts `Inter`（英文/数字）+ 系统中文字体回退
- **圆角**：卡片 `16px`，按钮 `12px`，小元素 `8px`
- **动画**：所有交互元素 `transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- **移动端适配**：以 `375px` 为基准，使用 `clamp()` 和 `rem` 响应式

**分类配色方案（8 类，各有专属色）：**

| 分类 | 颜色 | 图标（Emoji） |
|------|------|---------|
| 饮食 | `#FF6B6B` 珊瑚红 | 🍚 |
| 奶茶零食 | `#A855F7` 紫色 | 🧋 |
| 交通 | `#3B82F6` 蓝色 | 🚌 |
| 网购 | `#F59E0B` 琥珀色 | 🛒 |
| 娱乐 | `#EC4899` 粉色 | 🎮 |
| 宿舍生活 | `#10B981` 绿色 | 🏠 |
| 社交 | `#06B6D4` 青色 | 👥 |
| 学习 | `#8B5CF6` 靛蓝 | 📚 |

---

### 2. 数据层 (Data Layer)

#### [NEW] [db.js](file:///C:/Users/15pro/.gemini/antigravity/scratch/coinflow/js/db.js)

**IndexedDB 数据模型：**

```javascript
// 交易记录表
Transaction {
  id: auto-increment,
  amount: number,          // 金额
  category: string,        // 分类 key
  note: string,           // 备注（可选）
  date: string,           // "YYYY-MM-DD"
  createdAt: timestamp
}

// 预算配置表
BudgetConfig {
  id: "current",           // 单条记录
  monthlyIncome: 3000,     // 月收入
  savingsTarget: 1000,     // 储蓄目标
  categoryBudgets: {       // 各分类预算
    food: 800,
    drinks: 200,
    transport: 100,
    shopping: 300,
    entertainment: 100,
    housing: 200,
    social: 100,
    study: 200
  },
  lastResetMonth: "2026-05" // 上次重置月份
}
```

**核心 API：**
- `addTransaction(tx)` — 新增记录
- `getTransactionsByMonth(year, month)` — 按月查询
- `getTransactionsByDateRange(start, end)` — 按日期范围查询
- `deleteTransaction(id)` — 删除记录
- `updateTransaction(id, data)` — 编辑记录
- `getBudgetConfig()` / `saveBudgetConfig(config)` — 预算配置
- `getMonthlyStats(year, month)` — 月度汇总统计

---

### 3. 仪表盘首页 (Dashboard)

#### [NEW] [dashboard.js](file:///C:/Users/15pro/.gemini/antigravity/scratch/coinflow/js/dashboard.js)

**布局（从上到下）：**

1. **顶部头部**
   - 左：「5月」月份选择器（可左右滑动切换月份）
   - 右：设置图标 ⚙️（点击进入预算设置弹窗）

2. **总览卡片**（大号磨砂玻璃卡片）
   - 中央大字体显示本月总消费金额（带动画计数效果）
   - 下方小字显示：剩余可用 / 总预算
   - 底部：整体预算进度条（橙金渐变）

3. **圆环图卡片**
   - Chart.js Doughnut 图，中间显示「已用 / 总预算」
   - 环形各段使用分类对应颜色
   - 底部横向滚动显示各分类图例 + 金额

4. **预算进度条组**（分类预算卡片）
   - 8 个分类各一条进度条
   - 每条显示：分类图标 + 名称 | 已用/预算 | 百分比
   - 颜色逻辑：`<60%` 绿色、`60-85%` 黄色、`>85%` 红色
   - 超支时进度条闪烁动画 + 红色警告

5. **最近交易**（最近 5 笔，可点击查看全部）

---

### 4. 记账录入页 (Add Record)

#### [NEW] [add-record.js](file:///C:/Users/15pro/.gemini/antigravity/scratch/coinflow/js/add-record.js)

**设计为仪表盘式快速录入界面：**

1. **分类选择区**（2×4 网格）
   - 每个分类显示为圆形图标按钮 + 名称
   - 选中时放大 + 橙金边框发光动画
   - 长按可自定义分类（V2 功能）

2. **金额输入区**
   - 大号数字显示当前输入金额
   - 下方显示该分类「剩余预算」
   - 自定义数字键盘（0-9 + 小数点 + 退格）
   - 键盘按键带触感反馈（CSS 动画模拟）

3. **备注输入**（可选）
   - 一行文本输入框，placeholder 显示「添加备注...」
   - 常用备注快捷标签（基于历史频率自动推荐，如「正餐」「coco」「拼多多」）

4. **日期选择**
   - 默认今天，可点击切换到其他日期
   - 简洁的日期选择器

5. **保存按钮**
   - 大号圆角按钮，橙金渐变
   - 保存成功后播放「✓」打勾动画 + 短暂震动反馈

---

### 5. 账单明细页 (Transactions)

#### [NEW] [transactions.js](file:///C:/Users/15pro/.gemini/antigravity/scratch/coinflow/js/transactions.js)

1. **月份选择器**（顶部，与仪表盘联动）

2. **筛选/排序栏**
   - 分类筛选（水平滚动标签）
   - 排序：按时间/按金额

3. **交易列表**
   - 按日期分组（「今天」「昨天」「5月28日」等）
   - 每条记录：分类图标 | 备注/分类名 | 金额
   - 左滑可删除（带确认）
   - 点击可编辑

4. **月度汇总**（底部悬浮）
   - 本月总支出 | 笔数 | 日均消费

---

### 6. 统计分析页 (Statistics)

#### [NEW] [statistics.js](file:///C:/Users/15pro/.gemini/antigravity/scratch/coinflow/js/statistics.js)

1. **每日消费柱状图**
   - Chart.js Bar 图，显示本月每天的消费
   - 悬浮/点击显示当天明细
   - 虚线标记日均预算线

2. **月度趋势线图**
   - 显示过去 6-12 个月的月度总消费趋势
   - 双线：实际消费 vs 预算

3. **消费日历热力图**
   - 类似 GitHub 贡献图的月度日历视图
   - 颜色从浅到深（浅橙 → 深橙 → 红色）表示消费金额
   - 点击某天显示该天消费详情

4. **分类排行**
   - 水平柱状图，按消费金额从高到低排列各分类
   - 显示各分类占比百分比

---

### 7. Excel 操作

#### [NEW] [excel.js](file:///C:/Users/15pro/.gemini/antigravity/scratch/coinflow/js/excel.js)

**导出功能：**
- 导出当前月份或自定义时间范围的账单
- Excel 格式包含：日期、分类、金额、备注
- 包含一个汇总 Sheet（月度总览、各分类汇总）
- 文件名格式：`CoinFlow_2026年5月账单.xlsx`

**导入功能：**
- 支持导入凌苍现有的 `2026年账单.xlsx` 格式
- 自动识别列映射（日期→I列、正餐→K列、宿舍→M列、奶茶零食→O列 等）
- 导入前预览，确认后写入 IndexedDB

---

### 8. PWA 配置

#### [NEW] [manifest.json](file:///C:/Users/15pro/.gemini/antigravity/scratch/coinflow/manifest.json)
- App 名称：CoinFlow
- 主题色：`#FF8C00`
- 背景色：`#0a0a0f`
- 显示模式：`standalone`（全屏，无浏览器 UI）

#### [NEW] [sw.js](file:///C:/Users/15pro/.gemini/antigravity/scratch/coinflow/sw.js)
- 缓存策略：Cache First（静态资源）+ Network First（CDN 库）
- 离线支持：所有核心功能离线可用

---

### 9. 动画与微交互

全应用范围的动画效果：

| 交互 | 动画效果 |
|------|----------|
| 页面切换 | 滑动过渡（类似 iOS 页面转场） |
| 卡片出现 | 从下方淡入 + 上移（staggered delay） |
| 数字变化 | 计数动画（从 0 递增到目标值） |
| 记录保存 | ✓ 打勾动画 + 卡片缩小消失 |
| 删除记录 | 左滑渐出 + 高度折叠 |
| 按钮点击 | 缩放 0.95 + 阴影变化 |
| 圆环图 | 从 0° 旋转展开到目标角度 |
| 进度条 | 从 0% 填充到目标宽度 |
| 超支警告 | 红色脉冲闪烁 |
| 下拉刷新 | 旋转 loading 指示器 |

---

## 预算智能分配默认值

基于凌苍现有消费数据分析（5月总消费 ¥2686），智能建议初始预算：

| 分类 | 建议预算 | 占比 | 依据 |
|------|----------|------|------|
| 饮食 | ¥800 | 40% | 每天约 ¥30 正餐，占比最大 |
| 奶茶零食 | ¥200 | 10% | 频繁奶茶消费（coco、一点点等） |
| 网购 | ¥300 | 15% | 拼多多消费较高且波动大 |
| 宿舍生活 | ¥200 | 10% | 电费、宿舍杂费 |
| 娱乐 | ¥150 | 7.5% | |
| 交通 | ¥100 | 5% | |
| 社交 | ¥150 | 7.5% | |
| 学习 | ¥100 | 5% | |
| **合计** | **¥2000** | **100%** | 收入 3000 - 储蓄 1000 |

---

## Verification Plan

### 自动化测试
1. 在浏览器中运行应用，检查所有 4 个页面正常渲染
2. 测试记账流程：添加多条不同分类的记录
3. 测试图表渲染：圆环图、柱状图、进度条正确显示数据
4. 测试 Excel 导出：下载文件并用 Excel 打开验证
5. 测试 Excel 导入：导入凌苍现有的 `2026年账单.xlsx`
6. 测试预算超支提醒：添加超出预算的记录，检查视觉提醒

### 手动验证
1. 在手机浏览器中访问，检查移动端适配效果
2. 添加到主屏幕，验证 PWA 全屏体验
3. 断网后测试离线功能

---

> [!IMPORTANT]
> **关于历史数据导入**：你现有 Excel 表格中，每天只有一行，但混合了多个分类（正餐在 K 列、奶茶在 O 列、网购在 T 列等）。导入时我会把每行拆分为多条独立记录（每个有金额的分类单独一条），这样在新应用中可以按分类查看和统计。备注列（如「coco」「霸王」「拼」）也会保留。
