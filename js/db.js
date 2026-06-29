// CoinFlow 数据管理层
// 桌面端优先使用 Documents\CoinFlow\Ledger\coinflow-ledger.json。
// 浏览器/PWA 环境保留 IndexedDB 兜底。
const DB_NAME = 'CoinFlowDB';
const DB_VERSION = 2;

let dbPromise = null;
let ledgerPromise = null;
let ledgerCache = null;

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
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
  return normalized;
}

async function getLedgerData() {
  if (!hasDesktopLedger()) return null;
  if (ledgerCache) return ledgerCache;

  if (!ledgerPromise) {
    ledgerPromise = (async () => {
      const response = await window.coinflowLedger.read();
      let ledger = normalizeLedger(response && response.data);
      const isEmpty = ledger.transactions.length === 0 && ledger.categories.length === 0 && !ledger.budget;

      if (!response.exists || isEmpty) {
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
        await writeLedgerData(ledger);
      }

      return ledger;
    })();
  }

  ledgerCache = await ledgerPromise;
  return ledgerCache;
}

async function saveLedgerMutation(mutator) {
  const ledger = await getLedgerData();
  const result = await mutator(ledger);
  await writeLedgerData(ledger);
  return result;
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
    ledger.budget = clone(config);
    await writeLedgerData(ledger);
    return clone(config);
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
    const index = ledger.categories.findIndex(item => item.key === nextCategory.key);
    if (index === -1) {
      ledger.categories.push(nextCategory);
    } else {
      ledger.categories[index] = nextCategory;
    }
    await writeLedgerData(ledger);
    return clone(nextCategory);
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
    const byKey = new Map(ledger.categories.map(category => [category.key, category]));
    nextCategories.forEach(category => byKey.set(category.key, category));
    ledger.categories = Array.from(byKey.values());
    await writeLedgerData(ledger);
    return clone(nextCategories);
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
    ledger.categories = ledger.categories.filter(category => category.key !== key);
    await writeLedgerData(ledger);
    return true;
  }

  const db = await getDB();
  await db.delete('categories', key);
  return true;
}

async function clearCategories() {
  const ledger = await getLedgerData();
  if (ledger) {
    ledger.categories = [];
    await writeLedgerData(ledger);
    return true;
  }

  const db = await getDB();
  await db.clear('categories');
  return true;
}

async function countTransactionsByCategory(key) {
  const ledger = await getLedgerData();
  if (ledger) {
    return ledger.transactions.filter(tx => tx.category === key).length;
  }

  const db = await getDB();
  const txs = await db.getAllFromIndex('transactions', 'category', key);
  return txs.length;
}

async function addTransaction(tx) {
  const transactionInput = {
    amount: parseFloat(tx.amount),
    category: tx.category,
    note: tx.note || '',
    date: tx.date,
    createdAt: tx.createdAt || Date.now()
  };

  const ledger = await getLedgerData();
  if (ledger) {
    const id = ledger.nextTransactionId;
    ledger.nextTransactionId += 1;
    const transaction = { id, ...transactionInput };
    ledger.transactions.push(transaction);
    await writeLedgerData(ledger);
    return clone(transaction);
  }

  const db = await getDB();
  const id = await db.add('transactions', transactionInput);
  return { id, ...transactionInput };
}

async function deleteTransaction(id) {
  const parsedId = parseInt(id, 10);
  const ledger = await getLedgerData();
  if (ledger) {
    ledger.transactions = ledger.transactions.filter(tx => parseInt(tx.id, 10) !== parsedId);
    await writeLedgerData(ledger);
    return true;
  }

  const db = await getDB();
  await db.delete('transactions', parsedId);
  return true;
}

async function clearTransactions() {
  const ledger = await getLedgerData();
  if (ledger) {
    ledger.transactions = [];
    ledger.nextTransactionId = 1;
    await writeLedgerData(ledger);
    return true;
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
    const index = ledger.transactions.findIndex(tx => parseInt(tx.id, 10) === parsedId);
    if (index === -1) throw new Error('Transaction not found');
    const next = {
      ...ledger.transactions[index],
      amount: parseFloat(updatedData.amount),
      category: updatedData.category,
      note: updatedData.note || '',
      date: updatedData.date
    };
    ledger.transactions[index] = next;
    await writeLedgerData(ledger);
    return clone(next);
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
    return clone(sortTransactions(
      ledger.transactions.filter(tx => tx.date >= startDate && tx.date <= endDate)
    ));
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
  addTransaction,
  deleteTransaction,
  clearTransactions,
  getTransactionById,
  updateTransaction,
  getTransactionsByDateRange,
  getTransactionsByMonth,
  getMonthlyStats,
  getStorageInfo
};
