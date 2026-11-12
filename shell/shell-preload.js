'use strict';

// shell-preload.js — jembatan untuk strip judul (shell.html) saja.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshChrome', {
  minimize: () => ipcRenderer.send('shell:minimize'),
  toggleMaximize: () => ipcRenderer.send('shell:toggle-maximize'),
  close: () => ipcRenderer.send('shell:close'),
  requestState: () => ipcRenderer.send('shell:request-state'),
  onState(callback) {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('shell:window-state', handler);
    return () => ipcRenderer.removeListener('shell:window-state', handler);
  },
  onStripHeight(callback) {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('shell:strip-height', handler);
    return () => ipcRenderer.removeListener('shell:strip-height', handler);
  },
});
