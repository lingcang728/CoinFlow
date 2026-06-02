// CoinFlow dynamic category metadata, icon matching, and management helpers.
(function() {
  const DEFAULT_CATEGORIES = [
    { key: 'food', name: '饮食', emoji: '🍚', color: '#FF6B6B' },
    { key: 'drinks', name: '奶茶零食', emoji: '🧋', color: '#A855F7' },
    { key: 'shopping', name: '网购', emoji: '🛒', color: '#F59E0B' },
    { key: 'transport', name: '交通', emoji: '🚌', color: '#3B82F6' },
    { key: 'entertainment', name: '娱乐', emoji: '🎮', color: '#EC4899' },
    { key: 'housing', name: '宿舍生活', emoji: '🏠', color: '#10B981' },
    { key: 'social', name: '社交', emoji: '👥', color: '#06B6D4' },
    { key: 'study', name: '学习', emoji: '📚', color: '#8B5CF6' }
  ];

  const BUILT_IN_ALIASES = {
    food: ['饮食', '餐饮', '吃饭', '正餐', '外卖'],
    drinks: ['奶茶零食', '奶茶', '饮品', '零食', '咖啡'],
    shopping: ['网购', '购物', '买东西'],
    transport: ['交通', '出行', '打车'],
    entertainment: ['娱乐', '游戏', '影音'],
    housing: ['宿舍生活', '宿舍', '房租', '住宿'],
    social: ['社交', '聚餐', '礼物'],
    study: ['学习', '教育', '课程']
  };

  const ICON_RULES = [
    { emoji: '📈', color: '#22C55E', keywords: ['股票', '基金', '证券', '理财', '投资', '收益'] },
    { emoji: '🚗', color: '#38BDF8', keywords: ['车', '汽车', '油费', '停车', '保养', '车险', '高速'] },
    { emoji: '🏠', color: '#10B981', keywords: ['房贷', '房租', '房子', '物业', '装修', '家居'] },
    { emoji: '🧧', color: '#EF4444', keywords: ['红包', '礼金', '压岁钱', '人情', '份子'] },
    { emoji: '💸', color: '#F97316', keywords: ['转账', '还款', '借款', '手续费'] },
    { emoji: '🧾', color: '#F59E0B', keywords: ['账单', '缴费', '税', '发票'] },
    { emoji: '🏥', color: '#F43F5E', keywords: ['医院', '医疗', '药', '体检', '门诊'] },
    { emoji: '👶', color: '#EC4899', keywords: ['孩子', '宝宝', '母婴', '奶粉', '玩具'] },
    { emoji: '🐾', color: '#A855F7', keywords: ['宠物', '猫', '狗'] },
    { emoji: '✈️', color: '#06B6D4', keywords: ['机票', '酒店', '旅行', '旅游', '出差'] },
    { emoji: '📱', color: '#6366F1', keywords: ['手机', '数码', '电脑', '电子'] },
    { emoji: '👕', color: '#E879F9', keywords: ['衣服', '服饰', '鞋', '包'] },
    { emoji: '🥬', color: '#84CC16', keywords: ['买菜', '水果', '蔬菜', '生鲜'] },
    { emoji: '🧴', color: '#14B8A6', keywords: ['日用', '清洁', '纸巾', '洗护'] },
    { emoji: '💡', color: '#FACC15', keywords: ['电费', '水费', '燃气', '宽带', '话费'] }
  ];

  const FALLBACK_EMOJIS = ['💳', '🧾', '💰', '📦', '🛍️', '⭐', '🔖', '📌', '💎', '🧩'];
  const COLOR_PALETTE = ['#FF6B6B', '#A855F7', '#F59E0B', '#3B82F6', '#EC4899', '#10B981', '#06B6D4', '#8B5CF6', '#F97316', '#22C55E', '#14B8A6', '#EAB308'];
  const DEFAULT_ORDER = new Map(DEFAULT_CATEGORIES.map((cat, index) => [cat.key, index]));

  let initialized = false;
  let initPromise = null;
  let categoryList = [];
  let categoryMap = {};

  function normalizeName(value) {
    return String(value || '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
  }

  function comparableName(value) {
    return normalizeName(value).toLowerCase();
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function escapeHtml(value) {
    if (window.CoinFlowUtils && typeof window.CoinFlowUtils.escapeHtml === 'function') {
      return window.CoinFlowUtils.escapeHtml(value);
    }
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[char]);
  }

  function hexToRgb(hex) {
    const clean = String(hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { r: 255, g: 255, b: 255 };
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function normalizeColor(value, fallback = '#F59E0B') {
    const clean = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean.toUpperCase() : fallback;
  }

  function getIconStyle(categoryOrKey) {
    const cat = typeof categoryOrKey === 'string' ? getCategory(categoryOrKey) : categoryOrKey;
    const color = normalizeColor(cat && cat.color, '#F59E0B');
    const rgb = hexToRgb(color);
    return `background-color: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16) !important; color: ${color} !important;`;
  }

  function iconHtml(categoryOrKey, className = 'category-icon') {
    const cat = typeof categoryOrKey === 'string' ? getCategory(categoryOrKey) : categoryOrKey;
    return `<span class="${className}" style="${getIconStyle(cat)}">${escapeHtml((cat && cat.emoji) || '❓')}</span>`;
  }

  function buildDefaultRecords() {
    const now = Date.now();
    return DEFAULT_CATEGORIES.map((cat, index) => ({
      key: cat.key,
      name: cat.name,
      emoji: cat.emoji,
      color: cat.color,
      hidden: false,
      builtIn: true,
      createdAt: now + index,
      updatedAt: now + index
    }));
  }

  function sortCategories(categories) {
    return categories.slice().sort((a, b) => {
      const aOrder = DEFAULT_ORDER.has(a.key) ? DEFAULT_ORDER.get(a.key) : 1000;
      const bOrder = DEFAULT_ORDER.has(b.key) ? DEFAULT_ORDER.get(b.key) : 1000;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.createdAt || 0) - (b.createdAt || 0) || a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  function hydrate(categories) {
    categoryList = sortCategories(categories);
    categoryMap = {};
    categoryList.forEach(cat => {
      categoryMap[cat.key] = { ...cat };
    });

    if (window.CoinFlowUtils && window.CoinFlowUtils.CATEGORIES) {
      const target = window.CoinFlowUtils.CATEGORIES;
      Object.keys(target).forEach(key => delete target[key]);
      categoryList.forEach(cat => {
        target[cat.key] = {
          ...cat,
          class: DEFAULT_ORDER.has(cat.key) ? cat.key : 'custom'
        };
      });
    }
  }

  async function init(options = {}) {
    if (initialized && !options.force) return categoryList;
    if (initPromise && !options.force) return initPromise;

    initPromise = (async () => {
      let categories = await window.CoinFlowDB.getAllCategories();
      if (!categories || categories.length === 0) {
        categories = buildDefaultRecords();
        await window.CoinFlowDB.saveCategories(categories);
      } else {
        categories = await backfillMissingDefaults(categories);
      }
      hydrate(categories);
      initialized = true;
      initPromise = null;
      return categoryList;
    })();

    return initPromise;
  }

  async function backfillMissingDefaults(categories) {
    const byKey = new Map(categories.map(cat => [cat.key, cat]));
    const missing = buildDefaultRecords().filter(cat => !byKey.has(cat.key));
    if (missing.length === 0) return categories;
    await window.CoinFlowDB.saveCategories(missing);
    return categories.concat(missing);
  }

  function getCategory(key) {
    return categoryMap[key] || {
      key,
      name: key || '未知分类',
      emoji: '❓',
      color: '#F59E0B',
      hidden: false,
      builtIn: false,
      createdAt: 0,
      updatedAt: 0
    };
  }

  function getCategoryEntries(options = {}) {
    const includeHidden = Boolean(options.includeHidden);
    return categoryList
      .filter(cat => includeHidden || !cat.hidden)
      .map(cat => [cat.key, { ...cat }]);
  }

  function getCategoryList(options = {}) {
    return getCategoryEntries(options).map(([, cat]) => cat);
  }

  function findKeyByName(name, excludeKey = '') {
    const normalized = comparableName(name);
    if (!normalized) return '';

    const exact = categoryList.find(cat => cat.key !== excludeKey && comparableName(cat.name) === normalized);
    if (exact) return exact.key;

    for (const [key, aliases] of Object.entries(BUILT_IN_ALIASES)) {
      if (key === excludeKey) continue;
      if (aliases.some(alias => comparableName(alias) === normalized)) return key;
    }
    return '';
  }

  function matchIcon(name) {
    const source = comparableName(name);
    const rule = ICON_RULES.find(item => item.keywords.some(keyword => source.includes(keyword.toLowerCase())));
    if (rule) {
      return { emoji: rule.emoji, color: rule.color };
    }

    const hash = hashString(source);
    return {
      emoji: FALLBACK_EMOJIS[hash % FALLBACK_EMOJIS.length],
      color: COLOR_PALETTE[hash % COLOR_PALETTE.length]
    };
  }

  function buildUniqueCustomKey(name, pendingKeys = new Set()) {
    const base = `custom_${hashString(comparableName(name)).toString(36)}`;
    let key = base;
    let suffix = 2;
    while ((categoryMap[key] && comparableName(categoryMap[key].name) !== comparableName(name)) || pendingKeys.has(key)) {
      key = `${base}_${suffix}`;
      suffix += 1;
    }
    return key;
  }

  function buildCustomCategory(name, pendingKeys = new Set(), overrides = {}) {
    const normalized = normalizeName(name);
    const matched = matchIcon(normalized);
    const now = Date.now();
    const key = buildUniqueCustomKey(normalized, pendingKeys);
    return {
      key,
      name: normalized,
      emoji: normalizeName(overrides.emoji || matched.emoji).slice(0, 4) || matched.emoji,
      color: normalizeColor(overrides.color, matched.color),
      hidden: false,
      builtIn: false,
      createdAt: now,
      updatedAt: now
    };
  }

  async function ensureCategoryForName(name) {
    await init();
    const normalized = normalizeName(name);
    if (!normalized) {
      return { key: 'shopping', category: getCategory('shopping'), created: false };
    }

    const existingKey = findKeyByName(normalized);
    if (existingKey) {
      return { key: existingKey, category: getCategory(existingKey), created: false };
    }

    const category = buildCustomCategory(normalized);
    await window.CoinFlowDB.saveCategory(category);
    hydrate(categoryList.concat(category));
    return { key: category.key, category: { ...category }, created: true };
  }

  async function ensureCategoryMap(names) {
    await init();
    const keysByName = {};
    const createdCategories = [];
    const pendingKeys = new Set();
    const pendingByComparable = new Map();

    names.forEach(name => {
      const normalized = normalizeName(name);
      if (!normalized) return;
      const comparable = comparableName(normalized);
      if (keysByName[normalized]) return;

      const existingKey = findKeyByName(normalized);
      if (existingKey) {
        keysByName[normalized] = existingKey;
        return;
      }

      if (pendingByComparable.has(comparable)) {
        keysByName[normalized] = pendingByComparable.get(comparable).key;
        return;
      }

      const category = buildCustomCategory(normalized, pendingKeys);
      pendingKeys.add(category.key);
      pendingByComparable.set(comparable, category);
      createdCategories.push(category);
      keysByName[normalized] = category.key;
    });

    if (createdCategories.length > 0) {
      await window.CoinFlowDB.saveCategories(createdCategories);
      hydrate(categoryList.concat(createdCategories));
    }

    return { keysByName, createdCategories };
  }

  async function createCategory(input) {
    await init();
    const name = normalizeName(input && input.name);
    if (!name) throw new Error('请输入分类名称');
    if (findKeyByName(name)) throw new Error('这个分类已经存在');

    const category = buildCustomCategory(name, new Set(), {
      emoji: input.emoji,
      color: input.color
    });
    await window.CoinFlowDB.saveCategory(category);
    hydrate(categoryList.concat(category));
    return { ...category };
  }

  async function updateCategory(key, updates) {
    await init();
    const current = categoryMap[key];
    if (!current) throw new Error('分类不存在');

    const nextName = updates.name !== undefined ? normalizeName(updates.name) : current.name;
    if (!nextName) throw new Error('请输入分类名称');
    const duplicateKey = findKeyByName(nextName, key);
    if (duplicateKey) throw new Error('这个分类名称已经被使用');

    const next = {
      ...current,
      name: nextName,
      emoji: normalizeName(updates.emoji || current.emoji).slice(0, 4) || current.emoji,
      color: normalizeColor(updates.color || current.color, current.color),
      hidden: updates.hidden === undefined ? current.hidden : Boolean(updates.hidden),
      builtIn: Boolean(current.builtIn),
      updatedAt: Date.now()
    };

    await window.CoinFlowDB.saveCategory(next);
    hydrate(categoryList.map(cat => cat.key === key ? next : cat));
    return { ...next };
  }

  async function deleteOrHideCategory(key) {
    await init();
    const category = categoryMap[key];
    if (!category) throw new Error('分类不存在');

    const usedCount = await window.CoinFlowDB.countTransactionsByCategory(key);
    if (category.builtIn || usedCount > 0) {
      const visibleCount = categoryList.filter(cat => !cat.hidden).length;
      if (!category.hidden && visibleCount <= 1) {
        throw new Error('至少保留一个可用分类');
      }
      const next = await updateCategory(key, { hidden: true });
      return { action: 'hidden', category: next, usedCount };
    }

    const visibleCount = categoryList.filter(cat => !cat.hidden).length;
    if (!category.hidden && visibleCount <= 1) {
      throw new Error('至少保留一个可用分类');
    }
    await window.CoinFlowDB.deleteCategory(key);
    hydrate(categoryList.filter(cat => cat.key !== key));
    return { action: 'deleted', category, usedCount };
  }

  async function restoreCategory(key) {
    return updateCategory(key, { hidden: false });
  }

  async function resetToDefaultCategories() {
    await window.CoinFlowDB.clearCategories();
    const categories = buildDefaultRecords();
    await window.CoinFlowDB.saveCategories(categories);
    hydrate(categories);
    initialized = true;
    initPromise = null;
    return categoryList;
  }

  window.CoinFlowCategories = {
    init,
    getCategory,
    getCategoryEntries,
    getCategoryList,
    getIconStyle,
    iconHtml,
    normalizeName,
    ensureCategoryForName,
    ensureCategoryMap,
    createCategory,
    updateCategory,
    deleteOrHideCategory,
    restoreCategory,
    resetToDefaultCategories
  };
})();
