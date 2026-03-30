const LOCAL_API_BASES = [
  'http://127.0.0.1:43893',
  'http://localhost:43893'
];

function normalizeErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error.message) {
    return error.message;
  }
  return String(error);
}

async function callAddQueueEndpoint(baseUrl, url) {
  const response = await fetch(`${baseUrl}/api/queue/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      downloadMethod: 'lucida',
      format: 'mp3_320'
    })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Local API returned non-JSON (HTTP ${response.status}) from ${baseUrl}.`);
  }

  if (!response.ok || !payload || payload.success === false) {
    throw new Error(payload && payload.error
      ? payload.error
      : `Local API request failed (HTTP ${response.status}) at ${baseUrl}.`);
  }

  return payload;
}

async function addUrlToLocalQueue(url) {
  let lastError = null;
  for (const baseUrl of LOCAL_API_BASES) {
    try {
      return await callAddQueueEndpoint(baseUrl, url);
    } catch (error) {
      lastError = error;
    }
  }

  const message = normalizeErrorMessage(lastError);
  if (message.includes('Failed to fetch') || message.includes('ERR_CONNECTION_REFUSED')) {
    throw new Error('Local API is unreachable. Start Tidal Downloader app and keep it open.');
  }
  throw lastError || new Error('Local API request failed.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'ENQUEUE_TIDAL_URL') {
    return false;
  }

  const url = typeof message.url === 'string' ? message.url.trim() : '';
  if (!url) {
    sendResponse({ ok: false, error: 'Missing URL.' });
    return false;
  }

  addUrlToLocalQueue(url)
    .then((data) => {
      sendResponse({
        ok: true,
        data
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: normalizeErrorMessage(error)
      });
    });

  return true;
});
