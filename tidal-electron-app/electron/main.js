const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
// More reliable way to detect development mode
const isDev = process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath);
console.log('Development mode detection:', { isDev, NODE_ENV: process.env.NODE_ENV, defaultApp: process.defaultApp });
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');

let mainWindow;
let downloadProcess = null;
let downloadQueue = [];
let isProcessingQueue = false;
let captchaWindow = null;
let captchaFlowPromise = null;
let localIngestServer = null;
let captchaArtifacts = {
  captchaToken: '',
  captchaResponse: ''
};

// Store user preferences
const prefsPath = path.join(os.homedir(), '.tidal_downloader_prefs.json');
const LUCIDA_BASE_URL = 'https://lucida.to';
const LUCIDA_DIRECT_HOSTS = ['maus.lucida.to', 'hund.lucida.to', 'katze.lucida.to'];
const DEFAULT_HTTP_TIMEOUT_MS = 45000;
const LUCIDA_POLL_INTERVAL_MS = 1000;
const LUCIDA_MAX_POLL_ATTEMPTS = 120;
const DEFAULT_HTTP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
const LOCAL_INGEST_HOST = '127.0.0.1';
const LOCAL_INGEST_PORT = 43893;

function getDefaultPreferences() {
  return {
    download_path: path.join(os.homedir(), 'Downloads'),
    format: 'mp3_320',
    last_url: '',
    download_method: 'doubledouble'
  };
}

function readPreferencesSync() {
  const defaults = getDefaultPreferences();
  try {
    if (!fs.existsSync(prefsPath)) {
      return defaults;
    }
    const data = fs.readFileSync(prefsPath, 'utf8');
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object') {
      return defaults;
    }
    return {
      ...defaults,
      ...parsed
    };
  } catch (error) {
    console.error('Error reading preferences:', error);
    return defaults;
  }
}

// Helper functions
function cleanTidalUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) {
    return raw;
  }

  const withScheme = /^(?:https?:)?\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const urlObj = new URL(withScheme);
    const host = urlObj.hostname.toLowerCase();
    if (!host.includes('tidal.com')) {
      return raw;
    }

    let pathname = urlObj.pathname || '/';
    pathname = pathname.replace(/^\/browse(?=\/)/i, '');
    pathname = pathname.replace(/\/+$/, '');
    pathname = pathname.replace(/\/u$/i, '');

    const normalizedPath = pathname || '/';
    const trackMatch = normalizedPath.match(/^\/track\/(\d+)$/i);
    const albumMatch = normalizedPath.match(/^\/album\/(\d+)$/i);
    const playlistMatch = normalizedPath.match(/^\/playlist\/([0-9a-f-]+)$/i);
    const videoMatch = normalizedPath.match(/^\/video\/(\d+)$/i);

    urlObj.hostname = 'tidal.com';
    if (trackMatch) {
      urlObj.pathname = `/track/${trackMatch[1]}`;
    } else if (albumMatch) {
      urlObj.pathname = `/album/${albumMatch[1]}`;
    } else if (playlistMatch) {
      urlObj.pathname = `/playlist/${playlistMatch[1]}`;
    } else if (videoMatch) {
      urlObj.pathname = `/video/${videoMatch[1]}`;
    } else {
      urlObj.pathname = normalizedPath;
    }

    // Remove tracking parameters like ?u and app deep-link hashes.
    urlObj.search = '';
    urlObj.hash = '';
    return urlObj.toString();
  } catch (error) {
    return raw; // Return original if parsing fails
  }
}

function detectMusicService(url) {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();
    const pathName = parsedUrl.pathname.toLowerCase();
    const query = parsedUrl.search.toLowerCase();

    if (host.includes('tidal.com')) {
      return 'tidal';
    }

    if (host === 'music.amazon.com' || host.endsWith('.music.amazon.com')) {
      return 'amazon';
    }

    if (host === 'amazon.com' || host === 'www.amazon.com' || host.endsWith('.amazon.com')) {
      if (
        pathName.startsWith('/music') ||
        pathName.startsWith('/albums') ||
        pathName.startsWith('/tracks') ||
        query.includes('trackasin=') ||
        query.includes('musicterritory=')
      ) {
        return 'amazon';
      }
    }
  } catch (error) {
    const fallback = String(url || '').toLowerCase();
    if (fallback.includes('tidal.com')) {
      return 'tidal';
    }
    if (fallback.includes('music.amazon.') || fallback.includes('amazon.com/music/')) {
      return 'amazon';
    }
  }

  return null;
}

function cleanAmazonUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();

    if (parsedUrl.pathname.startsWith('/music/player')) {
      parsedUrl.pathname = parsedUrl.pathname.replace('/music/player', '') || '/music';
    }

    if (host === 'amazon.com' || host === 'www.amazon.com' || host.endsWith('.amazon.com')) {
      const baseHost = host.startsWith('www.') ? host.substring(4) : host;
      if (!baseHost.startsWith('music.')) {
        parsedUrl.hostname = `music.${baseHost}`;
      }
    }

    const allowedParams = ['marketplaceId', 'musicTerritory', 'trackAsin'];
    const cleanedQuery = new URLSearchParams();
    for (const key of allowedParams) {
      const value = parsedUrl.searchParams.get(key);
      if (value) {
        cleanedQuery.set(key, value);
      }
    }
    parsedUrl.search = cleanedQuery.toString();

    return parsedUrl.toString();
  } catch (error) {
    return url;
  }
}

function normalizeMusicUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  const service = detectMusicService(trimmed);
  if (service === 'tidal') {
    return cleanTidalUrl(trimmed);
  }
  if (service === 'amazon') {
    return cleanAmazonUrl(trimmed);
  }
  return trimmed;
}

function isTidalPlaylistUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();
    if (!host.includes('tidal.com')) {
      return false;
    }
    return pathname.includes('/playlist/');
  } catch (error) {
    const fallback = String(url || '').toLowerCase();
    return fallback.includes('tidal.com/playlist/') || fallback.includes('tidal.com/browse/playlist/');
  }
}

function extractTidalTrackId(url) {
  const raw = String(url || '');
  const fromPath = raw.match(/(?:\/browse)?\/track\/(\d+)/i);
  if (fromPath && fromPath[1]) {
    return fromPath[1];
  }
  const directDigits = raw.match(/^\d+$/);
  if (directDigits) {
    return directDigits[0];
  }
  return null;
}

function canonicalizeTidalTrackUrl(url) {
  const trackId = extractTidalTrackId(url);
  if (!trackId) {
    return null;
  }
  return `https://tidal.com/track/${trackId}`;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLucidaLoadUrl(apiPath, queryParams = {}) {
  const params = new URLSearchParams();
  params.set('url', apiPath);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  return `${LUCIDA_BASE_URL}/api/load?${params.toString()}`;
}

function buildLucidaDirectUrl(hostname, apiPath, queryParams = {}) {
  const directUrl = new URL(apiPath, `https://${hostname}`);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && value !== '') {
      directUrl.searchParams.set(key, String(value));
    }
  }
  return directUrl.toString();
}

function normalizeLucidaHost(serverName) {
  const raw = String(serverName || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.hostname) {
      return parsed.hostname.toLowerCase();
    }
  } catch (error) {
    // Not a full URL, continue with hostname normalization.
  }

  if (raw.endsWith('.lucida.to')) {
    return raw;
  }

  if (/^[a-z0-9-]+$/i.test(raw)) {
    return `${raw}.lucida.to`;
  }

  return null;
}

function getLucidaCandidateHosts(preferredServerName = '') {
  const seen = new Set();
  const preferredHost = normalizeLucidaHost(preferredServerName);
  const normalized = [];

  if (preferredHost && !seen.has(preferredHost)) {
    seen.add(preferredHost);
    normalized.push(preferredHost);
  }

  for (const host of LUCIDA_DIRECT_HOSTS) {
    const normalizedHost = normalizeLucidaHost(host);
    if (normalizedHost && !seen.has(normalizedHost)) {
      seen.add(normalizedHost);
      normalized.push(normalizedHost);
    }
  }

  return normalized;
}

function sanitizeFilename(filename) {
  return String(filename || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .trim();
}

function getFilenameFromContentDisposition(contentDisposition) {
  if (!contentDisposition || typeof contentDisposition !== 'string') {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (error) {
      return utf8Match[1];
    }
  }

  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (filenameMatch && filenameMatch[1]) {
    return filenameMatch[1];
  }

  return null;
}

function inferExtensionFromContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.includes('audio/flac')) {
    return '.flac';
  }
  if (normalized.includes('audio/mpeg') || normalized.includes('audio/mp3')) {
    return '.mp3';
  }
  if (normalized.includes('audio/ogg')) {
    return '.ogg';
  }
  if (normalized.includes('audio/wav') || normalized.includes('audio/x-wav')) {
    return '.wav';
  }
  if (normalized.includes('audio/mp4') || normalized.includes('audio/aac') || normalized.includes('audio/x-m4a')) {
    return '.m4a';
  }
  if (normalized.includes('application/zip')) {
    return '.zip';
  }
  return '';
}

function ensureUniqueFilePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }

  const parsed = path.parse(targetPath);
  let counter = 1;
  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name} (${counter})${parsed.ext}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

function buildFallbackFilename(queueItem) {
  const artist = sanitizeFilename(queueItem.artist || 'Unknown Artist') || 'Unknown Artist';
  const title = sanitizeFilename(queueItem.title || 'Unknown Track') || 'Unknown Track';
  return `${artist} - ${title}.flac`;
}

function extractLucidaErrorMessage(payload) {
  if (!payload) {
    return 'Unknown Lucida error.';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  const numericKeys = Object.keys(payload).filter((key) => /^\d+$/.test(key));
  if (numericKeys.length > 0) {
    const rawText = numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => payload[key])
      .join('');
    const compactText = rawText.replace(/\s+/g, ' ').trim();
    if (compactText) {
      if (compactText.includes('404 Not Found')) {
        return '404 Not Found (Lucida backend could not process this item).';
      }
      return compactText.slice(0, 220);
    }
  }

  return JSON.stringify(payload).slice(0, 220);
}

function requestWithRedirects({
  url,
  method = 'GET',
  headers = {},
  body = null,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  maxRedirects = 8
}) {
  return new Promise((resolve, reject) => {
    const payload = body == null
      ? null
      : Buffer.isBuffer(body)
        ? body
        : Buffer.from(String(body));

    const send = (requestUrl, requestMethod, requestBody, redirectsLeft) => {
      const parsedUrl = new URL(requestUrl);
      const transport = parsedUrl.protocol === 'http:' ? http : https;
      const requestHeaders = {
        'User-Agent': DEFAULT_HTTP_USER_AGENT,
        ...headers
      };

      if (requestBody && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-length')) {
        requestHeaders['Content-Length'] = String(requestBody.length);
      }

      const requestOptions = {
        method: requestMethod,
        headers: requestHeaders,
        timeout: timeoutMs
      };

      const req = transport.request(parsedUrl, requestOptions, (res) => {
        const statusCode = Number(res.statusCode || 0);

        if (
          [301, 302, 303, 307, 308].includes(statusCode) &&
          res.headers.location
        ) {
          if (redirectsLeft <= 0) {
            res.resume();
            reject(new Error(`Too many redirects while requesting ${url}`));
            return;
          }

          const redirectUrl = new URL(res.headers.location, parsedUrl).toString();
          res.resume();

          let nextMethod = requestMethod;
          let nextBody = requestBody;
          if (
            statusCode === 303 ||
            ((statusCode === 301 || statusCode === 302) && requestMethod !== 'GET' && requestMethod !== 'HEAD')
          ) {
            nextMethod = 'GET';
            nextBody = null;
          }

          send(redirectUrl, nextMethod, nextBody, redirectsLeft - 1);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
            finalUrl: requestUrl
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (requestBody) {
        req.write(requestBody);
      }
      req.end();
    };

    send(url, method, payload, maxRedirects);
  });
}

async function requestJsonWithRedirects(url, options = {}, context = 'Request') {
  const response = await requestWithRedirects({ url, ...options });
  const bodyText = response.body.toString('utf8');

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (error) {
    throw new Error(`${context} returned invalid JSON (HTTP ${response.statusCode}).`);
  }

  if (response.statusCode >= 400) {
    const message = extractLucidaErrorMessage(payload);
    throw new Error(`${context} failed (HTTP ${response.statusCode}): ${message}`);
  }

  return { response, payload };
}

async function requestLucidaJson({
  apiPath,
  queryParams = {},
  method = 'GET',
  headers = {},
  body = null,
  context = 'Lucida request'
}) {
  const forcedServer = queryParams && queryParams.force ? queryParams.force : '';
  const candidateHosts = getLucidaCandidateHosts(forcedServer);
  const urlsToTry = [
    ...candidateHosts.map((host) => buildLucidaDirectUrl(host, apiPath, queryParams)),
    buildLucidaLoadUrl(apiPath, queryParams)
  ];

  let lastError = null;
  for (const candidateUrl of urlsToTry) {
    try {
      return await requestJsonWithRedirects(candidateUrl, {
        method,
        headers,
        body
      }, context);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`${context} failed.`);
}

function downloadFileWithRedirects({
  url,
  outputDir,
  fallbackFilename,
  headers = {},
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  maxRedirects = 8,
  onProgress
}) {
  return new Promise((resolve, reject) => {
    const startDownload = (requestUrl, redirectsLeft) => {
      const parsedUrl = new URL(requestUrl);
      const transport = parsedUrl.protocol === 'http:' ? http : https;
      const requestHeaders = {
        'User-Agent': DEFAULT_HTTP_USER_AGENT,
        ...headers
      };

      const req = transport.request(parsedUrl, { method: 'GET', headers: requestHeaders, timeout: timeoutMs }, (res) => {
        const statusCode = Number(res.statusCode || 0);

        if (
          [301, 302, 303, 307, 308].includes(statusCode) &&
          res.headers.location
        ) {
          if (redirectsLeft <= 0) {
            res.resume();
            reject(new Error(`Too many redirects while downloading from Lucida.`));
            return;
          }
          const redirectUrl = new URL(res.headers.location, parsedUrl).toString();
          res.resume();
          startDownload(redirectUrl, redirectsLeft - 1);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          res.resume();
          reject(new Error(`Download request failed with HTTP ${statusCode}.`));
          return;
        }

        fs.mkdirSync(outputDir, { recursive: true });

        let resolvedFilename = getFilenameFromContentDisposition(res.headers['content-disposition']);
        if (!resolvedFilename) {
          resolvedFilename = fallbackFilename || 'download';
        }
        const inferredExtension = inferExtensionFromContentType(res.headers['content-type']);
        if (!path.extname(resolvedFilename) && inferredExtension) {
          resolvedFilename += inferredExtension;
        }
        resolvedFilename = sanitizeFilename(resolvedFilename) || `download${inferredExtension || ''}`;

        const targetPath = ensureUniqueFilePath(path.join(outputDir, resolvedFilename));
        const fileStream = fs.createWriteStream(targetPath);
        const totalBytes = Number.parseInt(String(res.headers['content-length'] || '0'), 10);
        let downloadedBytes = 0;

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (onProgress) {
            onProgress(downloadedBytes, Number.isFinite(totalBytes) ? totalBytes : 0);
          }
        });

        res.on('error', (error) => {
          fileStream.destroy(error);
        });

        fileStream.on('error', (error) => {
          try {
            if (fs.existsSync(targetPath)) {
              fs.unlinkSync(targetPath);
            }
          } catch (cleanupError) {
            // Ignore cleanup failures, preserve original error.
          }
          reject(error);
        });

        fileStream.on('finish', () => {
          fileStream.close(() => {
            resolve({
              outputPath: targetPath,
              contentType: String(res.headers['content-type'] || ''),
              finalUrl: requestUrl
            });
          });
        });

        res.pipe(fileStream);
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Download timed out after ${timeoutMs}ms`));
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    };

    startDownload(url, maxRedirects);
  });
}

function buildLucidaAccountPreference(sourceUrl) {
  let country = 'auto';
  try {
    const parsedUrl = new URL(sourceUrl);
    const territory = parsedUrl.searchParams.get('musicTerritory');
    if (territory && /^[a-z]{2}$/i.test(territory)) {
      country = territory.toUpperCase();
    }
  } catch (error) {
    // Keep the default region if URL parsing fails.
  }

  return {
    type: 'country',
    id: country
  };
}

function convertAudioToMp3(inputPath, outputPath, metadata = {}) {
  return new Promise((resolve, reject) => {
    configureFfmpegPath();

    const artist = typeof metadata.artist === 'string' ? metadata.artist.trim() : '';
    const ffmpegArgs = [
      '-i', inputPath,
      '-map', '0:a',
      '-codec:a', 'libmp3lame',
      '-b:a', '320k',
      '-minrate', '320k',
      '-maxrate', '320k',
      '-bufsize', '320k',
      '-ac', '2',
      '-ar', '48000',
      '-metadata', `artist=${artist || 'Unknown Artist'}`,
      '-y',
      outputPath
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let errorOutput = '';
    ffmpegProcess.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    ffmpegProcess.on('error', (error) => {
      reject(new Error(`Failed to start ffmpeg: ${error.message}`));
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
        return;
      }
      const message = errorOutput.trim() || `ffmpeg exited with code ${code}`;
      reject(new Error(`MP3 conversion failed: ${message}`));
    });
  });
}

async function fetchLucidaMetadata(sourceUrl) {
  const normalizedUrl = normalizeMusicUrl(sourceUrl);
  const metadataPath = `/api/fetch/metadata?url=${encodeURIComponent(normalizedUrl)}`;

  const { payload } = await requestLucidaJson({
    apiPath: metadataPath,
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': DEFAULT_HTTP_USER_AGENT
    },
    context: 'Lucida metadata'
  });

  if (!payload || payload.success !== true) {
    throw new Error(`Lucida metadata lookup failed: ${extractLucidaErrorMessage(payload)}`);
  }

  const artistName = Array.isArray(payload.artists) && payload.artists.length > 0
    ? payload.artists
      .map((artist) => artist && artist.name)
      .filter(Boolean)
      .join(', ')
    : 'Unknown Artist';

  const title = payload.title || 'Unknown Track';

  return {
    title,
    artist: artistName || 'Unknown Artist',
    url: normalizedUrl,
    originalUrl: sourceUrl
  };
}

async function fetchLucidaPlaylistTracks(sourceUrl) {
  const normalizedUrl = normalizeMusicUrl(sourceUrl);
  const metadataPath = `/api/fetch/metadata?url=${encodeURIComponent(normalizedUrl)}`;

  const { payload } = await requestLucidaJson({
    apiPath: metadataPath,
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': DEFAULT_HTTP_USER_AGENT
    },
    context: 'Lucida playlist metadata'
  });

  if (!payload || payload.success !== true) {
    throw new Error(`Playlist lookup failed: ${extractLucidaErrorMessage(payload)}`);
  }

  if (payload.type !== 'playlist') {
    throw new Error('The provided URL is not a playlist.');
  }

  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  const preparedTracks = tracks
    .map((track, index) => {
      const canonicalUrl = canonicalizeTidalTrackUrl(track && track.url);
      if (!canonicalUrl) {
        return null;
      }
      const artistName = Array.isArray(track.artists) && track.artists.length > 0
        ? track.artists
          .map((artist) => artist && artist.name)
          .filter(Boolean)
          .join(', ')
        : 'Unknown Artist';
      return {
        trackNumber: index + 1,
        url: canonicalUrl,
        title: (track && track.title) || `Track ${index + 1}`,
        artist: artistName || 'Unknown Artist'
      };
    })
    .filter(Boolean);

  if (preparedTracks.length === 0) {
    throw new Error('Playlist contains no downloadable tracks.');
  }

  return {
    playlistTitle: payload.title || 'Untitled Playlist',
    tracks: preparedTracks,
    originalTrackCount: tracks.length
  };
}

async function startLucidaRequest(requestPayload) {
  const { payload } = await requestLucidaJson({
    apiPath: '/api/fetch/stream/v2',
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_HTTP_USER_AGENT
    },
    body: JSON.stringify(requestPayload),
    context: 'Lucida request init'
  });

  if (!payload || payload.success !== true || !payload.handoff || !payload.name) {
    throw new Error(`Lucida request init failed: ${extractLucidaErrorMessage(payload)}`);
  }

  return payload;
}

async function pollLucidaRequest(handoffId, serverName, onTick) {
  for (let attempt = 0; attempt < LUCIDA_MAX_POLL_ATTEMPTS; attempt += 1) {
    const statusPath = `/api/fetch/request/${handoffId}`;
    const { payload } = await requestLucidaJson({
      apiPath: statusPath,
      queryParams: { force: serverName },
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': DEFAULT_HTTP_USER_AGENT
      },
      context: 'Lucida status check'
    });

    if (onTick) {
      onTick(attempt, payload);
    }

    if (!payload || payload.success !== true) {
      throw new Error(`Lucida status check failed: ${extractLucidaErrorMessage(payload)}`);
    }

    if (payload.status === 'completed') {
      return payload;
    }

    if (payload.status === 'error') {
      throw new Error(`Lucida reported an error: ${extractLucidaErrorMessage(payload)}`);
    }

    await sleep(LUCIDA_POLL_INTERVAL_MS);
  }

  throw new Error('Lucida download timed out while waiting for completion.');
}

async function downloadSongViaLucida(queueItem) {
  const reportProgress = (value) => {
    const bounded = Math.max(0, Math.min(100, Number(value) || 0));
    queueItem.progress = bounded;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('queue-updated', downloadQueue);
    }
  };

  const normalizedUrl = normalizeMusicUrl(queueItem.url);
  queueItem.url = normalizedUrl;

  const requestPayload = {
    url: normalizedUrl,
    // Some Lucida FLAC outputs contain malformed metadata blocks that break ffmpeg.
    // Prefer compatibility-safe output since we convert to MP3 for DJ workflow.
    metadata: false,
    compat: true,
    private: false,
    handoff: true,
    account: buildLucidaAccountPreference(normalizedUrl),
    upload: {
      enabled: false,
      service: 'catbox'
    },
    downscale: 'original'
  };

  reportProgress(12);
  const requestInit = await startLucidaRequest(requestPayload);

  reportProgress(22);
  await pollLucidaRequest(requestInit.handoff, requestInit.name, (attempt) => {
    const progressValue = 22 + Math.min(
      45,
      Math.floor(((attempt + 1) / LUCIDA_MAX_POLL_ATTEMPTS) * 45)
    );
    reportProgress(progressValue);
  });

  const fallbackFilename = buildFallbackFilename(queueItem);
  const downloadApiPath = `/api/fetch/request/${requestInit.handoff}/download`;
  const candidateHosts = getLucidaCandidateHosts(requestInit.name);
  const downloadCandidates = [
    ...candidateHosts.map((host) =>
      buildLucidaDirectUrl(host, downloadApiPath, { force: requestInit.name, redirect: 'true' })
    ),
    buildLucidaLoadUrl(downloadApiPath, { force: requestInit.name, redirect: 'true' })
  ];

  reportProgress(70);
  let downloadedFile = null;
  let lastDownloadError = null;
  for (const candidateUrl of downloadCandidates) {
    try {
      downloadedFile = await downloadFileWithRedirects({
        url: candidateUrl,
        outputDir: queueItem.downloadPath,
        fallbackFilename,
        headers: {
          Accept: '*/*',
          'User-Agent': DEFAULT_HTTP_USER_AGENT
        },
        onProgress: (downloadedBytes, totalBytes) => {
          if (totalBytes > 0) {
            const ratio = downloadedBytes / totalBytes;
            reportProgress(70 + Math.min(25, Math.floor(ratio * 25)));
          }
        }
      });
      break;
    } catch (downloadError) {
      lastDownloadError = downloadError;
    }
  }

  if (!downloadedFile) {
    throw lastDownloadError || new Error('Lucida download failed.');
  }

  let outputPath = downloadedFile.outputPath;
  const outputExtension = path.extname(outputPath).toLowerCase();
  if (queueItem.format !== 'flac' && outputExtension !== '.mp3') {
    reportProgress(96);
    const mp3Path = ensureUniqueFilePath(
      path.join(path.dirname(outputPath), `${path.basename(outputPath, outputExtension)}.mp3`)
    );
    await convertAudioToMp3(outputPath, mp3Path, {
      artist: queueItem.artist
    });
    try {
      fs.unlinkSync(outputPath);
    } catch (cleanupError) {
      console.warn('Could not remove source file after conversion:', cleanupError.message);
    }
    outputPath = mp3Path;
  }

  queueItem.outputPath = outputPath;
  reportProgress(100);
}

function fetchSongMetadata(url) {
  return new Promise((resolve, reject) => {
    const cleanUrl = normalizeMusicUrl(url);
    
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
  emitQueueUpdated();
  
  try {
    await downloadSong(nextItem);
    nextItem.status = 'completed';
    nextItem.progress = 100;
  } catch (error) {
    nextItem.status = 'failed';
    nextItem.error = error.message;
    nextItem.progress = 0;
  }
  
  emitQueueUpdated();
  isProcessingQueue = false;
  
  // Process next item in queue
  setTimeout(() => processQueue(), 1000);
}

async function downloadSong(queueItem) {
  const downloadMethod = queueItem.downloadMethod || 'doubledouble';
  if (downloadMethod === 'lucida') {
    await downloadSongViaLucida(queueItem);
    return;
  }

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
          emitQueueUpdated();
        }
      }
    }
  });
}

function emitQueueUpdated() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('queue-updated', downloadQueue);
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    req.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > 1024 * 1024) {
        reject(new Error('Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function writeJsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

async function addToQueueInternal({ url, format, downloadPath, downloadMethod = 'doubledouble' }) {
  const normalizedUrl = normalizeMusicUrl(url);
  console.log('Fetching metadata for:', normalizedUrl, 'method:', downloadMethod);

  if (isTidalPlaylistUrl(normalizedUrl)) {
    const playlistData = await fetchLucidaPlaylistTracks(normalizedUrl);
    const queueBaseId = Date.now();
    const playlistItems = playlistData.tracks.map((track, index) => ({
      id: `${queueBaseId}-${index}`,
      title: track.title,
      artist: track.artist,
      url: track.url,
      originalUrl: normalizedUrl,
      format,
      downloadMethod,
      downloadPath,
      status: 'queued',
      addedAt: new Date().toISOString(),
      progress: 0
    }));

    downloadQueue.push(...playlistItems);
    emitQueueUpdated();
    processQueue();

    return {
      success: true,
      item: playlistItems[0],
      isPlaylist: true,
      playlistTitle: playlistData.playlistTitle,
      addedCount: playlistItems.length,
      skippedCount: Math.max(0, playlistData.originalTrackCount - playlistItems.length)
    };
  }

  let metadata;
  if (downloadMethod === 'lucida') {
    try {
      metadata = await fetchLucidaMetadata(normalizedUrl);
    } catch (lucidaMetadataError) {
      console.warn('Lucida metadata lookup failed, falling back to HTML metadata scrape:', lucidaMetadataError.message);
      metadata = await fetchSongMetadata(normalizedUrl);
    }
  } else {
    metadata = await fetchSongMetadata(normalizedUrl);
  }

  const queueItem = {
    id: Date.now().toString(),
    ...metadata,
    format,
    downloadMethod,
    downloadPath,
    status: 'queued',
    addedAt: new Date().toISOString(),
    progress: 0
  };

  downloadQueue.push(queueItem);
  emitQueueUpdated();
  processQueue();

  return { success: true, item: queueItem };
}

async function startLocalIngestServer() {
  if (localIngestServer) {
    return;
  }

  localIngestServer = http.createServer(async (req, res) => {
    if (!req.url) {
      writeJsonResponse(res, 400, { success: false, error: 'Missing request URL.' });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    const requestUrl = new URL(req.url, `http://${LOCAL_INGEST_HOST}:${LOCAL_INGEST_PORT}`);
    if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
      const prefs = readPreferencesSync();
      writeJsonResponse(res, 200, {
        success: true,
        service: 'tidal-downloader-local-api',
        queueLength: downloadQueue.length,
        defaults: {
          download_method: prefs.download_method || 'doubledouble',
          format: prefs.format || 'mp3_320',
          download_path: prefs.download_path || getDefaultPreferences().download_path
        }
      });
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/queue/add') {
      try {
        const body = await parseJsonBody(req);
        const incomingUrl = typeof body.url === 'string' ? body.url.trim() : '';
        if (!incomingUrl) {
          writeJsonResponse(res, 400, { success: false, error: 'Missing "url".' });
          return;
        }

        const prefs = readPreferencesSync();
        const result = await addToQueueInternal({
          url: incomingUrl,
          format: typeof body.format === 'string' && body.format.trim()
            ? body.format.trim()
            : 'mp3_320',
          downloadPath: typeof body.downloadPath === 'string' && body.downloadPath.trim()
            ? body.downloadPath.trim()
            : (prefs.download_path || getDefaultPreferences().download_path),
          downloadMethod: typeof body.downloadMethod === 'string' && body.downloadMethod.trim()
            ? body.downloadMethod.trim()
            : 'lucida'
        });
        writeJsonResponse(res, 200, result);
      } catch (error) {
        const message = error && error.message ? error.message : 'Failed to add to queue.';
        const badRequest = message === 'Invalid JSON body.' || message === 'Request body is too large.';
        writeJsonResponse(res, badRequest ? 400 : 500, { success: false, error: message });
      }
      return;
    }

    writeJsonResponse(res, 404, { success: false, error: 'Not found.' });
  });

  await new Promise((resolve, reject) => {
    localIngestServer.once('error', reject);
    localIngestServer.listen(LOCAL_INGEST_PORT, LOCAL_INGEST_HOST, () => {
      localIngestServer.removeListener('error', reject);
      resolve();
    });
  });

  console.log(`Local ingest API listening at http://${LOCAL_INGEST_HOST}:${LOCAL_INGEST_PORT}`);
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
app.whenReady().then(async () => {
  console.log('App is ready, creating window...');
  createWindow();
  try {
    await startLocalIngestServer();
  } catch (error) {
    if (error && error.code === 'EADDRINUSE') {
      console.warn(`Local ingest API is already running on ${LOCAL_INGEST_HOST}:${LOCAL_INGEST_PORT}.`);
    } else {
      console.error('Failed to start local ingest API:', error);
    }
  }
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

app.on('before-quit', () => {
  if (localIngestServer) {
    try {
      localIngestServer.close();
    } catch (error) {
      console.warn('Error closing local ingest API:', error.message);
    }
    localIngestServer = null;
  }
});

// IPC handlers
ipcMain.handle('get-preferences', async () => {
  return readPreferencesSync();
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

// Queue management handlers
ipcMain.handle('add-to-queue', async (event, { url, format, downloadPath, downloadMethod = 'doubledouble' }) => {
  try {
    return await addToQueueInternal({ url, format, downloadPath, downloadMethod });
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
    emitQueueUpdated();
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
    emitQueueUpdated();
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
