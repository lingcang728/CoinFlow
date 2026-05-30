// CoinFlow 主入口与路由控制中心
document.addEventListener('DOMContentLoaded', () => {
  // 1. 初始化全局状态
  // 从本地系统时间初始化年月
  const now = new Date();
  window.CoinFlowState = {
    currentYear: now.getFullYear(),
    currentMonth: now.getMonth() + 1 // 1-12
  };

  const PAGES_ORDER = ['dashboard', 'transactions', 'add', 'statistics'];
  const TRANSITION_MS = 380;
  let currentPageId = 'dashboard';
  let isTransitioning = false; // 转场互斥锁，防止高并发点击竞态
  let transitionTimer = null;

  function resetPageInlineState(pageEl) {
    if (!pageEl) return;
    pageEl.style.transition = '';
    pageEl.style.transform = '';
    pageEl.style.opacity = '';
    pageEl.style.visibility = '';
    pageEl.style.position = '';
  }

  // 2. 页面转场核心逻辑
  function switchPage(targetPageId) {
    if (isTransitioning) return; // 若正在转场中，拒绝新的切换动作
    if (currentPageId === targetPageId) return;
    const currentEl = document.getElementById(`page-${currentPageId}`);
    const targetEl = document.getElementById(`page-${targetPageId}`);
    if (!currentEl || !targetEl) return;

    const curIdx = PAGES_ORDER.indexOf(currentPageId);
    const targetIdx = PAGES_ORDER.indexOf(targetPageId);
    const isRight = targetIdx > curIdx;

    const navBar = document.querySelector('.bottom-nav');

    try {
      isTransitioning = true; // 开启互斥锁
      
      // 物理屏蔽底栏点击，双重保障并发冲突
      if (navBar) navBar.classList.add('pointer-events-none');
      document.body.classList.add('is-route-transitioning');

      // 触感反馈
      window.CoinFlowUtils.triggerHaptic('light');

      document.querySelectorAll('.page').forEach(page => {
        if (page !== currentEl && page !== targetEl) {
          page.classList.remove('active');
          resetPageInlineState(page);
        }
      });

      // 更新底部导航高亮
      document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.target === targetPageId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      // 禁用目标页过渡，将其定位到左/右侧
      targetEl.style.transition = 'none';
      targetEl.style.transform = isRight ? 'translateX(100%)' : 'translateX(-100%)';
      targetEl.style.opacity = '0';
      targetEl.style.visibility = 'visible';
      targetEl.style.position = 'absolute'; // 动画期间悬浮

      // 强制重绘 (Reflow)
      targetEl.offsetWidth;

      // 启动转场
      targetEl.style.transition = `transform ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${TRANSITION_MS - 80}ms ease-out`;
      targetEl.style.transform = 'translateX(0)';
      targetEl.style.opacity = '1';
      targetEl.classList.add('active');

      currentEl.style.transition = `transform ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${TRANSITION_MS - 80}ms ease-out`;
      currentEl.style.transform = isRight ? 'translateX(-30%)' : 'translateX(30%)';
      currentEl.style.opacity = '0';

      let finished = false;
      const completeTransition = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(transitionTimer);

        try {
          document.querySelectorAll('.page').forEach(page => {
            resetPageInlineState(page);
            page.classList.toggle('active', page === targetEl);
          });

          currentPageId = targetPageId;
          triggerPageInit(targetPageId);
          requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
          });
        } catch (initErr) {
          console.error('[Router] Error inside page init:', initErr);
        } finally {
          isTransitioning = false;
          document.body.classList.remove('is-route-transitioning');
          if (navBar) navBar.classList.remove('pointer-events-none');
        }
      };

      targetEl.addEventListener('transitionend', (event) => {
        if (event.target === targetEl && event.propertyName === 'transform') {
          completeTransition();
        }
      }, { once: true });

      transitionTimer = window.setTimeout(completeTransition, TRANSITION_MS + 120);

    } catch (err) {
      console.error('[Router] Animation switch error:', err);
      // 容错恢复解锁，防止应用导航彻底卡死
      isTransitioning = false;
      document.body.classList.remove('is-route-transitioning');
      if (navBar) navBar.classList.remove('pointer-events-none');
    }
  }

  // 触发各个页面加载/刷新
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
      case 'add':
        if (window.CoinFlowAddRecord && typeof window.CoinFlowAddRecord.init === 'function') {
          window.CoinFlowAddRecord.init();
        }
        break;
      case 'statistics':
        if (window.CoinFlowStatistics && typeof window.CoinFlowStatistics.init === 'function') {
          window.CoinFlowStatistics.init();
        }
        break;
    }
  }

  // 3. 绑定导航点击事件
  document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.target;
      switchPage(target);
    });
  });

  // 全局跳转接口 (如从仪表盘点击“查看全部”跳到明细页)
  window.navigateToPage = function(targetPageId) {
    switchPage(targetPageId);
  };

  // 全局获取当前页面的 ID (用于自动返回和定时器比对，防止用户切走后仍强行被拉回)
  window.getCurrentPageId = function() {
    return currentPageId;
  };

  // 4. 全局数据更新事件监听
  // 当新增记录、删除记录或修改预算时，触发相应的视图局部刷新
  window.CoinFlowUtils.events.on('dataChanged', () => {
    console.log('[Global Event] Data changed, refreshing current page');
    triggerPageInit(currentPageId);
  });

  // 5. 初始化第一个页面
  setTimeout(() => {
    // 初始化 IndexedDB 配置后加载仪表盘
    if (window.CoinFlowBudget && typeof window.CoinFlowBudget.init === 'function') {
      window.CoinFlowBudget.init();
    }
    triggerPageInit('dashboard');
  }, 100);

});
