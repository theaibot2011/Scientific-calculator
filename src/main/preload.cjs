// Minimal, explicit bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  loadState: () => ipcRenderer.sendSync('state:load'),
  saveState: (text) => ipcRenderer.send('state:save', text),
  copy: (text) => ipcRenderer.send('clip:copy', text),
  paste: () => ipcRenderer.sendSync('clip:paste'),
  minimize: () => ipcRenderer.send('win:min'),
  maximize: () => ipcRenderer.send('win:max'),
  close: () => ipcRenderer.send('win:close'),
  setOnTop: (on) => ipcRenderer.send('win:ontop', on),
  version: ipcRenderer.sendSync('app:version'),
});
