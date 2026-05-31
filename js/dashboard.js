// CoinFlow desktop dashboard rendering.
(function() {
  const monthDisplay = document.getElementById('current-month-display');
  const spentDisplay = document.getElementById('total-spent-display');
  const remainingDisplay = document.getElementById('remaining-budget-display');
  const totalBudgetDisplay = document.getElementById('total-budget-display');
  const summaryCard = document.getElementById('dashboard-summary-card');
  const mainProgressBar = document.getElementById('total-budget-progress');
  const budgetProgressText = document.getElementById('budget-progress-text');
  const remainingBudgetRatio = document.getElementById('remaining-budget-ratio');
  const summaryDailyAverage = document.getElementById('summary-daily-average');
  const legendContainer = document.getElementById('chart-legend-container');
  const centerPercent = document.getElementById('chart-center-percent');
  const progressList = document.getElementById('dashboard-category-progress-list');
  const recentList = document.getElementById('dashboard-recent-list');
  const btnViewAll = document.getElementById('btn-view-all-transactions');
  const ledgerFilterRow = document.getElementById('dashboard-ledger-filters');
  const ledgerList = document.getElementById('dashboard-ledger-list');
  const ledgerSortBtn = document.getElementById('dashboard-ledger-sort');
  const dashboardMonthTotal = document.getElementById('dashboard-month-total');
  const dashboardMonthCount = document.getElementById('dashboard-month-count');
  const dashboardMonthAverage = document.getElementById('dashboard-month-average');

  let hasBoundEvents = false;
  let activeLedgerFilter = 'all';
  let ledgerSortType = 'time-desc';

  function init() {
    if (!hasBoundEvents) {
      if (btnViewAll) {
        btnViewAll.addEventListener('click', () => window.navigateToPage('transactions'));
      }

      if (ledgerSortBtn) {
        ledgerSortBtn.addEventListener('click', () => {
          ledgerSortType = ledgerSortType === 'time-desc' ? 'amount-desc' : 'time-desc';
          ledgerSortBtn.innerHTML = ledgerSortType === 'time-desc'
            ? '排序：时间降序 <span>⌄</span>'
            : '排序：金额降序 <span>⌄</span>';
          render();
        });
      }

      renderLedgerFilters();
      hasBoundEvents = true;
    }

    render();
  }

  function renderLedgerFilters() {
    if (!ledgerFilterRow) return;
    ledgerFilterRow.innerHTML = '';

    const filters = [{ key: 'all', label: '全部' }].concat(
      Object.keys(window.CoinFlowUtils.CATEGORIES).map((key) => ({
        key,
        label: window.CoinFlowUtils.CATEGORIES[key].name
      }))
    );

    filters.forEach((filter) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.category = filter.key;
      btn.textContent = filter.label;
      btn.classList.toggle('active', filter.key === activeLedgerFilter);
      btn.addEventListener('click', () => {
        activeLedgerFilter = filter.key;
        ledgerFilterRow.querySelectorAll('button').forEach((item) => {
          item.classList.toggle('active', item.dataset.category === activeLedgerFilter);
        });
        render();
      });
      ledgerFilterRow.appendChild(btn);
    });
  }

  function animateAmount(element, end, duration = 420) {
    if (!element) return;

    const prevVal = parseFloat(element.textContent.replace('¥', '').replace(/,/g, '')) || 0;
    const start = performance.now();

    function tick(timestamp) {
      const progress = Math.min((timestamp - start) / duration, 1);
      const value = prevVal + (end - prevVal) * progress;
      element.textContent = window.CoinFlowUtils.formatAmount(value);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  async function render() {
    const year = window.CoinFlowState.currentYear;
    const month = window.CoinFlowState.currentMonth;
    const daysInMonth = new Date(year, month, 0).getDate();

    if (monthDisplay) {
      monthDisplay.textContent = `${year}年${String(month).padStart(2, '0')}月`;
    }

    try {
      const stats = await window.CoinFlowDB.getMonthlyStats(year, month);
      const dailyAverage = daysInMonth > 0 ? stats.totalSpent / daysInMonth : 0;
      const progressPercent = stats.totalBudget > 0 ? (stats.totalSpent / stats.totalBudget) * 100 : 0;
      const remainingPercent = stats.totalBudget > 0 ? Math.max(0, (stats.remainingBudget / stats.totalBudget) * 100) : 0;
      const clampedProgress = Math.min(progressPercent, 100);
      const progressClass = progressPercent >= 90 ? 'danger' : progressPercent >= 70 ? 'warning' : 'success';

      animateAmount(spentDisplay, stats.totalSpent);
      if (remainingDisplay) {
        remainingDisplay.textContent = window.CoinFlowUtils.formatAmount(stats.remainingBudget);
        remainingDisplay.classList.toggle('success', stats.remainingBudget >= 0);
        remainingDisplay.style.color = stats.remainingBudget < 0 ? 'var(--color-danger)' : 'var(--color-success)';
      }
      if (totalBudgetDisplay) {
        totalBudgetDisplay.textContent = window.CoinFlowUtils.formatAmount(stats.totalBudget);
      }
      if (budgetProgressText) {
        budgetProgressText.textContent = `${Math.round(progressPercent)}%`;
      }
      if (remainingBudgetRatio) {
        remainingBudgetRatio.textContent = `${Math.round(remainingPercent)}%`;
      }
      if (summaryDailyAverage) {
        summaryDailyAverage.textContent = window.CoinFlowUtils.formatAmount(dailyAverage);
      }

      if (summaryCard) {
        summaryCard.classList.toggle('warning-pulse', progressPercent >= 90);
      }
      if (mainProgressBar) {
        mainProgressBar.className = `progress-bar ${progressClass}`;
        mainProgressBar.style.width = `${clampedProgress}%`;
      }

      renderDoughnut(stats);
      renderCategoryBudgets(stats);
      renderRecent(stats.transactions);
      renderLedger(stats, dailyAverage);
    } catch (err) {
      console.error('渲染首页看板失败:', err);
    }
  }

  function renderDoughnut(stats) {
    const chartCanvas = document.getElementById('chart-doughnut-dashboard');
    const chartLabels = [];
    const chartData = [];
    const chartColors = [];

    Object.keys(window.CoinFlowUtils.CATEGORIES).forEach((key) => {
      const cat = window.CoinFlowUtils.CATEGORIES[key];
      const spent = stats.categorySpent[key] || 0;
      if (spent > 0) {
        chartLabels.push(cat.name);
        chartData.push(parseFloat(spent.toFixed(2)));
        chartColors.push(cat.color);
      }
    });

    if (chartCanvas) {
      window.CoinFlowCharts.createDoughnutChart(chartCanvas, chartData, chartLabels, chartColors);
    }

    if (centerPercent) {
      const percent = stats.totalBudget > 0 ? Math.round((stats.totalSpent / stats.totalBudget) * 100) : 0;
      centerPercent.textContent = `${percent}%`;
      centerPercent.style.color = percent >= 100 ? 'var(--color-danger)' : '#fff';
    }

    if (!legendContainer) return;
    legendContainer.innerHTML = '';
    if (chartData.length === 0) {
      legendContainer.innerHTML = '<div class="empty-state">当月尚无消费支出数据</div>';
      return;
    }

    Object.keys(window.CoinFlowUtils.CATEGORIES).forEach((key) => {
      const cat = window.CoinFlowUtils.CATEGORIES[key];
      const spent = stats.categorySpent[key] || 0;
      if (spent <= 0) return;

      const ratio = stats.totalSpent > 0 ? ((spent / stats.totalSpent) * 100).toFixed(1) : '0.0';
      const legendItem = document.createElement('div');
      legendItem.className = 'legend-row';
      legendItem.innerHTML = `
        <span class="legend-dot" style="background:${cat.color};"></span>
        <span class="legend-name">${cat.name}</span>
        <span class="legend-value">¥${spent.toFixed(2)}</span>
        <span class="legend-ratio">${ratio}%</span>
      `;
      legendContainer.appendChild(legendItem);
    });
  }

  function renderCategoryBudgets(stats) {
    if (!progressList) return;
    progressList.innerHTML = '';

    Object.keys(window.CoinFlowUtils.CATEGORIES).forEach((key) => {
      const cat = window.CoinFlowUtils.CATEGORIES[key];
      const spent = stats.categorySpent[key] || 0;
      const budget = stats.categoryBudgets[key] || 0;
      const percent = budget > 0 ? (spent / budget) * 100 : (spent > 0 ? 100 : 0);
      const colorClass = percent > 100 ? 'danger' : percent > 85 ? 'warning' : 'success';
      const overText = percent > 100 ? `<small style="color:var(--color-danger);">超 ¥${(spent - budget).toFixed(0)}</small>` : '';

      const div = document.createElement('div');
      div.className = 'budget-progress-item';
      div.innerHTML = `
        <div class="budget-progress-top">
          <div class="budget-progress-title">
            <span class="category-icon bg-${cat.class}">${cat.emoji}</span>
            <span>${cat.name}</span>
            ${overText}
          </div>
          <div class="budget-progress-value">
            <span>¥${spent.toFixed(0)}</span>
            <small>/ ¥${budget.toFixed(0)}</small>
          </div>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar ${colorClass}" style="width:${Math.min(percent, 100)}%;"></div>
        </div>
      `;
      progressList.appendChild(div);
    });
  }

  function renderRecent(transactions) {
    if (!recentList) return;
    recentList.innerHTML = '';

    const recentTxs = transactions.slice(0, 6);
    if (recentTxs.length === 0) {
      recentList.innerHTML = '<div class="empty-state">本月还没有记账记录</div>';
      return;
    }

    recentTxs.forEach((tx) => {
      const cat = window.CoinFlowUtils.CATEGORIES[tx.category] || { emoji: '❓', name: tx.category, class: 'food' };
      const label = window.CoinFlowUtils.escapeHtml(tx.note || cat.name);
      const div = document.createElement('div');
      div.className = 'tx-row';
      div.addEventListener('click', () => window.navigateToPage('transactions'));
      div.innerHTML = `
        <div class="tx-left">
          <span class="category-icon bg-${cat.class}">${cat.emoji}</span>
          <div>
            <div class="tx-title">${label}</div>
            <div class="tx-subtitle">${window.CoinFlowUtils.formatFriendlyDate(tx.date)} · ${cat.name}</div>
          </div>
        </div>
        <div class="tx-amount">-¥${tx.amount.toFixed(2)}</div>
      `;
      recentList.appendChild(div);
    });
  }

  function renderLedger(stats, dailyAverage) {
    if (!ledgerList) return;

    let transactions = stats.transactions.slice();
    if (activeLedgerFilter !== 'all') {
      transactions = transactions.filter((tx) => tx.category === activeLedgerFilter);
    }

    if (ledgerSortType === 'amount-desc') {
      transactions.sort((a, b) => b.amount - a.amount);
    } else {
      transactions.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    }

    ledgerList.innerHTML = '';
    if (transactions.length === 0) {
      ledgerList.innerHTML = '<div class="empty-state">当月尚无符合筛选条件的账单</div>';
    } else if (ledgerSortType === 'amount-desc') {
      ledgerList.appendChild(buildLedgerGroup('金额排序', transactions));
    } else {
      const grouped = {};
      transactions.forEach((tx) => {
        if (!grouped[tx.date]) grouped[tx.date] = [];
        grouped[tx.date].push(tx);
      });

      Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach((dateStr) => {
        ledgerList.appendChild(buildLedgerGroup(dateStr, grouped[dateStr]));
      });
    }

    const filteredTotal = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    if (dashboardMonthTotal) {
      dashboardMonthTotal.textContent = window.CoinFlowUtils.formatAmount(filteredTotal);
    }
    if (dashboardMonthCount) {
      dashboardMonthCount.textContent = transactions.length;
    }
    if (dashboardMonthAverage) {
      dashboardMonthAverage.textContent = window.CoinFlowUtils.formatAmount(dailyAverage);
    }
  }

  function buildLedgerGroup(label, txs) {
    const group = document.createElement('div');
    group.className = 'ledger-day-group';
    const daySpent = txs.reduce((sum, item) => sum + item.amount, 0);
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(label);
    const dayLabel = isDate ? formatDashboardDate(label) : label;

    group.innerHTML = `
      <div class="ledger-day-header">
        <span>${dayLabel}</span>
        <span>支出 <strong>¥${daySpent.toFixed(2)}</strong></span>
      </div>
    `;

    txs.forEach((tx) => {
      const cat = window.CoinFlowUtils.CATEGORIES[tx.category] || { emoji: '❓', name: tx.category, class: 'food' };
      const labelText = window.CoinFlowUtils.escapeHtml(tx.note || cat.name);
      const row = document.createElement('div');
      row.className = 'ledger-row';
      row.innerHTML = `
        <div class="ledger-left">
          <span class="category-icon bg-${cat.class}">${cat.emoji}</span>
          <div>
            <div class="ledger-title">${labelText}</div>
            <div class="ledger-subtitle">${formatTxTime(tx.createdAt)} <span class="ledger-category">${cat.name}</span></div>
          </div>
        </div>
        <div class="ledger-amount">-¥${tx.amount.toFixed(2)}</div>
      `;
      row.addEventListener('click', () => window.navigateToPage('transactions'));
      group.appendChild(row);
    });

    return group;
  }

  function formatDashboardDate(dateStr) {
    const date = new Date(`${dateStr}T00:00:00`);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const friendly = window.CoinFlowUtils.formatFriendlyDate(dateStr);
    const plain = `${date.getMonth() + 1}月${date.getDate()}日`;
    return friendly === plain ? `${month}月${day}日` : `${month}月${day}日  ${friendly}`;
  }

  function formatTxTime(createdAt) {
    if (!createdAt) return '';
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  window.CoinFlowDashboard = {
    init,
    render
  };
})();
