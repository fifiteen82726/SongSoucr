const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const isDev = require('electron-is-dev');
const fs = require('fs');
const os = require('os');

let mainWindow;
let downloadProcess = null;

// Store user preferences
const prefsPath = path.join(os.homedir(), '.tidal_downloader_prefs.json');

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 1000,
    minWidth: 800,
    minHeight: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // Disable web security for development
    },
    titleBarStyle: 'hiddenInset',
    show: false,
    icon: path.join(__dirname, '../assets/icon.png')
  });

  // Load the app - always use build for now
  const startUrl = `file://${path.join(__dirname, '../build/index.html')}`;
  
  console.log('Loading URL:', startUrl);
  
  mainWindow.loadURL(startUrl).catch(err => {
    console.error('Failed to load URL:', err);
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
  });

  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools();
  
  // Handle load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Page failed to load:', errorCode, errorDescription, validatedURL);
  });
  
  // Handle page load
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (downloadProcess) {
      downloadProcess.kill();
    }
  });
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-preferences', async () => {
  try {
    if (fs.existsSync(prefsPath)) {
      const data = fs.readFileSync(prefsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading preferences:', error);
  }
  
  return {
    download_path: path.join(os.homedir(), 'Downloads'),
    format: 'mp3_320',
    last_url: ''
  };
});

ipcMain.handle('save-preferences', async (event, prefs) => {
  try {
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving preferences:', error);
    return false;
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Download Folder',
    buttonLabel: 'Select Folder',
    message: 'Choose where to save your downloaded music'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  
  return null;
});

ipcMain.handle('start-download', async (event, { url, format, downloadPath }) => {
  return new Promise((resolve, reject) => {
    // Path to the Python script
    const pythonScript = isDev 
      ? path.join(__dirname, '../../tidal_downloader.py')
      : path.join(process.resourcesPath, 'python/tidal_downloader.py');
    
    // Prepare arguments
    const args = [pythonScript, url];
    if (format === 'flac') {
      args.push('--no-mp3');
      args.push('-f', 'flac');
    } else {
      args.push('-f', 'mp3');
    }
    args.push('-o', downloadPath);
    
    console.log('Starting download with args:', args);
    
    // Spawn Python process
    downloadProcess = spawn('python3', args);
    
    let output = '';
    let errorOutput = '';
    
    downloadProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('Python stdout:', text);
      
      // Send progress updates to renderer
      if (text.includes('Starting download')) {
        mainWindow.webContents.send('download-progress', { 
          status: 'starting', 
          message: 'Starting download...' 
        });
      } else if (text.includes('Download initiated')) {
        const idMatch = text.match(/ID: ([^\)]+)/);
        const id = idMatch ? idMatch[1] : 'Unknown';
        mainWindow.webContents.send('download-progress', { 
          status: 'queued', 
          message: `Download queued (ID: ${id})` 
        });
      } else if (text.includes('Status:')) {
        const statusMatch = text.match(/Status: (.+)/);
        const status = statusMatch ? statusMatch[1] : 'Processing';
        mainWindow.webContents.send('download-progress', { 
          status: 'processing', 
          message: `Status: ${status}` 
        });
      } else if (text.includes('Progress:')) {
        const progressMatch = text.match(/Progress: ([\d.]+)%/);
        const progress = progressMatch ? parseFloat(progressMatch[1]) : 0;
        mainWindow.webContents.send('download-progress', { 
          status: 'downloading', 
          message: `Downloading... ${progress}%`,
          progress 
        });
      } else if (text.includes('Converting')) {
        mainWindow.webContents.send('download-progress', { 
          status: 'converting', 
          message: 'Converting to MP3 320kbps...' 
        });
      } else if (text.includes('Converted to:') || text.includes('.mp3')) {
        mainWindow.webContents.send('download-progress', { 
          status: 'converting', 
          message: 'Converting to MP3 320kbps...' 
        });
      } else if (text.includes('Download completed successfully') || text.includes('Cleanup complete') || text.includes('Final MP3 files')) {
        mainWindow.webContents.send('download-progress', { 
          status: 'completed', 
          message: '✅ Download completed! Ready for your DJ set! 🎧',
          progress: 100
        });
      }
    });
    
    downloadProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error('Python stderr:', text);
      
      if (text.includes('Error') || text.includes('Failed')) {
        mainWindow.webContents.send('download-progress', { 
          status: 'error', 
          message: `Error: ${text}` 
        });
      }
    });
    
    downloadProcess.on('close', (code) => {
      downloadProcess = null;
      console.log(`Python process exited with code ${code}`);
      
      if (code === 0) {
        // Send completion status when process exits successfully
        mainWindow.webContents.send('download-progress', { 
          status: 'completed', 
          message: '✅ Download completed! Ready for your DJ set! 🎧',
          progress: 100
        });
        resolve({ success: true, output });
      } else {
        const errorMsg = errorOutput || `Process exited with code ${code}`;
        mainWindow.webContents.send('download-progress', { 
          status: 'error', 
          message: `Download failed: ${errorMsg}` 
        });
        reject(new Error(errorMsg));
      }
    });
    
    downloadProcess.on('error', (error) => {
      downloadProcess = null;
      console.error('Failed to start Python process:', error);
      mainWindow.webContents.send('download-progress', { 
        status: 'error', 
        message: `Failed to start download: ${error.message}` 
      });
      reject(error);
    });
  });
});

ipcMain.handle('cancel-download', async () => {
  if (downloadProcess) {
    downloadProcess.kill();
    downloadProcess = null;
    mainWindow.webContents.send('download-progress', { 
      status: 'cancelled', 
      message: 'Download cancelled by user' 
    });
    return true;
  }
  return false;
});