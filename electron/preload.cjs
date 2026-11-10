const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isMac: process.platform === 'darwin',
  isElectron: true,
})
