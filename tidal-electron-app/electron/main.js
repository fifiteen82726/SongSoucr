const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const isDev = require('electron-is-dev');
const fs = require('fs');
const os = require('os');
const https = require('https');

let mainWindow;
let downloadProcess = null;
let downloadQueue = [];
let isProcessingQueue = false;

// Store user preferences
const prefsPath = path.join(os.homedir(), '.tidal_downloader_prefs.json');

// Helper functions
function cleanTidalUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove tracking parameters like ?u
    urlObj.search = '';
    return urlObj.toString();
  } catch (error) {
    return url; // Return original if parsing fails
  }
}

function fetchSongMetadata(url) {
  return new Promise((resolve, reject) => {
    const cleanUrl = cleanTidalUrl(url);
    
    https.get(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      }
    }, (res) => {
      let html = '';
      
      res.on('data', (chunk) => {
        html += chunk;
      });
      
      res.on('end', () => {
        try {
          // Debug: log the HTML content
          console.log('Fetched HTML length:', html.length);
          console.log('HTML preview:', html.substring(0, 1000));
          
          // Extract song title from meta tags or title
          let title = 'Unknown Track';
          let artist = 'Unknown Artist';
          
          // Try to extract from JSON-LD structured data first
          const jsonLdMatches = html.match(/<script[^>]*type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>/gis);
          if (jsonLdMatches) {
            for (const match of jsonLdMatches) {
              try {
                const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
                const jsonData = JSON.parse(jsonContent);
                
                // Look for MusicRecording type
                if (jsonData['@type'] === 'MusicRecording' || 
                    (Array.isArray(jsonData) && jsonData.some(item => item['@type'] === 'MusicRecording'))) {
                  
                  const musicData = Array.isArray(jsonData) ? 
                    jsonData.find(item => item['@type'] === 'MusicRecording') : jsonData;
                  
                  if (musicData.name) {
                    title = musicData.name;
                  }
                  
                  if (musicData.byArtist) {
                    if (Array.isArray(musicData.byArtist)) {
                      artist = musicData.byArtist.map(a => a.name).join(', ');
                    } else if (musicData.byArtist.name) {
                      artist = musicData.byArtist.name;
                    }
                  }
                  
                  break; // Found what we need
                }
              } catch (e) {
                // Continue to next JSON-LD block
                console.log('Failed to parse JSON-LD block:', e);
              }
            }
          }
          
          // Try various meta tags for title and artist
          if (title === 'Unknown Track') {
            // Try og:title
            const ogTitleMatch = html.match(/<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
            if (ogTitleMatch) {
              title = ogTitleMatch[1];
            }
            
            // Try twitter:title
            const twitterTitleMatch = html.match(/<meta[^>]*name=["\']twitter:title["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
            if (twitterTitleMatch && title === 'Unknown Track') {
              title = twitterTitleMatch[1];
            }
          }
          
          if (artist === 'Unknown Artist') {
            // Try og:description which might contain artist info
            const ogDescMatch = html.match(/<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
            if (ogDescMatch) {
              const desc = ogDescMatch[1];
              // Look for "by Artist" pattern in description
              const byMatch = desc.match(/by\s+([^,\n\r]+)/i);
              if (byMatch) {
                artist = byMatch[1].trim();
              }
            }
            
            // Try twitter:audio:artist
            const twitterArtistMatch = html.match(/<meta[^>]*name=["\']twitter:audio:artist["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
            if (twitterArtistMatch) {
              artist = twitterArtistMatch[1];
            }
          }
          
          // Fallback: Try to extract from title tag if still unknown
          if (title === 'Unknown Track') {
            const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (pageTitleMatch) {
              const fullTitle = pageTitleMatch[1].replace(' - TIDAL', '').trim();
              const byMatch = fullTitle.match(/^(.+?)\s+by\s+(.+)$/i);
              if (byMatch) {
                title = byMatch[1].trim();
                if (artist === 'Unknown Artist') {
                  artist = byMatch[2].trim();
                }
              } else {
                title = fullTitle;
              }
            }
          }
          
          console.log('Extracted title:', title);
          console.log('Extracted artist:', artist);
          
          resolve({
            title: title,
            artist: artist,
            url: cleanUrl,
            originalUrl: url
          });
        } catch (error) {
          reject(new Error('Failed to parse song metadata'));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

async function processQueue() {
  if (isProcessingQueue || downloadQueue.length === 0) {
    return;
  }
  
  const nextItem = downloadQueue.find(item => item.status === 'queued');
  if (!nextItem) {
    return;
  }
  
  isProcessingQueue = true;
  nextItem.status = 'downloading';
  nextItem.progress = 0;
  
  mainWindow.webContents.send('queue-updated', downloadQueue);
  
  try {
    await downloadSong(nextItem);
    nextItem.status = 'completed';
    nextItem.progress = 100;
  } catch (error) {
    nextItem.status = 'failed';
    nextItem.error = error.message;
    nextItem.progress = 0;
  }
  
  mainWindow.webContents.send('queue-updated', downloadQueue);
  isProcessingQueue = false;
  
  // Process next item in queue
  setTimeout(() => processQueue(), 1000);
}

function downloadSong(queueItem) {
  return new Promise((resolve, reject) => {
    // Use standalone executable in production, Python script in development
    const executablePath = isDev 
      ? 'python3'
      : path.join(process.resourcesPath, 'binaries/tidal-downloader');
    
    // Set FFmpeg path for the executable
    if (!isDev) {
      const ffmpegPath = path.join(process.resourcesPath, 'binaries/ffmpeg');
      const ffmpegDir = path.dirname(ffmpegPath);
      process.env.PATH = `${ffmpegDir}:${process.env.PATH}`;
    }
    
    const args = isDev 
      ? [path.join(__dirname, '../../tidal_downloader.py'), queueItem.url]
      : [queueItem.url];
    if (queueItem.format === 'flac') {
      args.push('--no-mp3');
      args.push('-f', 'flac');
    } else {
      // For MP3 320kbps, download as FLAC and convert to MP3 320kbps
      args.push('-f', 'flac');
      // Don't add --no-mp3, so it will convert to MP3 320kbps
    }
    args.push('-o', queueItem.downloadPath);
    
    console.log('Starting download for queue item:', queueItem.id);
    console.log('Command args:', args);
    
    const process = spawn(executablePath, args);
    
    let output = '';
    let errorOutput = '';
    
    process.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      
      // Update progress for this specific queue item
      if (text.includes('Progress:')) {
        const progressMatch = text.match(/Progress: ([\d.]+)%/);
        if (progressMatch) {
          queueItem.progress = parseFloat(progressMatch[1]);
          mainWindow.webContents.send('queue-updated', downloadQueue);
        }
      }
    });
    
    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        reject(new Error(errorOutput || `Process exited with code ${code}`));
      }
    });
    
    process.on('error', (error) => {
      reject(error);
    });
  });
}

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
    titleBarStyle: 'default',
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

// Queue management handlers
ipcMain.handle('add-to-queue', async (event, { url, format, downloadPath }) => {
  try {
    console.log('Fetching metadata for:', url);
    const metadata = await fetchSongMetadata(url);
    
    const queueItem = {
      id: Date.now().toString(),
      ...metadata,
      format,
      downloadPath,
      status: 'queued',
      addedAt: new Date().toISOString(),
      progress: 0
    };
    
    downloadQueue.push(queueItem);
    
    // Notify frontend about queue update
    mainWindow.webContents.send('queue-updated', downloadQueue);
    
    // Start processing queue if not already processing
    processQueue();
    
    return { success: true, item: queueItem };
  } catch (error) {
    console.error('Error adding to queue:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-queue', async () => {
  return downloadQueue;
});

ipcMain.handle('remove-from-queue', async (event, itemId) => {
  const index = downloadQueue.findIndex(item => item.id === itemId);
  if (index !== -1) {
    downloadQueue.splice(index, 1);
    mainWindow.webContents.send('queue-updated', downloadQueue);
    return { success: true };
  }
  return { success: false, error: 'Item not found' };
});

ipcMain.handle('retry-download', async (event, itemId) => {
  const item = downloadQueue.find(item => item.id === itemId);
  if (item) {
    item.status = 'queued';
    item.progress = 0;
    item.error = null;
    mainWindow.webContents.send('queue-updated', downloadQueue);
    processQueue();
    return { success: true };
  }
  return { success: false, error: 'Item not found' };
});

ipcMain.handle('start-download', async (event, { url, format, downloadPath }) => {
  return new Promise((resolve, reject) => {
    // Use standalone executable in production, Python script in development
    const executablePath = isDev 
      ? 'python3'
      : path.join(process.resourcesPath, 'binaries/tidal-downloader');
    
    // Set FFmpeg path for the executable
    if (!isDev) {
      const ffmpegPath = path.join(process.resourcesPath, 'binaries/ffmpeg');
      const ffmpegDir = path.dirname(ffmpegPath);
      process.env.PATH = `${ffmpegDir}:${process.env.PATH}`;
    }
    
    // Prepare arguments
    const args = isDev 
      ? [path.join(__dirname, '../../tidal_downloader.py'), url]
      : [url];
    if (format === 'flac') {
      args.push('--no-mp3');
      args.push('-f', 'flac');
    } else {
      args.push('-f', 'mp3');
    }
    args.push('-o', downloadPath);
    
    console.log('Starting download with args:', args);
    
    // Spawn Python process
    downloadProcess = spawn(executablePath, args);
    
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