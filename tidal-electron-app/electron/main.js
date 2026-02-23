const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
// More reliable way to detect development mode
const isDev = process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath);
console.log('Development mode detection:', { isDev, NODE_ENV: process.env.NODE_ENV, defaultApp: process.defaultApp });
const fs = require('fs');
const os = require('os');
const https = require('https');

let mainWindow;
let downloadProcess = null;
let downloadQueue = [];
let isProcessingQueue = false;
let captchaWindow = null;
let captchaFlowPromise = null;
let captchaArtifacts = {
  captchaToken: '',
  captchaResponse: ''
};

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

function buildLucidaUrl(musicUrl) {
  const cleanUrl = cleanTidalUrl(musicUrl);
  return `https://lucida.to/?url=${encodeURIComponent(cleanUrl)}&country=auto`;
}

function buildDoubleDoubleUrl(musicUrl) {
  const normalizedUrl = musicUrl && musicUrl.includes('tidal.com')
    ? cleanTidalUrl(musicUrl)
    : musicUrl;
  return `https://us.doubledouble.top/?url=${encodeURIComponent(normalizedUrl || '')}`;
}

function parseDownloaderFailure(output, errorOutput, sourceUrl, exitCode) {
  const combined = `${output || ''}\n${errorOutput || ''}`.replace(/\r/g, '');
  const lines = combined
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const lowercaseLines = lines.map(line => line.toLowerCase());
  const requiresCaptcha = lowercaseLines.some(line =>
    line.includes('captcha is required to continue') ||
    line.includes('captcha bypass token is invalid')
  );

  if (requiresCaptcha) {
    return {
      message: 'DoubleDouble requires CAPTCHA verification. Complete it in the popup window and the app will retry automatically.',
      requiresCaptcha
    };
  }

  const usefulPatterns = [
    /^❌\s*Download failed:/i,
    /^Failed to initiate download:/i,
    /^Error making request:/i,
    /^Error polling status:/i,
    /^Error downloading file:/i,
    /^Invalid JSON response:/i,
    /^Timeout waiting for download completion/i,
    /^Download marked as done but no URL provided/i
  ];

  for (const line of lines) {
    if (usefulPatterns.some(pattern => pattern.test(line))) {
      return {
        message: line,
        requiresCaptcha
      };
    }
  }

  return {
    message: lines.length > 0 ? lines[lines.length - 1] : `Process exited with code ${exitCode}`,
    requiresCaptcha
  };
}

function normalizeCaptchaArtifacts(raw) {
  if (!raw || typeof raw !== 'object') {
    return { captchaToken: '', captchaResponse: '' };
  }

  return {
    captchaToken: typeof raw.captchaToken === 'string' ? raw.captchaToken.trim() : '',
    captchaResponse: typeof raw.captchaResponse === 'string' ? raw.captchaResponse.trim() : ''
  };
}

function hasCaptchaArtifacts(raw) {
  const artifacts = normalizeCaptchaArtifacts(raw);
  return Boolean(artifacts.captchaToken || artifacts.captchaResponse);
}

function rememberCaptchaArtifacts(raw) {
  const artifacts = normalizeCaptchaArtifacts(raw);
  if (artifacts.captchaToken) {
    captchaArtifacts.captchaToken = artifacts.captchaToken;
  }
  if (artifacts.captchaResponse) {
    captchaArtifacts.captchaResponse = artifacts.captchaResponse;
  }
}

function getCaptchaArtifactsSnapshot() {
  const snapshot = {
    captchaToken: captchaArtifacts.captchaToken || '',
    captchaResponse: captchaArtifacts.captchaResponse || ''
  };
  // Raw CAPTCHA responses are usually short-lived, use them once.
  captchaArtifacts.captchaResponse = '';
  return snapshot;
}

async function readCaptchaArtifactsFromWindow(windowRef) {
  const raw = await windowRef.webContents.executeJavaScript(
    `(() => ({
      captchaToken: sessionStorage.getItem("captchaToken") || "",
      captchaResponse: sessionStorage.getItem("captcha-response") || ""
    }))();`,
    true
  );
  return normalizeCaptchaArtifacts(raw);
}

function requestDoubleDoubleVerification(sourceUrl) {
  if (captchaFlowPromise) {
    return captchaFlowPromise;
  }

  captchaFlowPromise = new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer = null;

    const cleanup = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      captchaFlowPromise = null;
    };

    const finish = (error, artifacts) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      const finalize = () => {
        if (error) {
          reject(error);
        } else {
          resolve(artifacts);
        }
      };

      if (captchaWindow && !captchaWindow.isDestroyed()) {
        const closingWindow = captchaWindow;
        captchaWindow = null;
        closingWindow.close();
      } else {
        captchaWindow = null;
      }

      finalize();
    };

    const authUrl = buildDoubleDoubleUrl(sourceUrl);
    captchaWindow = new BrowserWindow({
      width: 1100,
      height: 860,
      minWidth: 900,
      minHeight: 700,
      parent: mainWindow,
      modal: true,
      show: false,
      title: 'DoubleDouble Verification',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:doubledouble-auth',
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    captchaWindow.once('ready-to-show', () => {
      if (captchaWindow && !captchaWindow.isDestroyed()) {
        captchaWindow.show();
        captchaWindow.focus();
      }
    });

    captchaWindow.on('closed', () => {
      if (!settled) {
        cleanup();
        captchaWindow = null;
        reject(new Error('Verification window closed before CAPTCHA completed.'));
      }
    });

    captchaWindow.loadURL(authUrl).catch((loadError) => {
      finish(new Error(`Failed to open DoubleDouble verification window: ${loadError.message}`));
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', {
        status: 'processing',
        message: 'Please complete DoubleDouble CAPTCHA in the popup window, then click Download there once.'
      });
    }

    pollTimer = setInterval(async () => {
      if (!captchaWindow || captchaWindow.isDestroyed()) {
        return;
      }

      try {
        const artifacts = await readCaptchaArtifactsFromWindow(captchaWindow);
        if (hasCaptchaArtifacts(artifacts)) {
          rememberCaptchaArtifacts(artifacts);
          finish(null, getCaptchaArtifactsSnapshot());
        }
      } catch (pollError) {
        // Ignore transient script execution errors while page is loading/changing.
      }
    }, 1200);
  });

  return captchaFlowPromise;
}

function getDownloaderExecutablePath() {
  const arch = os.arch();
  return isDev
    ? 'python3'
    : path.join(process.resourcesPath, `binaries/tidal-downloader-${arch}`);
}

function configureFfmpegPath() {
  if (isDev) {
    return;
  }
  const arch = os.arch();
  const ffmpegPath = path.join(process.resourcesPath, `binaries/ffmpeg-${arch}`);
  const ffmpegDir = path.dirname(ffmpegPath);
  process.env.PATH = `${ffmpegDir}:${process.env.PATH}`;
}

function buildDownloaderArgs({ url, format, downloadPath, mode, captcha }) {
  const args = isDev
    ? [path.join(__dirname, '../../tidal_downloader.py'), url]
    : [url];

  if (mode === 'queue') {
    if (format === 'flac') {
      args.push('--no-mp3');
      args.push('-f', 'flac');
    } else {
      args.push('-f', 'flac');
    }
  } else if (format === 'flac') {
    args.push('--no-mp3');
    args.push('-f', 'flac');
  } else {
    args.push('-f', 'mp3');
  }

  // The current production binary may not yet include CAPTCHA CLI args.
  if (isDev && captcha && captcha.captchaResponse) {
    args.push('--captcha-response', captcha.captchaResponse);
  }
  if (isDev && captcha && captcha.captchaToken) {
    args.push('--captcha-token', captcha.captchaToken);
  }

  args.push('-o', downloadPath);
  return args;
}

function spawnDownloaderAttempt({
  url,
  format,
  downloadPath,
  mode,
  captcha,
  trackGlobalProcess = false,
  onStdout,
  onStderr
}) {
  return new Promise((resolve, reject) => {
    const executablePath = getDownloaderExecutablePath();
    configureFfmpegPath();
    const args = buildDownloaderArgs({ url, format, downloadPath, mode, captcha });

    console.log('Starting download with args:', args);
    console.log('Executable path:', executablePath);
    console.log('Is development mode:', isDev);

    if (!isDev && !fs.existsSync(executablePath)) {
      reject(new Error(`Executable not found: ${executablePath}`));
      return;
    }

    if (!isDev) {
      try {
        fs.chmodSync(executablePath, 0o755);
      } catch (permissionError) {
        console.warn('Could not set executable permissions:', permissionError.message);
      }
    }

    let childProcess;
    try {
      childProcess = spawn(executablePath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        shell: false,
        detached: false
      });
    } catch (spawnError) {
      reject(new Error(`Failed to start download process: ${spawnError.message}`));
      return;
    }

    if (trackGlobalProcess) {
      downloadProcess = childProcess;
    }

    let output = '';
    let errorOutput = '';

    childProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (onStdout) {
        onStdout(text);
      }
    });

    childProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      if (onStderr) {
        onStderr(text);
      }
    });

    childProcess.on('close', (code) => {
      if (trackGlobalProcess && downloadProcess === childProcess) {
        downloadProcess = null;
      }

      if (code === 0) {
        resolve({ output, errorOutput, code });
        return;
      }

      const failure = parseDownloaderFailure(output, errorOutput, url, code);
      const error = new Error(failure.message);
      error.requiresCaptcha = Boolean(failure.requiresCaptcha);
      error.failure = failure;
      reject(error);
    });

    childProcess.on('error', (error) => {
      if (trackGlobalProcess && downloadProcess === childProcess) {
        downloadProcess = null;
      }
      reject(error);
    });
  });
}

async function runDownloaderWithCaptchaRetry({
  url,
  format,
  downloadPath,
  mode,
  trackGlobalProcess = false,
  onStdout,
  onStderr
}) {
  try {
    return await spawnDownloaderAttempt({
      url,
      format,
      downloadPath,
      mode,
      captcha: getCaptchaArtifactsSnapshot(),
      trackGlobalProcess,
      onStdout,
      onStderr
    });
  } catch (firstError) {
    if (!firstError.requiresCaptcha) {
      throw firstError;
    }

    const verifiedArtifacts = await requestDoubleDoubleVerification(url);
    return await spawnDownloaderAttempt({
      url,
      format,
      downloadPath,
      mode,
      captcha: verifiedArtifacts,
      trackGlobalProcess,
      onStdout,
      onStderr
    });
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

async function downloadSong(queueItem) {
  await runDownloaderWithCaptchaRetry({
    url: queueItem.url,
    format: queueItem.format,
    downloadPath: queueItem.downloadPath,
    mode: 'queue',
    trackGlobalProcess: false,
    onStdout: (text) => {
      if (text.includes('Progress:')) {
        const progressMatch = text.match(/Progress: ([\d.]+)%/);
        if (progressMatch) {
          queueItem.progress = parseFloat(progressMatch[1]);
          mainWindow.webContents.send('queue-updated', downloadQueue);
        }
      }
    }
  });
}

function createWindow() {
  console.log('Creating main window...');
  console.log('isDev:', isDev);
  console.log('App ready status:', app.isReady());
  console.log('Resource path:', process.resourcesPath);
  
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

  // Open DevTools only in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
  
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
    if (captchaWindow && !captchaWindow.isDestroyed()) {
      captchaWindow.close();
    }
  });
}

// App event handlers
app.whenReady().then(() => {
  console.log('App is ready, creating window...');
  createWindow();
}).catch(err => {
  console.error('Failed to create window:', err);
});

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
    last_url: '',
    download_method: 'doubledouble' // 'doubledouble' or 'lucida'
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

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    if (folderPath && fs.existsSync(folderPath)) {
      await shell.openPath(folderPath);
      return { success: true };
    } else {
      return { success: false, error: 'Folder does not exist' };
    }
  } catch (error) {
    console.error('Error opening folder:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-lucida', async (event, url) => {
  try {
    const lucidaUrl = buildLucidaUrl(url);
    console.log('Opening lucida.to URL:', lucidaUrl);
    await shell.openExternal(lucidaUrl);
    return { success: true, url: lucidaUrl };
  } catch (error) {
    console.error('Error opening lucida.to:', error);
    return { success: false, error: error.message };
  }
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
  try {
    const result = await runDownloaderWithCaptchaRetry({
      url,
      format,
      downloadPath,
      mode: 'direct',
      trackGlobalProcess: true,
      onStdout: (text) => {
        console.log('Python stdout:', text);

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
        } else if (
          text.includes('Download completed successfully') ||
          text.includes('Cleanup complete') ||
          text.includes('Final MP3 files')
        ) {
          mainWindow.webContents.send('download-progress', {
            status: 'completed',
            message: '✅ Download completed! Ready for your DJ set! 🎧',
            progress: 100
          });
        }
      },
      onStderr: (text) => {
        console.error('Python stderr:', text);
      }
    });

    mainWindow.webContents.send('download-progress', {
      status: 'completed',
      message: '✅ Download completed! Ready for your DJ set! 🎧',
      progress: 100
    });

    return { success: true, output: result.output };
  } catch (error) {
    console.error('Download failed:', error);
    mainWindow.webContents.send('download-progress', {
      status: 'error',
      message: error.message || 'Download failed.'
    });
    throw error;
  }
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

// Batch search handler
ipcMain.handle('batch-search', async (event, songList) => {
  return new Promise((resolve, reject) => {
    // Use Python 3 to run batch_search.py
    const batchSearchScript = path.join(__dirname, '../../batch_search.py');

    console.log(`Starting batch search for ${songList.length} songs`);
    console.log('Batch search script path:', batchSearchScript);

    // Check if script exists
    if (!fs.existsSync(batchSearchScript)) {
      reject(new Error(`Batch search script not found: ${batchSearchScript}`));
      return;
    }

    // Spawn Python process with stdin
    const pythonProcess = spawn('python3', [batchSearchScript, '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let output = '';
    let errorOutput = '';

    // Send song list to stdin
    const input = songList.join('\n');
    pythonProcess.stdin.write(input);
    pythonProcess.stdin.end();

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.log('Batch search stderr:', text);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Batch search process exited with code ${code}`);

      if (code === 0) {
        try {
          const results = JSON.parse(output);
          console.log(`Batch search completed: ${results.successful} successful, ${results.failed} failed`);
          resolve(results);
        } catch (parseError) {
          console.error('Failed to parse batch search results:', parseError);
          console.error('Output was:', output);
          reject(new Error(`Failed to parse search results: ${parseError.message}`));
        }
      } else {
        const errorMsg = errorOutput || `Process exited with code ${code}`;
        console.error(`Batch search failed: ${errorMsg}`);
        reject(new Error(errorMsg));
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to start batch search process:', error);
      reject(error);
    });
  });
});
