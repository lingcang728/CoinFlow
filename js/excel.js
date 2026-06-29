// CoinFlow Excel 与 CSV 导入导出模块
// 深度适配凌苍原有的 "2026年账单 .xlsx" 格式与支付宝 CSV 格式

// 凌苍账单的列索引定义 (0-indexed) - 对应原有的导入格式
const EXCEL_MAPPING = {
  dateCol: 8, // I列: 日期(日)
  categories: [
    { key: 'food', name: '饮食', noteCol: 9, amountCol: 10 },        // J列备注, K列金额
    { key: 'housing', name: '宿舍生活', noteCol: 11, amountCol: 12 }, // L列备注, M列金额
    { key: 'drinks', name: '奶茶零食', noteCol: 13, amountCol: 14 }, // N列备注, O列金额
    { key: 'transport', name: '交通', noteCol: 15, amountCol: 16 },  // P列备注, Q列金额
    { key: 'entertainment', name: '娱乐', noteCol: -1, amountCol: 17 }, // R列直接是金额，无备注
    { key: 'shopping', name: '网购', noteCol: 18, amountCol: 19 }    // S列备注, T列金额
  ]
};

// 预定义样式 (在支持样式的 XLSX 版本下生效)
const excelStyles = {
  title: {
    font: { name: 'Microsoft YaHei', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: 'FF8C00' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  },
  cardLabel: {
    font: { name: 'Microsoft YaHei', sz: 10, bold: true, color: { rgb: '555555' } },
    fill: { fgColor: { rgb: 'F0F0F4' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'DDDDDD' } },
      bottom: { style: 'thin', color: { rgb: 'DDDDDD' } },
      left: { style: 'thin', color: { rgb: 'DDDDDD' } },
      right: { style: 'thin', color: { rgb: 'DDDDDD' } }
    }
  },
  cardValue: {
    font: { name: 'Microsoft YaHei', sz: 10, bold: true, color: { rgb: '111111' } },
    fill: { fgColor: { rgb: 'FAFAFD' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'DDDDDD' } },
      bottom: { style: 'thin', color: { rgb: 'DDDDDD' } },
      left: { style: 'thin', color: { rgb: 'DDDDDD' } },
      right: { style: 'thin', color: { rgb: 'DDDDDD' } }
    }
  },
  sectionHeader: {
    font: { name: 'Microsoft YaHei', sz: 11, bold: true, color: { rgb: 'FF8C00' } },
    alignment: { horizontal: 'left', vertical: 'center' }
  },
  tableHeader: {
    font: { name: 'Microsoft YaHei', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '2D2D3D' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  },
  dataRow: {
    font: { name: 'Microsoft YaHei', sz: 10 },
    alignment: { vertical: 'center' }
  },
  dataNumber: {
    font: { name: 'Microsoft YaHei', sz: 10 },
    alignment: { horizontal: 'right', vertical: 'center' }
  },
  totalRow: {
    font: { name: 'Microsoft YaHei', sz: 10, bold: true },
    fill: { fgColor: { rgb: 'EAEAEA' } },
    alignment: { vertical: 'center' }
  },
  totalNumber: {
    font: { name: 'Microsoft YaHei', sz: 10, bold: true },
    fill: { fgColor: { rgb: 'EAEAEA' } },
    alignment: { horizontal: 'right', vertical: 'center' }
  }
};

const GENERIC_IMPORT_HEADERS = {
  date: ['日期', '消费日期', '交易时间', '记账日期', '时间'],
  category: ['分类', '类别', '消费分类', '消费类别', '分类明细', '交易分类', '账单分类'],
  amount: ['金额', '金额(元)', '消费金额', '消费金额(元)', '支出金额', '实付金额'],
  note: ['备注', '说明', '商品说明', '交易对方', '商户', '账单明细', '明细', '用途'],
  type: ['收/支', '收支', '类型', '交易类型'],
  status: ['交易状态', '状态']
};

function normalizeHeader(value) {
  return String(value || '')
    .replace(/[\s\t\uFEFF]/g, '')
    .replace(/[（(].*?[）)]/g, match => match.includes('元') ? '(元)' : '')
    .toLowerCase();
}

function findColumn(headers, aliases) {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const exactIndex = normalizedHeaders.indexOf(normalizedAlias);
    if (exactIndex !== -1) return exactIndex;
  }
  return -1;
}

function findGenericHeaderRow(rows) {
  const maxScanRows = Math.min(rows.length, 30);
  for (let i = 0; i < maxScanRows; i += 1) {
    const row = rows[i] || [];
    const indices = {
      date: findColumn(row, GENERIC_IMPORT_HEADERS.date),
      category: findColumn(row, GENERIC_IMPORT_HEADERS.category),
      amount: findColumn(row, GENERIC_IMPORT_HEADERS.amount),
      note: findColumn(row, GENERIC_IMPORT_HEADERS.note),
      type: findColumn(row, GENERIC_IMPORT_HEADERS.type),
      status: findColumn(row, GENERIC_IMPORT_HEADERS.status)
    };
    if (indices.date !== -1 && indices.category !== -1 && indices.amount !== -1) {
      return { index: i, indices };
    }
  }
  return null;
}

function parseAmountValue(value) {
  if (typeof value === 'number') return Math.abs(value);
  const text = String(value || '')
    .replace(/[￥¥,\s]/g, '')
    .replace(/[()（）]/g, '-')
    .trim();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  return Math.abs(parseFloat(match[0]));
}

function parseDateValue(value, XLSX) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  if (typeof value === 'number' && XLSX && XLSX.SSF && typeof XLSX.SSF.parse_date_code === 'function') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const text = String(value || '').trim();
  const normalized = text
    .replace(/[年月]/g, '-')
    .replace(/[日号]/g, '')
    .replace(/\//g, '-')
    .split(/\s+/)[0];
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shouldSkipByTypeOrStatus(row, indices) {
  const type = indices.type !== -1 ? String(row[indices.type] || '') : '';
  const status = indices.status !== -1 ? String(row[indices.status] || '') : '';
  if (type && type.includes('收入') && !type.includes('支出')) return true;
  if (status && (status.includes('交易关闭') || status.includes('退款成功') || status.includes('退款中'))) return true;
  return false;
}

async function saveImportedTransactions(rawTransactions) {
  const categoryNames = rawTransactions.map(tx => tx.categoryName);
  const { keysByName, createdCategories, restoredCategories } = await window.CoinFlowCategories.ensureCategoryMap(categoryNames);
  const transactions = rawTransactions.map(tx => {
    const normalizedName = window.CoinFlowCategories.normalizeName(tx.categoryName);
    const categoryKey = keysByName[normalizedName] || 'shopping';
    return {
      amount: tx.amount,
      category: categoryKey,
      note: tx.note || normalizedName,
      date: tx.date
    };
  });
  const saved = await window.CoinFlowDB.addTransactions(transactions);

  return { successCount: saved.length, createdCategories, restoredCategories };
}

function extractGenericTransactionsFromRows(rows, XLSX) {
  const header = findGenericHeaderRow(rows);
  if (!header) return null;

  const transactions = [];
  for (let i = header.index + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (shouldSkipByTypeOrStatus(row, header.indices)) continue;

    const categoryName = window.CoinFlowCategories.normalizeName(row[header.indices.category]);
    const amount = parseAmountValue(row[header.indices.amount]);
    const date = parseDateValue(row[header.indices.date], XLSX);
    if (!categoryName || !date || !Number.isFinite(amount) || amount <= 0) continue;

    const note = header.indices.note !== -1 ? String(row[header.indices.note] || '').trim() : '';
    transactions.push({ amount, categoryName, note, date });
  }

  return transactions;
}

function getReportCategoryEntries(stats) {
  const entries = window.CoinFlowCategories.getCategoryEntries();
  const seen = new Set(entries.map(([key]) => key));
  Object.keys(stats.categorySpent || {}).forEach(key => {
    const spent = stats.categorySpent[key] || 0;
    if (!seen.has(key) && spent > 0) {
      entries.push([key, window.CoinFlowCategories.getCategory(key)]);
      seen.add(key);
    }
  });
  Object.keys(stats.categoryBudgets || {}).forEach(key => {
    const category = window.CoinFlowCategories.getCategory(key);
    if (!seen.has(key) && !category.deleted) {
      entries.push([key, category]);
      seen.add(key);
    }
  });
  return entries.filter(([key, cat]) => {
    const spent = stats.categorySpent[key] || 0;
    const budget = stats.categoryBudgets[key] || 0;
    return !cat.deleted || spent > 0 || budget > 0;
  });
}

/**
 * 导入 Excel 账单主函数
 */
function importFromExcel(file, defaultYear = 2026) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    let year = defaultYear;
    const yearMatch = file.name.match(/\d{4}/);
    if (yearMatch) {
      year = parseInt(yearMatch[0]);
    }

    reader.onload = async (e) => {
      try {
        const XLSX = await window.CoinFlowRuntime.ensureXlsx();
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        let totalImported = 0;
        let sheetsProcessed = 0;
        const allTransactions = [];
        const genericTransactions = [];
        let genericSheetsProcessed = 0;
        let genericMatched = false;

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
          const extracted = extractGenericTransactionsFromRows(rows, XLSX);
          if (extracted !== null) {
            genericMatched = true;
            genericSheetsProcessed += 1;
            genericTransactions.push(...extracted);
          }
        }

        if (genericMatched) {
          const saved = await saveImportedTransactions(genericTransactions);
          resolve({
            successCount: saved.successCount,
            sheetsCount: genericSheetsProcessed,
            importType: 'generic',
            createdCategoryCount: saved.createdCategories.length,
            createdCategories: saved.createdCategories,
            restoredCategoryCount: saved.restoredCategories.length,
            restoredCategories: saved.restoredCategories
          });
          return;
        }

        for (const sheetName of workbook.SheetNames) {
          if (!sheetName.includes('月') && isNaN(parseInt(sheetName))) {
            continue;
          }

          const month = parseInt(sheetName);
          if (isNaN(month) || month < 1 || month > 12) continue;

          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;

          sheetsProcessed++;
          
          const range = XLSX.utils.decode_range(sheet['!ref']);
          const maxRow = range.e.r; 

          for (let r = 11; r <= maxRow; r++) {
            const dateCellRef = XLSX.utils.encode_cell({ r, c: EXCEL_MAPPING.dateCol });
            const dateCell = sheet[dateCellRef];
            if (!dateCell || dateCell.v === undefined || dateCell.v === null) {
              continue; 
            }

            const day = parseInt(dateCell.v);
            if (isNaN(day) || day < 1 || day > 31) {
              continue;
            }

            const formattedMonth = String(month).padStart(2, '0');
            const formattedDay = String(day).padStart(2, '0');
            const dateStr = `${year}-${formattedMonth}-${formattedDay}`;

            EXCEL_MAPPING.categories.forEach(cat => {
              const amtCellRef = XLSX.utils.encode_cell({ r, c: cat.amountCol });
              const amtCell = sheet[amtCellRef];
              if (amtCell && amtCell.v !== undefined && amtCell.v !== null) {
                const amount = parseFloat(amtCell.v);
                if (!isNaN(amount) && amount > 0) {
                  let note = '';
                  if (cat.noteCol !== -1) {
                    const noteCellRef = XLSX.utils.encode_cell({ r, c: cat.noteCol });
                    const noteCell = sheet[noteCellRef];
                    if (noteCell && noteCell.v !== undefined && noteCell.v !== null) {
                      note = String(noteCell.v).trim();
                    }
                  }

                  allTransactions.push({
                    amount: amount,
                    category: cat.key,
                    note: note || cat.name, 
                    date: dateStr
                  });
                }
              }
            });
          }
        }

        if (allTransactions.length > 0) {
          const saved = await window.CoinFlowDB.addTransactions(allTransactions);
          totalImported = saved.length;
        }

        resolve({
          successCount: totalImported,
          sheetsCount: sheetsProcessed,
          importType: 'legacy-excel',
          createdCategoryCount: 0,
          createdCategories: [],
          restoredCategoryCount: 0,
          restoredCategories: []
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 智能解析 CSV 辅助函数
 */
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  lines.forEach(line => {
    if (!line.trim()) return;
    const row = [];
    let inQuotes = false;
    let currentCell = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    
    const cleanedRow = row.map(cell => cell.replace(/^["\s\t\uFEFF]+|["\s\t]+$/g, ''));
    rows.push(cleanedRow);
  });
  return rows;
}

function decodeCSVBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const utf8Text = new TextDecoder('utf-8').decode(bytes);
  const looksUtf8 = hasUtf8Bom || (
    (utf8Text.match(/\uFFFD/g) || []).length === 0 &&
    /交易时间|日期|分类|金额|CoinFlow/.test(utf8Text)
  );
  if (looksUtf8) return utf8Text;

  try {
    return new TextDecoder('gb18030').decode(bytes);
  } catch (_error) {
    return utf8Text;
  }
}

/**
 * 从支付宝 CSV 文件导入账单
 */
function importFromCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = decodeCSVBuffer(e.target.result);
        const rows = parseCSV(text);
        const genericTransactions = extractGenericTransactionsFromRows(rows, null);
        if (genericTransactions !== null) {
          const saved = await saveImportedTransactions(genericTransactions);
          resolve({
            successCount: saved.successCount,
            sheetsCount: 1,
            importType: 'generic',
            createdCategoryCount: saved.createdCategories.length,
            createdCategories: saved.createdCategories,
            restoredCategoryCount: saved.restoredCategories.length,
            restoredCategories: saved.restoredCategories
          });
          return;
        }
        
        let headerIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].includes('交易时间') && (rows[i].includes('金额') || rows[i].includes('金额(元)'))) {
            headerIndex = i;
            break;
          }
        }
        
        if (headerIndex === -1) {
          reject(new Error('未找到支付宝 CSV 账单的有效表头'));
          return;
        }
        
        const headers = rows[headerIndex];
        const colIndices = {
          date: headers.indexOf('交易时间'),
          merchant: headers.indexOf('交易对方'),
          note: headers.indexOf('商品说明'),
          type: headers.indexOf('收/支'),
          amount: headers.indexOf('金额') !== -1 ? headers.indexOf('金额') : headers.indexOf('金额(元)'),
          status: headers.indexOf('交易状态')
        };
        
        if (colIndices.date === -1 || colIndices.amount === -1) {
          reject(new Error('CSV 缺少必要的列 (交易时间 或 金额)'));
          return;
        }
        
        const allTransactions = [];
        const keywords = {
          food: ['美团', '饿了么', '外卖', '餐', '食', '麦当劳', '肯德基', '饭', '面', '粥', '菜', '饭堂'],
          transport: ['滴滴', '高德', '打车', '地铁', '公交', '出行', '铁路', '12306', '骑行', '单车'],
          drinks: ['茶', '咖啡', '蜜雪', '瑞幸', '星巴克', '奶茶', '零食', '果汁', 'coco', '甜品'],
          shopping: ['淘宝', '天猫', '京东', '拼多多', '闲鱼', '1688', '网购', '快递'],
          entertainment: ['游戏', '网易', '腾讯', '充值', '电影', '视频', '音乐', '爱奇艺', 'bilibili'],
          housing: ['电费', '水费', '网费', '话费', '日用', '超市', '便利店'],
          social: ['红包', '转账', '聚餐', '礼物', '请客'],
          study: ['书', '文具', '教育', '课程', '考试', '打印']
        };
        
        for (let i = headerIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length < headers.length) continue;
          
          const type = colIndices.type !== -1 ? row[colIndices.type] : '';
          const status = colIndices.status !== -1 ? row[colIndices.status] : '';
          
          if (type && type !== '支出') continue;
          if (status && (status.includes('交易关闭') || status.includes('退款成功') || status.includes('退款中'))) continue;
          
          const rawAmount = row[colIndices.amount];
          const amount = parseFloat(rawAmount);
          if (isNaN(amount) || amount <= 0) continue;
          
          const rawDate = row[colIndices.date];
          if (!rawDate) continue;
          const date = rawDate.split(' ')[0]; // 提取 YYYY-MM-DD
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          
          const merchant = colIndices.merchant !== -1 ? row[colIndices.merchant] : '';
          const note = colIndices.note !== -1 ? row[colIndices.note] : '';
          
          let matchedCategory = 'shopping';
          let found = false;
          const searchStr = (merchant + ' ' + note).toLowerCase();
          
          for (const [catKey, catKeywords] of Object.entries(keywords)) {
            for (const kw of catKeywords) {
              if (searchStr.includes(kw.toLowerCase())) {
                matchedCategory = catKey;
                found = true;
                break;
              }
            }
            if (found) break;
          }
          
          allTransactions.push({
            amount: amount,
            category: matchedCategory,
            note: note || merchant || window.CoinFlowCategories.getCategory(matchedCategory).name,
            date: date
          });
        }
        
        let successCount = 0;
        if (allTransactions.length > 0) {
          const saved = await window.CoinFlowDB.addTransactions(allTransactions);
          successCount = saved.length;
        }
        
        resolve({
          successCount,
          sheetsCount: 1,
          importType: 'alipay-csv',
          createdCategoryCount: 0,
          createdCategories: [],
          restoredCategoryCount: 0,
          restoredCategories: []
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('CSV 读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

function autoFitColumns(sheet) {
  if (!sheet || !sheet['!ref'] || !window.XLSX) return;

  const range = window.XLSX.utils.decode_range(sheet['!ref']);
  const widths = [];

  for (let c = range.s.c; c <= range.e.c; c++) {
    let maxChars = 8;
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cellRef = window.XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellRef];
      if (!cell || cell.v === undefined || cell.v === null) continue;

      const value = String(cell.w || cell.v);
      const wideChars = (value.match(/[^\x00-\xff]/g) || []).length;
      const width = value.length + wideChars;
      maxChars = Math.max(maxChars, width);
    }
    widths[c] = { wch: Math.min(Math.max(maxChars + 2, 10), 36) };
  }

  sheet['!cols'] = widths;
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (text.includes(',') || text.includes('\n') || text.includes('"')) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * 导出 CSV 账单
 */
async function exportToCSV(year, month) {
  try {
    const stats = await window.CoinFlowDB.getMonthlyStats(year, month);
    const transactions = stats.transactions;
    const formattedMonth = String(month).padStart(2, '0');
    const title = `CoinFlow_${year}年${formattedMonth}月账单`;
    
    let csvContent = '\ufeff'; 
    csvContent += '序号,日期,分类,金额(元),备注\n';
    
    transactions.forEach((tx, idx) => {
      const catInfo = window.CoinFlowCategories.getCategory(tx.category);
      const row = [
        idx + 1,
        tx.date,
        catInfo.name,
        tx.amount.toFixed(2),
        tx.note || ''
      ];
      csvContent += `${row.map(csvCell).join(',')}\n`;
    });
    
    const result = await window.CoinFlowRuntime.saveFile({
      defaultPath: `${title}.csv`,
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
      data: csvContent,
      encoding: 'utf8',
      mimeType: 'text/csv;charset=utf-8;'
    });
    return !result.canceled;
  } catch (error) {
    console.error('导出 CSV 失败:', error);
    throw error;
  }
}

/**
 * 导出精美排版 Excel 报表
 */
async function exportToExcel(year, month) {
  try {
    const XLSX = await window.CoinFlowRuntime.ensureXlsx();
    const stats = await window.CoinFlowDB.getMonthlyStats(year, month);
    const budgetConfig = await window.CoinFlowDB.getBudgetConfig();
    const transactions = stats.transactions;
    const reportCategoryEntries = getReportCategoryEntries(stats);

    const formattedMonth = String(month).padStart(2, '0');
    const title = `CoinFlow_${year}年${formattedMonth}月账单`;

    const wb = XLSX.utils.book_new();

    // ----------------------------------------------------
    // Sheet 1: 月度总览
    // ----------------------------------------------------
    const summaryRows = [
      [`${year}年${formattedMonth}月 CoinFlow 记账月度报告`],
      [],
      ['月度收支与预算概览'],
      ['本月生活费(收入)', budgetConfig.monthlyIncome, '储蓄目标额', budgetConfig.savingsTarget, '可用总预算(可支配)', stats.totalBudget],
      ['本月实际支出', stats.totalSpent, '剩余预算结余', stats.remainingBudget, '预算使用率', (stats.progressPercent / 100)],
      [],
      ['各消费分类汇总统计'],
      ['分类名称', '分类图标', '实际支出(元)', '分类预算(元)', '预算结余(元)', '支出占比']
    ];

    // 添加分类汇总数据
    reportCategoryEntries.forEach(([key, cat]) => {
      const spent = stats.categorySpent[key] || 0;
      const budget = stats.categoryBudgets[key] || 0;
      const balance = budget - spent;
      const percent = stats.totalSpent > 0 ? (spent / stats.totalSpent) : 0;
      summaryRows.push([
        cat.name,
        cat.emoji,
        spent,
        budget,
        balance,
        percent
      ]);
    });

    // 加上总计行
    summaryRows.push([
      '合计',
      '',
      stats.totalSpent,
      Object.values(stats.categoryBudgets).reduce((a, b) => a + b, 0),
      Object.values(stats.categoryBudgets).reduce((a, b) => a + b, 0) - stats.totalSpent,
      stats.totalSpent > 0 ? 1 : 0
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    
    // 合并标题行
    wsSummary['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } } // A1:F1
    ];

    // 格式化单元格 & 样式
    // A1 Title
    if (wsSummary['A1']) wsSummary['A1'].s = excelStyles.title;

    // A3 section
    if (wsSummary['A3']) wsSummary['A3'].s = excelStyles.sectionHeader;
    
    // 卡片网格格式化 (A4:F5)
    for (let c = 0; c < 6; c++) {
      const labelCell = wsSummary[XLSX.utils.encode_cell({ r: 3, c })];
      const valueCell = wsSummary[XLSX.utils.encode_cell({ r: 4, c })];
      if (labelCell) labelCell.s = excelStyles.cardLabel;
      if (valueCell) {
        valueCell.s = excelStyles.cardValue;
        if (c < 5) {
          valueCell.t = 'n';
          valueCell.z = '"¥"#,##0.00';
        } else {
          valueCell.t = 'n';
          valueCell.z = '0.0%';
        }
      }
    }

    // A7 section
    if (wsSummary['A7']) wsSummary['A7'].s = excelStyles.sectionHeader;

    // 表头 A8:F8 (0-indexed 是 r:7)
    for (let c = 0; c < 6; c++) {
      const headerCell = wsSummary[XLSX.utils.encode_cell({ r: 7, c })];
      if (headerCell) headerCell.s = excelStyles.tableHeader;
    }

    const summaryDataStartRow = 8;
    const summaryTotalRow = summaryDataStartRow + reportCategoryEntries.length;

    // 数据行和合计行会随动态分类数量变化
    for (let r = summaryDataStartRow; r < summaryTotalRow; r++) {
      for (let c = 0; c < 6; c++) {
        const cell = wsSummary[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        if (c === 0 || c === 1) {
          cell.s = excelStyles.dataRow;
        } else if (c >= 2 && c <= 4) {
          cell.s = excelStyles.dataNumber;
          cell.t = 'n';
          cell.z = '"¥"#,##0.00';
          // 条件格式：结余为负数则显红，正数显绿
          if (c === 4) {
            if (cell.v < 0) {
              cell.s = { ...excelStyles.dataNumber, font: { ...excelStyles.dataNumber.font, color: { rgb: 'FF3B30' } } };
            } else if (cell.v > 0) {
              cell.s = { ...excelStyles.dataNumber, font: { ...excelStyles.dataNumber.font, color: { rgb: '34C759' } } };
            }
          }
        } else if (c === 5) {
          cell.s = excelStyles.dataNumber;
          cell.t = 'n';
          cell.z = '0.0%';
        }
      }
    }

    // 合计行样式
    for (let c = 0; c < 6; c++) {
      const cell = wsSummary[XLSX.utils.encode_cell({ r: summaryTotalRow, c })];
      if (!cell) continue;
      if (c < 2) {
        cell.s = excelStyles.totalRow;
      } else if (c >= 2 && c <= 4) {
        cell.s = excelStyles.totalNumber;
        cell.t = 'n';
        cell.z = '"¥"#,##0.00';
      } else if (c === 5) {
        cell.s = excelStyles.totalNumber;
        cell.t = 'n';
        cell.z = '0.0%';
      }
    }

    autoFitColumns(wsSummary);
    XLSX.utils.book_append_sheet(wb, wsSummary, '月度总览');

    // ----------------------------------------------------
    // Sheet 2: 分类明细
    // ----------------------------------------------------
    const categoryRows = [];
    const catGroups = {};
    
    // 初始化分组
    reportCategoryEntries.forEach(([k]) => {
      catGroups[k] = [];
    });
    
    transactions.forEach(tx => {
      if (!catGroups[tx.category]) {
        catGroups[tx.category] = [];
      }
      catGroups[tx.category].push(tx);
    });

    let currentR = 0;
    const mergeRanges = [];
    const tableHeaderRows = [];
    const sectionHeaderRows = [];

    Object.keys(catGroups).forEach(key => {
      const txs = catGroups[key];
      if (txs.length === 0) return; // 只列出有交易的分类
      
      const cat = window.CoinFlowCategories.getCategory(key);
      const spent = txs.reduce((sum, item) => sum + item.amount, 0);

      // 分类区块头
      sectionHeaderRows.push(currentR);
      categoryRows.push([`${cat.emoji} ${cat.name}明细统计 (共 ${txs.length} 笔, 合计: ¥${spent.toFixed(2)})`]);
      mergeRanges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 3 } });
      currentR++;

      // 表头
      tableHeaderRows.push(currentR);
      categoryRows.push(['序号', '日期', '消费金额(元)', '备注说明']);
      currentR++;

      // 数据行
      txs.forEach((tx, idx) => {
        categoryRows.push([
          idx + 1,
          tx.date,
          tx.amount,
          tx.note
        ]);
        currentR++;
      });

      // 间隔空行
      categoryRows.push([]);
      categoryRows.push([]);
      currentR += 2;
    });

    if (categoryRows.length === 0) {
      categoryRows.push(['本月无任何记账记录']);
    }

    const wsCategory = XLSX.utils.aoa_to_sheet(categoryRows);
    wsCategory['!merges'] = mergeRanges;

    // 应用样式到分类明细
    const catRange = wsCategory['!ref'] ? XLSX.utils.decode_range(wsCategory['!ref']) : null;
    if (catRange) {
      for (let r = catRange.s.r; r <= catRange.e.r; r++) {
        if (sectionHeaderRows.includes(r)) {
          const cell = wsCategory[XLSX.utils.encode_cell({ r, c: 0 })];
          if (cell) cell.s = excelStyles.sectionHeader;
        } else if (tableHeaderRows.includes(r)) {
          for (let c = 0; c < 4; c++) {
            const cell = wsCategory[XLSX.utils.encode_cell({ r, c })];
            if (cell) cell.s = excelStyles.tableHeader;
          }
        } else {
          // 普通数据行样式
          const numCell = wsCategory[XLSX.utils.encode_cell({ r, c: 2 })];
          if (numCell && numCell.v !== undefined && !isNaN(parseFloat(numCell.v))) {
            numCell.t = 'n';
            numCell.z = '"¥"#,##0.00';
            numCell.s = excelStyles.dataNumber;
            
            const cell0 = wsCategory[XLSX.utils.encode_cell({ r, c: 0 })];
            const cell1 = wsCategory[XLSX.utils.encode_cell({ r, c: 1 })];
            const cell3 = wsCategory[XLSX.utils.encode_cell({ r, c: 3 })];
            if (cell0) cell0.s = excelStyles.dataRow;
            if (cell1) cell1.s = excelStyles.dataRow;
            if (cell3) cell3.s = excelStyles.dataRow;
          }
        }
      }
    }

    autoFitColumns(wsCategory);
    XLSX.utils.book_append_sheet(wb, wsCategory, '分类明细');

    // ----------------------------------------------------
    // Sheet 3: 逐日明细
    // ----------------------------------------------------
    const detailData = transactions.map((tx, idx) => {
      const catInfo = window.CoinFlowCategories.getCategory(tx.category);
      return [
        idx + 1,
        tx.date,
        catInfo.name,
        tx.amount,
        tx.note
      ];
    });

    const detailHeaders = ['序号', '日期', '消费分类', '金额 (元)', '备注'];
    const detailRows = [
      [`${year}年${formattedMonth}月 账单记账流水清单`],
      [],
      detailHeaders,
      ...detailData,
      ['合计', '', '', stats.totalSpent, '']
    ];

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsDetail['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }
    ];

    if (wsDetail['A1']) wsDetail['A1'].s = excelStyles.title;

    // 表头样式 (r:2)
    for (let c = 0; c < 5; c++) {
      const cell = wsDetail[XLSX.utils.encode_cell({ r: 2, c })];
      if (cell) cell.s = excelStyles.tableHeader;
    }

    // 数据行样式
    for (let r = 3; r < 3 + detailData.length; r++) {
      // 隔行变色
      const rowBg = r % 2 === 0 ? 'F9F9FB' : 'FFFFFF';
      const cellStyle = { ...excelStyles.dataRow, fill: { fgColor: { rgb: rowBg } } };
      const numStyle = { ...excelStyles.dataNumber, fill: { fgColor: { rgb: rowBg } } };

      for (let c = 0; c < 5; c++) {
        const cell = wsDetail[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        if (c === 3) {
          cell.s = numStyle;
          cell.t = 'n';
          cell.z = '"¥"#,##0.00';
        } else {
          cell.s = cellStyle;
        }
      }
    }

    // 合计行样式 (最后一行)
    const totalR = 3 + detailData.length;
    for (let c = 0; c < 5; c++) {
      const cell = wsDetail[XLSX.utils.encode_cell({ r: totalR, c })];
      if (!cell) continue;
      if (c === 3) {
        cell.s = excelStyles.totalNumber;
        cell.t = 'n';
        cell.z = '"¥"#,##0.00';
      } else {
        cell.s = excelStyles.totalRow;
      }
    }

    autoFitColumns(wsDetail);
    XLSX.utils.book_append_sheet(wb, wsDetail, '逐日明细');

    // 4. 保存文件
    const workbookData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const result = await window.CoinFlowRuntime.saveFile({
      defaultPath: `${title}.xlsx`,
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      data: workbookData,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    return !result.canceled;
  } catch (error) {
    console.error('导出 Excel 失败:', error);
    throw error;
  }
}

// 暴露 API
window.CoinFlowExcel = {
  importFromExcel,
  importFromCSV,
  exportToCSV,
  exportToExcel
};
