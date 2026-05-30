# CoinFlow UI 四项问题修复计划

修复凌苍截图中反馈的四类 UI 问题：圆环图布局空旷、图例数字错位、导出菜单穿透、热力图样式古板。

---

## Proposed Changes

### 1. 圆环图布局 — 消除空旷感

> [!IMPORTANT]
> 截图中「消费分类结构」卡片内圆环图只占容器很小一部分，周围留白过多。

**根因**：桌面端 CSS 给圆环图卡片设了 `min-height: 386px`，但圆环图容器只有 `220×220px`（移动端 `180×180px`），图例又紧贴底部，导致中间大段空白。

**修复方案**：

#### [MODIFY] [style.css](file:///c:/Users/15pro/Desktop/MyProject/CoinFlow/css/style.css)

桌面端（`@media min-width: 900px`）调整：

```diff
- #page-dashboard > .glass-card:nth-of-type(3) {
-   grid-column: 2;
-   grid-row: 3 / span 2;
-   min-height: 386px;
-   justify-content: space-between;
-   overflow: visible !important;
- }
+ #page-dashboard > .glass-card:nth-of-type(3) {
+   grid-column: 2;
+   grid-row: 3 / span 2;
+   min-height: 386px;
+   justify-content: center;      /* 垂直居中使圆环不再偏上 */
+   align-items: center;
+   overflow: visible !important;
+   padding: 16px 15px !important; /* 收紧内边距 */
+ }

- #page-dashboard > .glass-card:nth-of-type(3) > div:nth-of-type(2) {
-   width: 220px !important;
-   height: 220px !important;
-   padding: 10px;
-   box-sizing: border-box;
- }
+ #page-dashboard > .glass-card:nth-of-type(3) > div:nth-of-type(2) {
+   width: 260px !important;
+   height: 260px !important;     /* 增大圆环尺寸 220→260 */
+   padding: 10px;
+   box-sizing: border-box;
+ }
```

#### [MODIFY] [index.html](file:///c:/Users/15pro/Desktop/MyProject/CoinFlow/index.html)

移动端圆环容器也适当增大：

```diff
- <div style="position: relative; width: 180px; height: 180px;">
+ <div style="position: relative; width: 220px; height: 220px;">
```

同时确保标题行 `align-self: flex-start` 不受 `align-items: center` 影响（标题需保持左对齐）——通过给标题行加 `width: 100%` 解决。

---

### 2. 图例标签 — 修复名称与数字错位

> [!IMPORTANT]
> 底部图例「饮食¥960.0」「奶茶零¥235.0」，名称被截断、与金额挤在一起无间距。

**根因**：`dashboard.js` 中图例 innerHTML 的格式是 `${cat.name}:` 紧接 `¥${spent.toFixed(1)}`，冒号和 ¥ 之间没有空格；且 `white-space: nowrap` 导致长名称在容器不足时直接截断。

**修复方案**：

#### [MODIFY] [dashboard.js](file:///c:/Users/15pro/Desktop/MyProject/CoinFlow/js/dashboard.js)

```diff
  legendItem.innerHTML = `
    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${cat.color};"></span>
-   <span style="color:var(--text-secondary);">${cat.name}:</span>
-   <span style="font-weight:600; color:#fff;">¥${spent.toFixed(1)}</span>
+   <span style="color:var(--text-secondary);">${cat.name}</span>
+   <span style="font-weight:600; color:#fff; flex-shrink:0;">¥${spent.toFixed(1)}</span>
  `;
```

关键改动：
- 去掉冒号，名称和金额自然由 `gap: 6px` 分隔
- 金额 `<span>` 加 `flex-shrink: 0` 防止被压缩截断
- 每个图例项容器已有 `white-space: nowrap`，保证完整显示

---

### 3. 导出下拉菜单 — 修复穿透/遮挡

> [!IMPORTANT]
> 点击「导出 ▾」后弹出的菜单被下方的筛选卡片遮挡，无法点击到菜单项。

**根因**：下拉菜单的父容器 `.glass-card` 虽然设了 `overflow: visible`，但没有建立足够高的层叠上下文。下方紧邻的 `.glass-card`（筛选与排序区）的 `backdrop-filter` 隐式创建了新的层叠上下文，其层级高于下拉菜单。

**修复方案**：

#### [MODIFY] [index.html](file:///c:/Users/15pro/Desktop/MyProject/CoinFlow/index.html)

给导出按钮所在的 `.glass-card` 容器加 `position: relative; z-index: 10;`，确保其层叠上下文高于下方卡片：

```diff
- <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; margin-bottom: 15px; overflow: visible;">
+ <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; margin-bottom: 15px; overflow: visible; position: relative; z-index: 10;">
```

同时将下拉菜单的 z-index 提升到 `200`（从 `150`）以确保安全覆盖：

```diff
- z-index: 150;
+ z-index: 200;
```

---

### 4. 热力图 — 半透明磨砂渐变风格

> [!IMPORTANT]
> 当前热力图格子是纯色方块，风格古板。改为半透明磨砂渐变 + 微光晕发光。

**修复方案**：

#### [MODIFY] [statistics.js](file:///c:/Users/15pro/Desktop/MyProject/CoinFlow/js/statistics.js)

重写 `renderHeatmap` 中格子的样式逻辑：

| 消费等级 | 旧样式 | 新样式 |
|---------|--------|--------|
| ¥0 (无) | `rgba(255,255,255,0.05)` 纯灰 | 深灰磨砂玻璃 + 微弱边框 |
| ≤¥30 (低) | `rgba(255,140,0,0.18)` 纯橙 | 半透明橙金渐变 + 内发光边框 + 微弱 box-shadow |
| ≤¥100 (中) | `rgba(255,140,0,0.55)` 深橙 | 明亮橙金渐变 + 更强发光 + 磨砂效果 |
| >¥100 (高) | `rgba(244,67,54,0.85)` 纯红 | 红橙渐变 + 警示光晕 + 脉动发光边框 |

每个格子的基础样式增加：
- `border-radius: 6px`（从 4px 增大）
- `backdrop-filter: blur(4px)`（磨砂玻璃感）
- `border: 1px solid rgba(...)` 带微光发光边框
- 有消费的格子加 `box-shadow` 内外发光
- 背景使用 `linear-gradient` 渐变而非纯色

#### [MODIFY] [index.html](file:///c:/Users/15pro/Desktop/MyProject/CoinFlow/index.html)

同步更新底部图例色块，使其与新的渐变色阶一致：

```diff
  <!-- 图例色块更新为渐变匹配 -->
- <span style="...background:rgba(255,255,255,0.06);..."></span>
+ <span style="...background:linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); border:1px solid rgba(255,255,255,0.08);..."></span>
  <!-- 其余三级同理改为渐变 -->
```

---

## Verification Plan

### 自动验证
1. 在桌面端浏览器打开应用，检查圆环图是否充满卡片区域
2. 检查图例标签名称和金额是否分隔清晰、完整显示
3. 点击「导出 ▾」按钮，验证菜单可正常点击
4. 切换到统计页，检查热力图格子是否呈现磨砂渐变效果

### 手动验证
- 请凌苍在 Electron 桌面端验证以上四项修复效果
