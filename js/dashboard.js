// CoinFlow 仪表盘首页逻辑
(function() {
  const monthDisplay = document.getElementById('current-month-display');
  const prevMonthBtn = document.getElementById('prev-month');
  const nextMonthBtn = document.getElementById('next-month');
  
  const spentDisplay = document.getElementById('total-spent-display');
  const remainingDisplay = document.getElementById('remaining-budget-display');
  const totalBudgetDisplay = document.getElementById('total-budget-display');
  
  const summaryCard = document.getElementById('dashboard-summary-card');
  const mainProgressBar = document.getElementById('total-budget-progress');
  
  const legendContainer = document.getElementById('chart-legend-container');
  const centerPercent = document.getElementById('chart-center-percent');
  const progressList = document.getElementById('dashboard-category-progress-list');
  const recentList = document.getElementById('dashboard-recent-list');
  const btnViewAll = document.getElementById('btn-view-all-transactions');

  let currentChart = null;

  /**
   * 初始化首页
   */
  function init() {
    // 绑定切换月份
    prevMonthBtn.onclick = () => changeMonth(-1);
    nextMonthBtn.onclick = () => changeMonth(1);
    
    // 绑定查看全部
    btnViewAll.onclick = () => {
      window.navigateToPage('transactions');
    };

    render();
  }

  /**
   * 切换月份
   */
  function changeMonth(direction) {
    window.CoinFlowUtils.triggerHaptic('light');
    let month = window.CoinFlowState.currentMonth + direction;
    let year = window.CoinFlowState.currentYear;
    
    if (month < 1) {
      month = 12;
      year--;
    } else if (month > 12) {
      month = 1;
      year++;
    }

    window.CoinFlowState.currentYear = year;
    window.CoinFlowState.currentMonth = month;
    
    render();
  }

  /**
   * 滚动数字动画效果 (Wow)
   */
  function animateValue(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const currentVal = start + progress * (end - start);
      element.innerHTML = '¥' + currentVal.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }

  /**
   * 加载数据并渲染视图
   */
  async function render() {
    const year = window.CoinFlowState.currentYear;
    const month = window.CoinFlowState.currentMonth;

    // 1. 更新月份文字
    monthDisplay.textContent = `${year}年${String(month).padStart(2, '0')}月`;

    try {
      // 获取 IndexedDB 统计数据
      const stats = await window.CoinFlowDB.getMonthlyStats(year, month);
      
      // 2. 消费大额卡片渲染与动画
      const prevValStr = spentDisplay.textContent.replace('¥', '').replace(/,/g, '');
      const prevVal = parseFloat(prevValStr) || 0;
      animateValue(spentDisplay, prevVal, stats.totalSpent, 600);

      // 剩余可用
      remainingDisplay.textContent = window.CoinFlowUtils.formatAmount(stats.remainingBudget);
      totalBudgetDisplay.textContent = window.CoinFlowUtils.formatAmount(stats.totalBudget);

      // 主进度条百分比与颜色
      let progressPercent = stats.progressPercent;
      let pbClass = 'success';
      
      if (progressPercent >= 100) {
        progressPercent = 100;
        pbClass = 'danger pulse';
        summaryCard.classList.add('warning-pulse');
        remainingDisplay.style.color = 'var(--color-danger)';
      } else if (progressPercent >= 80) {
        pbClass = 'warning';
        summaryCard.classList.add('warning-pulse');
        remainingDisplay.style.color = 'var(--color-warning)';
      } else {
        summaryCard.classList.remove('warning-pulse');
        remainingDisplay.style.color = '#fff';
      }

      mainProgressBar.className = `progress-bar ${pbClass}`;
      mainProgressBar.style.width = `${progressPercent}%`;

      // 3. 渲染圆环图
      const chartCanvas = document.getElementById('chart-doughnut-dashboard');
      const chartLabels = [];
      const chartData = [];
      const chartColors = [];

      Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
        const cat = window.CoinFlowUtils.CATEGORIES[key];
        const spent = stats.categorySpent[key] || 0;
        if (spent > 0) {
          chartLabels.push(cat.name);
          chartData.push(parseFloat(spent.toFixed(2)));
          chartColors.push(cat.color);
        }
      });

      // 创建环形图
      currentChart = window.CoinFlowCharts.createDoughnutChart(chartCanvas, chartData, chartLabels, chartColors);
      
      // 环中心百分比
      centerPercent.textContent = `${stats.totalBudget > 0 ? Math.round((stats.totalSpent / stats.totalBudget) * 100) : 0}%`;
      if (stats.totalSpent > stats.totalBudget && stats.totalBudget > 0) {
        centerPercent.style.color = 'var(--color-danger)';
      } else {
        centerPercent.style.color = '#fff';
      }

      // 4. 渲染图例滚动容器
      legendContainer.innerHTML = '';
      if (chartData.length === 0) {
        legendContainer.innerHTML = `<div style="font-size:12px; color:var(--text-muted); width:100%; text-align:center;">当月尚无消费支出数据</div>`;
      } else {
        Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
          const cat = window.CoinFlowUtils.CATEGORIES[key];
          const spent = stats.categorySpent[key] || 0;
          if (spent > 0) {
            const legendItem = document.createElement('div');
            legendItem.style.cssText = `
              display: flex;
              align-items: center;
              gap: 6px;
              background: var(--glass-bg);
              border: 1px solid var(--glass-border);
              padding: 6px 12px;
              border-radius: 12px;
              white-space: nowrap;
              font-size: 11px;
            `;
            legendItem.innerHTML = `
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${cat.color};"></span>
              <span style="color:var(--text-secondary);">${cat.name}:</span>
              <span style="font-weight:600; color:#fff;">¥${spent.toFixed(1)}</span>
            `;
            legendContainer.appendChild(legendItem);
          }
        });
      }

      // 5. 渲染各分类预算进度条列表
      progressList.innerHTML = '';
      Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
        const cat = window.CoinFlowUtils.CATEGORIES[key];
        const spent = stats.categorySpent[key] || 0;
        const budget = stats.categoryBudgets[key] || 0;
        
        let percent = budget > 0 ? (spent / budget) * 100 : (spent > 0 ? 100 : 0);
        let colorClass = 'success';
        let warnText = '';
        let isOver = false;

        if (percent > 100) {
          colorClass = 'danger pulse';
          warnText = `<span style="color:var(--color-danger); font-size:10px; font-weight:600; margin-left: 5px;">⚠️ 超支 ¥${(spent - budget).toFixed(0)}</span>`;
          isOver = true;
        } else if (percent > 85) {
          colorClass = 'danger';
        } else if (percent > 60) {
          colorClass = 'warning';
        }

        const div = document.createElement('div');
        div.className = isOver ? 'warning-pulse' : '';
        div.style.cssText = `
          display: flex;
          flex-direction: column;
          padding: ${isOver ? '8px 10px' : '0'};
          border-radius: ${isOver ? '10px' : '0'};
          background: ${isOver ? 'rgba(244,67,54,0.05)' : 'none'};
          border: ${isOver ? '1px solid rgba(244,67,54,0.1)' : 'none'};
          transition: var(--transition-smooth);
        `;
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="bg-${cat.class}" style="width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px;">${cat.emoji}</span>
              <span style="font-weight:500;">${cat.name}</span>
              ${warnText}
            </div>
            <div style="color:var(--text-secondary);">
              <span style="color:#fff; font-weight:500;">¥${spent.toFixed(0)}</span>
              <span style="color:var(--text-muted);">/ ¥${budget.toFixed(0)}</span>
            </div>
          </div>
          <div class="progress-bar-container" style="height:6px; margin-top:6px;">
            <div class="progress-bar ${colorClass}" style="width: ${Math.min(percent, 100)}%;"></div>
          </div>
        `;
        progressList.appendChild(div);
      });

      // 6. 最近账单记录 (最多最近5笔)
      recentList.innerHTML = '';
      const recentTxs = stats.transactions.slice(0, 5);

      if (recentTxs.length === 0) {
        recentList.innerHTML = `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding: 15px 0;">本月还没有记账记录</div>`;
      } else {
        recentTxs.forEach(tx => {
          const cat = window.CoinFlowUtils.CATEGORIES[tx.category] || { emoji: '❓', name: tx.category, color: '#fff', class: 'food' };
          const div = document.createElement('div');
          div.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.03);
            cursor: pointer;
          `;
          div.onclick = () => {
            window.navigateToPage('transactions');
          };
          div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="bg-${cat.class}" style="width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px;">${cat.emoji}</span>
              <div>
                <div style="font-size:13px; font-weight:500;">${tx.note || cat.name}</div>
                <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${window.CoinFlowUtils.formatFriendlyDate(tx.date)}</div>
              </div>
            </div>
            <div style="font-size:14px; font-weight:700; color:var(--primary-gold);">-¥${tx.amount.toFixed(2)}</div>
          `;
          recentList.appendChild(div);
        });
      }

    } catch (err) {
      console.error('渲染首页看板失败:', err);
    }
  }

  // 暴露组件 API
  window.CoinFlowDashboard = {
    init,
    render
  };
})();
