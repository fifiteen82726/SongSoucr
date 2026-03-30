const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Preferences
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  savePreferences: (prefs) => ipcRenderer.invoke('save-preferences', prefs),
  
  // File system
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  
  // Download functionality
  startDownload: ({ url, format, downloadPath }) => 
    ipcRenderer.invoke('start-download', { url, format, downloadPath }),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  
  // Queue functionality
  addToQueue: ({ url, format, downloadPath, downloadMethod }) =>
    ipcRenderer.invoke('add-to-queue', { url, format, downloadPath, downloadMethod }),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  removeFromQueue: (itemId) => ipcRenderer.invoke('remove-from-queue', itemId),
  retryDownload: (itemId) => ipcRenderer.invoke('retry-download', itemId),

  // Batch search functionality
  batchSearch: (songList) => ipcRenderer.invoke('batch-search', songList),
  
  // Progress updates
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  onQueueUpdated: (callback) => {
    ipcRenderer.on('queue-updated', (event, data) => callback(data));
  },
  
  // Cleanup listener
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
