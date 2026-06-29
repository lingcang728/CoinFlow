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
  let refreshFrame = 0;
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
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
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

  function setMonth(year, month) {
    window.CoinFlowState.currentYear = year;
    window.CoinFlowState.currentMonth = month;
    updateMonthLabel();
    refreshCurrentPageNow();
    renderMonthPicker();
  }

  function refreshCurrentPageNow() {
    triggerPageInit(currentPageId);
    updateTopbarMetrics();
    triggerChartResize();
  }

  function scheduleCurrentPageRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refreshCurrentPageNow();
    });
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

    setMonth(year, month);
  }

  // ===== 顶栏年月选择器：点击月份标签直接跳转任意年月 =====
  let monthPickerEl = null;
  let monthPickerYear = 0;

  function buildMonthPicker() {
    if (monthPickerEl) return monthPickerEl;
    const toolbar = monthDisplay ? monthDisplay.closest('.month-toolbar') : null;
    if (!toolbar) return null;
    toolbar.classList.add('has-month-picker');

    monthPickerEl = document.createElement('div');
    monthPickerEl.className = 'month-picker-popover';
    monthPickerEl.hidden = true;
    monthPickerEl.innerHTML = `
      <div class="month-picker-header">
        <button type="button" class="icon-button month-picker-year-nav" data-year-step="-1" aria-label="上一年">‹</button>
        <span class="month-picker-year"></span>
        <button type="button" class="icon-button month-picker-year-nav" data-year-step="1" aria-label="下一年">›</button>
      </div>
      <div class="month-picker-grid"></div>
    `;

    const grid = monthPickerEl.querySelector('.month-picker-grid');
    for (let m = 1; m <= 12; m++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'month-picker-cell';
      btn.dataset.month = String(m);
      btn.textContent = `${m}月`;
      btn.addEventListener('click', () => {
        setMonth(monthPickerYear, m);
        closeMonthPicker();
      });
      grid.appendChild(btn);
    }

    monthPickerEl.querySelectorAll('.month-picker-year-nav').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        monthPickerYear += Number(btn.dataset.yearStep);
        renderMonthPicker();
      });
    });

    toolbar.appendChild(monthPickerEl);
    return monthPickerEl;
  }

  function renderMonthPicker() {
    if (!monthPickerEl || monthPickerEl.hidden) return;
    const now = new Date();
    monthPickerEl.querySelector('.month-picker-year').textContent = `${monthPickerYear}年`;
    monthPickerEl.querySelectorAll('.month-picker-cell').forEach((btn) => {
      const m = Number(btn.dataset.month);
      btn.classList.toggle('selected',
        monthPickerYear === window.CoinFlowState.currentYear && m === window.CoinFlowState.currentMonth);
      btn.classList.toggle('is-now',
        monthPickerYear === now.getFullYear() && m === now.getMonth() + 1);
    });
  }

  function openMonthPicker() {
    const el = buildMonthPicker();
    if (!el) return;
    monthPickerYear = window.CoinFlowState.currentYear;
    el.hidden = false;
    renderMonthPicker();
    if (monthDisplay) monthDisplay.classList.add('is-open');
  }

  function closeMonthPicker() {
    if (monthPickerEl && !monthPickerEl.hidden) {
      monthPickerEl.hidden = true;
    }
    if (monthDisplay) monthDisplay.classList.remove('is-open');
  }

  function toggleMonthPicker() {
    if (monthPickerEl && !monthPickerEl.hidden) {
      closeMonthPicker();
    } else {
      openMonthPicker();
    }
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

  let resizeThrottleTimer = 0;
  function scheduleLayoutResize() {
    // 100ms 节流：ResizeObserver 观察了多组容器，避免连环回调触发图表 resize 风暴
    if (resizeThrottleTimer) return;
    resizeThrottleTimer = window.setTimeout(() => {
      resizeThrottleTimer = 0;
      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
      }
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        triggerChartResize();
      });
    }, 100);
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
        closeMonthPicker();
        closeQuickAddPanel();
        return;
      }
      // Ctrl+N：随时呼出「快速记一笔」
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey &&
          (event.key === 'n' || event.key === 'N')) {
        event.preventDefault();
        openQuickAddPanel();
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

    if (monthDisplay) {
      monthDisplay.setAttribute('role', 'button');
      monthDisplay.setAttribute('tabindex', '0');
      monthDisplay.title = '点击选择年月';
      monthDisplay.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleMonthPicker();
      });
      monthDisplay.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleMonthPicker();
        }
      });
    }

    document.addEventListener('click', (event) => {
      if (!monthPickerEl || monthPickerEl.hidden) return;
      if (monthPickerEl.contains(event.target)) return;
      if (monthDisplay && monthDisplay.contains(event.target)) return;
      closeMonthPicker();
    });

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

  window.setCoinFlowMonth = function(year, month) {
    const nextYear = Number(year);
    const nextMonth = Number(month);
    if (!Number.isInteger(nextYear) || !Number.isInteger(nextMonth) || nextMonth < 1 || nextMonth > 12) {
      return false;
    }
    setMonth(nextYear, nextMonth);
    return true;
  };

  window.openQuickAdd = openQuickAddPanel;
  window.closeQuickAdd = closeQuickAddPanel;
  window.focusQuickAdd = focusQuickAddAmount;
  window.refreshCurrentPage = function() {
    scheduleCurrentPageRefresh();
  };

  window.CoinFlowUtils.events.on('dataChanged', () => {
    scheduleCurrentPageRefresh();
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
