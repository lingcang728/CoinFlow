// IndexedDB 数据管理层 - CoinFlow
const DB_NAME = 'CoinFlowDB';
const DB_VERSION = 1;

// 初始化数据库
let dbPromise = null;

function getDB() {
  if (!window.idb || typeof window.idb.openDB !== 'function') {
    throw new Error('IndexedDB helper library is not loaded');
  }

  if (!dbPromise) {
    dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 创建交易记录 store，设置 id 为主键自增
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('category', 'category', { unique: false });
        }
        // 创建预算配置 store，以固定 key 作为主键
        if (!db.objectStoreNames.contains('budget')) {
          db.createObjectStore('budget');
        }
      }
    });
  }
  return dbPromise;
}

// 默认智能建议预算配置
const DEFAULT_BUDGET = {
  monthlyIncome: 3000,
  savingsTarget: 1000,
  categoryBudgets: {
    food: 800,
    drinks: 200,
    transport: 100,
    shopping: 300,
    entertainment: 150,
    housing: 200,
    social: 150,
    study: 100
  },
  lastResetMonth: ""
};

/**
 * 获取预算配置
 */
async function getBudgetConfig() {
  const db = await getDB();
  const config = await db.get('budget', 'current');
  return config || { ...DEFAULT_BUDGET };
}

/**
 * 保存预算配置
 */
async function saveBudgetConfig(config) {
  const db = await getDB();
  await db.put('budget', config, 'current');
  return config;
}

/**
 * 添加交易记录
 */
async function addTransaction(tx) {
  const db = await getDB();
  const transaction = {
    amount: parseFloat(tx.amount),
    category: tx.category,
    note: tx.note || '',
    date: tx.date, // 格式: "YYYY-MM-DD"
    createdAt: Date.now()
  };
  const id = await db.add('transactions', transaction);
  return { id, ...transaction };
}

/**
 * 删除交易记录
 */
async function deleteTransaction(id) {
  const db = await getDB();
  await db.delete('transactions', parseInt(id));
  return true;
}

/**
 * 通过主键获取单笔交易记录
 */
async function getTransactionById(id) {
  const db = await getDB();
  return db.get('transactions', parseInt(id));
}

/**
 * 更新交易记录
 */
async function updateTransaction(id, updatedData) {
  const db = await getDB();
  const tx = await db.get('transactions', parseInt(id));
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

/**
 * 获取特定日期范围内的交易记录
 */
async function getTransactionsByDateRange(startDate, endDate) {
  const db = await getDB();
  const txs = await db.getAllFromIndex('transactions', 'date', IDBKeyRange.bound(startDate, endDate));
  // 按照日期和创建时间降序排列 (最新在最前)
  return txs.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.createdAt - a.createdAt;
  });
}

/**
 * 获取某年某月的交易记录
 */
async function getTransactionsByMonth(year, month) {
  // 补充月份前导零
  const formattedMonth = String(month).padStart(2, '0');
  const startDate = `${year}-${formattedMonth}-01`;
  
  // 动态计算当月的实际最后一天，避免小月产生 Invalid Date 隐患
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${formattedMonth}-${String(lastDay).padStart(2, '0')}`;
  
  return getTransactionsByDateRange(startDate, endDate);
}

/**
 * 计算某月的度总账目与预算占比统计
 */
async function getMonthlyStats(year, month) {
  const formattedMonth = String(month).padStart(2, '0');
  const startDate = `${year}-${formattedMonth}-01`;
  
  // 计算当月最后一天
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${formattedMonth}-${String(lastDay).padStart(2, '0')}`;

  const transactions = await getTransactionsByDateRange(startDate, endDate);
  const budgetConfig = await getBudgetConfig();

  // 1. 各项求和
  let totalSpent = 0;
  const categorySpent = {
    food: 0,
    drinks: 0,
    transport: 0,
    shopping: 0,
    entertainment: 0,
    housing: 0,
    social: 0,
    study: 0
  };

  transactions.forEach(tx => {
    totalSpent += tx.amount;
    if (categorySpent[tx.category] !== undefined) {
      categorySpent[tx.category] += tx.amount;
    }
  });

  // 2. 总预算计算
  let totalCategoryBudget = 0;
  Object.values(budgetConfig.categoryBudgets).forEach(b => {
    totalCategoryBudget += b;
  });

  // 总预算由月收入减去储蓄目标决定，如无此项则为各子分类之和
  const totalBudget = budgetConfig.monthlyIncome - budgetConfig.savingsTarget;

  return {
    year,
    month: formattedMonth,
    totalSpent: parseFloat(totalSpent.toFixed(2)),
    totalBudget: parseFloat(totalBudget.toFixed(2)),
    remainingBudget: parseFloat((totalBudget - totalSpent).toFixed(2)),
    progressPercent: totalBudget > 0 ? parseFloat(((totalSpent / totalBudget) * 100).toFixed(1)) : 0,
    categoryBudgets: budgetConfig.categoryBudgets,
    categorySpent: categorySpent,
    transactions: transactions
  };
}

// 暴露 API
window.CoinFlowDB = {
  getBudgetConfig,
  saveBudgetConfig,
  addTransaction,
  deleteTransaction,
  getTransactionById,
  updateTransaction,
  getTransactionsByDateRange,
  getTransactionsByMonth,
  getMonthlyStats
};
