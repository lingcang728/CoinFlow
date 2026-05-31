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
      window.CoinFlowCharts.createDoughnutChart(chartCanvas, chartData, chartLabels, chartColors);
      
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
            const ratio = stats.totalSpent > 0 ? ((spent / stats.totalSpent) * 100).toFixed(1) : '0.0';
            legendItem.className = 'legend-row';
            legendItem.innerHTML = `
              <span class="legend-dot" style="background:${cat.color};"></span>
              <span class="legend-name">${cat.name}</span>
              <span class="legend-value">¥${spent.toFixed(1)}</span>
              <span class="legend-ratio">${ratio}%</span>
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
        div.classList.add('budget-progress-item');
        div.innerHTML = `
          <div class="budget-progress-top">
            <div class="budget-progress-title">
              <span class="category-icon bg-${cat.class}">${cat.emoji}</span>
              <span>${cat.name}</span>
              ${warnText}
            </div>
            <div class="budget-progress-value">
              <span>¥${spent.toFixed(0)}</span>
              <small>/ ¥${budget.toFixed(0)}</small>
            </div>
          </div>
          <div class="progress-bar-container">
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
          const label = window.CoinFlowUtils.escapeHtml(tx.note || cat.name);
          const div = document.createElement('div');
          div.className = 'tx-row';
          div.onclick = () => {
            window.navigateToPage('transactions');
          };
          div.innerHTML = `
            <div class="tx-left">
                <span class="category-icon bg-${cat.class}">${cat.emoji}</span>
              <div>
                <div class="tx-title">${label}</div>
                <div class="tx-subtitle">${window.CoinFlowUtils.formatFriendlyDate(tx.date)}</div>
              </div>
            </div>
            <div class="tx-amount">-¥${tx.amount.toFixed(2)}</div>
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
