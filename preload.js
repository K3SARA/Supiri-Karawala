const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SupiriKarawala', {
  getPrinters: () => ipcRenderer.invoke('printers:list'),
  printLabel: (html, options = {}) => ipcRenderer.invoke('labels:print', html, options),
  openCashDrawer: (options = {}) => ipcRenderer.invoke('cash-drawer:open', options),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});
