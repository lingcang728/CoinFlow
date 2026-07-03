// CoinFlow 数据管理层
// 桌面端优先使用 Documents\CoinFlow\Ledger\coinflow-ledger.json。
// 浏览器/PWA 环境保留 IndexedDB 兜底。
const DB_NAME = 'CoinFlowDB';
const DB_VERSION = 2;
const INDEXEDDB_MIGRATION_MARKER = 'coinflow:indexeddb-migration-complete';

let dbPromise = null;
let ledgerPromise = null;
let ledgerCache = null;
let ledgerWriteQueue = Promise.resolve();

function getDB() {
  if (!window.idb || typeof window.idb.openDB !== 'function') {
    throw new Error('IndexedDB helper library is not loaded');
  }

  if (!dbPromise) {
    dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('category', 'category', { unique: false });
        }
        if (!db.objectStoreNames.contains('budget')) {
          db.createObjectStore('budget');
        }
        if (!db.objectStoreNames.contains('categories')) {
          const categoryStore = db.createObjectStore('categories', { keyPath: 'key' });
          categoryStore.createIndex('name', 'name', { unique: false });
          categoryStore.createIndex('hidden', 'hidden', { unique: false });
        }
      }
    });
  }
  return dbPromise;
}

const DEFAULT_BUDGET = {
  monthlyIncome: 3000,
  savingsTarget: 0,
  categoryBudgets: {
    food: 1000,
    drinks: 300,
    shopping: 700,
    transport: 220,
    entertainment: 320,
    housing: 240,
    social: 120,
    study: 100
  },
  lastResetMonth: ''
};

function clone(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

// 按日期区间缓存排好序的交易副本：一次页面刷新会拉取同一批月份 2~8 次
// （顶栏 + 看板 + 统计页 6 个月趋势），全部命中缓存后只需做一次过滤排序。
const rangeCache = new Map();

function invalidateDerivedCaches() {
  rangeCache.clear();
}

function hasDesktopLedger() {
  return Boolean(
    window.coinflowLedger &&
    typeof window.coinflowLedger.read === 'function' &&
    typeof window.coinflowLedger.write === 'function'
  );
}

function emptyLedger() {
  return {
    schemaVersion: 1,
    app: 'CoinFlow',
    storage: 'documents-ledger-json',
    updatedAt: new Date().toISOString(),
    nextTransactionId: 1,
    transactions: [],
    categories: [],
    budget: null
  };
}

function maxTransactionId(transactions) {
  return transactions.reduce((max, tx) => {
    const id = Number(tx && tx.id);
    return Number.isFinite(id) && id > max ? id : max;
  }, 0);
}

function normalizeLedger(raw) {
  const data = { ...emptyLedger(), ...(raw || {}) };
  data.transactions = Array.isArray(data.transactions) ? data.transactions : [];
  data.categories = Array.isArray(data.categories) ? data.categories : [];
  data.budget = data.budget || null;
  data.nextTransactionId = Math.max(Number(data.nextTransactionId) || 1, maxTransactionId(data.transactions) + 1);
  return data;
}

function hasIndexedDBMigrationCompleted(ledger) {
  if (ledger && ledger.indexedDBMigrationComplete) return true;
  try {
    return window.localStorage && window.localStorage.getItem(INDEXEDDB_MIGRATION_MARKER) === '1';
  } catch (_error) {
    return false;
  }
}

function markIndexedDBMigrationComplete(ledger) {
  ledger.indexedDBMigrationComplete = true;
  ledger.indexedDBMigrationCompletedAt = ledger.indexedDBMigrationCompletedAt || new Date().toISOString();
  try {
    if (window.localStorage) {
      window.localStorage.setItem(INDEXEDDB_MIGRATION_MARKER, '1');
    }
  } catch (_error) {
  }
}

async function readIndexedDBSnapshot() {
  try {
    const db = await getDB();
    return {
      transactions: await db.getAll('transactions'),
      categories: db.objectStoreNames.contains('categories') ? await db.getAll('categories') : [],
      budget: await db.get('budget', 'current')
    };
  } catch (error) {
    console.warn('CoinFlow IndexedDB migration skipped:', error);
    return { transactions: [], categories: [], budget: null };
  }
}

async function writeLedgerData(data) {
  const normalized = normalizeLedger(data);
  normalized.updatedAt = new Date().toISOString();
  await window.coinflowLedger.write(normalized);
  ledgerCache = normalized;
  invalidateDerivedCaches();
  return normalized;
}

function queueLedgerWrite(task) {
  const queued = ledgerWriteQueue.then(task);
  ledgerWriteQueue = queued.catch(error => {
    console.error('CoinFlow ledger write failed:', error);
  });
  return queued;
}

async function getLedgerData() {
  if (!hasDesktopLedger()) return null;
  if (ledgerCache) return ledgerCache;

  if (!ledgerPromise) {
    ledgerPromise = (async () => {
      const response = await window.coinflowLedger.read();
      if (response && response.warning && window.CoinFlowUtils && typeof window.CoinFlowUtils.showToast === 'function') {
        window.CoinFlowUtils.showToast(response.warning, response.recoveryFailed ? 'error' : 'warning');
      }
      let ledger = normalizeLedger(response && response.data);
      const isEmpty = ledger.transactions.length === 0 && ledger.categories.length === 0 && !ledger.budget;
      const migrationComplete = hasIndexedDBMigrationCompleted(ledger);
      let shouldWriteLedger = false;

      if ((!response.exists || isEmpty) && !migrationComplete && !(response && response.recoveryFailed)) {
        const legacy = await readIndexedDBSnapshot();
        if (legacy.transactions.length > 0 || legacy.categories.length > 0 || legacy.budget) {
          ledger = normalizeLedger({
            ...ledger,
            transactions: legacy.transactions,
            categories: legacy.categories,
            budget: legacy.budget || null,
            migratedFrom: 'indexeddb',
            migratedAt: new Date().toISOString()
          });
        }
        shouldWriteLedger = true;
      }

      if (ledger.indexedDBMigrationComplete) {
        markIndexedDBMigrationComplete(ledger);
      } else if (!(response && response.recoveryFailed)) {
        markIndexedDBMigrationComplete(ledger);
        shouldWriteLedger = true;
      }

      if (shouldWriteLedger) {
        // 初始化阶段的回写失败（磁盘满 / 同步盘占用等）不应让整个应用瘫痪：
        // 先以内存数据继续运行，后续任何一次成功保存都会把状态补写回磁盘。
        try {
          await writeLedgerData(ledger);
        } catch (writeError) {
          console.error('CoinFlow initial ledger write failed:', writeError);
          if (window.CoinFlowUtils && typeof window.CoinFlowUtils.showToast === 'function') {
            window.CoinFlowUtils.showToast('账本写入失败，本次以内存数据运行，请检查磁盘空间或同步盘占用', 'warning');
          }
        }
      }

      return ledger;
    })();
  }

  try {
    ledgerCache = await ledgerPromise;
  } catch (error) {
    // 读取失败时允许下一次调用重试，而不是让所有页面从此永远失败（表现为假死）。
    ledgerPromise = null;
    throw error;
  }
  return ledgerCache;
}

async function saveLedgerMutation(mutator) {
  return queueLedgerWrite(async () => {
    const ledger = await getLedgerData();
    try {
      const result = await mutator(ledger);
      await writeLedgerData(ledger);
      return result;
    } finally {
      // 变更已应用到内存缓存；无论写盘成败都要让派生缓存失效，避免读到旧数据。
      invalidateDerivedCaches();
    }
  });
}

async function getBudgetConfig() {
  const ledger = await getLedgerData();
  if (ledger) {
    return clone(ledger.budget || DEFAULT_BUDGET);
  }

  const db = await getDB();
  const config = await db.get('budget', 'current');
  return config || { ...DEFAULT_BUDGET };
}

async function saveBudgetConfig(config) {
  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      nextLedger.budget = clone(config);
      return clone(config);
    });
  }

  const db = await getDB();
  await db.put('budget', config, 'current');
  return config;
}

async function removeCategoryBudget(categoryKey) {
  const config = await getBudgetConfig();
  if (!config.categoryBudgets || !(categoryKey in config.categoryBudgets)) {
    return false;
  }

  const nextCategoryBudgets = { ...config.categoryBudgets };
  delete nextCategoryBudgets[categoryKey];
  await saveBudgetConfig({
    ...config,
    categoryBudgets: nextCategoryBudgets
  });
  return true;
}

async function getAllCategories() {
  const ledger = await getLedgerData();
  if (ledger) {
    return clone(ledger.categories);
  }

  const db = await getDB();
  if (!db.objectStoreNames.contains('categories')) return [];
  return db.getAll('categories');
}

async function saveCategory(category) {
  const nextCategory = {
    ...category,
    updatedAt: category.updatedAt || Date.now()
  };

  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      const index = nextLedger.categories.findIndex(item => item.key === nextCategory.key);
      if (index === -1) {
        nextLedger.categories.push(nextCategory);
      } else {
        nextLedger.categories[index] = nextCategory;
      }
      return clone(nextCategory);
    });
  }

  const db = await getDB();
  await db.put('categories', nextCategory);
  return nextCategory;
}

async function saveCategories(categories) {
  const nextCategories = categories.map(category => ({
    ...category,
    updatedAt: category.updatedAt || Date.now()
  }));

  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      const byKey = new Map(nextLedger.categories.map(category => [category.key, category]));
      nextCategories.forEach(category => byKey.set(category.key, category));
      nextLedger.categories = Array.from(byKey.values());
      return clone(nextCategories);
    });
  }

  const db = await getDB();
  const tx = db.transaction('categories', 'readwrite');
  nextCategories.forEach(category => tx.store.put(category));
  await tx.done;
  return nextCategories;
}

async function deleteCategory(key) {
  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      nextLedger.categories = nextLedger.categories.filter(category => category.key !== key);
      return true;
    });
  }

  const db = await getDB();
  await db.delete('categories', key);
  return true;
}

async function clearCategories() {
  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      nextLedger.categories = [];
      return true;
    });
  }

  const db = await getDB();
  await db.clear('categories');
  return true;
}

async function countTransactionsByCategory(key) {
  const usageCounts = await getCategoryUsageCounts([key]);
  return usageCounts[key] || 0;
}

async function getCategoryUsageCounts(keys) {
  const keySet = Array.isArray(keys) && keys.length > 0 ? new Set(keys) : null;
  const counts = {};
  if (keySet) {
    keySet.forEach(key => {
      counts[key] = 0;
    });
  }

  const ledger = await getLedgerData();
  if (ledger) {
    ledger.transactions.forEach(tx => {
      if (keySet && !keySet.has(tx.category)) return;
      counts[tx.category] = (counts[tx.category] || 0) + 1;
    });
    return counts;
  }

  const db = await getDB();
  const txs = await db.getAll('transactions');
  txs.forEach(tx => {
    if (keySet && !keySet.has(tx.category)) return;
    counts[tx.category] = (counts[tx.category] || 0) + 1;
  });
  return counts;
}

function normalizeTransactionInput(tx) {
  return {
    amount: parseFloat(tx.amount),
    category: tx.category,
    note: tx.note || '',
    date: tx.date,
    createdAt: tx.createdAt || Date.now()
  };
}

async function addTransaction(tx) {
  const transactionInput = normalizeTransactionInput(tx);

  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      const id = nextLedger.nextTransactionId;
      nextLedger.nextTransactionId += 1;
      const transaction = { id, ...transactionInput };
      nextLedger.transactions.push(transaction);
      return clone(transaction);
    });
  }

  const db = await getDB();
  const id = await db.add('transactions', transactionInput);
  return { id, ...transactionInput };
}

async function addTransactions(transactions) {
  const transactionInputs = (Array.isArray(transactions) ? transactions : [])
    .map(normalizeTransactionInput)
    .filter(tx => Number.isFinite(tx.amount) && tx.amount > 0 && tx.category && tx.date);

  if (transactionInputs.length === 0) return [];

  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      const saved = transactionInputs.map((tx) => {
        const transaction = { id: nextLedger.nextTransactionId, ...tx };
        nextLedger.nextTransactionId += 1;
        nextLedger.transactions.push(transaction);
        return clone(transaction);
      });
      nextLedger.nextTransactionId = maxTransactionId(nextLedger.transactions) + 1;
      return saved;
    });
  }

  const db = await getDB();
  const tx = db.transaction('transactions', 'readwrite');
  const saved = [];
  for (const transactionInput of transactionInputs) {
    const id = await tx.store.add(transactionInput);
    saved.push({ id, ...transactionInput });
  }
  await tx.done;
  return saved;
}

async function deleteTransaction(id) {
  const parsedId = parseInt(id, 10);
  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      nextLedger.transactions = nextLedger.transactions.filter(tx => parseInt(tx.id, 10) !== parsedId);
      return true;
    });
  }

  const db = await getDB();
  await db.delete('transactions', parsedId);
  return true;
}

async function clearTransactions() {
  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      nextLedger.transactions = [];
      nextLedger.nextTransactionId = 1;
      return true;
    });
  }

  const db = await getDB();
  await db.clear('transactions');
  return true;
}

async function getTransactionById(id) {
  const parsedId = parseInt(id, 10);
  const ledger = await getLedgerData();
  if (ledger) {
    const tx = ledger.transactions.find(item => parseInt(item.id, 10) === parsedId);
    return clone(tx);
  }

  const db = await getDB();
  return db.get('transactions', parsedId);
}

async function updateTransaction(id, updatedData) {
  const parsedId = parseInt(id, 10);
  const ledger = await getLedgerData();
  if (ledger) {
    return saveLedgerMutation((nextLedger) => {
      const index = nextLedger.transactions.findIndex(tx => parseInt(tx.id, 10) === parsedId);
      if (index === -1) throw new Error('Transaction not found');
      const next = {
        ...nextLedger.transactions[index],
        amount: parseFloat(updatedData.amount),
        category: updatedData.category,
        note: updatedData.note || '',
        date: updatedData.date
      };
      nextLedger.transactions[index] = next;
      return clone(next);
    });
  }

  const db = await getDB();
  const tx = await db.get('transactions', parsedId);
  if (!tx) throw new Error('Transaction not found');
  const newTx = {
    ...tx,
    amount: parseFloat(updatedData.amount),
    category: updatedData.category,
    note: updatedData.note || '',
    date: updatedData.date
  };
  await db.put('transactions', newTx);
  return newTx;
}

function sortTransactions(txs) {
  return txs.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

async function getTransactionsByDateRange(startDate, endDate) {
  const ledger = await getLedgerData();
  if (ledger) {
    const cacheKey = `${startDate}|${endDate}`;
    let cached = rangeCache.get(cacheKey);
    if (!cached) {
      cached = sortTransactions(
        ledger.transactions
          .filter(tx => tx.date >= startDate && tx.date <= endDate)
          .map(tx => ({ ...tx }))
      );
      if (rangeCache.size > 36) rangeCache.clear();
      rangeCache.set(cacheKey, cached);
    }
    // 交易对象都是扁平结构，浅拷贝即等价于深拷贝；返回副本避免调用方排序/改写污染缓存。
    return cached.map(tx => ({ ...tx }));
  }

  const db = await getDB();
  const txs = await db.getAllFromIndex('transactions', 'date', IDBKeyRange.bound(startDate, endDate));
  return sortTransactions(txs);
}

async function getTransactionsByMonth(year, month) {
  const formattedMonth = String(month).padStart(2, '0');
  const startDate = `${year}-${formattedMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${formattedMonth}-${String(lastDay).padStart(2, '0')}`;
  return getTransactionsByDateRange(startDate, endDate);
}

async function getMonthlyStats(year, month) {
  const formattedMonth = String(month).padStart(2, '0');
  const startDate = `${year}-${formattedMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${formattedMonth}-${String(lastDay).padStart(2, '0')}`;

  const transactions = await getTransactionsByDateRange(startDate, endDate);
  const budgetConfig = await getBudgetConfig();

  let totalSpent = 0;
  const categorySpent = {};

  Object.keys(budgetConfig.categoryBudgets || {}).forEach(key => {
    categorySpent[key] = 0;
  });

  transactions.forEach(tx => {
    totalSpent += tx.amount;
    if (categorySpent[tx.category] === undefined) {
      categorySpent[tx.category] = 0;
    }
    categorySpent[tx.category] += tx.amount;
  });

  const totalBudget = budgetConfig.monthlyIncome - budgetConfig.savingsTarget;

  return {
    year,
    month: formattedMonth,
    totalSpent: parseFloat(totalSpent.toFixed(2)),
    totalBudget: parseFloat(totalBudget.toFixed(2)),
    remainingBudget: parseFloat((totalBudget - totalSpent).toFixed(2)),
    progressPercent: totalBudget > 0 ? parseFloat(((totalSpent / totalBudget) * 100).toFixed(1)) : 0,
    categoryBudgets: budgetConfig.categoryBudgets,
    categorySpent,
    transactions
  };
}

async function getStorageInfo() {
  if (hasDesktopLedger() && window.coinflowLedger.getPath) {
    return window.coinflowLedger.getPath();
  }
  return { storage: 'indexeddb', dbName: DB_NAME, dbVersion: DB_VERSION };
}

window.CoinFlowDB = {
  getBudgetConfig,
  saveBudgetConfig,
  removeCategoryBudget,
  getAllCategories,
  saveCategory,
  saveCategories,
  deleteCategory,
  clearCategories,
  countTransactionsByCategory,
  getCategoryUsageCounts,
  addTransaction,
  addTransactions,
  deleteTransaction,
  clearTransactions,
  getTransactionById,
  updateTransaction,
  getTransactionsByDateRange,
  getTransactionsByMonth,
  getMonthlyStats,
  getStorageInfo
};
