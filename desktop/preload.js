const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coinflowDesktop', {
  saveFile(payload) {
    return ipcRenderer.invoke('coinflow:save-file', payload);
  },
  // 应用信息（版本号等），供「关于」面板显示
  getAppInfo() {
    return ipcRenderer.invoke('coinflow:get-app-info');
  }
});

contextBridge.exposeInMainWorld('coinflowLedger', {
  read() {
    return ipcRenderer.invoke('coinflow:ledger-read');
  },
  write(payload) {
    return ipcRenderer.invoke('coinflow:ledger-write', payload);
  },
  getPath() {
    return ipcRenderer.invoke('coinflow:ledger-path');
  }
});

// 自动更新桥接：检查更新、退出安装、订阅更新状态
contextBridge.exposeInMainWorld('coinflowUpdater', {
  check() {
    return ipcRenderer.invoke('coinflow:check-update');
  },
  quitAndInstall() {
    return ipcRenderer.invoke('coinflow:quit-and-install');
  },
  onStatus(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('coinflow:update-status', (_event, payload) => callback(payload));
  }
});
