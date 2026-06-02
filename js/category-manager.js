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

  function init() {
    if (initialized || !modal || !form) return;

    document.querySelectorAll('[data-open-categories]').forEach(button => {
      button.addEventListener('click', openModal);
    });

    btnClose.addEventListener('click', closeModal);
    btnReset.addEventListener('click', resetEditor);
    btnDelete.addEventListener('click', deleteSelectedCategory);
    form.addEventListener('submit', saveCategory);

    [emojiInput, colorInput].forEach(input => {
      input.addEventListener('input', updatePreview);
    });

    initialized = true;
  }

  async function openModal() {
    window.CoinFlowUtils.triggerHaptic('light');
    modal.classList.add('active');
    await window.CoinFlowCategories.init();
    resetEditor();
    await renderList();
  }

  function closeModal() {
    modal.classList.remove('active');
  }

  async function renderList() {
    const categories = window.CoinFlowCategories.getCategoryList({ includeHidden: true });
    const usageEntries = await Promise.all(
      categories.map(async cat => [cat.key, await window.CoinFlowDB.countTransactionsByCategory(cat.key)])
    );
    const usageMap = Object.fromEntries(usageEntries);

    listEl.innerHTML = '';
    categories.forEach(cat => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'category-manager-row';
      row.classList.toggle('is-hidden', Boolean(cat.hidden));
      row.classList.toggle('active', cat.key === selectedKey);
      row.dataset.category = cat.key;

      const usedCount = usageMap[cat.key] || 0;
      row.innerHTML = `
        ${window.CoinFlowCategories.iconHtml(cat)}
        <span class="category-manager-main">
          <strong>${window.CoinFlowUtils.escapeHtml(cat.name)}</strong>
          <small>${cat.builtIn ? '默认分类' : '自定义分类'} · ${usedCount} 笔${cat.hidden ? ' · 已隐藏' : ''}</small>
        </span>
        <span class="category-manager-edit">编辑</span>
      `;
      row.addEventListener('click', () => selectCategory(cat.key, usageMap[cat.key] || 0));
      listEl.appendChild(row);
    });
  }

  async function selectCategory(key, knownUsageCount) {
    const cat = window.CoinFlowCategories.getCategory(key);
    selectedKey = key;
    keyInput.value = key;
    nameInput.value = cat.name;
    emojiInput.value = cat.emoji;
    colorInput.value = cat.color;
    editorTitle.textContent = cat.hidden ? '编辑隐藏分类' : '编辑分类';
    btnDelete.disabled = false;

    const usedCount = knownUsageCount === undefined
      ? await window.CoinFlowDB.countTransactionsByCategory(key)
      : knownUsageCount;
    btnDelete.textContent = cat.hidden ? '恢复' : (!cat.builtIn && usedCount === 0 ? '删除' : '隐藏');

    updatePreview();
    await renderList();
  }

  function resetEditor() {
    selectedKey = '';
    keyInput.value = '';
    nameInput.value = '';
    emojiInput.value = '🏷️';
    colorInput.value = '#F59E0B';
    editorTitle.textContent = '新增分类';
    btnDelete.disabled = true;
    btnDelete.textContent = '隐藏';
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
    btnReset.disabled = nextSaving;
    btnDelete.disabled = nextSaving || !selectedKey;
    btnSave.textContent = nextSaving ? '保存中...' : '保存分类';
  }

  async function saveCategory(event) {
    event.preventDefault();
    if (saving) return;

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
        window.CoinFlowUtils.showToast('分类已创建', 'success');
      }
      window.CoinFlowUtils.triggerHaptic('success');
      window.CoinFlowUtils.events.emit('categoriesChanged');
      window.CoinFlowUtils.events.emit('dataChanged');
      await renderList();
      if (selectedKey) {
        await selectCategory(selectedKey);
      }
    } catch (error) {
      console.error('保存分类失败:', error);
      window.CoinFlowUtils.showToast(error.message || '保存分类失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedCategory() {
    if (!selectedKey || saving) return;

    const cat = window.CoinFlowCategories.getCategory(selectedKey);
    try {
      setSaving(true);
      if (cat.hidden) {
        await window.CoinFlowCategories.restoreCategory(selectedKey);
        window.CoinFlowUtils.showToast('分类已恢复', 'success');
      } else {
        const result = await window.CoinFlowCategories.deleteOrHideCategory(selectedKey);
        window.CoinFlowUtils.showToast(result.action === 'deleted' ? '分类已删除' : '分类已隐藏', 'success');
      }
      window.CoinFlowUtils.triggerHaptic('success');
      window.CoinFlowUtils.events.emit('categoriesChanged');
      window.CoinFlowUtils.events.emit('dataChanged');
      resetEditor();
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
