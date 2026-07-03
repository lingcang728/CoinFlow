// CoinFlow category management modal.
(function() {
  const modal = document.getElementById('modal-category-settings');
  const btnClose = document.getElementById('btn-close-category-modal');
  const listEl = document.getElementById('category-manager-list');
  const form = document.getElementById('form-category-settings');
  const keyInput = document.getElementById('category-edit-key');
  const nameInput = document.getElementById('category-name-input');
  const emojiInput = document.getElementById('category-emoji-input');
  const colorInput = document.getElementById('category-color-input');
  const previewIcon = document.getElementById('category-editor-icon-preview');
  const editorTitle = document.getElementById('category-editor-title');
  const btnReset = document.getElementById('btn-reset-category-editor');
  const btnDelete = document.getElementById('btn-delete-category');
  const btnSave = document.getElementById('btn-save-category');

  let initialized = false;
  let selectedKey = '';
  let saving = false;
  let emojiTouched = false;
  let colorTouched = false;
  let nameMatchTimer = null;

  function init() {
    if (initialized || !modal || !form) return;

    document.querySelectorAll('[data-open-categories]').forEach(button => {
      button.addEventListener('click', openModal);
    });

    btnClose.addEventListener('click', closeModal);
    btnReset.addEventListener('click', resetEditor);
    btnDelete.addEventListener('click', deleteSelectedCategory);
    form.addEventListener('submit', saveCategory);

    emojiInput.addEventListener('input', () => {
      // 图标被清空时视为「未自定义」,允许后续根据名称自动补全;有内容才锁定为手动。
      emojiTouched = emojiInput.value.trim() !== '';
      updatePreview();
    });
    colorInput.addEventListener('input', () => {
      colorTouched = true;
      updatePreview();
    });
    nameInput.addEventListener('input', scheduleNameMatch);

    initialized = true;
  }

  // 仅在「新增分类」且用户尚未手动改过图标/颜色时,根据分类名称自动匹配 emoji 与配色。
  function scheduleNameMatch() {
    if (nameMatchTimer) clearTimeout(nameMatchTimer);
    nameMatchTimer = setTimeout(applyNameMatch, 120);
  }

  function applyNameMatch() {
    nameMatchTimer = null;
    if (selectedKey) return; // 编辑已有分类时不自动改写其图标
    if (emojiTouched && colorTouched) return;

    const name = nameInput.value.trim();
    if (!name) {
      if (!emojiTouched) emojiInput.value = '🏷️';
      if (!colorTouched) colorInput.value = '#F59E0B';
      updatePreview();
      return;
    }

    const matched = window.CoinFlowCategories.matchIcon(name);
    if (!emojiTouched) emojiInput.value = matched.emoji;
    if (!colorTouched) colorInput.value = matched.color;
    updatePreview();
  }

  function flushNameMatch() {
    if (nameMatchTimer) {
      clearTimeout(nameMatchTimer);
      nameMatchTimer = null;
    }
    applyNameMatch();
  }

  async function openModal() {
    window.CoinFlowUtils.triggerHaptic('light');
    modal.classList.add('active');
    await window.CoinFlowCategories.init();
    resetEditor();
    await renderList();
  }

  function closeModal() {
    if (nameMatchTimer) {
      clearTimeout(nameMatchTimer);
      nameMatchTimer = null;
    }
    modal.classList.remove('active');
  }

  async function renderList() {
    const categories = window.CoinFlowCategories.getCategoryList();
    const usageMap = await window.CoinFlowDB.getCategoryUsageCounts(categories.map(cat => cat.key));

    listEl.innerHTML = '';
    categories.forEach(cat => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'category-manager-row';
      row.classList.toggle('active', cat.key === selectedKey);
      row.dataset.category = cat.key;

      const usedCount = usageMap[cat.key] || 0;
      row.innerHTML = `
        ${window.CoinFlowCategories.iconHtml(cat)}
        <span class="category-manager-main">
          <strong>${window.CoinFlowUtils.escapeHtml(cat.name)}</strong>
          <small>${cat.builtIn ? '默认分类' : '自定义分类'} · ${usedCount} 笔</small>
        </span>
        <span class="category-manager-edit">编辑</span>
      `;
      row.addEventListener('click', () => selectCategory(cat.key));
      listEl.appendChild(row);
    });
  }

  function updateListSelection() {
    if (!listEl) return;
    listEl.querySelectorAll('.category-manager-row').forEach(row => {
      row.classList.toggle('active', row.dataset.category === selectedKey);
    });
  }

  async function selectCategory(key) {
    const cat = window.CoinFlowCategories.getCategory(key);
    selectedKey = key;
    emojiTouched = true;
    colorTouched = true;
    keyInput.value = key;
    nameInput.value = cat.name;
    emojiInput.value = cat.emoji;
    colorInput.value = cat.color;
    editorTitle.textContent = '编辑分类';
    btnDelete.disabled = false;

    btnDelete.textContent = '删除';

    updatePreview();
    updateListSelection();
  }

  function resetEditor() {
    if (nameMatchTimer) {
      clearTimeout(nameMatchTimer);
      nameMatchTimer = null;
    }
    selectedKey = '';
    emojiTouched = false;
    colorTouched = false;
    keyInput.value = '';
    nameInput.value = '';
    emojiInput.value = '🏷️';
    colorInput.value = '#F59E0B';
    editorTitle.textContent = '新增分类';
    btnDelete.disabled = true;
    btnDelete.textContent = '删除';
    updatePreview();
    if (listEl) {
      listEl.querySelectorAll('.category-manager-row').forEach(row => row.classList.remove('active'));
    }
  }

  function updatePreview() {
    const previewCategory = {
      emoji: emojiInput.value.trim() || '🏷️',
      color: colorInput.value || '#F59E0B'
    };
    previewIcon.textContent = previewCategory.emoji;
    previewIcon.style.cssText = window.CoinFlowCategories.getIconStyle(previewCategory);
  }

  function setSaving(nextSaving) {
    saving = nextSaving;
    btnSave.disabled = nextSaving;
    // 「新建」按钮保持可用：异步保存/删除期间用户点击新建的意图不能被吞掉，
    // 否则删除完成后的兜底 reset 会清掉用户已经开始输入的新分类内容。
    btnDelete.disabled = nextSaving || !selectedKey;
    btnSave.textContent = nextSaving ? '保存中...' : '保存分类';
  }

  async function saveCategory(event) {
    event.preventDefault();
    if (saving) return;

    flushNameMatch();

    const payload = {
      name: nameInput.value,
      emoji: emojiInput.value,
      color: colorInput.value
    };

    try {
      setSaving(true);
      if (selectedKey) {
        await window.CoinFlowCategories.updateCategory(selectedKey, payload);
        window.CoinFlowUtils.showToast('分类已更新', 'success');
      } else {
        const created = await window.CoinFlowCategories.createCategory(payload);
        selectedKey = created.key;
        window.CoinFlowUtils.showToast(created.restored ? '分类已恢复' : '分类已创建', 'success');
      }
      window.CoinFlowUtils.triggerHaptic('success');
      window.CoinFlowUtils.events.emit('categoriesChanged');
      window.CoinFlowUtils.events.emit('dataChanged');
      await renderList();
      updateListSelection();
    } catch (error) {
      console.error('保存分类失败:', error);
      window.CoinFlowUtils.showToast(error.message || '保存分类失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedCategory() {
    if (!selectedKey || saving) return;
    const keyBeingDeleted = selectedKey;

    try {
      setSaving(true);
      const result = await window.CoinFlowCategories.deleteCategory(keyBeingDeleted);
      const message = result.usedCount > 0
        ? `分类已删除，${result.usedCount} 笔历史账单已保留`
        : '分类已删除';
      window.CoinFlowUtils.showToast(message, 'success');
      window.CoinFlowUtils.triggerHaptic('success');
      window.CoinFlowUtils.events.emit('categoriesChanged');
      window.CoinFlowUtils.events.emit('dataChanged');
      // 仅当编辑器仍停留在被删分类时才重置；删除进行中用户可能已点了「新建」
      // 并开始输入，此时不能把用户输入清掉。
      if (selectedKey === keyBeingDeleted) {
        resetEditor();
      }
      await renderList();
    } catch (error) {
      console.error('处理分类失败:', error);
      window.CoinFlowUtils.showToast(error.message || '处理分类失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  window.CoinFlowCategoryManager = {
    init,
    open: openModal,
    close: closeModal
  };
})();
