const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coinflowDesktop', {
  saveFile(payload) {
    return ipcRenderer.invoke('coinflow:save-file', payload);
  }
});
