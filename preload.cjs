const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
    getConfig: () => ipcRenderer.invoke('config:get'),
    saveConfig: nextConfig => ipcRenderer.invoke('config:save', nextConfig),
    chooseResultsDir: () => ipcRenderer.invoke('results-dir:choose'),
    loadResults: () => ipcRenderer.invoke('results:load'),
    onResultsChanged: callback => {
        const listener = () => callback()
        ipcRenderer.on('results:changed', listener)
        return () => ipcRenderer.removeListener('results:changed', listener)
    },
})