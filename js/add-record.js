// CoinFlow desktop quick-add record form.
(function() {
  const defaultShortcuts = {
    food: ['正餐', '外卖', '饭堂', '麦当劳', '麻辣香锅'],
    drinks: ['一点点', 'coco', '霸王茶姬', '瑞幸咖啡', '零食'],
    shopping: ['拼多多', '淘宝', '京东', '日用品', '买衣服'],
    housing: ['电费', '水费', '网费', '宿舍杂物'],
    entertainment: ['电影', '网易云', '游戏充值', '看展'],
    transport: ['公交车', '地铁', '共享单车', '打车'],
    social: ['聚餐', '请客', '生日礼物', '聚会'],
    study: ['买书', '文具', '打印资料', '考证网课']
  };

  let root = null;
  let amountInput = null;
  let clearAmountBtn = null;
  let catGrid = null;
  let noteInput = null;
  let dateInput = null;
  let dateTrigger = null;
  let shortcutContainer = null;
  let btnSave = null;
  let successToast = null;
  let budgetStatusText = null;
  let selectedCategory = 'food';
  let isSaving = false;
  let mounted = false;
  let optionsRef = {};

  function queryParts(container) {
    root = container || document.getElementById('desktop-record-form');
    if (!root) return false;

    amountInput = root.querySelector('#add-amount-input');
    clearAmountBtn = root.querySelector('#btn-clear-amount');
    catGrid = root.querySelector('.add-category-grid');
    noteInput = root.querySelector('#add-note-input');
    dateInput = root.querySelector('#add-date-input');
    dateTrigger = root.querySelector('#add-date-trigger');
    shortcutContainer = root.querySelector('#shortcut-notes-container');
    btnSave = root.querySelector('#btn-save-record');
    budgetStatusText = root.querySelector('#selected-category-budget-status');
    successToast = document.getElementById('save-success-toast');

    return Boolean(amountInput && catGrid && noteInput && dateInput && dateTrigger && shortcutContainer && btnSave);
  }

  function mount(container, options = {}) {
    optionsRef = options;
    if (!queryParts(container)) return;

    renderCategoryGrid();

    if (!dateInput.value) {
      dateInput.value = window.CoinFlowUtils.getTodayDateString();
    }

    if (window.CoinFlowDatePicker) {
      window.CoinFlowDatePicker.attach(dateInput, { trigger: dateTrigger });
    }

    if (!mounted) {
      root.addEventListener('submit', (event) => {
        event.preventDefault();
        saveRecord();
      });

      amountInput.addEventListener('keydown', handleAmountKeydown);
      amountInput.addEventListener('input', normalizeAmountWhileTyping);
      amountInput.addEventListener('blur', normalizeAmountOnBlur);
      noteInput.addEventListener('keydown', handleNoteKeydown);
      dateInput.addEventListener('change', () => updateCategoryBudgetStatus(selectedCategory));

      if (clearAmountBtn) {
        clearAmountBtn.addEventListener('click', () => {
          amountInput.value = '';
          focusAmount();
        });
      }

      mounted = true;
    }

    selectCategory(selectedCategory);
    loadShortcutNotes(selectedCategory);
    focusAmount();
  }

  function renderCategoryGrid() {
    catGrid.innerHTML = '';
    Object.keys(window.CoinFlowUtils.CATEGORIES).forEach((key) => {
      const cat = window.CoinFlowUtils.CATEGORIES[key];
      const btn = document.createElement('button');
      btn.className = 'cat-select-btn';
      btn.type = 'button';
      btn.dataset.category = key;
      btn.innerHTML = `
        <span class="category-icon bg-${cat.class}">${cat.emoji}</span>
        <span>${cat.name}</span>
      `;
      btn.addEventListener('click', () => selectCategory(key));
      catGrid.appendChild(btn);
    });
  }

  async function selectCategory(key) {
    selectedCategory = key;
    catGrid.querySelectorAll('.cat-select-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.category === key);
    });
    await updateCategoryBudgetStatus(key);
    loadShortcutNotes(key);
  }

  async function updateCategoryBudgetStatus(key) {
    if (!budgetStatusText) return;

    const dateValue = dateInput.value || window.CoinFlowUtils.getTodayDateString();
    const d = new Date(`${dateValue}T00:00:00`);
    const year = Number.isNaN(d.getTime()) ? window.CoinFlowState.currentYear : d.getFullYear();
    const month = Number.isNaN(d.getTime()) ? window.CoinFlowState.currentMonth : d.getMonth() + 1;

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
        budgetStatusText.textContent = `剩余 ¥${remain.toFixed(0)}`;
        budgetStatusText.style.color = 'var(--color-success)';
      }
    } catch (error) {
      budgetStatusText.textContent = '';
    }
  }

  function normalizeAmountText(rawValue, cursorIndex = rawValue.length) {
    const source = String(rawValue).replace(/[，。]/g, '.');
    const safeCursor = Number.isFinite(cursorIndex) ? Math.max(0, cursorIndex) : source.length;
    let value = '';
    let nextCursor = 0;
    let hasDot = false;
    let integerDigits = 0;
    let decimalDigits = 0;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const beforeCursor = index < safeCursor;
      let accepted = false;

      if (/\d/.test(char)) {
        if (hasDot) {
          if (decimalDigits < 2) {
            decimalDigits += 1;
            accepted = true;
          }
        } else if (integerDigits < 8) {
          integerDigits += 1;
          accepted = true;
        }
      } else if (char === '.' && !hasDot) {
        hasDot = true;
        accepted = true;
      }

      if (accepted) {
        value += char;
        if (beforeCursor) {
          nextCursor += 1;
        }
      }
    }

    return { value, cursor: nextCursor };
  }

  function normalizeAmountWhileTyping() {
    const cursorIndex = amountInput.selectionStart === null ? amountInput.value.length : amountInput.selectionStart;
    const normalized = normalizeAmountText(amountInput.value, cursorIndex);

    if (amountInput.value === normalized.value) return;

    amountInput.value = normalized.value;
    if (typeof amountInput.setSelectionRange === 'function') {
      amountInput.setSelectionRange(normalized.cursor, normalized.cursor);
    }
  }

  function normalizeAmountOnBlur() {
    const amount = parseFloat(amountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    amountInput.value = amount.toFixed(2);
  }

  function handleAmountKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveRecord();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      reset();
    }
  }

  function handleNoteKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveRecord();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      reset();
    }
  }

  function loadShortcutNotes(categoryKey = selectedCategory) {
    shortcutContainer.innerHTML = '';
    const shortcuts = defaultShortcuts[categoryKey] || ['支出'];

    shortcuts.forEach((text) => {
      const tag = document.createElement('button');
      tag.className = 'shortcut-tag';
      tag.type = 'button';
      tag.textContent = text;
      tag.addEventListener('click', () => {
        noteInput.value = text;
        focusAmount();
      });
      shortcutContainer.appendChild(tag);
    });
  }

  function setSaving(nextSaving) {
    isSaving = nextSaving;
    btnSave.disabled = nextSaving;
    btnSave.toggleAttribute('aria-busy', nextSaving);
    btnSave.querySelector('span').textContent = nextSaving ? '保存中...' : '确认保存';
  }

  function showSuccess() {
    if (!successToast) return;
    successToast.classList.add('active');
    window.setTimeout(() => {
      successToast.classList.remove('active');
    }, 720);
  }

  async function saveRecord() {
    if (isSaving) return;

    const amount = parseFloat(amountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      window.CoinFlowUtils.showToast('请输入有效金额', 'warning');
      focusAmount();
      return;
    }

    const note = noteInput.value.trim();
    const date = dateInput.value;
    if (!date || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
      window.CoinFlowUtils.showToast('请选择有效日期', 'warning');
      return;
    }

    try {
      setSaving(true);
      await window.CoinFlowDB.addTransaction({
        amount,
        category: selectedCategory,
        note,
        date
      });

      window.CoinFlowUtils.triggerHaptic('success');
      window.CoinFlowUtils.showToast('记账成功', 'success');
      showSuccess();
      reset({ keepCategory: true });
      window.CoinFlowUtils.events.emit('dataChanged');

      if (typeof optionsRef.onSaved === 'function') {
        optionsRef.onSaved();
      }
    } catch (error) {
      console.error('记账保存失败:', error);
      const message = error && error.message ? `记账保存失败：${error.message}` : '记账保存失败，请重试';
      window.CoinFlowUtils.showToast(message, 'error');
    } finally {
      setSaving(false);
      focusAmount();
    }
  }

  function reset(options = {}) {
    amountInput.value = '';
    noteInput.value = '';
    dateInput.value = window.CoinFlowUtils.getTodayDateString();

    const picker = window.CoinFlowDatePicker && window.CoinFlowDatePicker.attach(dateInput, { trigger: dateTrigger });
    if (picker && typeof picker.updateLabel === 'function') {
      picker.updateLabel();
    }

    if (!options.keepCategory) {
      selectedCategory = 'food';
      selectCategory(selectedCategory);
    } else {
      updateCategoryBudgetStatus(selectedCategory);
    }
  }

  function focusAmount() {
    if (!amountInput) return;
    requestAnimationFrame(() => {
      amountInput.focus();
    });
  }

  function destroy() {
    mounted = false;
    root = null;
  }

  window.CoinFlowRecordForm = {
    mount,
    reset,
    focusAmount,
    destroy
  };

  window.CoinFlowAddRecord = {
    init() {
      mount(document.getElementById('desktop-record-form'));
    },
    reset,
    focusAmount
  };
})();
