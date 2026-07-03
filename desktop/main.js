const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

const APP_SCHEME = 'coinflow';
const { IS_SMOKE_TEST, setupSmokeEnvironment, runSmokeTest } = require('./smoke');

setupSmokeEnvironment();
app.setName('CoinFlow');
// 真实账本不再放在 Electron/Chromium profile 中。
// 渲染层通过 coinflow:ledger-* IPC 读写 Documents\CoinFlow\Ledger\coinflow-ledger.json；
// userData 只保留窗口状态、WebView 缓存、旧 IndexedDB 迁移源等非权威数据。

let activeMainWindow = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true
    }
  }
]);

function resolveAppFile(requestUrl) {
  const appRoot = app.getAppPath();
  const parsedUrl = new URL(requestUrl);
  const pathname = decodeURIComponent(parsedUrl.pathname || '/index.html');
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const targetPath = path.normalize(path.join(appRoot, relativePath));
  const rootWithSeparator = appRoot.endsWith(path.sep) ? appRoot : `${appRoot}${path.sep}`;

  if (targetPath !== appRoot && !targetPath.startsWith(rootWithSeparator)) {
    return null;
  }

  return targetPath;
}

async function registerLocalProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const targetPath = resolveAppFile(request.url);

    if (!targetPath) {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(targetPath).toString());
  });
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 720,
    minWidth: 1180,
    minHeight: 720,
    title: 'CoinFlow',
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'assets', 'icons', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true
    }
  });

  // 仅冒烟测试收集渲染进程的告警/报错用于断言；正式运行不做收集，避免长期驻留的数组无限增长。
  mainWindow.__coinflowRendererMessages = [];
  if (IS_SMOKE_TEST) {
    mainWindow.webContents.on('console-message', (event, legacyLevel, legacyMessage, legacyLine, legacySourceId) => {
      // Electron 新版事件对象携带字符串 level（'warning'/'error'），旧版是位置参数的数字 level（2/3）。
      const level = event && typeof event.level === 'string' ? event.level : legacyLevel;
      const isProblem = level === 'warning' || level === 'error' ||
        (typeof level === 'number' && level >= 2);
      if (!isProblem) return;
      if (mainWindow.__coinflowRendererMessages.length >= 500) return;
      mainWindow.__coinflowRendererMessages.push({
        level,
        message: event && event.message !== undefined ? event.message : legacyMessage,
        line: event && event.lineNumber !== undefined ? event.lineNumber : legacyLine,
        sourceId: event && event.sourceId !== undefined ? event.sourceId : legacySourceId
      });
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`${APP_SCHEME}://app/index.html`);
  activeMainWindow = mainWindow;
  mainWindow.on('closed', () => {
    if (activeMainWindow === mainWindow) {
      activeMainWindow = null;
    }
  });
  return mainWindow;
}

function normalizeSaveData(data, encoding = 'utf8') {
  if (typeof data === 'string') {
    return Buffer.from(data, encoding);
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  if (data && data.type === 'Buffer' && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }

  if (Array.isArray(data)) {
    return Buffer.from(data);
  }

  throw new Error('Unsupported file payload');
}

function registerIpcHandlers() {
  ipcMain.handle('coinflow:ledger-read', async () => {
    return readLedgerFile();
  });

  ipcMain.handle('coinflow:ledger-write', async (_event, payload = {}) => {
    return writeLedgerFile(payload);
  });

  ipcMain.handle('coinflow:ledger-path', () => getLedgerPaths());

  ipcMain.handle('coinflow:save-file', async (event, payload = {}) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const defaultPath = String(payload.defaultPath || 'CoinFlow-export.dat');
    const filters = Array.isArray(payload.filters) ? payload.filters : [{ name: 'All Files', extensions: ['*'] }];
    const buffer = normalizeSaveData(payload.data, payload.encoding);

    if (IS_SMOKE_TEST) {
      const exportDir = process.env.COINFLOW_SMOKE_EXPORT_DIR || path.join(os.tmpdir(), 'coinflow-smoke-exports');
      await fs.promises.mkdir(exportDir, { recursive: true });
      const safeName = path.basename(defaultPath).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
      const filePath = path.join(exportDir, safeName || 'CoinFlow-export.dat');
      await fs.promises.writeFile(filePath, buffer);
      return { canceled: false, filePath };
    }

    const result = await dialog.showSaveDialog(ownerWindow, {
      title: '保存 CoinFlow 导出文件',
      defaultPath,
      filters
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.promises.writeFile(result.filePath, buffer);
    return { canceled: false, filePath: result.filePath };
  });

  // 应用信息（版本号等），供「关于」面板显示
  ipcMain.handle('coinflow:get-app-info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    ledgerPath: getLedgerPaths().ledgerPath
  }));

  // 手动「检查更新」。开发态（未打包）直接返回提示，避免 electron-updater 抛错。
  ipcMain.handle('coinflow:check-update', async () => {
    if (!app.isPackaged) {
      return { state: 'dev' };
    }
    try {
      await withTimeout(
        autoUpdater.checkForUpdates(),
        30000,
        '检查更新超时，请稍后重试'
      );
      return { state: 'checking' };
    } catch (error) {
      const message = describeUpdateError(error);
      sendUpdateStatus({ state: 'error', message });
      return { state: 'error', message };
    }
  });

  // 下载完成后由渲染层触发：退出并安装新版本
  ipcMain.handle('coinflow:quit-and-install', () => {
    if (!app.isPackaged) {
      return { ok: false, reason: 'dev' };
    }
    setImmediate(() => autoUpdater.quitAndInstall());
    return { ok: true };
  });
}

function getLedgerPaths() {
  const ledgerDir = process.env.COINFLOW_LEDGER_DIR || (
    IS_SMOKE_TEST
      ? path.join(app.getPath('userData'), 'Ledger')
      : path.join(app.getPath('documents'), 'CoinFlow', 'Ledger')
  );

  return {
    ledgerDir,
    ledgerPath: path.join(ledgerDir, 'coinflow-ledger.json'),
    backupPath: path.join(ledgerDir, 'coinflow-ledger.json.bak'),
    tempPath: path.join(ledgerDir, 'coinflow-ledger.json.tmp'),
    backupDir: path.join(ledgerDir, 'Backups')
  };
}

const DAILY_BACKUP_KEEP = 14;

function formatStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// 每天第一次成功写入后，把账本快照复制到 Backups\，最多保留最近 DAILY_BACKUP_KEEP 天。
// 这样即使主文件和 .bak 同时出问题，仍有最近两周的每日快照可回溯。
async function rotateDailyBackup(paths) {
  try {
    const day = formatStamp().slice(0, 8);
    const dailyPath = path.join(paths.backupDir, `coinflow-ledger-${day}.json`);
    if (fs.existsSync(dailyPath)) return;

    await fs.promises.mkdir(paths.backupDir, { recursive: true });
    await fs.promises.copyFile(paths.ledgerPath, dailyPath);

    const entries = await fs.promises.readdir(paths.backupDir);
    const dailyBackups = entries
      .filter(name => /^coinflow-ledger-\d{8}\.json$/.test(name))
      .sort();
    for (const name of dailyBackups.slice(0, Math.max(0, dailyBackups.length - DAILY_BACKUP_KEEP))) {
      await removeIfExists(path.join(paths.backupDir, name));
    }
  } catch (error) {
    console.warn('[Ledger] Daily backup rotation failed:', error);
  }
}

// 无法解析的账本文件先原样隔离保存，绝不允许后续写入把「唯一的现场」覆盖掉。
async function quarantineCorruptFile(filePath, paths) {
  try {
    if (!fs.existsSync(filePath)) return null;
    await fs.promises.mkdir(paths.backupDir, { recursive: true });
    const target = path.join(paths.backupDir, `${path.basename(filePath)}.corrupt-${formatStamp()}`);
    await fs.promises.copyFile(filePath, target);
    return target;
  } catch (error) {
    console.warn('[Ledger] Failed to quarantine corrupt ledger:', error);
    return null;
  }
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

async function readLedgerFile() {
  const paths = getLedgerPaths();
  await fs.promises.mkdir(paths.ledgerDir, { recursive: true });

  if (!fs.existsSync(paths.ledgerPath)) {
    return {
      exists: false,
      ledgerPath: paths.ledgerPath,
      ledgerDir: paths.ledgerDir,
      data: emptyLedger()
    };
  }

  try {
    const data = await readJsonFile(paths.ledgerPath);
    lastPersistedTxCount = Array.isArray(data && data.transactions) ? data.transactions.length : 0;
    return {
      exists: true,
      ledgerPath: paths.ledgerPath,
      ledgerDir: paths.ledgerDir,
      data
    };
  } catch (error) {
    console.error('[Ledger] Failed to read primary ledger:', error);
    await quarantineCorruptFile(paths.ledgerPath, paths);
  }

  if (fs.existsSync(paths.backupPath)) {
    try {
      const backupData = await readJsonFile(paths.backupPath);
      await fs.promises.copyFile(paths.backupPath, paths.ledgerPath);
      lastPersistedTxCount = Array.isArray(backupData && backupData.transactions) ? backupData.transactions.length : 0;
      return {
        exists: true,
        recovered: true,
        warning: '主账本文件损坏，已从备份恢复',
        ledgerPath: paths.ledgerPath,
        ledgerDir: paths.ledgerDir,
        data: backupData
      };
    } catch (backupError) {
      console.error('[Ledger] Failed to recover from backup ledger:', backupError);
      await quarantineCorruptFile(paths.backupPath, paths);
    }
  }

  return {
    exists: true,
    recoveryFailed: true,
    warning: '账本文件损坏且备份不可用，已临时载入空账本（损坏文件已隔离保存在 Backups 目录）',
    ledgerPath: paths.ledgerPath,
    ledgerDir: paths.ledgerDir,
    data: emptyLedger()
  };
}

// 最近一次成功持久化的交易条数，用于识别「疑似误删」的大幅缩水写入。
let lastPersistedTxCount = null;
// 主进程内串行化所有账本写入，避免两个并发写共用同一个 .tmp 文件互相踩踏。
let ledgerFileWriteChain = Promise.resolve();

function writeLedgerFile(payload = {}) {
  const queued = ledgerFileWriteChain.then(() => writeLedgerFileNow(payload));
  ledgerFileWriteChain = queued.catch(() => {});
  return queued;
}

async function writeLedgerFileNow(payload = {}) {
  const paths = getLedgerPaths();
  try {
    await fs.promises.mkdir(paths.ledgerDir, { recursive: true });

    const data = {
      ...emptyLedger(),
      ...payload,
      schemaVersion: 1,
      app: 'CoinFlow',
      storage: 'documents-ledger-json',
      updatedAt: new Date().toISOString()
    };
    data.transactions = Array.isArray(data.transactions) ? data.transactions : [];
    data.categories = Array.isArray(data.categories) ? data.categories : [];

    // 缩水保护：一次写入若让交易数掉到原来的一半以下（且原来至少有 20 条），
    // 先把当前磁盘上的账本原样快照到 Backups\，再继续写。清空账本等合法操作不受阻，
    // 但任何「误清空 / 异常状态覆盖」都留有完整可恢复的现场。
    const nextCount = data.transactions.length;
    if (
      typeof lastPersistedTxCount === 'number' &&
      lastPersistedTxCount >= 20 &&
      nextCount < lastPersistedTxCount / 2 &&
      fs.existsSync(paths.ledgerPath)
    ) {
      try {
        await fs.promises.mkdir(paths.backupDir, { recursive: true });
        const snapshotPath = path.join(paths.backupDir, `coinflow-ledger.pre-shrink-${formatStamp()}.json`);
        await fs.promises.copyFile(paths.ledgerPath, snapshotPath);
        console.warn(`[Ledger] Transaction count shrinking ${lastPersistedTxCount} -> ${nextCount}; snapshot saved to ${snapshotPath}`);
      } catch (snapshotError) {
        console.warn('[Ledger] Failed to write pre-shrink snapshot:', snapshotError);
      }
    }

    const json = `${JSON.stringify(data, null, 2)}\n`;
    await fs.promises.writeFile(paths.tempPath, json, 'utf8');
    JSON.parse(await fs.promises.readFile(paths.tempPath, 'utf8'));

    if (fs.existsSync(paths.ledgerPath)) {
      await fs.promises.copyFile(paths.ledgerPath, paths.backupPath);
    }

    await fs.promises.rename(paths.tempPath, paths.ledgerPath);
    lastPersistedTxCount = nextCount;
    await rotateDailyBackup(paths);
    return {
      ok: true,
      ledgerPath: paths.ledgerPath,
      backupPath: fs.existsSync(paths.backupPath) ? paths.backupPath : null,
      bytes: Buffer.byteLength(json, 'utf8')
    };
  } catch (error) {
    await removeIfExists(paths.tempPath);
    const detail = error && error.message ? error.message : String(error);
    throw new Error(`账本写入失败：${detail}`);
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
}

async function removeIfExists(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      console.warn('[Ledger] Failed to remove temp file:', error);
    }
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

// 把 electron-updater 抛出的原始错误（含堆栈、COS XML、request-id）归一成
// 一句简短、家人也看得懂的中文提示，避免把整段技术细节暴露到「关于」面板。
function describeUpdateError(error) {
  const statusCode = error && error.statusCode;
  const rawMessage = (error && error.message) || String(error || '');

  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|getaddrinfo|network/i.test(rawMessage)) {
    return '网络连接失败，请检查网络后重试';
  }
  if (statusCode === 404 || /\b404\b/.test(rawMessage)) {
    return '暂无可用更新（服务器尚未发布新版本）';
  }
  if (statusCode === 403 || /\b403\b/.test(rawMessage)) {
    return '暂时无法访问更新服务（403），请稍后重试';
  }
  const httpMatch = !statusCode ? rawMessage.match(/\b(4\d\d|5\d\d)\b/) : null;
  const code = statusCode || (httpMatch && Number(httpMatch[1]));
  if (code) {
    return `检查更新失败（${code}），请稍后重试`;
  }
  return '检查更新失败，请稍后重试';
}

// 把更新状态广播给所有窗口的渲染进程
function sendUpdateStatus(payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('coinflow:update-status', payload);
    }
  });
}

let autoUpdaterWired = false;
function wireAutoUpdater() {
  if (autoUpdaterWired) return;
  autoUpdaterWired = true;

  // 检查到新版后自动下载；下载完成后等用户在「关于」面板点击重启安装。
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdateStatus({ state: 'available', version: info && info.version }));
  autoUpdater.on('update-not-available', (info) => sendUpdateStatus({ state: 'latest', version: info && info.version }));
  autoUpdater.on('download-progress', (progress) => sendUpdateStatus({
    state: 'downloading',
    percent: Math.round((progress && progress.percent) || 0)
  }));
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ state: 'downloaded', version: info && info.version }));
  autoUpdater.on('error', (error) => sendUpdateStatus({
    state: 'error',
    message: describeUpdateError(error)
  }));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const targetWindow = activeMainWindow || BrowserWindow.getAllWindows()[0];
    if (!targetWindow || targetWindow.isDestroyed()) return;
    if (targetWindow.isMinimized()) {
      targetWindow.restore();
    }
    targetWindow.show();
    targetWindow.focus();
  });

  app.whenReady().then(async () => {
    await registerLocalProtocol();
    registerIpcHandlers();
    if (!IS_SMOKE_TEST) {
      wireAutoUpdater();
    }
    const mainWindow = createMainWindow();

    if (IS_SMOKE_TEST) {
      runSmokeTest(mainWindow);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
