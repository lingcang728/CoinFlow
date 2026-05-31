// CoinFlow runtime helpers shared by browser/PWA and Electron desktop.
(function() {
  let xlsxLoadPromise = null;

  function loadScriptOnce(src, globalName) {
    if (globalName && window[globalName]) {
      return Promise.resolve(window[globalName]);
    }

    const existing = document.querySelector(`script[data-runtime-src="${src}"]`);
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
        existing.addEventListener('error', () => reject(new Error(`脚本加载失败：${src}`)), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.runtimeSrc = src;
      script.onload = () => resolve(globalName ? window[globalName] : true);
      script.onerror = () => reject(new Error(`脚本加载失败：${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureXlsx() {
    if (window.XLSX) {
      return window.XLSX;
    }

    if (!xlsxLoadPromise) {
      xlsxLoadPromise = loadScriptOnce('vendor/xlsx/xlsx.full.min.js', 'XLSX').then((xlsx) => {
        if (!xlsx) {
          throw new Error('XLSX 运行库加载失败');
        }
        return xlsx;
      });
    }

    return xlsxLoadPromise;
  }

  function browserDownload({ defaultPath, data, mimeType = 'application/octet-stream' }) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultPath || 'CoinFlow-export.dat';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { canceled: false, filePath: null, fallback: 'browser-download' };
  }

  async function saveFile(options) {
    if (!options || !options.data) {
      throw new Error('缺少导出文件内容');
    }

    if (window.coinflowDesktop && typeof window.coinflowDesktop.saveFile === 'function') {
      return window.coinflowDesktop.saveFile(options);
    }

    return browserDownload(options);
  }

  window.CoinFlowRuntime = {
    ensureXlsx,
    loadScriptOnce,
    saveFile
  };
})();
