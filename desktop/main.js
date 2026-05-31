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
  if (!mainWindow.webContents.isLoading()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    mainWindow.webContents.once('did-finish-load', resolve);
    mainWindow.webContents.once('did-fail-load', (_event, code, description) => {
      reject(new Error(`Renderer failed to load: ${code} ${description}`));
    });
  });
}

async function runSmokeTest(mainWindow) {
  const screenshotPath = process.env.COINFLOW_SMOKE_SCREENSHOT || path.join(os.tmpdir(), 'coinflow-smoke.png');
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const failTimer = setTimeout(() => {
    console.error('COINFLOW_SMOKE_ERROR=Timed out');
    app.exit(1);
  }, 30000);

  try {
    await waitForRendererLoad(mainWindow);
    await wait(900);

    const result = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const note = '麻辣香锅';
        const click = (selector) => {
          const el = document.querySelector(selector);
          if (!el) throw new Error('Missing selector: ' + selector);
          el.click();
        };

        window.navigateToPage('add');
        await wait(250);
        click('#add-date-trigger');
        await wait(120);
        const datePickerVisible = Boolean(document.querySelector('.date-picker-popover:not([hidden])'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await wait(80);
        const amountInput = document.getElementById('add-amount-input');
        amountInput.value = '25.00';
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('add-note-input').value = note;
        document.getElementById('add-date-input').value = '2026-05-30';
        click('#btn-save-record');
        await wait(700);

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
        for (const tx of seedRecords) {
          await window.CoinFlowDB.addTransaction(tx);
          await wait(5);
        }
        window.CoinFlowUtils.events.emit('dataChanged');
        await wait(900);
        const toast = document.getElementById('coinflow-toast');
        if (toast) toast.remove();

        const stats = await window.CoinFlowDB.getMonthlyStats(2026, 5);
        const savedTx = stats.transactions.find(tx => tx.note === note && tx.amount === 25);
        const exportResults = {
          csv: await window.CoinFlowExcel.exportToCSV(2026, 5),
          excel: await window.CoinFlowExcel.exportToExcel(2026, 5),
          html: await window.CoinFlowExportHTML.exportToHTML(2026, 5)
        };

        click('.sidebar-nav-item[data-target="transactions"]');
        click('.sidebar-nav-item[data-target="statistics"]');
        click('.sidebar-nav-item[data-target="dashboard"]');
        click('.sidebar-nav-item[data-target="transactions"]');
        click('.sidebar-nav-item[data-target="dashboard"]');
        await wait(500);

        amountInput.value = '25.00';
        document.getElementById('add-note-input').value = '麻辣香锅';
        document.getElementById('add-date-input').value = '2026-05-30';
        const datePickerInstance = window.CoinFlowDatePicker.attach(document.getElementById('add-date-input'), {
          trigger: document.getElementById('add-date-trigger')
        });
        if (datePickerInstance && typeof datePickerInstance.updateLabel === 'function') {
          datePickerInstance.updateLabel();
        }
        click('#add-date-trigger');
        await wait(120);

        const appRect = document.getElementById('app-container').getBoundingClientRect();
        const sidebarRect = document.querySelector('.desktop-sidebar').getBoundingClientRect();
        const quickAddRect = document.querySelector('.desktop-quick-add').getBoundingClientRect();
        const activePages = Array.from(document.querySelectorAll('.desktop-page.active')).map(el => el.id);
        const bottomNavPresent = Boolean(document.querySelector('.bottom-nav'));
        const pageAddPresent = Boolean(document.getElementById('page-add'));

        return {
          title: document.title,
          url: location.href,
          saved: Boolean(savedTx),
          activePages,
          chartReady: Boolean(window.Chart),
          idbReady: Boolean(window.idb),
          xlsxReady: Boolean(window.XLSX),
          datePickerVisible,
          exportResults,
          appWidth: Math.round(appRect.width),
          appHeight: Math.round(appRect.height),
          sidebarWidth: Math.round(sidebarRect.width),
          quickAddWidth: Math.round(quickAddRect.width),
          bottomNavPresent,
          pageAddPresent
        };
      })()
    `, true);

    try {
      const image = await mainWindow.webContents.capturePage().catch(() => mainWindow.capturePage());
      await fs.promises.writeFile(screenshotPath, image.toPNG());
      result.screenshotPath = screenshotPath;
    } catch (screenshotError) {
      result.screenshotError = screenshotError.message;
    }

    const layoutSizes = [
      { width: 1366, height: 768 },
      { width: 1280, height: 800 },
      { width: 1180, height: 720 }
    ];
    result.layoutChecks = [];
    for (const size of layoutSizes) {
      mainWindow.unmaximize();
      mainWindow.setBounds({ width: size.width, height: size.height });
      await wait(650);
      const contentSize = mainWindow.getContentSize();
      const check = await mainWindow.webContents.executeJavaScript(`
        (() => {
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          document.body.classList.remove('quick-add-open');
          const shell = document.getElementById('app-container');
          const shellRect = shell.getBoundingClientRect();
          const activePages = Array.from(document.querySelectorAll('.desktop-page.active')).map(el => el.id);
          const rootOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
          const bodyOverflow = document.body.scrollWidth > window.innerWidth + 2;
          const offenders = Array.from(document.querySelectorAll('body *')).map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || '',
              className: typeof el.className === 'string' ? el.className : '',
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width)
            };
          }).filter(item => item.right > window.innerWidth + 2 || item.left < -2).slice(0, 8);
          return {
            requestedWidth: ${size.width},
            requestedHeight: ${size.height},
            contentWidth: ${contentSize[0]},
            contentHeight: ${contentSize[1]},
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            rootScrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
            shellWidth: Math.round(shellRect.width),
            shellHeight: Math.round(shellRect.height),
            activePages,
            horizontalOverflow: rootOverflow || bodyOverflow,
            offenders
          };
        })()
      `, true);
      result.layoutChecks.push(check);
    }

    result.rendererMessages = mainWindow.__coinflowRendererMessages;
    const badLayout = result.layoutChecks.find(check => check.horizontalOverflow || check.activePages.length !== 1);
    if (badLayout) {
      throw new Error(`Desktop layout check failed: ${JSON.stringify(badLayout)}`);
    }

    console.log(`COINFLOW_SMOKE_RESULT=${JSON.stringify(result)}`);
    if (result.screenshotPath) {
      console.log(`COINFLOW_SMOKE_SCREENSHOT=${screenshotPath}`);
    }
    clearTimeout(failTimer);
    app.quit();
  } catch (error) {
    clearTimeout(failTimer);
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
