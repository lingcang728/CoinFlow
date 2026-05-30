// CoinFlow Excel 导入导出模块
// 深度适配凌苍原有的 "2026年账单 .xlsx" 格式

// 凌苍账单的列索引定义 (0-indexed)
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

/**
 * 导入 Excel 账单主函数
 * @param {File} file 用户上传的 Excel 文件
 * @param {number} defaultYear 默认年份，如 2026
 * @returns {Promise<{successCount: number, sheetsCount: number}>}
 */
function importFromExcel(file, defaultYear = 2026) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    // 尝试从文件名中提取 4 位数字作为年份
    let year = defaultYear;
    const yearMatch = file.name.match(/\d{4}/);
    if (yearMatch) {
      year = parseInt(yearMatch[0]);
    }

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        let totalImported = 0;
        let sheetsProcessed = 0;
        const allTransactions = [];

        // 遍历所有 Sheet (如 '1月', '2月', ...)
        for (const sheetName of workbook.SheetNames) {
          // 只处理以“月”结尾或纯数字命名的 Sheet，避免读入其他无用 Sheet
          if (!sheetName.includes('月') && isNaN(parseInt(sheetName))) {
            continue;
          }

          const month = parseInt(sheetName);
          if (isNaN(month) || month < 1 || month > 12) continue;

          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;

          sheetsProcessed++;
          
          // 获取 Sheet 的数据范围
          const range = XLSX.utils.decode_range(sheet['!ref']);
          const maxRow = range.e.r; // 最大行索引 (0-indexed)

          // 凌苍账单数据从第 12 行开始 (0-indexed 的 11)
          for (let r = 11; r <= maxRow; r++) {
            // 1. 获取日期 (日)
            const dateCellRef = XLSX.utils.encode_cell({ r, c: EXCEL_MAPPING.dateCol });
            const dateCell = sheet[dateCellRef];
            if (!dateCell || dateCell.v === undefined || dateCell.v === null) {
              continue; // 这一行没有日期，跳过
            }

            const day = parseInt(dateCell.v);
            if (isNaN(day) || day < 1 || day > 31) {
              // 如果日期列不是有效的 1-31 数字，可能是汇总行或空白行，跳过
              continue;
            }

            // 拼接完整日期
            const formattedMonth = String(month).padStart(2, '0');
            const formattedDay = String(day).padStart(2, '0');
            const dateStr = `${year}-${formattedMonth}-${formattedDay}`;

            // 2. 遍历分类，提取金额与备注
            EXCEL_MAPPING.categories.forEach(cat => {
              // 提取金额
              const amtCellRef = XLSX.utils.encode_cell({ r, c: cat.amountCol });
              const amtCell = sheet[amtCellRef];
              if (amtCell && amtCell.v !== undefined && amtCell.v !== null) {
                const amount = parseFloat(amtCell.v);
                if (!isNaN(amount) && amount > 0) {
                  // 提取备注
                  let note = '';
                  if (cat.noteCol !== -1) {
                    const noteCellRef = XLSX.utils.encode_cell({ r, c: cat.noteCol });
                    const noteCell = sheet[noteCellRef];
                    if (noteCell && noteCell.v !== undefined && noteCell.v !== null) {
                      note = String(noteCell.v).trim();
                    }
                  }

                  // 添加到临时列表
                  allTransactions.push({
                    amount: amount,
                    category: cat.key,
                    note: note || cat.name, // 若无具体备注则用分类名代替
                    date: dateStr
                  });
                }
              }
            });
          }
        }

        // 3. 批量写入 IndexedDB
        if (allTransactions.length > 0) {
          for (const tx of allTransactions) {
            await window.CoinFlowDB.addTransaction(tx);
          }
          totalImported = allTransactions.length;
        }

        resolve({ successCount: totalImported, sheetsCount: sheetsProcessed });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 导出特定月份的账单到 Excel
 * @param {number} year 
 * @param {number} month 
 */
async function exportToExcel(year, month) {
  try {
    const stats = await window.CoinFlowDB.getMonthlyStats(year, month);
    const transactions = stats.transactions;

    const formattedMonth = String(month).padStart(2, '0');
    const title = `CoinFlow_${year}年${formattedMonth}月账单`;

    // 1. 创建 Workbook
    const wb = XLSX.utils.book_new();

    // 2. 构建账单明细 Sheet
    const detailData = transactions.map((tx, idx) => {
      const catInfo = window.CoinFlowUtils.CATEGORIES[tx.category] || { name: tx.category };
      return {
        '序号': idx + 1,
        '日期': tx.date,
        '分类': catInfo.name,
        '金额 (元)': tx.amount,
        '备注': tx.note
      };
    });

    const wsDetail = XLSX.utils.json_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, wsDetail, '账单明细');

    // 3. 构建月度汇总 Sheet
    const summaryData = [];
    
    // 总体预算卡片汇总
    summaryData.push({ '指标': '当月总预算(可支配)', '数值': stats.totalBudget });
    summaryData.push({ '指标': '实际总消费', '数值': stats.totalSpent });
    summaryData.push({ '指标': '剩余可用', '数值': stats.remainingBudget });
    summaryData.push({ '指标': '预算使用率 (%)', '数值': stats.progressPercent });
    summaryData.push({}); // 空行

    // 分类明细汇总
    summaryData.push({ '指标': '分类名称', '数值': '分类支出', '分类预算': '分类预算', '分类结余': '分类结余' });
    Object.keys(window.CoinFlowUtils.CATEGORIES).forEach(key => {
      const cat = window.CoinFlowUtils.CATEGORIES[key];
      const spent = stats.categorySpent[key] || 0;
      const budget = stats.categoryBudgets[key] || 0;
      summaryData.push({
        '指标': cat.name,
        '数值': spent,
        '分类预算': budget,
        '分类结余': budget - spent
      });
    });

    const wsSummary = XLSX.utils.json_to_sheet(summaryData, { skipHeader: true });
    XLSX.utils.book_append_sheet(wb, wsSummary, '月度汇总');

    // 4. 保存文件
    XLSX.writeFile(wb, `${title}.xlsx`);
    return true;
  } catch (error) {
    console.error('导出失败:', error);
    throw error;
  }
}

// 暴露 API
window.CoinFlowExcel = {
  importFromExcel,
  exportToExcel
};
