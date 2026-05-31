// CoinFlow 预算设置与智能划分面板逻辑
(function() {
  const modal = document.getElementById('modal-budget-settings');
  const btnSettings = document.getElementById('btn-budget-settings');
  const btnClose = document.getElementById('btn-close-budget-modal');
  const form = document.getElementById('form-budget-settings');
  
  const inputIncome = document.getElementById('input-monthly-income');
  const inputSavings = document.getElementById('input-savings-target');
  const btnAuto = document.getElementById('btn-auto-allocate-budget');
  const btnSave = document.getElementById('btn-save-budget');
  const inputsGrid = document.getElementById('category-budgets-inputs-grid');
  
  const disposableDisplay = document.getElementById('val-disposable-display');
  const catTotalDisplay = document.getElementById('val-cat-budget-total-display');
  let isSavingBudget = false;
  let hasInitialized = false;

  // 建议分配占比默认配置
  const SUGGESTED_RATIOS = {
    food: 0.40,         // 饮食 40%
    drinks: 0.10,       // 奶茶零食 10%
    shopping: 0.15,     // 网购 15%
    housing: 0.10,      // 宿舍 10%
    entertainment: 0.075, // 娱乐 7.5%
    social: 0.075,      // 社交 7.5%
    transport: 0.05,    // 交通 5%
    study: 0.05         // 学习 5%
  };

  /**
   * 初始化弹窗
   */
  function init() {
    if (hasInitialized) return;
    // 1. 动态在表单中渲染 8 个分类的预算输入框
    inputsGrid.innerHTML = '';
    Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
      const cat = window.CoinFlowUtils.CATEGORIES[key];
      const div = document.createElement('div');
      div.className = 'form-group';
      div.innerHTML = `
        <label for="budget-cat-${key}">${cat.emoji} ${cat.name}</label>
        <input type="number" id="budget-cat-${key}" class="form-input budget-cat-input" data-category="${key}" placeholder="0" min="0" required>
      `;
      inputsGrid.appendChild(div);
    });

    // 2. 绑定事件
    btnSettings.addEventListener('click', openModal);
    btnClose.addEventListener('click', closeModal);
    
    // 输入实时更新显示数据
    inputIncome.addEventListener('input', updateBudgetCalculations);
    inputSavings.addEventListener('input', updateBudgetCalculations);
    inputsGrid.addEventListener('input', updateBudgetCalculations);
    
    // 智能均分/推荐分配
    btnAuto.addEventListener('click', autoAllocate);

    // 提交保存
    form.addEventListener('submit', saveBudget);
    hasInitialized = true;
  }

  /**
   * 打开弹窗并载入当前配置
   */
  async function openModal() {
    window.CoinFlowUtils.triggerHaptic('light');
    modal.classList.add('active');

    try {
      const config = await window.CoinFlowDB.getBudgetConfig();
      inputIncome.value = config.monthlyIncome;
      inputSavings.value = config.savingsTarget;

      Object.keys(config.categoryBudgets).forEach(key => {
        const input = document.getElementById(`budget-cat-${key}`);
        if (input) {
          input.value = config.categoryBudgets[key];
        }
      });

      updateBudgetCalculations();
    } catch (e) {
      console.error('加载预算配置失败:', e);
    }
  }

  /**
   * 关闭弹窗
   */
  function closeModal() {
    modal.classList.remove('active');
  }

  /**
   * 实时计算可支配与当前分类预算和
   */
  function updateBudgetCalculations() {
    const income = parseFloat(inputIncome.value) || 0;
    const savings = parseFloat(inputSavings.value) || 0;
    const disposable = income - savings;
    
    disposableDisplay.textContent = window.CoinFlowUtils.formatAmount(disposable);

    // 统计各分类预算和
    let catTotal = 0;
    document.querySelectorAll('.budget-cat-input').forEach(input => {
      catTotal += parseFloat(input.value) || 0;
    });

    catTotalDisplay.textContent = window.CoinFlowUtils.formatAmount(catTotal);
    
    // 如果预算总和超出了可支配额，将分类合计设为警告红字
    if (catTotal > disposable) {
      catTotalDisplay.style.color = 'var(--color-danger)';
    } else {
      catTotalDisplay.style.color = 'var(--color-success)';
    }
  }

  /**
   * 智能匹配分配算法
   */
  function autoAllocate() {
    window.CoinFlowUtils.triggerHaptic('medium');
    const income = parseFloat(inputIncome.value) || 0;
    const savings = parseFloat(inputSavings.value) || 0;
    const disposable = Math.max(0, income - savings);

    if (disposable === 0) {
      window.CoinFlowUtils.showToast('可支配金额为0，无法分配', 'warning');
      return;
    }

    // 根据 SUGGESTED_RATIOS 乘积计算每一类的额度
    Object.keys(SUGGESTED_RATIOS).forEach(key => {
      const input = document.getElementById(`budget-cat-${key}`);
      if (input) {
        const calculated = Math.round(disposable * SUGGESTED_RATIOS[key]);
        input.value = calculated;
      }
    });

    updateBudgetCalculations();
    window.CoinFlowUtils.showToast('已应用智能推荐分配方案', 'success');
  }

  /**
   * 保存配置
   */
  async function saveBudget(e) {
    e.preventDefault();
    if (isSavingBudget) return;

    const income = parseFloat(inputIncome.value) || 0;
    const savings = parseFloat(inputSavings.value) || 0;
    
    // 构建 categoryBudgets 对象
    const categoryBudgets = {};
    document.querySelectorAll('.budget-cat-input').forEach(input => {
      const catKey = input.dataset.category;
      categoryBudgets[catKey] = parseFloat(input.value) || 0;
    });

    const config = {
      id: 'current',
      monthlyIncome: income,
      savingsTarget: savings,
      categoryBudgets: categoryBudgets,
      lastResetMonth: `${window.CoinFlowState.currentYear}-${String(window.CoinFlowState.currentMonth).padStart(2, '0')}`
    };

    try {
      isSavingBudget = true;
      btnSave.disabled = true;
      btnSave.setAttribute('aria-busy', 'true');
      btnSave.textContent = '保存中...';

      await window.CoinFlowDB.saveBudgetConfig(config);
      window.CoinFlowUtils.triggerHaptic('success');
      window.CoinFlowUtils.showToast('预算配置保存成功', 'success');
      closeModal();
      // 广播全局更新
      window.CoinFlowUtils.events.emit('dataChanged');
    } catch (err) {
      console.error('保存失败:', err);
      const message = err && err.message ? `保存失败：${err.message}` : '保存失败，请重试';
      window.CoinFlowUtils.showToast(message, 'error');
    } finally {
      isSavingBudget = false;
      btnSave.disabled = false;
      btnSave.removeAttribute('aria-busy');
      btnSave.textContent = '保存配置';
    }
  }

  // 挂载到全局
  window.CoinFlowBudget = {
    init
  };
})();
