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

  // 关键词匹配按得分选择：精确命中 > 前缀/后缀命中 > 普通包含，且长关键词优先。
  // 这样可以避免「房贷还款」被还款吞掉，也避免未知分类被随机猜成不相关图标。
  const ICON_RULES = [
    // —— 金融 / 账务(含「X险」需先于「车」) ——
    { emoji: '🛡️', color: '#0EA5E9', keywords: ['保险', '车险', '社保', '医保', '寿险', '意外险'] },
    { emoji: '📈', color: '#22C55E', keywords: ['股票', '基金', '证券', '理财', '投资', '收益', '炒股', '债券'] },
    { emoji: '💰', color: '#EAB308', keywords: ['工资', '收入', '报销', '奖金', '薪资', '收款', '兼职', '外快'] },
    { emoji: '💳', color: '#6366F1', keywords: ['信用卡', '花呗', '白条', '分期', '贷款', '车贷'] },
    { emoji: '💸', color: '#F97316', keywords: ['转账', '还款', '借款', '手续费', '提现', '微信', '支付宝'] },
    { emoji: '🧾', color: '#F59E0B', keywords: ['账单', '缴费', '税', '发票', '罚款', '滞纳金'] },
    { emoji: '🎰', color: '#A855F7', keywords: ['彩票', '刮刮乐', '双色球'] },
    { emoji: '❤️', color: '#EF4444', keywords: ['捐款', '公益', '慈善', '捐赠'] },

    // —— 交通出行(具体方式先于笼统「车」「交通」) ——
    { emoji: '⛽', color: '#F43F5E', keywords: ['加油', '油费', '汽油', '充电桩'] },
    { emoji: '🅿️', color: '#64748B', keywords: ['停车', '车位', '停车费'] },
    { emoji: '🚕', color: '#FACC15', keywords: ['打车', '出租车', '网约车', '滴滴', '快车', '专车'] },
    { emoji: '🚇', color: '#0EA5E9', keywords: ['地铁', '轻轨'] },
    { emoji: '🚌', color: '#3B82F6', keywords: ['公交', '巴士', '大巴', '班车'] },
    { emoji: '🚄', color: '#06B6D4', keywords: ['高铁', '火车', '动车', '车票'] },
    { emoji: '✈️', color: '#06B6D4', keywords: ['机票', '飞机', '航班', '机场'] },
    { emoji: '🚢', color: '#0284C7', keywords: ['轮船', '邮轮', '船票'] },
    { emoji: '🚲', color: '#10B981', keywords: ['自行车', '单车', '共享单车', '电动车', '骑行'] },
    { emoji: '🚗', color: '#38BDF8', keywords: ['汽车', '车子', '车辆', '小车', '保养', '维修', '高速', '过路费', 'etc', '洗车', '驾照'] },
    { emoji: '🚏', color: '#3B82F6', keywords: ['交通', '出行', '通勤', '路费'] },

    // —— 居住 / 水电杂费 ——
    { emoji: '🏠', color: '#10B981', keywords: ['房贷', '月供', '房租', '租房', '房子', '住房'] },
    { emoji: '🏢', color: '#14B8A6', keywords: ['物业', '物业费', '取暖费', '暖气'] },
    { emoji: '💡', color: '#FACC15', keywords: ['电费'] },
    { emoji: '💧', color: '#38BDF8', keywords: ['水费'] },
    { emoji: '🔥', color: '#F97316', keywords: ['燃气', '天然气', '煤气', '气费'] },
    { emoji: '🌐', color: '#6366F1', keywords: ['宽带', '网费', '网络', 'wifi'] },
    { emoji: '📶', color: '#8B5CF6', keywords: ['话费', '流量', '手机费', '电话费'] },
    { emoji: '🛏️', color: '#A855F7', keywords: ['宿舍', '床上用品', '寝室'] },
    { emoji: '🛋️', color: '#F59E0B', keywords: ['家具', '家居', '家电', '沙发', '床', '冰箱', '洗衣机'] },
    { emoji: '🔨', color: '#EA580C', keywords: ['装修', '建材', '五金', '油漆'] },

    // —— 餐饮(笼统「餐饮 / 吃饭」放最后,具体品类先匹配) ——
    { emoji: '🥛', color: '#60A5FA', keywords: ['牛奶', '纯牛奶', '鲜奶', '酸奶', '乳制品', '燕麦奶', '豆奶', '豆浆', '牛乳'] },
    { emoji: '🥐', color: '#D97706', keywords: ['面包', '吐司', '欧包', '贝果', '三明治', '汉堡', '包子', '馒头', '蛋挞'] },
    { emoji: '🥚', color: '#F59E0B', keywords: ['鸡蛋', '牛肉', '猪肉', '鸡肉', '羊肉', '海鲜', '鱼', '虾', '肉类'] },
    { emoji: '☕', color: '#A16207', keywords: ['咖啡', '拿铁', '美式', '星巴克', 'coffee'] },
    { emoji: '🧋', color: '#A855F7', keywords: ['奶茶', '茶饮', '喜茶', '蜜雪'] },
    { emoji: '🍵', color: '#16A34A', keywords: ['茶叶', '喝茶'] },
    { emoji: '🥡', color: '#F97316', keywords: ['外卖', '美团', '饿了么'] },
    { emoji: '🍱', color: '#FB923C', keywords: ['早餐', '午餐', '晚餐', '夜宵', '正餐', '快餐', '便当'] },
    { emoji: '🍲', color: '#DC2626', keywords: ['火锅', '麻辣烫', '冒菜', '串串'] },
    { emoji: '🍢', color: '#B45309', keywords: ['烧烤', '夜市', '撸串'] },
    { emoji: '🍰', color: '#EC4899', keywords: ['甜品', '蛋糕', '烘焙', '甜点'] },
    { emoji: '🍓', color: '#F43F5E', keywords: ['水果', '车厘子'] },
    { emoji: '🥬', color: '#84CC16', keywords: ['买菜', '蔬菜', '生鲜', '菜市场', '食材'] },
    { emoji: '🍿', color: '#F59E0B', keywords: ['零食', '小吃', '辣条'] },
    { emoji: '🥤', color: '#06B6D4', keywords: ['饮料', '汽水', '可乐', '矿泉水'] },
    { emoji: '🍻', color: '#D97706', keywords: ['请客', '聚餐', '聚会', '下馆子', '饭局'] },
    { emoji: '🍚', color: '#FF6B6B', keywords: ['餐饮', '吃饭', '美食', '餐厅', '饮食', '午饭', '晚饭'] },

    // —— 医疗健康 ——
    { emoji: '🏥', color: '#F43F5E', keywords: ['医院', '看病', '门诊', '挂号', '住院', '手术', '医疗'] },
    { emoji: '💊', color: '#EF4444', keywords: ['药', '药店', '买药', '药品'] },
    { emoji: '🩺', color: '#0EA5E9', keywords: ['体检', '检查', '化验'] },
    { emoji: '🦷', color: '#22D3EE', keywords: ['牙', '牙医', '口腔', '洗牙', '补牙'] },
    { emoji: '👓', color: '#64748B', keywords: ['眼镜', '配镜', '隐形'] },

    // —— 学习教育 ——
    { emoji: '🎓', color: '#8B5CF6', keywords: ['学费', '培训', '补习', '网课', '辅导', '杂费'] },
    { emoji: '📖', color: '#7C3AED', keywords: ['书', '书籍', '图书', '教材', '杂志'] },
    { emoji: '📝', color: '#6366F1', keywords: ['考试', '报名', '证书', '考证', '驾考'] },
    { emoji: '✏️', color: '#F59E0B', keywords: ['文具', '笔记本', '本子'] },
    { emoji: '📚', color: '#8B5CF6', keywords: ['学习', '课程', '教育', '上课'] },

    // —— 数码电子 ——
    { emoji: '📱', color: '#6366F1', keywords: ['手机', '苹果', '华为', '小米'] },
    { emoji: '💻', color: '#3B82F6', keywords: ['电脑', '笔记本电脑', '平板', 'ipad', 'mac'] },
    { emoji: '🎧', color: '#A855F7', keywords: ['耳机', '音响', '耳麦'] },
    { emoji: '📷', color: '#0EA5E9', keywords: ['相机', '镜头', '摄影'] },
    { emoji: '🎮', color: '#EC4899', keywords: ['游戏', 'steam', '点券', '充值', '皮肤', '手游', '主机'] },
    { emoji: '🔌', color: '#64748B', keywords: ['数码', '电子', '配件', '充电器', '数据线'] },

    // —— 服饰美妆 ——
    { emoji: '👟', color: '#EF4444', keywords: ['鞋', '球鞋', '运动鞋'] },
    { emoji: '👜', color: '#D97706', keywords: ['包包', '箱包', '背包', '钱包'] },
    { emoji: '👖', color: '#3B82F6', keywords: ['裤子', '牛仔裤'] },
    { emoji: '👗', color: '#EC4899', keywords: ['裙子', '连衣裙'] },
    { emoji: '💄', color: '#F472B6', keywords: ['美妆', '化妆', '护肤', '口红', '面膜', '彩妆'] },
    { emoji: '💍', color: '#FACC15', keywords: ['首饰', '饰品', '珠宝', '项链', '戒指'] },
    { emoji: '💇', color: '#A855F7', keywords: ['理发', '美发', '发型', '剪发', '烫发', '染发'] },
    { emoji: '👕', color: '#E879F9', keywords: ['衣服', '服饰', '衣物', '穿搭', '外套', '上衣'] },

    // —— 社交人情 ——
    { emoji: '🧧', color: '#EF4444', keywords: ['红包', '礼金', '压岁钱', '份子', '人情', '随礼'] },
    { emoji: '🎁', color: '#F43F5E', keywords: ['礼物', '送礼', '礼品'] },
    { emoji: '👥', color: '#06B6D4', keywords: ['社交', '朋友', '同事'] },

    // —— 宠物 ——
    { emoji: '🐱', color: '#F59E0B', keywords: ['猫', '猫粮', '猫砂'] },
    { emoji: '🐶', color: '#D97706', keywords: ['狗', '狗粮', '遛狗'] },
    { emoji: '🐾', color: '#A855F7', keywords: ['宠物', '铲屎', '宠物医院'] },

    // —— 旅行娱乐 ——
    { emoji: '🏨', color: '#0EA5E9', keywords: ['酒店', '住宿', '民宿', '客栈', '青旅'] },
    { emoji: '🧳', color: '#06B6D4', keywords: ['旅行', '旅游', '出差', '度假', '行李'] },
    { emoji: '🎫', color: '#F97316', keywords: ['门票', '景区', '景点', '游乐园'] },
    { emoji: '🎭', color: '#A855F7', keywords: ['演唱会', '话剧', '展览', '音乐会', '演出'] },
    { emoji: '🎬', color: '#6366F1', keywords: ['电影', '影院', '观影'] },
    { emoji: '🎤', color: '#EC4899', keywords: ['ktv', '唱歌', '麦克风'] },

    // —— 运动健康 ——
    { emoji: '🏋️', color: '#EF4444', keywords: ['健身', '健身房', '撸铁', '私教'] },
    { emoji: '⚽', color: '#22C55E', keywords: ['篮球', '足球', '羽毛球', '球类', '运动'] },
    { emoji: '🏊', color: '#0EA5E9', keywords: ['游泳', '泳池'] },
    { emoji: '🧘', color: '#10B981', keywords: ['瑜伽', '冥想'] },

    // —— 烟酒 ——
    { emoji: '🚬', color: '#64748B', keywords: ['香烟', '抽烟', '烟草', '电子烟'] },
    { emoji: '🍺', color: '#D97706', keywords: ['啤酒', '白酒', '红酒', '喝酒', '洋酒', '买酒'] },

    // —— 母婴育儿 ——
    { emoji: '🍼', color: '#F472B6', keywords: ['母婴', '奶粉', '尿布', '纸尿裤', '辅食'] },
    { emoji: '🧸', color: '#FB923C', keywords: ['玩具', '积木', '手办'] },
    { emoji: '👶', color: '#EC4899', keywords: ['孩子', '宝宝', '育儿', '早教', '幼儿'] },

    // —— 订阅 / 媒体 ——
    { emoji: '📺', color: '#6366F1', keywords: ['视频', '爱奇艺', '腾讯视频', '优酷', 'netflix', '哔哩', 'bilibili', 'b站'] },
    { emoji: '🎵', color: '#A855F7', keywords: ['音乐', '网易云', 'qq音乐', 'spotify'] },
    { emoji: '🔄', color: '#0EA5E9', keywords: ['订阅', '会员', 'vip', '续费', '包月'] },
    { emoji: '☁️', color: '#38BDF8', keywords: ['网盘', '云服务', '云盘', '云存储'] },

    // —— 物流 / 日用 ——
    { emoji: '📦', color: '#F59E0B', keywords: ['快递', '邮费', '运费', '包邮', '物流'] },
    { emoji: '🚚', color: '#EA580C', keywords: ['搬家', '货运', '搬运'] },
    { emoji: '🧴', color: '#14B8A6', keywords: ['日用', '清洁', '纸巾', '洗护', '卫生', '洗衣液', '日化'] },
    { emoji: '🏪', color: '#22C55E', keywords: ['超市', '便利店', '商超'] },
    { emoji: '🛒', color: '#F59E0B', keywords: ['网购', '购物', '淘宝', '京东', '拼多多', '买东西'] }
  ];

  const FALLBACK_EMOJI = '🏷️';
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

  function compactMatchText(value) {
    return comparableName(value).replace(/[\s\-_.,，。/\\|+：:;；()（）【】\[\]]+/g, '');
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
      deleted: false,
      deletedAt: null,
      builtIn: true,
      createdAt: now + index,
      updatedAt: now + index
    }));
  }

  function isCategoryDeleted(category) {
    return Boolean(category && (category.deleted || category.hidden));
  }

  function normalizeCategoryRecord(category) {
    const deleted = isCategoryDeleted(category);
    const matched = matchIcon(category && category.name);
    return {
      key: String((category && category.key) || buildUniqueCustomKey(category && category.name || '分类')),
      name: normalizeName(category && category.name) || '未知分类',
      emoji: normalizeName((category && category.emoji) || matched.emoji).slice(0, 4) || matched.emoji,
      color: normalizeColor(category && category.color, matched.color),
      hidden: false,
      deleted,
      deletedAt: deleted ? ((category && category.deletedAt) || (category && category.updatedAt) || Date.now()) : null,
      builtIn: Boolean(category && category.builtIn),
      createdAt: (category && category.createdAt) || Date.now(),
      updatedAt: (category && category.updatedAt) || Date.now()
    };
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
        if (isCategoryDeleted(cat)) return;
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
        const normalizedCategories = categories.map(normalizeCategoryRecord);
        const needsMigration = normalizedCategories.some((cat, index) => {
          const original = categories[index] || {};
          return Boolean(original.hidden) ||
            Boolean(original.deleted) !== cat.deleted ||
            original.hidden !== false ||
            original.deletedAt !== cat.deletedAt;
        });
        categories = normalizedCategories;
        if (needsMigration) {
          await window.CoinFlowDB.saveCategories(categories);
        }
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
      deleted: false,
      deletedAt: null,
      builtIn: false,
      createdAt: 0,
      updatedAt: 0
    };
  }

  function getCategoryEntries(options = {}) {
    const includeDeleted = Boolean(options.includeDeleted || options.includeHidden);
    return categoryList
      .filter(cat => includeDeleted || !isCategoryDeleted(cat))
      .map(cat => [cat.key, { ...cat }]);
  }

  function getCategoryList(options = {}) {
    return getCategoryEntries(options).map(([, cat]) => cat);
  }

  function findKeyByName(name, excludeKey = '', options = {}) {
    const normalized = comparableName(name);
    if (!normalized) return '';
    const includeDeleted = Boolean(options.includeDeleted);

    const exact = categoryList.find(cat =>
      cat.key !== excludeKey &&
      comparableName(cat.name) === normalized &&
      (includeDeleted || !isCategoryDeleted(cat))
    );
    if (exact) return exact.key;

    for (const [key, aliases] of Object.entries(BUILT_IN_ALIASES)) {
      if (key === excludeKey) continue;
      const category = categoryMap[key];
      if (category && !includeDeleted && isCategoryDeleted(category)) continue;
      if (aliases.some(alias => comparableName(alias) === normalized)) return key;
    }
    return '';
  }

  function findDeletedKeyByName(name, excludeKey = '') {
    const normalized = comparableName(name);
    if (!normalized) return '';
    const exact = categoryList.find(cat =>
      cat.key !== excludeKey &&
      isCategoryDeleted(cat) &&
      comparableName(cat.name) === normalized
    );
    return exact ? exact.key : '';
  }

  function getKeywordScore(source, keyword) {
    const target = compactMatchText(keyword);
    if (!source || !target) return 0;

    const index = source.indexOf(target);
    if (index === -1) return 0;

    let score = target.length * 20;
    if (source === target) {
      score += 1000;
    } else {
      if (source.startsWith(target)) score += 180;
      if (source.endsWith(target)) score += 130;
      if (index > 0 && index < source.length - target.length) score += 70;
    }

    // 单字关键词只做弱匹配，避免长分类名里偶然含有一个字就误判。
    if (target.length === 1 && source.length > 3) {
      score -= 90;
    }

    return Math.max(0, score);
  }

  function matchIcon(name) {
    const source = compactMatchText(name);
    if (!source) {
      return { emoji: FALLBACK_EMOJI, color: '#F59E0B' };
    }

    let bestMatch = null;
    ICON_RULES.forEach((rule, ruleIndex) => {
      rule.keywords.forEach((keyword, keywordIndex) => {
        const score = getKeywordScore(source, keyword);
        if (score <= 0) return;

        const nextMatch = { rule, ruleIndex, keywordIndex, score };
        if (!bestMatch ||
            nextMatch.score > bestMatch.score ||
            (nextMatch.score === bestMatch.score &&
              (nextMatch.ruleIndex < bestMatch.ruleIndex ||
                (nextMatch.ruleIndex === bestMatch.ruleIndex && nextMatch.keywordIndex < bestMatch.keywordIndex)))) {
          bestMatch = nextMatch;
        }
      });
    });

    if (bestMatch) {
      return { emoji: bestMatch.rule.emoji, color: bestMatch.rule.color };
    }

    const hash = hashString(source);
    return {
      emoji: FALLBACK_EMOJI,
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
      deleted: false,
      deletedAt: null,
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

    const deletedKey = findDeletedKeyByName(normalized);
    if (deletedKey) {
      const category = await restoreCategory(deletedKey);
      return { key: deletedKey, category, created: false, restored: true };
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
    const restoredCategories = [];
    const pendingKeys = new Set();
    const pendingByComparable = new Map();
    const restoredByKey = new Map();

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

      const deletedKey = findDeletedKeyByName(normalized);
      if (deletedKey) {
        const current = categoryMap[deletedKey];
        const restored = {
          ...current,
          name: normalized,
          hidden: false,
          deleted: false,
          deletedAt: null,
          updatedAt: Date.now()
        };
        restoredByKey.set(deletedKey, restored);
        restoredCategories.push(restored);
        pendingByComparable.set(comparable, restored);
        keysByName[normalized] = restored.key;
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

    if (createdCategories.length > 0 || restoredCategories.length > 0) {
      await window.CoinFlowDB.saveCategories(restoredCategories.concat(createdCategories));
      const nextList = categoryList
        .map(cat => restoredByKey.get(cat.key) || cat)
        .concat(createdCategories);
      hydrate(nextList);
    }

    return { keysByName, createdCategories, restoredCategories };
  }

  async function createCategory(input) {
    await init();
    const name = normalizeName(input && input.name);
    if (!name) throw new Error('请输入分类名称');
    if (findKeyByName(name)) throw new Error('这个分类已经存在');

    const deletedKey = findDeletedKeyByName(name);
    if (deletedKey) {
      const category = await restoreCategory(deletedKey, input);
      return { ...category, restored: true };
    }

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
    const duplicateKey = findKeyByName(nextName, key, { includeDeleted: true });
    if (duplicateKey) throw new Error('这个分类名称已经被使用');

    const next = {
      ...current,
      name: nextName,
      emoji: normalizeName(updates.emoji || current.emoji).slice(0, 4) || current.emoji,
      color: normalizeColor(updates.color || current.color, current.color),
      hidden: false,
      deleted: updates.deleted === undefined ? isCategoryDeleted(current) : Boolean(updates.deleted),
      deletedAt: updates.deleted === false ? null : (updates.deleted === true ? Date.now() : (current.deletedAt || null)),
      builtIn: Boolean(current.builtIn),
      updatedAt: Date.now()
    };

    await window.CoinFlowDB.saveCategory(next);
    hydrate(categoryList.map(cat => cat.key === key ? next : cat));
    return { ...next };
  }

  async function deleteCategory(key) {
    await init();
    const category = categoryMap[key];
    if (!category) throw new Error('分类不存在');
    if (isCategoryDeleted(category)) {
      return { action: 'deleted', category: { ...category }, usedCount: await window.CoinFlowDB.countTransactionsByCategory(key) };
    }

    const usedCount = await window.CoinFlowDB.countTransactionsByCategory(key);
    const visibleCount = categoryList.filter(cat => !isCategoryDeleted(cat)).length;
    if (visibleCount <= 1) {
      throw new Error('至少保留一个可用分类');
    }
    const next = await updateCategory(key, { deleted: true });
    if (window.CoinFlowDB.removeCategoryBudget) {
      await window.CoinFlowDB.removeCategoryBudget(key);
    }
    return { action: 'deleted', category: next, usedCount };
  }

  async function restoreCategory(key, input = {}) {
    const updates = {
      name: input.name === undefined ? undefined : input.name,
      emoji: input.emoji,
      color: input.color,
      deleted: false
    };
    return updateCategory(key, updates);
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
    isCategoryDeleted,
    matchIcon,
    normalizeName,
    ensureCategoryForName,
    ensureCategoryMap,
    createCategory,
    updateCategory,
    deleteCategory,
    deleteOrHideCategory: deleteCategory,
    restoreCategory,
    resetToDefaultCategories
  };
})();
