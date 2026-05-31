// CoinFlow HTML 报告导出模块
// 生成完全自包含、精美磨砂玻璃暗色系风格的离线 HTML 账单报告

(function() {
  /**
   * 导出 HTML 报告主函数
   */
  async function exportToHTML(year, month) {
    try {
      const stats = await window.CoinFlowDB.getMonthlyStats(year, month);
      const budgetConfig = await window.CoinFlowDB.getBudgetConfig();
      const transactions = stats.transactions;
      
      const formattedMonth = String(month).padStart(2, '0');
      const reportTitle = `${year}年${formattedMonth}月 记账月度报告`;
      const generationTime = new Date().toLocaleString('zh-CN');

      // 1. 计算分类饼图的 conic-gradient
      let conicParts = [];
      let currentDeg = 0;
      Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
        const cat = window.CoinFlowUtils.CATEGORIES[key];
        const spent = stats.categorySpent[key] || 0;
        if (spent > 0 && stats.totalSpent > 0) {
          const percent = spent / stats.totalSpent;
          const nextDeg = currentDeg + percent * 360;
          conicParts.push(`${cat.color} ${currentDeg.toFixed(1)}deg ${nextDeg.toFixed(1)}deg`);
          currentDeg = nextDeg;
        }
      });
      if (conicParts.length === 0) {
        conicParts.push('rgba(255, 255, 255, 0.08) 0deg 360deg');
      }
      const pieGradient = `conic-gradient(${conicParts.join(', ')})`;

      // 2. 生成图例 HTML
      let legendHtml = '';
      Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
        const cat = window.CoinFlowUtils.CATEGORIES[key];
        const spent = stats.categorySpent[key] || 0;
        const percent = stats.totalSpent > 0 ? ((spent / stats.totalSpent) * 100).toFixed(1) : '0.0';
        if (spent > 0) {
          legendHtml += `
            <div class="legend-item">
              <span class="legend-dot" style="background-color: ${cat.color};"></span>
              <span class="legend-label">${cat.emoji} ${cat.name}</span>
              <span class="legend-value">¥${spent.toFixed(2)} (${percent}%)</span>
            </div>
          `;
        }
      });
      if (!legendHtml) {
        legendHtml = '<div style="color: var(--text-secondary); font-size: 13px;">本月无消费数据</div>';
      }

      // 3. 生成分类预算进度条 HTML
      let progressBarsHtml = '';
      Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
        const cat = window.CoinFlowUtils.CATEGORIES[key];
        const spent = stats.categorySpent[key] || 0;
        const budget = stats.categoryBudgets[key] || 0;
        const percent = budget > 0 ? Math.min((spent / budget) * 100, 100).toFixed(1) : 0;
        
        let statusClass = 'success';
        if (percent >= 100) {
          statusClass = 'danger';
        } else if (percent >= 80) {
          statusClass = 'warning';
        }

        progressBarsHtml += `
          <div class="progress-item">
            <div class="progress-info">
              <span class="progress-label">${cat.emoji} ${cat.name}</span>
              <span class="progress-values">¥${spent.toFixed(2)} / ¥${budget.toFixed(2)} (${percent}%)</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar ${statusClass}" style="width: ${percent}%;"></div>
            </div>
          </div>
        `;
      });

      // 4. 生成每日消费趋势柱状图
      const lastDay = new Date(year, month, 0).getDate();
      const dailySpent = {};
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${formattedMonth}-${String(d).padStart(2, '0')}`;
        dailySpent[d] = 0;
      }
      transactions.forEach(tx => {
        const day = parseInt(tx.date.split('-')[2]);
        if (dailySpent[day] !== undefined) {
          dailySpent[day] += tx.amount;
        }
      });

      const maxDailySpent = Math.max(...Object.values(dailySpent), 1);
      let barChartHtml = '';
      for (let d = 1; d <= lastDay; d++) {
        const spent = dailySpent[d];
        const heightPercent = ((spent / maxDailySpent) * 100).toFixed(1);
        barChartHtml += `
          <div class="bar-col" title="${d}日: ¥${spent.toFixed(2)}">
            <div class="bar-fill" style="height: ${heightPercent}%;">
              <div class="bar-tooltip">¥${spent.toFixed(2)}</div>
            </div>
            <div class="bar-label">${d}</div>
          </div>
        `;
      }

      // 5. 生成逐日明细交易列表 HTML (按天分组)
      const groupedTxs = {};
      transactions.forEach(tx => {
        if (!groupedTxs[tx.date]) groupedTxs[tx.date] = [];
        groupedTxs[tx.date].push(tx);
      });

      let transactionsHtml = '';
      Object.keys(groupedTxs).sort((a, b) => b.localeCompare(a)).forEach(dateStr => {
        const txs = groupedTxs[dateStr];
        const daySpent = txs.reduce((sum, item) => sum + item.amount, 0);
        
        let txRowsHtml = '';
        txs.forEach(tx => {
          const cat = window.CoinFlowUtils.CATEGORIES[tx.category] || { emoji: '❓', name: tx.category, class: 'food' };
          txRowsHtml += `
            <div class="tx-item">
              <div class="tx-left">
                <span class="tx-emoji bg-${cat.class}">${cat.emoji}</span>
                <span class="tx-note">${window.CoinFlowUtils.escapeHtml(tx.note || cat.name)}</span>
              </div>
              <div class="tx-amount">-¥${tx.amount.toFixed(2)}</div>
            </div>
          `;
        });

        const formattedDate = window.CoinFlowUtils.formatFriendlyDate(dateStr);

        transactionsHtml += `
          <div class="day-group">
            <div class="day-header">
              <span class="day-title">${formattedDate} (${dateStr})</span>
              <span class="day-total">日支出 ¥${daySpent.toFixed(2)}</span>
            </div>
            <div class="day-list">${txRowsHtml}</div>
          </div>
        `;
      });

      if (transactions.length === 0) {
        transactionsHtml = '<div class="no-data-card">本月暂无任何记账记录</div>';
      }

      // 6. 构造自包含的 HTML 页面模板
      const htmlTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle}</title>
  <style>
    :root {
      --bg-color: #0a0a0f;
      --card-bg: rgba(255, 255, 255, 0.04);
      --glass-border: rgba(255, 255, 255, 0.08);
      --text-main: #ffffff;
      --text-secondary: rgba(255, 255, 255, 0.6);
      --primary-gold: #FF8C00;
      --primary-gradient: linear-gradient(135deg, #FF8C00 0%, #FFD700 100%);
      --color-success: #4CAF50;
      --color-warning: #FF9800;
      --color-danger: #F44336;
      --font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html,
    body {
      scrollbar-color: rgba(255, 255, 255, 0.18) rgba(10, 10, 15, 0.92);
      scrollbar-width: thin;
    }

    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    ::-webkit-scrollbar-track {
      background: rgba(10, 10, 15, 0.92);
      border-radius: 999px;
    }

    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.20);
      border: 2px solid rgba(10, 10, 15, 0.92);
      border-radius: 999px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.30);
    }

    ::-webkit-scrollbar-button {
      width: 0;
      height: 0;
      display: none;
    }

    ::-webkit-scrollbar-corner {
      background: rgba(10, 10, 15, 0.92);
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: var(--font-family);
      padding: 30px 20px;
      line-height: 1.5;
      display: flex;
      justify-content: center;
    }

    .report-container {
      width: 100%;
      max-width: 1000px;
    }

    /* 头部区域 */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--glass-border);
      padding-bottom: 16px;
    }

    .logo-area {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .logo-text {
      background: var(--primary-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .report-title-desc {
      font-size: 18px;
      font-weight: 700;
    }

    .generation-time {
      font-size: 11px;
      color: var(--text-secondary);
      text-align: right;
    }

    /* 磨砂玻璃卡片 */
    .glass-card {
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }

    /* 左右双栏布局 */
    .grid-layout {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 20px;
    }

    /* 指标卡片排列 */
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-bottom: 20px;
    }

    .metric-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 12px;
      padding: 15px;
      text-align: center;
    }

    .metric-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .metric-value {
      font-size: 22px;
      font-weight: 800;
      color: var(--text-main);
    }

    .metric-value.gold {
      background: var(--primary-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    /* 饼图容器 */
    .chart-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px 0;
    }

    .pie-chart {
      width: 170px;
      height: 170px;
      border-radius: 50%;
      background: ${pieGradient};
      position: relative;
      margin-bottom: 20px;
      box-shadow: 0 0 20px rgba(0,0,0,0.3);
    }

    .pie-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 120px;
      height: 120px;
      background: #0d0d15;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .center-percent {
      font-size: 20px;
      font-weight: 800;
      color: #fff;
    }

    .center-label {
      font-size: 9px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    /* 图例 */
    .legend-container {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      font-size: 13px;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 8px;
      display: inline-block;
    }

    .legend-label {
      flex: 1;
      color: var(--text-main);
    }

    .legend-value {
      color: var(--text-secondary);
      font-weight: 500;
    }

    /* 进度条样式 */
    .progress-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .progress-item {
      display: flex;
      flex-direction: column;
    }

    .progress-info {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 6px;
    }

    .progress-label {
      font-weight: 500;
    }

    .progress-values {
      color: var(--text-secondary);
    }

    .progress-bar-container {
      width: 100%;
      height: 7px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      border-radius: 4px;
    }

    .progress-bar.success { background-color: var(--color-success); }
    .progress-bar.warning { background-color: var(--color-warning); }
    .progress-bar.danger { background-color: var(--color-danger); }

    /* 柱状图样式 */
    .bar-chart-container {
      height: 150px;
      display: flex;
      align-items: flex-end;
      gap: 4px;
      padding-top: 15px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      margin-bottom: 8px;
    }

    .bar-col {
      flex: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      position: relative;
      cursor: pointer;
    }

    .bar-fill {
      width: 100%;
      background: linear-gradient(180deg, #FF8C00 0%, rgba(255, 215, 0, 0.2) 100%);
      border-radius: 3px 3px 0 0;
      min-height: 2px;
      transition: background 0.2s;
      position: relative;
    }

    .bar-col:hover .bar-fill {
      background: #FFD700;
    }

    .bar-label {
      font-size: 9px;
      color: var(--text-secondary);
      margin-top: 6px;
    }

    .bar-tooltip {
      position: absolute;
      bottom: 105%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 15, 25, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 9px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 10;
    }

    .bar-col:hover .bar-tooltip {
      opacity: 1;
    }

    /* 账单明细列表 */
    .day-group {
      margin-bottom: 15px;
    }

    .day-header {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-secondary);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding-bottom: 6px;
      margin-bottom: 8px;
    }

    .day-title {
      font-weight: 600;
      color: var(--text-main);
    }

    .day-total {
      font-weight: 500;
    }

    .day-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tx-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.02);
    }

    .tx-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .tx-emoji {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    }

    .tx-note {
      font-size: 13px;
      color: #fff;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tx-amount {
      font-size: 13px;
      font-weight: 700;
      color: var(--primary-gold);
    }

    .no-data-card {
      text-align: center;
      padding: 40px;
      color: var(--text-secondary);
      font-size: 13px;
    }

    /* 分类标签配色 */
    .bg-food { background-color: rgba(255, 107, 107, 0.15); color: #FF6B6B; }
    .bg-drinks { background-color: rgba(168, 85, 247, 0.15); color: #A855F7; }
    .bg-transport { background-color: rgba(59, 130, 246, 0.15); color: #3B82F6; }
    .bg-shopping { background-color: rgba(245, 158, 11, 0.15); color: #F59E0B; }
    .bg-entertainment { background-color: rgba(236, 72, 153, 0.15); color: #EC4899; }
    .bg-housing { background-color: rgba(16, 185, 129, 0.15); color: #10B981; }
    .bg-social { background-color: rgba(6, 182, 212, 0.15); color: #06B6D4; }
    .bg-study { background-color: rgba(139, 92, 246, 0.15); color: #8B5CF6; }

    /* 页脚 */
    footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--glass-border);
      color: var(--text-secondary);
      font-size: 11px;
    }

    /* 响应式媒体查询 */
    @media (max-width: 800px) {
      .grid-layout {
        grid-template-columns: 1fr;
      }
      .metric-grid {
        grid-template-columns: 1fr;
        gap: 10px;
      }
    }

    /* 打印专属样式 */
    @media print {
      body {
        background-color: #fff !important;
        color: #000 !important;
        padding: 0;
      }
      
      .glass-card, .metric-card {
        background: none !important;
        border: 1px solid #ccc !important;
        box-shadow: none !important;
        color: #000 !important;
      }

      .pie-center {
        background: #fff !important;
      }

      .center-percent, .center-label, .tx-note, .tx-amount, .logo-text, .metric-value, .day-title {
        color: #000 !important;
      }

      .progress-bar-container {
        border: 1px solid #ccc;
        background: #eee !important;
      }

      .progress-bar {
        background-color: #333 !important;
      }
      
      .pie-chart {
        border: 1px solid #ccc;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <header>
      <div class="logo-area">
        <span class="logo-text">CoinFlow</span>
        <span class="report-title-desc">${reportTitle}</span>
      </div>
      <div class="generation-time">
        生成时间<br>${generationTime}
      </div>
    </header>

    <div class="grid-layout">
      <!-- 左栏：指标卡片 & 分类预算进度 & 每日趋势 -->
      <div class="left-col">
        <!-- 指标卡片 -->
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-label">本月总消费</div>
            <div class="metric-value gold">¥${stats.totalSpent.toFixed(2)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">本月总预算</div>
            <div class="metric-value">¥${stats.totalBudget.toFixed(2)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">预算剩余</div>
            <div class="metric-value">¥${stats.remainingBudget.toFixed(2)}</div>
          </div>
        </div>

        <!-- 每日支出趋势 -->
        <div class="glass-card">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 15px;">📊 每日支出趋势</div>
          <div class="bar-chart-container">
            ${barChartHtml}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-secondary); padding: 0 4px;">
            <span>1日</span>
            <span>${lastDay}日</span>
          </div>
        </div>

        <!-- 预算进度条 -->
        <div class="glass-card">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 15px;">📈 分类预算进度</div>
          <div class="progress-list">
            ${progressBarsHtml}
          </div>
        </div>
      </div>

      <!-- 右栏：占比图 & 交易明细 -->
      <div class="right-col">
        <!-- 消费环形占比 -->
        <div class="glass-card">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 15px;">📊 消费结构占比</div>
          <div class="chart-box">
            <div class="pie-chart">
              <div class="pie-center">
                <div class="center-percent">${stats.progressPercent.toFixed(1)}%</div>
                <div class="center-label">已用总预算</div>
              </div>
            </div>
            <div class="legend-container">
              ${legendHtml}
            </div>
          </div>
        </div>

        <!-- 交易流水明细 -->
        <div class="glass-card">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 15px;">📝 账单记录明细</div>
          <div style="max-height: 480px; overflow-y: auto; padding-right: 4px;">
            ${transactionsHtml}
          </div>
        </div>
      </div>
    </div>

    <footer>
      CoinFlow 零花钱管家 - 您的校园智能理财助手
    </footer>
  </div>
</body>
</html>`;

      // 7. 保存文件
      const result = await window.CoinFlowRuntime.saveFile({
        defaultPath: `CoinFlow_${year}年${formattedMonth}月数据报告.html`,
        filters: [{ name: 'HTML 报告', extensions: ['html'] }],
        data: htmlTemplate,
        encoding: 'utf8',
        mimeType: 'text/html;charset=utf-8;'
      });
      return !result.canceled;
    } catch (error) {
      console.error('HTML 报告导出失败:', error);
      throw error;
    }
  }

  // 暴露 API
  window.CoinFlowExportHTML = {
    exportToHTML
  };
})();
