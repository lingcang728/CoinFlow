// CoinFlow 统计分析页面逻辑
(function() {
  const barCanvas = document.getElementById('chart-bar-daily');
  const lineCanvas = document.getElementById('chart-line-trend');
  
  const heatmapContainer = document.getElementById('calendar-heatmap-container');
  const heatmapDetailText = document.getElementById('heatmap-day-detail');
  
  const rankList = document.getElementById('statistics-rank-list');

  /**
   * 初始化统计页
   */
  function init() {
    render();
  }

  /**
   * 渲染统计图表
   */
  async function render() {
    const year = window.CoinFlowState.currentYear;
    const month = window.CoinFlowState.currentMonth;

    try {
      // 1. 获取当月统计数据
      const stats = await window.CoinFlowDB.getMonthlyStats(year, month);
      const transactions = stats.transactions;

      // ================= (一) 每日消费柱状图 =================
      const daysInMonth = new Date(year, month, 0).getDate();
      const dailySpent = Array(daysInMonth).fill(0);
      
      transactions.forEach(tx => {
        const d = new Date(tx.date + 'T00:00:00');
        const dayIdx = d.getDate() - 1;
        if (dayIdx >= 0 && dayIdx < daysInMonth) {
          dailySpent[dayIdx] += tx.amount;
        }
      });

      // 组装 X 轴 labels ('1', '2', ..., '31')
      const xLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
      
      // 计算日均消费 (只算当月总消费/当月总天数)
      const avgSpent = stats.totalSpent / daysInMonth;
      window.CoinFlowCharts.createBarChart(barCanvas, dailySpent, xLabels, avgSpent);

      // ================= (二) 月历热力图 =================
      renderHeatmap(year, month, dailySpent);

      // ================= (三) 过去 6 个月收支趋势图 =================
      await renderSixMonthTrend(year, month);

      // ================= (四) 分类消费排行列表 =================
      renderRankList(stats);

    } catch (err) {
      console.error('统计分析渲染失败:', err);
    }
  }

  /**
   * 渲染日历热力图
   */
  function renderHeatmap(year, month, dailySpent) {
    heatmapContainer.innerHTML = '';
    heatmapDetailText.textContent = '点击上方日期查看当天明细';

    // 1. 渲染星期表头 (周一至周日)
    const weekDays = ['一', '二', '三', '四', '五', '六', '日'];
    weekDays.forEach(day => {
      const header = document.createElement('div');
      header.style.cssText = `
        text-align: center;
        font-size: 10px;
        color: var(--text-muted);
        font-weight: 600;
        padding-bottom: 5px;
      `;
      header.textContent = day;
      heatmapContainer.appendChild(header);
    });

    // 2. 计算日历偏移
    // Date(year, month-1, 1).getDay() 获取 1 号是周几：0是周日，1-6是周一至周六
    const firstDay = new Date(year, month - 1, 1).getDay();
    // 换算为：周一在第一列，前面应该补足几个格子
    const emptyCells = firstDay === 0 ? 6 : firstDay - 1;

    // 填充前面的空白格子
    for (let i = 0; i < emptyCells; i++) {
      const empty = document.createElement('div');
      empty.style.cssText = 'aspect-ratio: 1; border-radius: 3px;';
      heatmapContainer.appendChild(empty);
    }

    // 填充日期格子
    const daysInMonth = dailySpent.length;
    for (let day = 1; day <= daysInMonth; day++) {
      const spent = dailySpent[day - 1];
      const cell = document.createElement('div');
      cell.style.cssText = `
        aspect-ratio: 1;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        color: rgba(255,255,255,0.4);
        cursor: pointer;
        transition: var(--transition-smooth);
        font-weight: 500;
      `;
      cell.textContent = day;

      // 根据金额阶梯配置背景色与发光
      if (spent === 0) {
        cell.style.background = 'rgba(255, 255, 255, 0.05)';
        cell.style.border = '1px solid rgba(255, 255, 255, 0.02)';
      } else if (spent <= 30) {
        cell.style.background = 'rgba(255, 140, 0, 0.18)'; // 浅橙
        cell.style.color = 'rgba(255, 255, 255, 0.8)';
      } else if (spent <= 100) {
        cell.style.background = 'rgba(255, 140, 0, 0.55)'; // 中等橙
        cell.style.color = '#fff';
      } else {
        cell.style.background = 'rgba(244, 67, 54, 0.85)'; // 警示红
        cell.style.color = '#fff';
        cell.style.boxShadow = '0 0 5px rgba(244, 67, 54, 0.4)';
      }

      // 绑定点击详情
      cell.onclick = () => {
        window.CoinFlowUtils.triggerHaptic('light');
        
        // 突出选中态
        document.querySelectorAll('#calendar-heatmap-container div').forEach(c => {
          c.classList.remove('heatmap-selected');
        });
        cell.classList.add('heatmap-selected');
        
        // 显示文本
        const formattedMonth = String(month).padStart(2, '0');
        const formattedDay = String(day).padStart(2, '0');
        const dateStr = `${year}-${formattedMonth}-${formattedDay}`;
        
        if (spent > 0) {
          heatmapDetailText.innerHTML = `<span style="color:#fff; font-weight:600;">${month}月${day}日</span> 消费支出了 <strong style="color:var(--primary-gold); font-size:14px; margin-left:4px;">¥${spent.toFixed(2)}</strong>`;
        } else {
          heatmapDetailText.innerHTML = `<span style="color:#fff; font-weight:600;">${month}月${day}日</span> <span style="color:var(--text-muted);">今天没有消费记账哦</span>`;
        }
      };

      heatmapContainer.appendChild(cell);
    }
  }

  /**
   * 渲染过去 6 个月的趋势图 (包含预算线和支出线)
   */
  async function renderSixMonthTrend(currentYear, currentMonth) {
    const months = [];
    const spentData = [];
    const budgetData = [];
    const labels = [];

    // 获取过去 6 个月的年月序列
    for (let i = 5; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m <= 0) {
        m += 12;
        y--;
      }
      months.push({ year: y, month: m });
      labels.push(`${m}月`);
    }

    // 批量拉取 IndexedDB 月度统计数据
    for (const item of months) {
      const stats = await window.CoinFlowDB.getMonthlyStats(item.year, item.month);
      spentData.push(stats.totalSpent);
      budgetData.push(stats.totalBudget);
    }

    window.CoinFlowCharts.createLineChart(lineCanvas, spentData, budgetData, labels);
  }

  /**
   * 渲染排行列表
   */
  function renderRankList(stats) {
    rankList.innerHTML = '';
    
    // 组装消费项
    const ranks = [];
    let maxSpent = 0;

    Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
      const cat = window.CoinFlowUtils.CATEGORIES[key];
      const spent = stats.categorySpent[key] || 0;
      if (spent > 0) {
        ranks.push({ key, name: cat.name, emoji: cat.emoji, spent, color: cat.color });
        if (spent > maxSpent) maxSpent = spent;
      }
    });

    // 降序排列
    ranks.sort((a, b) => b.spent - a.spent);

    if (ranks.length === 0) {
      rankList.innerHTML = `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding: 15px 0;">当月没有消费，暂无排行</div>`;
      return;
    }

    ranks.forEach((item, index) => {
      const ratio = stats.totalSpent > 0 ? ((item.spent / stats.totalSpent) * 100).toFixed(1) : 0;
      const barWidth = maxSpent > 0 ? (item.spent / maxSpent) * 100 : 0;

      const div = document.createElement('div');
      div.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 6px;
      `;
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-weight:700; color:var(--primary-gold); width:15px;">#${index + 1}</span>
            <span>${item.emoji} ${item.name}</span>
            <span style="color:var(--text-muted); font-size:10px;">${ratio}%</span>
          </div>
          <span style="font-weight:600; color:#fff;">¥${item.spent.toFixed(2)}</span>
        </div>
        <div style="width:100%; height:6px; background:rgba(255,255,255,0.04); border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:${barWidth}%; background:${item.color}; border-radius:3px; transition: width 0.8s ease-out;"></div>
        </div>
      `;
      rankList.appendChild(div);
    });
  }

  // 暴露组件 API
  window.CoinFlowStatistics = {
    init
  };
})();
