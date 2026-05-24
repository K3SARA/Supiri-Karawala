const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('PrintCarePlus', {
  getPrinters: () => ipcRenderer.invoke('printers:list'),
  printLabel: (html, options = {}) => ipcRenderer.invoke('labels:print', html, options)
});
