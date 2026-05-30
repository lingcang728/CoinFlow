// CoinFlow 记账录入页面逻辑
(function() {
  const catGrid = document.querySelector('.add-category-grid');
  const amountDisplay = document.getElementById('keyboard-input-amount');
  const noteInput = document.getElementById('add-note-input');
  const dateInput = document.getElementById('add-date-input');
  const shortcutContainer = document.getElementById('shortcut-notes-container');
  const btnSave = document.getElementById('btn-save-record');
  const successToast = document.getElementById('save-success-toast');
  const budgetStatusText = document.getElementById('selected-category-budget-status');

  let selectedCategory = 'food'; // 默认选中饮食
  let inputAmountStr = '0';

  /**
   * 初始化记账页
   */
  function init() {
    // 1. 动态渲染分类网格
    renderCategoryGrid();
    
    // 2. 初始化日期
    if (!dateInput.value) {
      dateInput.value = window.CoinFlowUtils.getTodayDateString();
    }

    // 3. 数字键盘绑定
    document.querySelectorAll('.keyboard-grid .key-btn').forEach(btn => {
      btn.onclick = () => handleKeyboardInput(btn.dataset.key);
    });

    // 4. 绑定保存
    btnSave.onclick = saveRecord;

    // 5. 加载历史备注推荐
    loadShortcutNotes();

    // 6. 默认高亮选中饮食
    selectCategory('food');
  }

  /**
   * 动态生成分类按钮
   */
  function renderCategoryGrid() {
    catGrid.innerHTML = '';
    Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
      const cat = window.CoinFlowUtils.CATEGORIES[key];
      const btn = document.createElement('button');
      btn.className = `cat-select-btn`;
      btn.style.cssText = `
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        border-radius: 16px;
        padding: 12px 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        color: var(--text-secondary);
        font-size: 11px;
        font-weight: 500;
        transition: var(--transition-smooth);
      `;
      btn.innerHTML = `
        <span class="bg-${cat.class}" style="width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; transition: var(--transition-smooth);">${cat.emoji}</span>
        <span>${cat.name}</span>
      `;
      btn.dataset.category = key;
      btn.onclick = (e) => {
        e.preventDefault();
        selectCategory(key);
      };
      catGrid.appendChild(btn);
    });
  }

  /**
   * 选中分类
   */
  async function selectCategory(key) {
    window.CoinFlowUtils.triggerHaptic('light');
    selectedCategory = key;

    // 移除其他的高亮
    document.querySelectorAll('.cat-select-btn').forEach(btn => {
      btn.style.borderColor = 'var(--glass-border)';
      btn.style.background = 'var(--glass-bg)';
      btn.style.boxShadow = 'none';
      btn.querySelector('span:first-child').style.transform = 'scale(1)';
    });

    // 为选中的分类加上高亮
    const activeBtn = document.querySelector(`.cat-select-btn[data-category="${key}"]`);
    if (activeBtn) {
      const catColor = window.CoinFlowUtils.CATEGORIES[key].color;
      activeBtn.style.borderColor = catColor;
      activeBtn.style.background = 'rgba(255, 255, 255, 0.08)';
      activeBtn.style.boxShadow = `0 0 10px rgba(${hexToRgb(catColor)}, 0.25)`;
      activeBtn.querySelector('span:first-child').style.transform = 'scale(1.1)';
    }

    // 刷新该分类的预算状态与历史备注推荐
    updateCategoryBudgetStatus(key);
    loadShortcutNotes(key);
  }

  /**
   * 更新选中分类的当月预算剩余状态
   */
  async function updateCategoryBudgetStatus(key) {
    const d = new Date(dateInput.value || window.CoinFlowUtils.getTodayDateString());
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    try {
      const stats = await window.CoinFlowDB.getMonthlyStats(year, month);
      const budget = stats.categoryBudgets[key] || 0;
      const spent = stats.categorySpent[key] || 0;
      const remain = budget - spent;

      if (budget === 0) {
        budgetStatusText.textContent = '未设预算';
        budgetStatusText.style.color = 'var(--text-muted)';
      } else if (remain <= 0) {
        budgetStatusText.textContent = `超支 ¥${Math.abs(remain).toFixed(0)}`;
        budgetStatusText.style.color = 'var(--color-danger)';
      } else {
        budgetStatusText.textContent = `预算剩 ¥${remain.toFixed(0)}`;
        budgetStatusText.style.color = 'var(--color-success)';
      }
    } catch (e) {
      budgetStatusText.textContent = '';
    }
  }

  /**
   * 键盘输入处理逻辑
   */
  function handleKeyboardInput(key) {
    window.CoinFlowUtils.triggerHaptic('light');

    if (key === 'backspace') {
      if (inputAmountStr.length > 1) {
        inputAmountStr = inputAmountStr.slice(0, -1);
      } else {
        inputAmountStr = '0';
      }
    } else if (key === '.') {
      // 避免输入多个点
      if (!inputAmountStr.includes('.')) {
        inputAmountStr += '.';
      }
    } else {
      // 如果当前是0，直接替换为新数字 (除非新输入的是点)
      if (inputAmountStr === '0') {
        inputAmountStr = key;
      } else {
        // 小数位限制
        const dotIdx = inputAmountStr.indexOf('.');
        if (dotIdx === -1 || inputAmountStr.length - dotIdx <= 2) {
          // 长度限制
          if (inputAmountStr.replace('.', '').length < 8) {
            inputAmountStr += key;
          }
        }
      }
    }

    amountDisplay.textContent = inputAmountStr;
  }

  /**
   * 根据选中分类，异步获取历史交易，推荐常用备注标签
   */
  async function loadShortcutNotes(categoryKey = 'food') {
    shortcutContainer.innerHTML = '';
    
    // 默认推荐一些每个分类常见的初始标签，以保证冷启动体验
    const defaultShortcuts = {
      food: ['正餐', '外卖', '饭堂', '麦当劳', '蜜雪冰城'],
      drinks: ['一点点', 'coco', '霸王茶姬', '瑞幸咖啡', '零食'],
      shopping: ['拼多多', '淘宝', '京东', '日用品', '买衣服'],
      housing: ['电费', '水费', '网费', '宿舍杂物'],
      entertainment: ['电影', '网易云', '游戏充值', '看展'],
      transport: ['公交车', '地铁', '共享单车', '打车'],
      social: ['聚餐', '请客', '生日礼物', '聚会'],
      study: ['买书', '文具', '打印资料', '考证网课']
    };

    const shortcuts = defaultShortcuts[categoryKey] || ['支出'];

    // 动态生成快捷标签
    shortcuts.forEach(text => {
      const tag = document.createElement('span');
      tag.className = 'shortcut-tag';
      tag.textContent = text;
      tag.onclick = (e) => {
        e.preventDefault();
        window.CoinFlowUtils.triggerHaptic('light');
        noteInput.value = text;
      };
      shortcutContainer.appendChild(tag);
    });
  }

  /**
   * 保存账单记录
   */
  async function saveRecord() {
    const amount = parseFloat(inputAmountStr);
    
    if (isNaN(amount) || amount <= 0) {
      window.CoinFlowUtils.showToast('请输入有效金额', 'warning');
      window.CoinFlowUtils.triggerHaptic('warning');
      return;
    }

    const note = noteInput.value.trim();
    const date = dateInput.value;

    const tx = {
      amount,
      category: selectedCategory,
      note,
      date
    };

    try {
      btnSave.disabled = true;
      btnSave.textContent = '保存中...';

      await window.CoinFlowDB.addTransaction(tx);
      
      // 成功打勾动画
      window.CoinFlowUtils.triggerHaptic('success');
      successToast.classList.add('active');

      setTimeout(() => {
        successToast.classList.remove('active');
        
        // 重置界面
        inputAmountStr = '0';
        amountDisplay.textContent = '0';
        noteInput.value = '';
        
        btnSave.disabled = false;
        btnSave.textContent = '确认保存';

        // 广播数据变动事件
        window.CoinFlowUtils.events.emit('dataChanged');
        
        // 自动返回看板首页 (仅当用户还在记账录入页面时才强行拉回，防止打断用户手动切往明细/统计的操作)
        if (typeof window.getCurrentPageId === 'function' && window.getCurrentPageId() === 'add') {
          window.navigateToPage('dashboard');
        } else {
          console.log('[AddRecord] User already navigated away, cancelling auto-redirect');
        }
      }, 1100);

    } catch (err) {
      console.error('记账保存失败:', err);
      window.CoinFlowUtils.showToast('记账保存失败，请重试', 'error');
      btnSave.disabled = false;
      btnSave.textContent = '确认保存';
    }
  }

  // 辅助颜色转换 (Hex -> RGB 用来做 box-shadow 渐变)
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
      `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
      : '255, 255, 255';
  }

  // 暴露组件 API
  window.CoinFlowAddRecord = {
    init
  };
})();
