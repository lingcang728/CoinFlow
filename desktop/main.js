const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_SCHEME = 'coinflow';

if (process.env.COINFLOW_SMOKE_TEST === '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.setPath('userData', path.join(os.tmpdir(), `coinflow-smoke-profile-${process.pid}`));
}

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
    width: 1440,
    height: 900,
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

    if (process.env.COINFLOW_SMOKE_TEST === '1') {
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
    console.log(`COINFLOW_SMOKE_STAGE=${stage}`);
  }

  async function writeSmokeArtifact(fileName, payload) {
    try {
      await fs.promises.mkdir(screenshotRoot, { recursive: true });
      const filePath = path.join(screenshotRoot, fileName);
      await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return filePath;
    } catch (error) {
      console.error(`COINFLOW_SMOKE_ARTIFACT_ERROR=${error.stack || error.message}`);
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
        const rootOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
        const bodyOverflow = document.body.scrollWidth > window.innerWidth + 2;
        const visibleDatePickers = Array.from(document.querySelectorAll('.date-picker-popover')).filter(el => !el.hidden).length;
        const activeDropdowns = document.querySelectorAll('.dropdown-menu.active').length;
        const offenders = Array.from(document.querySelectorAll('body *')).map((el) => {
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
          { amount: 31, category: 'study', note: '学习资料', date: '2026-05-24' }
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

        const db = await window.idb.openDB('CoinFlowDB', 1);
        await db.clear('transactions');
        await db.put('budget', budgetConfig, 'current');
        db.close();

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
          seededCount: seedRecords.length + 1,
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
    console.error('COINFLOW_SMOKE_ERROR=Timed out');
    app.exit(1);
  }, 45000);

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
    mark('capture-date-picker');
    result.datePickerVisible = await openDatePickerForScreenshot();
    result.screenshots.push(await captureFreshScreenshot('date-picker'));

    const layoutSizes = [
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
    const badLayout = result.layoutChecks.find(check => check.horizontalOverflow || check.activePages.length !== 1);
    if (badLayout) {
      throw new Error(`Desktop layout check failed: ${JSON.stringify(badLayout)}`);
    }
    if (!result.smokeData.saved || result.smokeData.transactionCount !== result.smokeData.seededCount) {
      throw new Error(`Smoke data check failed: ${JSON.stringify(result.smokeData)}`);
    }
    if (!Object.values(result.smokeData.exportResults).every(Boolean)) {
      throw new Error(`Smoke export check failed: ${JSON.stringify(result.smokeData.exportResults)}`);
    }
    if (!result.datePickerVisible) {
      throw new Error('Smoke date picker check failed');
    }
    result.resultPath = await writeSmokeArtifact('result.json', result);

    console.log(`COINFLOW_SMOKE_RESULT=${JSON.stringify(result)}`);
    if (result.screenshots.length > 0) {
      console.log(`COINFLOW_SMOKE_SCREENSHOT=${result.screenshots[0].filePath}`);
      console.log(`COINFLOW_SMOKE_SCREENSHOTS=${JSON.stringify(result.screenshots.map(item => item.filePath))}`);
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
    console.error(`COINFLOW_SMOKE_ERROR=${error.stack || error.message}`);
    app.exit(1);
  }
}

app.whenReady().then(async () => {
  await registerLocalProtocol();
  registerIpcHandlers();
  const mainWindow = createMainWindow();

  if (process.env.COINFLOW_SMOKE_TEST === '1') {
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
