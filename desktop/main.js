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

  mainWindow.__coinflowRendererMessages = [];
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) {
      mainWindow.__coinflowRendererMessages.push({
        level: level,
        message: message,
        line: line,
        sourceId: sourceId
      });
    }
  });

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
    tempPath: path.join(ledgerDir, 'coinflow-ledger.json.tmp')
  };
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
    return {
      exists: true,
      ledgerPath: paths.ledgerPath,
      ledgerDir: paths.ledgerDir,
      data: await readJsonFile(paths.ledgerPath)
    };
  } catch (error) {
    console.error('[Ledger] Failed to read primary ledger:', error);
  }

  if (fs.existsSync(paths.backupPath)) {
    try {
      const backupData = await readJsonFile(paths.backupPath);
      await fs.promises.copyFile(paths.backupPath, paths.ledgerPath);
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
    }
  }

  return {
    exists: true,
    recoveryFailed: true,
    warning: '账本文件损坏且备份不可用，已临时载入空账本',
    ledgerPath: paths.ledgerPath,
    ledgerDir: paths.ledgerDir,
    data: emptyLedger()
  };
}

async function writeLedgerFile(payload = {}) {
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

    const json = `${JSON.stringify(data, null, 2)}\n`;
    await fs.promises.writeFile(paths.tempPath, json, 'utf8');
    JSON.parse(await fs.promises.readFile(paths.tempPath, 'utf8'));

    if (fs.existsSync(paths.ledgerPath)) {
      await fs.promises.copyFile(paths.ledgerPath, paths.backupPath);
    }

    await fs.promises.rename(paths.tempPath, paths.ledgerPath);
    JSON.parse(await fs.promises.readFile(paths.ledgerPath, 'utf8'));
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
