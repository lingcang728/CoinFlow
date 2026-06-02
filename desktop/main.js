const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

const APP_SCHEME = 'coinflow';
const IS_SMOKE_TEST = process.env.COINFLOW_SMOKE_TEST === '1';

const smokePipeClosed = {
  stdout: false,
  stderr: false
};

function isBrokenPipeError(error) {
  return Boolean(error && (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED'));
}

function handleSmokeStreamError(streamName, error) {
  if (isBrokenPipeError(error)) {
    smokePipeClosed[streamName] = true;
  }
}

function writeSmokeLine(line, streamName = 'stdout') {
  if (!IS_SMOKE_TEST) {
    if (streamName === 'stderr') {
      console.error(line);
    } else {
      console.log(line);
    }
    return;
  }

  const stream = streamName === 'stderr' ? process.stderr : process.stdout;
  if (!stream || stream.destroyed || stream.writableEnded || smokePipeClosed[streamName]) {
    return;
  }

  try {
    stream.write(`${line}\n`, (error) => {
      if (error) {
        handleSmokeStreamError(streamName, error);
      }
    });
  } catch (error) {
    handleSmokeStreamError(streamName, error);
  }
}

if (IS_SMOKE_TEST) {
  process.stdout.on('error', (error) => handleSmokeStreamError('stdout', error));
  process.stderr.on('error', (error) => handleSmokeStreamError('stderr', error));
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.setPath('userData', path.join(os.tmpdir(), `coinflow-smoke-profile-${process.pid}`));
}
// 正式安装版（NSIS）使用 Electron 默认的 userData 位置（%APPDATA%\CoinFlow），
// 账本 IndexedDB 即存于此。自动更新只替换程序文件、不触碰该目录，
// 因此升级版本后数据始终保留，无需任何手动迁移。

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
    icon: path.join(app.getAppPath(), 'assets', 'icons', 'icon-512.png'),
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
    isPackaged: app.isPackaged
  }));

  // 手动「检查更新」。开发态（未打包）直接返回提示，避免 electron-updater 抛错。
  ipcMain.handle('coinflow:check-update', async () => {
    if (!app.isPackaged) {
      return { state: 'dev' };
    }
    try {
      await autoUpdater.checkForUpdates();
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

function waitForRendererLoad(mainWindow) {
  const webContents = mainWindow.webContents;
  if (!webContents.isLoading() && webContents.getURL().startsWith(`${APP_SCHEME}://`)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Renderer load timed out'));
    }, 10000);
    const cleanup = () => {
      clearTimeout(timer);
      webContents.removeListener('did-finish-load', onLoaded);
      webContents.removeListener('dom-ready', onLoaded);
      webContents.removeListener('did-fail-load', onFailed);
    };
    const onLoaded = () => {
      if (!webContents.getURL().startsWith(`${APP_SCHEME}://`)) return;
      cleanup();
      resolve();
    };
    const onFailed = (_event, code, description) => {
      cleanup();
      reject(new Error(`Renderer failed to load: ${code} ${description}`));
    };

    webContents.on('did-finish-load', onLoaded);
    webContents.on('dom-ready', onLoaded);
    webContents.on('did-fail-load', onFailed);
  });
}

async function runSmokeTest(mainWindow) {
  const runStartedAt = Date.now();
  const runId = `${new Date(runStartedAt).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}`;
  const explicitScreenshotPath = process.env.COINFLOW_SMOKE_SCREENSHOT;
  const screenshotRoot = explicitScreenshotPath
    ? (path.parse(explicitScreenshotPath).dir || os.tmpdir())
    : path.join(os.tmpdir(), `coinflow-smoke-${runId}`);
  const exportDir = process.env.COINFLOW_SMOKE_EXPORT_DIR || path.join(os.tmpdir(), `coinflow-smoke-exports-${runId}`);
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  process.env.COINFLOW_SMOKE_EXPORT_DIR = exportDir;

  function mark(stage) {
    writeSmokeLine(`COINFLOW_SMOKE_STAGE=${stage}`);
  }

  async function writeSmokeArtifact(fileName, payload) {
    try {
      await fs.promises.mkdir(screenshotRoot, { recursive: true });
      const filePath = path.join(screenshotRoot, fileName);
      await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return filePath;
    } catch (error) {
      writeSmokeLine(`COINFLOW_SMOKE_ARTIFACT_ERROR=${error.stack || error.message}`, 'stderr');
      return null;
    }
  }

  function screenshotPathFor(label) {
    const safeLabel = String(label).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'screen';
    if (!explicitScreenshotPath) {
      return path.join(screenshotRoot, `${safeLabel}.png`);
    }

    const parsed = path.parse(explicitScreenshotPath);
    const baseName = parsed.name || 'coinflow-smoke';
    const extension = parsed.ext || '.png';
    return path.join(screenshotRoot, `${baseName}-${safeLabel}-${runId}${extension}`);
  }

  async function evaluateRenderer(source, timeoutMs = 10000) {
    let timer;
    try {
      return await Promise.race([
        mainWindow.webContents.executeJavaScript(source, true),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Renderer evaluation timed out after ${timeoutMs}ms`)), timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function waitForRendererIdle() {
    await evaluateRenderer(`
      new Promise(async (resolve) => {
        try {
          if (document.fonts && document.fonts.ready) {
            await Promise.race([
              document.fonts.ready,
              new Promise(fontResolve => window.setTimeout(fontResolve, 200))
            ]);
          }
        } catch (_error) {}

        window.setTimeout(resolve, 950);
      })
    `, 5000);
  }

  async function waitForAppReady() {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const ready = await evaluateRenderer(`
        Boolean(
          window.CoinFlowDB &&
          window.CoinFlowCategories &&
          window.CoinFlowUtils &&
          window.CoinFlowRecordForm &&
          window.CoinFlowCharts &&
          document.getElementById('app-container') &&
          document.querySelector('.desktop-page.active')
        )
      `);
      if (ready) return;
      await wait(100);
    }
    throw new Error('Renderer app did not become ready for smoke test');
  }

  async function collectRendererState(label) {
    return evaluateRenderer(`
      (() => {
        const shell = document.getElementById('app-container');
        const shellRect = shell ? shell.getBoundingClientRect() : { width: 0, height: 0 };
        const activePages = Array.from(document.querySelectorAll('.desktop-page.active')).map(el => el.id);
        const doughnutCard = document.querySelector('.doughnut-card');
        const doughnutCardRect = doughnutCard ? doughnutCard.getBoundingClientRect() : null;
        const legendIssues = Array.from(document.querySelectorAll('#chart-legend-container .legend-value, #chart-legend-container .legend-ratio')).map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            text: el.textContent.trim(),
            className: el.className,
            clientWidth: Math.round(el.clientWidth),
            scrollWidth: Math.round(el.scrollWidth),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            clippedByBox: el.scrollWidth > el.clientWidth + 1,
            outsideCard: doughnutCardRect ? (rect.left < doughnutCardRect.left - 1 || rect.right > doughnutCardRect.right + 1) : false
          };
        }).filter(item => item.clippedByBox || item.outsideCard);
        const quickAdd = document.querySelector('.desktop-quick-add');
        const quickAddRect = quickAdd ? quickAdd.getBoundingClientRect() : null;
        const quickAddStyle = quickAdd ? window.getComputedStyle(quickAdd) : null;
        const quickAddVisible = Boolean(quickAdd && quickAddRect && quickAddStyle &&
          quickAddStyle.display !== 'none' &&
          quickAddStyle.visibility !== 'hidden' &&
          quickAddRect.width > 0 &&
          quickAddRect.right > 1 &&
          quickAddRect.left < window.innerWidth - 1);
        const rootOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
        const bodyOverflow = document.body.scrollWidth > window.innerWidth + 2;
        const visibleDatePickers = Array.from(document.querySelectorAll('.date-picker-popover')).filter(el => !el.hidden).length;
        const activeDropdowns = document.querySelectorAll('.dropdown-menu.active').length;
        const offenders = Array.from(document.querySelectorAll('body *')).filter((el) => {
          return quickAddVisible || !el.closest('.desktop-quick-add');
        }).map((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            className: typeof el.className === 'string' ? el.className : '',
            position: style.position,
            transform: style.transform,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width)
          };
        }).filter((item) => item.right > window.innerWidth + 2 || item.left < -2).slice(0, 10);

        return {
          label: ${JSON.stringify(label)},
          url: location.href,
          title: document.title,
          activePages,
          currentPage: typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : null,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          rootScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          shellWidth: Math.round(shellRect.width),
          shellHeight: Math.round(shellRect.height),
          horizontalOverflow: rootOverflow || bodyOverflow,
          legendIssues,
          quickAddOpen: document.body.classList.contains('quick-add-open'),
          quickAddVisible,
          visibleDatePickers,
          activeDropdowns,
          bottomNavPresent: Boolean(document.querySelector('.bottom-nav')),
          pageAddPresent: Boolean(document.getElementById('page-add')),
          rendererTimestamp: Date.now(),
          offenders
        };
      })()
    `);
  }

  async function verifyStatisticsScroll() {
    return evaluateRenderer(`
      (() => {
        const stack = document.querySelector('#page-statistics .desktop-page-stack');
        if (!stack) {
          return { present: false, canScroll: false, scrolled: false };
        }

        const previousTop = stack.scrollTop;
        const maxScrollTop = Math.max(0, stack.scrollHeight - stack.clientHeight);
        stack.scrollTop = maxScrollTop;
        const scrolledTop = stack.scrollTop;
        stack.scrollTop = previousTop;

        return {
          present: true,
          clientHeight: Math.round(stack.clientHeight),
          scrollHeight: Math.round(stack.scrollHeight),
          maxScrollTop: Math.round(maxScrollTop),
          canScroll: maxScrollTop > 2,
          scrolled: scrolledTop > 2
        };
      })()
    `, 5000);
  }

  async function verifyQuickAddAutoClose() {
    await resizeForLayoutCheck(1280, 800);
    return evaluateRenderer(`
      (async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const getPanelState = () => {
          const panel = document.querySelector('.desktop-quick-add');
          if (!panel) return { present: false, visible: false };
          const rect = panel.getBoundingClientRect();
          const style = window.getComputedStyle(panel);
          const visible = style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.right > 1 &&
            rect.left < window.innerWidth - 1;
          return {
            present: true,
            visible,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            transform: style.transform,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width)
          };
        };

        window.navigateToPage('add');
        await wait(260);
        const opened = document.body.classList.contains('quick-add-open');
        const panelAfterOpen = getPanelState();
        const visibleAfterOpen = panelAfterOpen.visible;

        window.navigateToPage('statistics');
        await wait(260);
        const closedAfterNavigation = !document.body.classList.contains('quick-add-open');
        const panelAfterNavigation = getPanelState();
        const hiddenAfterNavigation = !panelAfterNavigation.visible;
        const currentPage = typeof window.getCurrentPageId === 'function' ? window.getCurrentPageId() : null;

        window.navigateToPage('dashboard');
        await wait(120);

        return {
          opened,
          visibleAfterOpen,
          closedAfterNavigation,
          hiddenAfterNavigation,
          currentPage,
          panelAfterOpen,
          panelAfterNavigation,
          width: window.innerWidth,
          height: window.innerHeight
        };
      })()
    `, 5000);
  }

  async function captureFreshScreenshot(label) {
    await waitForRendererIdle();
    const filePath = screenshotPathFor(label);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.rm(filePath, { force: true });

    if (typeof mainWindow.webContents.invalidate === 'function') {
      mainWindow.webContents.invalidate();
    }
    await mainWindow.webContents.capturePage().catch(() => mainWindow.capturePage());
    await wait(300);

    const stateBeforeCapture = await collectRendererState(label);
    const captureStartedAt = Date.now();
    const image = await mainWindow.webContents.capturePage().catch(() => mainWindow.capturePage());
    const buffer = image.toPNG();
    if (!buffer || buffer.length < 1024) {
      throw new Error(`Smoke screenshot ${label} is empty`);
    }

    await fs.promises.writeFile(filePath, buffer);
    const stat = await fs.promises.stat(filePath);
    if (stat.size !== buffer.length || stat.mtimeMs < captureStartedAt - 1000 || stat.mtimeMs < runStartedAt - 1000) {
      throw new Error(`Smoke screenshot ${label} was not freshly written`);
    }

    return {
      label,
      filePath,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      capturedAt: new Date(captureStartedAt).toISOString(),
      stateBeforeCapture
    };
  }

  async function resetRendererToDashboard() {
    return evaluateRenderer(`
      (async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const smokeNote = ${JSON.stringify(`Smoke realtime ${runId}`)};
        const budgetConfig = {
          id: 'current',
          monthlyIncome: 2800,
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
          lastResetMonth: '2026-05'
        };
        const seedRecords = [
          { amount: 15, category: 'drinks', note: '一点点奶茶', date: '2026-05-30' },
          { amount: 68.90, category: 'shopping', note: '拼多多购物', date: '2026-05-29' },
          { amount: 2, category: 'transport', note: '公交车', date: '2026-05-29' },
          { amount: 50, category: 'entertainment', note: '王者荣耀充值', date: '2026-05-28' },
          { amount: 935, category: 'food', note: '本月餐饮', date: '2026-05-27' },
          { amount: 220, category: 'drinks', note: '零食饮品', date: '2026-05-27' },
          { amount: 621.10, category: 'shopping', note: '生活网购', date: '2026-05-26' },
          { amount: 208, category: 'transport', note: '交通出行', date: '2026-05-26' },
          { amount: 270, category: 'entertainment', note: '娱乐订阅', date: '2026-05-25' },
          { amount: 160, category: 'housing', note: '宿舍生活', date: '2026-05-25' },
          { amount: 80, category: 'social', note: '社交聚餐', date: '2026-05-24' },
          { amount: 31, category: 'study', note: '学习资料', date: '2026-05-24' },
          { amount: 2789, category: 'transport', note: '预算压力测试', date: '2026-05-24' }
        ];

        const click = (selector) => {
          const el = document.querySelector(selector);
          if (!el) throw new Error('Missing selector: ' + selector);
          el.click();
          return el;
        };
        const waitUntil = async (predicate, timeout = 5000) => {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            if (await predicate()) return true;
            await wait(80);
          }
          return false;
        };

        const db = await window.idb.openDB('CoinFlowDB', 2);
        await db.clear('transactions');
        await db.put('budget', budgetConfig, 'current');
        db.close();
        await window.CoinFlowCategories.resetToDefaultCategories();

        window.CoinFlowState.currentYear = 2026;
        window.CoinFlowState.currentMonth = 5;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        document.body.classList.remove('quick-add-open');
        document.querySelectorAll('.dropdown-menu.active').forEach(el => el.classList.remove('active'));
        const toast = document.getElementById('coinflow-toast');
        if (toast) toast.remove();
        const successToast = document.getElementById('save-success-toast');
        if (successToast) successToast.classList.remove('active');

        window.navigateToPage('dashboard');
        window.CoinFlowUtils.events.emit('dataChanged');
        await wait(300);

        window.navigateToPage('add');
        await wait(150);
        const amountInput = document.getElementById('add-amount-input');
        amountInput.value = '25.00';
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('add-note-input').value = smokeNote;
        document.getElementById('add-date-input').value = '2026-05-30';
        const picker = window.CoinFlowDatePicker.attach(document.getElementById('add-date-input'), {
          trigger: document.getElementById('add-date-trigger')
        });
        if (picker && typeof picker.updateLabel === 'function') {
          picker.updateLabel();
        }
        click('#btn-save-record');

        const saved = await waitUntil(async () => {
          const stats = await window.CoinFlowDB.getMonthlyStats(2026, 5);
          return stats.transactions.some(tx => tx.note === smokeNote && tx.amount === 25);
        });
        if (!saved) throw new Error('Smoke UI save did not create the expected record');

        for (const tx of seedRecords) {
          await window.CoinFlowDB.addTransaction(tx);
        }

        const genericCsv = [
          '日期,分类,金额(元),备注',
          '2026-05-23,股票,188.80,基金定投',
          '2026-05-22,车子,260.00,停车油费',
          '2026-05-21,房贷,1200.00,月供',
          '2026-05-20,红包,66.00,家庭红包'
        ].join('\\n');
        const genericFile = new File([new Blob(['\\uFEFF' + genericCsv], { type: 'text/csv;charset=utf-8' })], 'family-generic.csv', { type: 'text/csv' });
        const genericImport = await window.CoinFlowExcel.importFromCSV(genericFile);

        document.body.classList.remove('quick-add-open');
        window.navigateToPage('dashboard');
        window.CoinFlowUtils.events.emit('dataChanged');
        await wait(500);
        if (successToast) successToast.classList.remove('active');
        const lateToast = document.getElementById('coinflow-toast');
        if (lateToast) lateToast.remove();

        const stats = await window.CoinFlowDB.getMonthlyStats(2026, 5);
        const exportResults = {
          csv: await window.CoinFlowExcel.exportToCSV(2026, 5),
          excel: await window.CoinFlowExcel.exportToExcel(2026, 5),
          html: await window.CoinFlowExportHTML.exportToHTML(2026, 5)
        };

        return {
          smokeNote,
          saved,
          seededCount: seedRecords.length + 1 + genericImport.successCount,
          genericImport,
          dynamicCategories: ['股票', '车子', '房贷', '红包'].map(name => {
            const match = window.CoinFlowCategories.getCategoryList({ includeHidden: true }).find(cat => cat.name === name);
            return match ? { name: match.name, emoji: match.emoji, color: match.color } : null;
          }),
          totalSpent: stats.totalSpent,
          totalBudget: stats.totalBudget,
          transactionCount: stats.transactions.length,
          exportResults,
          chartReady: Boolean(window.Chart),
          idbReady: Boolean(window.idb),
          xlsxReady: Boolean(window.XLSX)
        };
      })()
    `, 25000);
  }

  async function showPage(pageId) {
    await evaluateRenderer(`
      (async () => {
        window.navigateToPage(${JSON.stringify(pageId)});
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        document.body.classList.remove('quick-add-open');
        document.querySelectorAll('.dropdown-menu.active').forEach(el => el.classList.remove('active'));
        const toast = document.getElementById('coinflow-toast');
        if (toast) toast.remove();
        const successToast = document.getElementById('save-success-toast');
        if (successToast) successToast.classList.remove('active');
      })()
    `);
    await wait(350);
  }

  async function openDatePickerForScreenshot() {
    return evaluateRenderer(`
      (async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        window.navigateToPage('add');
        await wait(150);
        const input = document.getElementById('add-date-input');
        input.value = '2026-05-30';
        const picker = window.CoinFlowDatePicker.attach(input, {
          trigger: document.getElementById('add-date-trigger')
        });
        if (picker && typeof picker.updateLabel === 'function') {
          picker.updateLabel();
        }
        document.getElementById('add-date-trigger').click();
        await wait(180);
        return Boolean(document.querySelector('.date-picker-popover:not([hidden])'));
      })()
    `);
  }

  async function verifyDatePickerMonthNavigation() {
    return evaluateRenderer(`
      (async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        window.navigateToPage('add');
        await wait(150);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await wait(80);

        const input = document.getElementById('add-date-input');
        const trigger = document.getElementById('add-date-trigger');

        let changeCount = 0;
        const onChange = () => {
          changeCount += 1;
        };
        input.addEventListener('change', onChange);

        const picker = window.CoinFlowDatePicker.attach(input, { trigger });
        if (picker && typeof picker.close === 'function') {
          picker.close();
        }
        input.value = '2026-06-01';
        if (picker && typeof picker.updateLabel === 'function') {
          picker.updateLabel();
        }

        trigger.click();
        await wait(120);
        const opened = Boolean(document.querySelector('.date-picker-popover:not([hidden])'));
        const initialMonth = document.querySelector('.date-picker-month')?.textContent.trim() || '';
        document.querySelector('.date-picker-prev')?.click();
        await wait(120);
        const visibleAfterPrev = Boolean(document.querySelector('.date-picker-popover:not([hidden])'));
        const afterPrevMonth = document.querySelector('.date-picker-month')?.textContent.trim() || '';
        document.querySelector('.date-picker-day[data-date="2026-05-15"]')?.click();
        await wait(120);

        const selectedValue = input.value;
        const selectedLabel = trigger.querySelector('[data-date-label]')?.textContent.trim() || '';
        const closedAfterSelection = !document.querySelector('.date-picker-popover:not([hidden])');

        trigger.click();
        await wait(120);
        const reopenedMonth = document.querySelector('.date-picker-month')?.textContent.trim() || '';
        document.querySelector('.date-picker-next')?.click();
        await wait(120);
        const visibleAfterNext = Boolean(document.querySelector('.date-picker-popover:not([hidden])'));
        const afterNextMonth = document.querySelector('.date-picker-month')?.textContent.trim() || '';
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        input.removeEventListener('change', onChange);

        return {
          initialMonth,
          opened,
          visibleAfterPrev,
          afterPrevMonth,
          selectedValue,
          selectedLabel,
          closedAfterSelection,
          reopenedMonth,
          visibleAfterNext,
          afterNextMonth,
          changeCount
        };
      })()
    `, 8000);
  }

  async function verifyAmountDecimalKeyboardInput() {
    return evaluateRenderer(`
      (async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        window.navigateToPage('add');
        await wait(150);

        const input = document.getElementById('add-amount-input');
        if (!input) {
          return { present: false };
        }

        const typeChar = (char) => {
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: char,
            bubbles: true,
            cancelable: true
          }));
          input.setRangeText(char, input.selectionStart, input.selectionEnd, 'end');
          input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: char
          }));
          input.dispatchEvent(new KeyboardEvent('keyup', {
            key: char,
            bubbles: true
          }));
        };

        input.value = '';
        input.focus();
        input.setSelectionRange(0, 0);
        typeChar('6');
        typeChar('.');
        typeChar('5');

        const typedValue = input.value;
        const selectionStart = input.selectionStart;
        const selectionEnd = input.selectionEnd;
        input.blur();
        await wait(80);

        return {
          present: true,
          type: input.type,
          typedValue,
          normalizedValue: input.value,
          selectionStart,
          selectionEnd
        };
      })()
    `, 5000);
  }

  async function verifyCategoryManagerFlow() {
    return evaluateRenderer(`
      (async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const waitUntil = async (predicate, timeout = 5000) => {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            if (await predicate()) return true;
            await wait(80);
          }
          return false;
        };

        document.getElementById('btn-category-settings')?.click();
        await wait(160);
        const modalOpened = document.getElementById('modal-category-settings')?.classList.contains('active') || false;

        const nameInput = document.getElementById('category-name-input');
        const emojiInput = document.getElementById('category-emoji-input');
        const colorInput = document.getElementById('category-color-input');
        nameInput.value = '宠物';
        emojiInput.value = '🐾';
        colorInput.value = '#A855F7';
        emojiInput.dispatchEvent(new Event('input', { bubbles: true }));
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('btn-save-category')?.click();

        const created = await waitUntil(() =>
          window.CoinFlowCategories.getCategoryList({ includeHidden: true }).some(cat => cat.name === '宠物')
        );
        const createdCategory = window.CoinFlowCategories.getCategoryList({ includeHidden: true }).find(cat => cat.name === '宠物');
        const iconMatched = createdCategory && createdCategory.emoji === '🐾' && createdCategory.color.toUpperCase() === '#A855F7';

        document.getElementById('btn-delete-category')?.click();
        const removed = await waitUntil(() =>
          !window.CoinFlowCategories.getCategoryList({ includeHidden: true }).some(cat => cat.name === '宠物')
        );
        document.getElementById('btn-close-category-modal')?.click();
        await wait(120);

        return {
          modalOpened,
          created,
          iconMatched,
          removed,
          modalClosed: !document.getElementById('modal-category-settings')?.classList.contains('active')
        };
      })()
    `, 8000);
  }

  async function resizeForLayoutCheck(width, height) {
    mainWindow.show();
    mainWindow.restore();
    mainWindow.unmaximize();
    mainWindow.setContentSize(width, height);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await wait(180);
      const [contentWidth, contentHeight] = mainWindow.getContentSize();
      if (Math.abs(contentWidth - width) <= 2 && Math.abs(contentHeight - height) <= 2) {
        return [contentWidth, contentHeight];
      }
      mainWindow.setContentSize(width, height);
    }

    return mainWindow.getContentSize();
  }

  const failTimer = setTimeout(() => {
    writeSmokeLine('COINFLOW_SMOKE_ERROR=Timed out', 'stderr');
    app.exit(1);
  }, 90000);

  try {
    await writeSmokeArtifact('started.json', {
      runId,
      startedAt: new Date(runStartedAt).toISOString(),
      pid: process.pid,
      screenshotRoot,
      exportDir,
      appPath: app.getAppPath()
    });

    mark('wait-load');
    await waitForRendererLoad(mainWindow);
    mark('wait-app-ready');
    await waitForAppReady();
    mark('wait-idle');
    await waitForRendererIdle();

    mark('reset-data');
    const result = {
      runId,
      startedAt: new Date(runStartedAt).toISOString(),
      screenshotRoot,
      exportDir,
      smokeData: await resetRendererToDashboard(),
      screenshots: []
    };

    mark('capture-dashboard');
    await showPage('dashboard');
    result.screenshots.push(await captureFreshScreenshot('dashboard'));
    mark('capture-transactions');
    await showPage('transactions');
    result.screenshots.push(await captureFreshScreenshot('transactions'));
    mark('capture-statistics');
    await showPage('statistics');
    result.screenshots.push(await captureFreshScreenshot('statistics'));
    result.statisticsScroll = await verifyStatisticsScroll();
    mark('capture-date-picker');
    result.datePickerVisible = await openDatePickerForScreenshot();
    result.screenshots.push(await captureFreshScreenshot('date-picker'));
    mark('date-picker-month-navigation');
    result.datePickerMonthNavigation = await verifyDatePickerMonthNavigation();
    mark('amount-decimal-keyboard');
    result.amountDecimalKeyboardInput = await verifyAmountDecimalKeyboardInput();
    mark('quick-add-autoclose');
    result.quickAddAutoClose = await verifyQuickAddAutoClose();
    mark('category-manager');
    result.categoryManager = await verifyCategoryManagerFlow();

    const layoutSizes = [
      { width: 1920, height: 1080 },
      { width: 1600, height: 900 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1280, height: 800 },
      { width: 1180, height: 720 }
    ];
    result.layoutChecks = [];
    for (const size of layoutSizes) {
      mark(`layout-${size.width}x${size.height}`);
      const contentSize = await resizeForLayoutCheck(size.width, size.height);
      await showPage('dashboard');
      const check = await collectRendererState(`layout-${size.width}x${size.height}`);
      check.requestedWidth = size.width;
      check.requestedHeight = size.height;
      check.contentWidth = contentSize[0];
      check.contentHeight = contentSize[1];
      check.screenshot = await captureFreshScreenshot(`layout-${size.width}x${size.height}`);
      result.layoutChecks.push(check);
    }

    result.rendererMessages = mainWindow.__coinflowRendererMessages;
    const badLayout = result.layoutChecks.find(check =>
      check.horizontalOverflow ||
      check.activePages.length !== 1 ||
      (Array.isArray(check.legendIssues) && check.legendIssues.length > 0)
    );
    if (badLayout) {
      throw new Error(`Desktop layout check failed: ${JSON.stringify(badLayout)}`);
    }
    if (!result.quickAddAutoClose.opened ||
        !result.quickAddAutoClose.visibleAfterOpen ||
        !result.quickAddAutoClose.closedAfterNavigation ||
        !result.quickAddAutoClose.hiddenAfterNavigation ||
        result.quickAddAutoClose.currentPage !== 'statistics') {
      throw new Error(`Quick-add auto close check failed: ${JSON.stringify(result.quickAddAutoClose)}`);
    }
    if (!result.categoryManager ||
        !result.categoryManager.modalOpened ||
        !result.categoryManager.created ||
        !result.categoryManager.iconMatched ||
        !result.categoryManager.removed ||
        !result.categoryManager.modalClosed) {
      throw new Error(`Category manager flow check failed: ${JSON.stringify(result.categoryManager)}`);
    }
    if (!result.smokeData.saved || result.smokeData.transactionCount !== result.smokeData.seededCount) {
      throw new Error(`Smoke data check failed: ${JSON.stringify(result.smokeData)}`);
    }
    if (!result.smokeData.genericImport ||
        result.smokeData.genericImport.successCount !== 4 ||
        result.smokeData.genericImport.createdCategoryCount < 4 ||
        !result.smokeData.dynamicCategories.every(Boolean)) {
      throw new Error(`Generic import dynamic category check failed: ${JSON.stringify(result.smokeData)}`);
    }
    if (!Object.values(result.smokeData.exportResults).every(Boolean)) {
      throw new Error(`Smoke export check failed: ${JSON.stringify(result.smokeData.exportResults)}`);
    }
    if (!result.statisticsScroll.present || !result.statisticsScroll.canScroll || !result.statisticsScroll.scrolled) {
      throw new Error(`Statistics scroll check failed: ${JSON.stringify(result.statisticsScroll)}`);
    }
    if (!result.datePickerVisible) {
      throw new Error('Smoke date picker check failed');
    }
    if (!result.datePickerMonthNavigation ||
        !result.datePickerMonthNavigation.opened ||
        result.datePickerMonthNavigation.initialMonth !== '2026年06月' ||
        !result.datePickerMonthNavigation.visibleAfterPrev ||
        result.datePickerMonthNavigation.afterPrevMonth !== '2026年05月' ||
        result.datePickerMonthNavigation.selectedValue !== '2026-05-15' ||
        result.datePickerMonthNavigation.selectedLabel !== '2026-05-15' ||
        !result.datePickerMonthNavigation.closedAfterSelection ||
        result.datePickerMonthNavigation.reopenedMonth !== '2026年05月' ||
        !result.datePickerMonthNavigation.visibleAfterNext ||
        result.datePickerMonthNavigation.afterNextMonth !== '2026年06月' ||
        result.datePickerMonthNavigation.changeCount < 1) {
      throw new Error(`Date picker month navigation check failed: ${JSON.stringify(result.datePickerMonthNavigation)}`);
    }
    if (!result.amountDecimalKeyboardInput ||
        !result.amountDecimalKeyboardInput.present ||
        result.amountDecimalKeyboardInput.type !== 'text' ||
        result.amountDecimalKeyboardInput.typedValue !== '6.5' ||
        result.amountDecimalKeyboardInput.normalizedValue !== '6.50' ||
        result.amountDecimalKeyboardInput.selectionStart !== 3 ||
        result.amountDecimalKeyboardInput.selectionEnd !== 3) {
      throw new Error(`Amount decimal keyboard check failed: ${JSON.stringify(result.amountDecimalKeyboardInput)}`);
    }
    result.resultPath = await writeSmokeArtifact('result.json', result);

    writeSmokeLine(`COINFLOW_SMOKE_RESULT=${JSON.stringify(result)}`);
    if (result.screenshots.length > 0) {
      writeSmokeLine(`COINFLOW_SMOKE_SCREENSHOT=${result.screenshots[0].filePath}`);
      writeSmokeLine(`COINFLOW_SMOKE_SCREENSHOTS=${JSON.stringify(result.screenshots.map(item => item.filePath))}`);
    }
    clearTimeout(failTimer);
    app.quit();
  } catch (error) {
    clearTimeout(failTimer);
    await writeSmokeArtifact('error.json', {
      runId,
      failedAt: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      screenshotRoot,
      exportDir,
      rendererMessages: mainWindow.__coinflowRendererMessages || []
    });
    writeSmokeLine(`COINFLOW_SMOKE_ERROR=${error.stack || error.message}`, 'stderr');
    app.exit(1);
  }
}

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
