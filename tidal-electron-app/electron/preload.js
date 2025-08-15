const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Preferences
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  savePreferences: (prefs) => ipcRenderer.invoke('save-preferences', prefs),
  
  // File system
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  // Download functionality
  startDownload: ({ url, format, downloadPath }) => 
    ipcRenderer.invoke('start-download', { url, format, downloadPath }),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  
  // Progress updates
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  
  // Cleanup listener
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});