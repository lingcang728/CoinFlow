const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_SCHEME = 'coinflow';

if (process.env.COINFLOW_SMOKE_TEST === '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.setPath('userData', path.join(os.tmpdir(), 'coinflow-smoke-profile'));
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
    width: 1366,
    height: 768,
    minWidth: 1100,
    minHeight: 700,
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
  const failTimer = setTimeout(() => {
    console.error('COINFLOW_SMOKE_ERROR=Timed out');
    app.exit(1);
  }, 20000);

  try {
    await waitForRendererLoad(mainWindow);
    await new Promise(resolve => setTimeout(resolve, 900));

    const result = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const note = 'Smoke-' + Date.now();
        const click = (selector) => {
          const el = document.querySelector(selector);
          if (!el) throw new Error('Missing selector: ' + selector);
          el.click();
        };

        window.navigateToPage('add');
        await wait(600);
        click('#add-date-trigger');
        await wait(120);
        const datePickerVisible = Boolean(document.querySelector('.date-picker-popover:not([hidden])'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await wait(80);
        ['1', '2', '.', '3', '4'].forEach(key => click('.key-btn[data-key="' + key + '"]'));
        document.getElementById('add-note-input').value = note;
        document.getElementById('add-date-input').value = '2026-05-30';
        click('#btn-save-record');
        await wait(1500);

        const stats = await window.CoinFlowDB.getMonthlyStats(2026, 5);
        const savedTx = stats.transactions.find(tx => tx.note === note && tx.amount === 12.34);
        const exportResults = {
          csv: await window.CoinFlowExcel.exportToCSV(2026, 5),
          excel: await window.CoinFlowExcel.exportToExcel(2026, 5),
          html: await window.CoinFlowExportHTML.exportToHTML(2026, 5)
        };

        click('.nav-item[data-target="transactions"]');
        click('.nav-item[data-target="statistics"]');
        click('.nav-item[data-target="dashboard"]');
        await wait(800);

        const appRect = document.getElementById('app-container').getBoundingClientRect();
        const navRect = document.querySelector('.bottom-nav').getBoundingClientRect();
        const activePages = Array.from(document.querySelectorAll('.page.active')).map(el => el.id);

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
          navWidth: Math.round(navRect.width)
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

    result.rendererMessages = mainWindow.__coinflowRendererMessages;
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
