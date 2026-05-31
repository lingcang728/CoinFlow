// CoinFlow 账单明细页面逻辑
(function() {
  const listContainer = document.getElementById('transactions-list-container');
  const monthSpentText = document.getElementById('tx-month-spent');
  const monthCountText = document.getElementById('tx-month-count');
  const monthAvgText = document.getElementById('tx-month-avg');
  
  const categoriesScroll = document.getElementById('filter-categories-scroll');
  const btnToggleSort = document.getElementById('btn-toggle-sort');
  const sortTextDisplay = document.getElementById('sort-text-display');
  
  const btnImport = document.getElementById('btn-import-excel');
  const inputFile = document.getElementById('input-file-excel');
  const btnExport = document.getElementById('btn-export-excel');

  let currentCategoryFilter = 'all'; // 默认显示全部分类
  let currentSortType = 'time-desc'; // time-desc, time-asc, amount-desc, amount-asc
  let editModalEl = null;
  let hasBoundEvents = false;

  /**
   * 初始化明细页
   */
  function init() {
    if (!hasBoundEvents) {
      // 1. 动态生成筛选分类滑动标签
      renderFilterCategories();

      // 2. 绑定排序切换
      btnToggleSort.onclick = toggleSort;

      // 3. 绑定导入导出
      btnImport.onclick = () => inputFile.click();
      inputFile.onchange = handleImport;
      
      // 绑定导出下拉菜单
      const dropdown = document.getElementById('export-dropdown');
      btnExport.onclick = (e) => {
        e.stopPropagation();
        window.CoinFlowUtils.triggerHaptic('light');
        dropdown.classList.toggle('active');
      };

      document.addEventListener('click', () => {
        dropdown.classList.remove('active');
      });

      document.getElementById('export-excel-item').onclick = () => handleExport('excel');
      document.getElementById('export-csv-item').onclick = () => handleExport('csv');
      document.getElementById('export-html-item').onclick = () => handleExport('html');
      hasBoundEvents = true;
    }

    render();
  }

  /**
   * 动态生成分类筛选标签
   */
  function renderFilterCategories() {
    // 保留“全部”标签，其余清空重新生成
    const allTag = categoriesScroll.querySelector('[data-category="all"]');
    categoriesScroll.innerHTML = '';
    categoriesScroll.appendChild(allTag);

    // 绑定全部标签点击
    allTag.onclick = () => selectCategoryFilter('all');

    Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
      const cat = window.CoinFlowUtils.CATEGORIES[key];
      const btn = document.createElement('button');
      btn.className = 'shortcut-tag';
      btn.style.whiteSpace = 'nowrap';
      btn.dataset.category = key;
      btn.textContent = `${cat.emoji} ${cat.name}`;
      btn.onclick = () => selectCategoryFilter(key);
      categoriesScroll.appendChild(btn);
    });
  }

  /**
   * 切换筛选分类
   */
  function selectCategoryFilter(categoryKey) {
    window.CoinFlowUtils.triggerHaptic('light');
    currentCategoryFilter = categoryKey;

    categoriesScroll.querySelectorAll('.shortcut-tag').forEach(tag => {
      if (tag.dataset.category === categoryKey) {
        tag.classList.add('active');
      } else {
        tag.classList.remove('active');
      }
    });

    render();
  }

  /**
   * 切换排序方式
   */
  function toggleSort() {
    window.CoinFlowUtils.triggerHaptic('light');
    if (currentSortType === 'time-desc') {
      currentSortType = 'amount-desc';
      sortTextDisplay.textContent = '金额降序';
    } else if (currentSortType === 'amount-desc') {
      currentSortType = 'time-desc';
      sortTextDisplay.textContent = '时间降序';
    }
    render();
  }

  /**
   * 处理账单导入 (自动检测 CSV 或 Excel)
   */
  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const isCSV = file.name.toLowerCase().endsWith('.csv');
    window.CoinFlowUtils.showToast('正在解析并导入账单...', 'info');

    try {
      let result;
      if (isCSV) {
        result = await window.CoinFlowExcel.importFromCSV(file);
      } else {
        result = await window.CoinFlowExcel.importFromExcel(file, window.CoinFlowState.currentYear);
      }
      
      window.CoinFlowUtils.triggerHaptic('success');
      if (isCSV) {
        window.CoinFlowUtils.showToast(`成功导入 ${result.successCount} 条支付宝账单`, 'success');
      } else {
        window.CoinFlowUtils.showToast(`成功导入 ${result.successCount} 条账单 (${result.sheetsCount} 个月份)`, 'success');
      }
      
      inputFile.value = '';
      window.CoinFlowUtils.events.emit('dataChanged');
    } catch (err) {
      console.error('导入失败:', err);
      window.CoinFlowUtils.showToast(err.message || '解析导入失败，请检查文件格式', 'error');
      inputFile.value = '';
    }
  }

  /**
   * 处理账单导出 (支持多格式)
   */
  async function handleExport(format) {
    const year = window.CoinFlowState.currentYear;
    const month = window.CoinFlowState.currentMonth;

    try {
      let exported = false;
      if (format === 'excel') {
        window.CoinFlowUtils.showToast('正在生成 Excel 文件...', 'info');
        exported = await window.CoinFlowExcel.exportToExcel(year, month);
      } else if (format === 'csv') {
        window.CoinFlowUtils.showToast('正在生成 CSV 文件...', 'info');
        exported = await window.CoinFlowExcel.exportToCSV(year, month);
      } else if (format === 'html') {
        window.CoinFlowUtils.showToast('正在生成 HTML 报告...', 'info');
        exported = await window.CoinFlowExportHTML.exportToHTML(year, month);
      }
      if (exported) {
        window.CoinFlowUtils.triggerHaptic('success');
        window.CoinFlowUtils.showToast('账单导出成功', 'success');
      } else {
        window.CoinFlowUtils.showToast('已取消导出', 'info');
      }
    } catch (err) {
      console.error('导出失败:', err);
      window.CoinFlowUtils.showToast('导出失败，请重试', 'error');
    }
  }

  /**
   * 数据加载并渲染明细列表
   */
  async function render() {
    const year = window.CoinFlowState.currentYear;
    const month = window.CoinFlowState.currentMonth;

    try {
      const transactions = await window.CoinFlowDB.getTransactionsByMonth(year, month);
      
      // 1. 根据分类筛选
      let filteredTxs = transactions;
      if (currentCategoryFilter !== 'all') {
        filteredTxs = transactions.filter(tx => tx.category === currentCategoryFilter);
      }

      // 2. 根据排序类型排序
      if (currentSortType === 'amount-desc') {
        filteredTxs.sort((a, b) => b.amount - a.amount);
      } else {
        // 默认 time-desc，db.js 出来的已经是日期最新优先，若是相同日期，ID更大（即创建时间更晚）优先
        filteredTxs.sort((a, b) => {
          if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
          }
          return b.createdAt - a.createdAt;
        });
      }

      // 3. 计算月度汇总数据并渲染
      let totalSpent = 0;
      filteredTxs.forEach(tx => totalSpent += tx.amount);

      // 计算当前月份的天数
      const totalDays = new Date(year, month, 0).getDate();
      const avgSpent = totalSpent / totalDays;

      monthSpentText.textContent = window.CoinFlowUtils.formatAmount(totalSpent);
      monthCountText.textContent = filteredTxs.length;
      monthAvgText.textContent = window.CoinFlowUtils.formatAmount(avgSpent);

      // 4. 按日期分组渲染 (如果是“时间降序”就按天分组，如果是“金额降序”则直接平铺列表)
      listContainer.innerHTML = '';

      if (filteredTxs.length === 0) {
        listContainer.innerHTML = `
          <div class="glass-card" style="text-align:center; padding: 40px 20px; color:var(--text-secondary); font-size:13px;">
            当月尚无符合筛选条件的账单数据
          </div>
        `;
        return;
      }

      if (currentSortType === 'time-desc') {
        // 按日期分组
        const grouped = {};
        filteredTxs.forEach(tx => {
          if (!grouped[tx.date]) grouped[tx.date] = [];
          grouped[tx.date].push(tx);
        });

        Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(dateStr => {
          const txs = grouped[dateStr];
          const daySpent = txs.reduce((sum, item) => sum + item.amount, 0);

          const groupCard = document.createElement('div');
          groupCard.className = 'surface-card transaction-day-card';
          
          let listHtml = '';
          txs.forEach(tx => {
            const cat = window.CoinFlowUtils.CATEGORIES[tx.category] || { emoji: '❓', name: tx.category, class: 'food' };
            const label = window.CoinFlowUtils.escapeHtml(tx.note || cat.name);
            listHtml += `
              <div class="tx-item-row" data-id="${tx.id}">
                <div class="tx-left">
                  <span class="category-icon bg-${cat.class}">${cat.emoji}</span>
                  <div>
                    <div class="tx-note-text">${label}</div>
                  </div>
                </div>
                <div class="tx-amount">-¥${tx.amount.toFixed(2)}</div>
              </div>
            `;
          });

          groupCard.innerHTML = `
            <div class="transaction-day-header">
              <div>${window.CoinFlowUtils.formatFriendlyDate(dateStr)} <span>(${dateStr})</span></div>
              <div>日支出 <strong>¥${daySpent.toFixed(2)}</strong></div>
            </div>
            <div class="transaction-day-list">
              ${listHtml}
            </div>
          `;
          listContainer.appendChild(groupCard);
        });

      } else {
        // 金额排序：直接渲染一个大列表卡片，不按日期分组
        const groupCard = document.createElement('div');
        groupCard.className = 'surface-card transaction-day-card';
        
        let listHtml = '';
        filteredTxs.forEach(tx => {
          const cat = window.CoinFlowUtils.CATEGORIES[tx.category] || { emoji: '❓', name: tx.category, class: 'food' };
          const label = window.CoinFlowUtils.escapeHtml(tx.note || cat.name);
          listHtml += `
            <div class="tx-item-row" data-id="${tx.id}">
              <div class="tx-left">
                <span class="category-icon bg-${cat.class}">${cat.emoji}</span>
                <div>
                  <div class="tx-note-text">${label}</div>
                  <div class="tx-subtitle">${tx.date}</div>
                </div>
              </div>
              <div class="tx-amount">-¥${tx.amount.toFixed(2)}</div>
            </div>
          `;
        });
        
        groupCard.innerHTML = `<div class="transaction-day-list">${listHtml}</div>`;
        listContainer.appendChild(groupCard);
      }

      // 5. 绑定行点击编辑事件
      document.querySelectorAll('.tx-item-row').forEach(row => {
        row.onclick = () => openEditModal(row.dataset.id);
      });

    } catch (err) {
      console.error('渲染明细页失败:', err);
    }
  }

  /**
   * 打开账单修改弹窗 (极佳的闭环功能)
   */
  async function openEditModal(txId) {
    window.CoinFlowUtils.triggerHaptic('light');

    try {
      const tx = await window.CoinFlowDB.getTransactionById(txId);
      if (!tx) return;
      const safeNote = window.CoinFlowUtils.escapeHtml(tx.note || '');

      // 动态创建 Modal Overlay (如果已存在则清空)
      if (editModalEl) {
        editModalEl.remove();
      }

      editModalEl = document.createElement('div');
      editModalEl.className = 'modal-overlay active';
      editModalEl.id = 'modal-edit-transaction';
      
      // 分类选项的 HTML
      let catOptionsHtml = '';
      Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
        const cat = window.CoinFlowUtils.CATEGORIES[key];
        const selected = tx.category === key ? 'selected' : '';
        catOptionsHtml += `<option value="${key}" ${selected}>${cat.emoji} ${cat.name}</option>`;
      });

      editModalEl.innerHTML = `
        <div class="bottom-sheet">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="font-size: 16px; font-weight: 700; color: #fff;">修改记账</h2>
            <button id="btn-close-edit-modal" style="background: none; font-size: 20px; color: var(--text-secondary);">×</button>
          </div>

          <form id="form-edit-transaction">
            <div class="form-group" style="margin-bottom: 12px;">
              <label>消费金额 (元)</label>
              <input type="number" step="0.01" id="edit-amount" class="form-input" value="${tx.amount}" required min="0.01">
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="form-group">
                <label>类别</label>
                <select id="edit-category" class="form-input" style="background:rgba(255,255,255,0.04); border-color:var(--glass-border); color:#fff;">
                  ${catOptionsHtml}
                </select>
              </div>
              <div class="form-group">
                <label>日期</label>
                <div class="date-picker-anchor">
                  <input type="hidden" id="edit-date" value="${tx.date}" required>
                  <button type="button" id="edit-date-trigger" class="date-field date-field-full">
                    <span data-date-label>${tx.date}</span>
                    <span class="date-field-icon" aria-hidden="true">▣</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
              <label>备注</label>
              <input type="text" id="edit-note" class="form-input" value="${safeNote}" placeholder="添加备注..." maxlength="30">
            </div>

            <div style="display:flex; gap:10px;">
              <button id="btn-delete-tx" type="button" class="btn-secondary" style="flex:1; border-color:rgba(244,67,54,0.4); color:#EF5350; background:rgba(244,67,54,0.06); padding:10px;">
                🗑️ 删除
              </button>
              <button id="btn-update-tx" type="button" class="btn-primary" style="flex:2; padding:10px;">
                ✓ 保存修改
              </button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(editModalEl);

      // 绑定事件
      document.getElementById('btn-close-edit-modal').onclick = closeEditModal;
      document.getElementById('btn-delete-tx').onclick = () => handleDelete(txId);
      document.getElementById('btn-update-tx').onclick = () => handleUpdate(txId);
      if (window.CoinFlowDatePicker) {
        window.CoinFlowDatePicker.attach(document.getElementById('edit-date'), {
          trigger: document.getElementById('edit-date-trigger')
        });
      }

    } catch (e) {
      console.error(e);
    }
  }

  function closeEditModal() {
    if (editModalEl) {
      editModalEl.classList.remove('active');
      setTimeout(() => {
        editModalEl.remove();
        editModalEl = null;
      }, 300);
    }
  }

  // 修改保存
  async function handleUpdate(txId) {
    const amount = parseFloat(document.getElementById('edit-amount').value);
    const category = document.getElementById('edit-category').value;
    const date = document.getElementById('edit-date').value;
    const note = document.getElementById('edit-note').value.trim();

    if (isNaN(amount) || amount <= 0) {
      window.CoinFlowUtils.showToast('请输入有效金额', 'warning');
      return;
    }

    try {
      await window.CoinFlowDB.updateTransaction(txId, { amount, category, date, note });
      window.CoinFlowUtils.triggerHaptic('success');
      window.CoinFlowUtils.showToast('账单修改成功', 'success');
      closeEditModal();
      window.CoinFlowUtils.events.emit('dataChanged');
    } catch (e) {
      window.CoinFlowUtils.showToast('修改失败', 'error');
    }
  }

  // 删除确认
  async function handleDelete(txId) {
    if (confirm('确认删除这笔账单记录吗？')) {
      try {
        await window.CoinFlowDB.deleteTransaction(txId);
        window.CoinFlowUtils.triggerHaptic('warning');
        window.CoinFlowUtils.showToast('账单已删除', 'success');
        closeEditModal();
        window.CoinFlowUtils.events.emit('dataChanged');
      } catch (e) {
        window.CoinFlowUtils.showToast('删除失败', 'error');
      }
    }
  }

  // 暴露组件 API
  window.CoinFlowTransactions = {
    init,
    render
  };
})();
