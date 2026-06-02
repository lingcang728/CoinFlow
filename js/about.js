// CoinFlow「关于」面板：显示版本号并驱动自动更新（检查 / 下载 / 重启安装）。
(function() {
  const modal = document.getElementById('modal-about');
  const btnClose = document.getElementById('btn-close-about-modal');
  const versionEl = document.getElementById('about-version');
  const btnCheck = document.getElementById('btn-check-update');
  const statusEl = document.getElementById('about-update-status');
  const btnRestart = document.getElementById('btn-restart-install');

  let hasInitialized = false;
  let versionLoaded = false;
  let checking = false;

  const updater = window.coinflowUpdater;       // 仅打包版存在
  const desktop = window.coinflowDesktop;        // 仅 Electron 存在

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setChecking(isChecking) {
    checking = isChecking;
    if (btnCheck) {
      btnCheck.disabled = isChecking;
      btnCheck.textContent = isChecking ? '检查中…' : '检查更新';
    }
  }

  async function loadVersion() {
    if (versionLoaded || !versionEl) return;
    if (desktop && typeof desktop.getAppInfo === 'function') {
      try {
        const info = await desktop.getAppInfo();
        versionEl.textContent = info && info.version ? info.version : '未知';
        versionLoaded = true;
      } catch (error) {
        versionEl.textContent = '未知';
      }
    } else {
      versionEl.textContent = '开发模式';
      versionLoaded = true;
    }
  }

  function handleStatus(payload) {
    if (!payload) return;
    switch (payload.state) {
      case 'checking':
        setChecking(true);
        setStatus('正在检查更新…');
        break;
      case 'available':
        setStatus(`发现新版本 ${payload.version || ''}，正在下载…`);
        break;
      case 'downloading':
        setStatus(`正在下载更新… ${payload.percent || 0}%`);
        break;
      case 'downloaded':
        setChecking(false);
        setStatus(`新版本 ${payload.version || ''} 已下载完成`);
        if (btnRestart) btnRestart.hidden = false;
        break;
      case 'latest':
        setChecking(false);
        setStatus(`当前已是最新版本${payload.version ? `（${payload.version}）` : ''}`);
        break;
      case 'error':
        setChecking(false);
        setStatus(`检查更新失败：${payload.message || '请稍后重试或检查网络'}`);
        break;
      default:
        break;
    }
  }

  async function onCheckClick() {
    if (checking) return;
    if (btnRestart) btnRestart.hidden = true;

    if (!updater || typeof updater.check !== 'function') {
      setStatus('当前为开发模式，无法在线检查更新');
      return;
    }

    setChecking(true);
    setStatus('正在检查更新…');
    try {
      const result = await updater.check();
      if (result && result.state === 'dev') {
        setChecking(false);
        setStatus('开发模式：未打包，跳过在线更新');
      } else if (result && result.state === 'error') {
        setChecking(false);
        setStatus(`检查更新失败：${result.message || '请稍后重试'}`);
      }
      // 其余进度由 onStatus 事件驱动
    } catch (error) {
      setChecking(false);
      setStatus('检查更新失败，请检查网络后重试');
    }
  }

  function onRestartClick() {
    if (updater && typeof updater.quitAndInstall === 'function') {
      setStatus('正在重启并安装…');
      updater.quitAndInstall();
    }
  }

  function init() {
    if (hasInitialized) return;
    hasInitialized = true;

    if (btnClose) btnClose.addEventListener('click', close);
    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
      });
    }
    if (btnCheck) btnCheck.addEventListener('click', onCheckClick);
    if (btnRestart) btnRestart.addEventListener('click', onRestartClick);

    if (updater && typeof updater.onStatus === 'function') {
      updater.onStatus(handleStatus);
    }
  }

  function open() {
    init();
    loadVersion();
    if (modal) modal.classList.add('active');
  }

  function close() {
    if (modal) modal.classList.remove('active');
  }

  window.CoinFlowAbout = { init, open, close };
})();
