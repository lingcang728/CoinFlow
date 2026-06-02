// CoinFlow desktop shell, routing, and global month controls.
document.addEventListener('DOMContentLoaded', async () => {
  const now = new Date();
  window.CoinFlowState = {
    currentYear: now.getFullYear(),
    currentMonth: now.getMonth() + 1
  };

  const PAGES = ['dashboard', 'transactions', 'statistics'];
  const PAGE_TITLES = {
    dashboard: '看板',
    transactions: '明细',
    statistics: '统计'
  };

  let currentPageId = 'dashboard';
  let switchToken = 0;

  const monthDisplay = document.getElementById('current-month-display');
  const prevMonthBtn = document.getElementById('prev-month');
  const nextMonthBtn = document.getElementById('next-month');
  const topbarBudget = document.getElementById('topbar-budget-display');
  const topbarAverage = document.getElementById('topbar-average-display');
  const quickAddPanel = document.querySelector('.desktop-quick-add');
  const quickAddBackdrop = document.querySelector('.quick-add-backdrop');
  let resizeFrame = 0;
  let layoutObserver = null;

  function formatMonthLabel() {
    const { currentYear, currentMonth } = window.CoinFlowState;
    return `${currentYear}年${String(currentMonth).padStart(2, '0')}月`;
  }

  function updateMonthLabel() {
    if (monthDisplay) {
      monthDisplay.textContent = formatMonthLabel();
    }
  }

  async function updateTopbarMetrics() {
    if (!topbarBudget && !topbarAverage) return;

    try {
      const { currentYear, currentMonth } = window.CoinFlowState;
      const stats = await window.CoinFlowDB.getMonthlyStats(currentYear, currentMonth);
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const dailyAverage = daysInMonth > 0 ? stats.totalSpent / daysInMonth : 0;

      if (topbarBudget) {
        topbarBudget.textContent = window.CoinFlowUtils.formatAmount(stats.totalBudget);
      }
      if (topbarAverage) {
        topbarAverage.textContent = window.CoinFlowUtils.formatAmount(dailyAverage);
      }
    } catch (error) {
      console.error('[App] Failed to update topbar metrics:', error);
    }
  }

  function triggerChartResize() {
    requestAnimationFrame(() => {
      if (window.CoinFlowCharts && typeof window.CoinFlowCharts.resizeAll === 'function') {
        window.CoinFlowCharts.resizeAll();
      }
    });
  }

  function triggerPageInit(pageId) {
    switch (pageId) {
      case 'dashboard':
        if (window.CoinFlowDashboard && typeof window.CoinFlowDashboard.init === 'function') {
          window.CoinFlowDashboard.init();
        }
        break;
      case 'transactions':
        if (window.CoinFlowTransactions && typeof window.CoinFlowTransactions.init === 'function') {
          window.CoinFlowTransactions.init();
        }
        break;
      case 'statistics':
        if (window.CoinFlowStatistics && typeof window.CoinFlowStatistics.init === 'function') {
          window.CoinFlowStatistics.init();
        }
        break;
    }
  }

  function setActiveNav(targetPageId) {
    document.querySelectorAll('.sidebar-nav-item[data-target]').forEach((item) => {
      item.classList.toggle('active', item.dataset.target === targetPageId);
    });
  }

  function switchPage(targetPageId) {
    if (targetPageId === 'add') {
      openQuickAddPanel();
      return true;
    }

    if (!PAGES.includes(targetPageId)) {
      return false;
    }

    const targetEl = document.getElementById(`page-${targetPageId}`);
    if (!targetEl) return false;

    closeQuickAddPanel();
    switchToken += 1;
    const token = switchToken;

    document.querySelectorAll('.desktop-page').forEach((page) => {
      page.classList.toggle('active', page === targetEl);
    });

    currentPageId = targetPageId;
    setActiveNav(targetPageId);
    triggerPageInit(targetPageId);

    requestAnimationFrame(() => {
      if (token !== switchToken) return;
      triggerChartResize();
    });

    return true;
  }

  function changeMonth(direction) {
    let month = window.CoinFlowState.currentMonth + direction;
    let year = window.CoinFlowState.currentYear;

    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }

    window.CoinFlowState.currentYear = year;
    window.CoinFlowState.currentMonth = month;
    updateMonthLabel();
    triggerPageInit(currentPageId);
    updateTopbarMetrics();
    triggerChartResize();
  }

  function openQuickAddPanel() {
    document.body.classList.add('quick-add-open');
    if (quickAddPanel) {
      quickAddPanel.classList.add('is-open');
      quickAddPanel.scrollTop = 0;
    }
    if (quickAddBackdrop) {
      quickAddBackdrop.classList.add('is-open');
    }
    focusQuickAddAmount();
  }

  function closeQuickAddPanel() {
    if (quickAddPanel && quickAddPanel.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    document.body.classList.remove('quick-add-open');
    if (quickAddPanel) {
      quickAddPanel.classList.remove('is-open');
    }
    if (quickAddBackdrop) {
      quickAddBackdrop.classList.remove('is-open');
    }
  }

  function scheduleLayoutResize() {
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
    }
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      triggerChartResize();
    });
  }

  function focusQuickAddAmount() {
    const amountInput = document.getElementById('add-amount-input');
    if (amountInput) {
      requestAnimationFrame(() => {
        amountInput.focus();
        amountInput.select();
      });
    }
  }

  function bindShellEvents() {
    document.querySelectorAll('.sidebar-nav-item[data-target], .sidebar-utility[data-target], .topbar-actions [data-target]').forEach((item) => {
      item.addEventListener('click', () => {
        const target = item.dataset.target;
        if (target === 'about') {
          if (window.CoinFlowAbout && typeof window.CoinFlowAbout.open === 'function') {
            window.CoinFlowAbout.open();
          } else {
            window.CoinFlowUtils.showToast('CoinFlow 本地桌面记账工具', 'info');
          }
          return;
        }
        switchPage(target);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeQuickAddPanel();
      }
    });

    document.querySelectorAll('[data-close-quick-add]').forEach((item) => {
      item.addEventListener('click', () => closeQuickAddPanel());
    });

    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    }
    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', () => changeMonth(1));
    }

    window.addEventListener('resize', scheduleLayoutResize);

    if (window.ResizeObserver) {
      layoutObserver = new ResizeObserver(scheduleLayoutResize);
      document.querySelectorAll('.desktop-content, .doughnut-card, .chart-stage, .doughnut-stage').forEach((el) => {
        layoutObserver.observe(el);
      });
    }
  }

  window.navigateToPage = function(targetPageId) {
    return switchPage(targetPageId);
  };

  window.getCurrentPageId = function() {
    return currentPageId;
  };

  window.openQuickAdd = openQuickAddPanel;
  window.closeQuickAdd = closeQuickAddPanel;
  window.focusQuickAdd = focusQuickAddAmount;
  window.refreshCurrentPage = function() {
    triggerPageInit(currentPageId);
    updateTopbarMetrics();
    triggerChartResize();
  };

  window.CoinFlowUtils.events.on('dataChanged', () => {
    triggerPageInit(currentPageId);
    updateTopbarMetrics();
    triggerChartResize();
  });

  try {
    if (window.CoinFlowCategories && typeof window.CoinFlowCategories.init === 'function') {
      await window.CoinFlowCategories.init();
    }
  } catch (error) {
    console.error('[App] Failed to initialize categories:', error);
    window.CoinFlowUtils.showToast('分类数据初始化失败', 'error');
  }

  bindShellEvents();
  updateMonthLabel();

  if (window.CoinFlowBudget && typeof window.CoinFlowBudget.init === 'function') {
    window.CoinFlowBudget.init();
  }

  if (window.CoinFlowCategoryManager && typeof window.CoinFlowCategoryManager.init === 'function') {
    window.CoinFlowCategoryManager.init();
  }

  if (window.CoinFlowRecordForm && typeof window.CoinFlowRecordForm.mount === 'function') {
    window.CoinFlowRecordForm.mount(document.getElementById('desktop-record-form'), {
      onSaved: () => {
        closeQuickAddPanel();
      }
    });
  } else if (window.CoinFlowAddRecord && typeof window.CoinFlowAddRecord.init === 'function') {
    window.CoinFlowAddRecord.init();
  }

  if (window.CoinFlowTransactions && typeof window.CoinFlowTransactions.init === 'function') {
    window.CoinFlowTransactions.init();
  }

  switchPage('dashboard');
  updateTopbarMetrics();
});
