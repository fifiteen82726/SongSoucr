#!/usr/bin/env node

const http = require('http');
const https = require('https');

const DIRECT_HOSTS = ['maus.lucida.to', 'katze.lucida.to', 'hund.lucida.to'];
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 60;
const DEFAULT_TIMEOUT_MS = 45000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanTidalUrl(input) {
  const raw = String(input || '').trim();
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

    urlObj.hostname = 'tidal.com';
    if (trackMatch) {
      urlObj.pathname = `/track/${trackMatch[1]}`;
    } else if (albumMatch) {
      urlObj.pathname = `/album/${albumMatch[1]}`;
    } else if (playlistMatch) {
      urlObj.pathname = `/playlist/${playlistMatch[1]}`;
    } else {
      urlObj.pathname = normalizedPath;
    }

    urlObj.search = '';
    urlObj.hash = '';
    return urlObj.toString();
  } catch (error) {
    return raw;
  }
}

function requestWithRedirects({
  url,
  method = 'GET',
  headers = {},
  body = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRedirects = 8
}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(String(body));

    const send = (requestUrl, currentMethod, currentBody, redirectsLeft) => {
      const parsedUrl = new URL(requestUrl);
      const transport = parsedUrl.protocol === 'http:' ? http : https;
      const req = transport.request(parsedUrl, {
        method: currentMethod,
        timeout: timeoutMs,
        headers: {
          'User-Agent': USER_AGENT,
          ...headers,
          ...(currentBody && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')
            ? { 'Content-Length': String(currentBody.length) }
            : {})
        }
      }, (res) => {
        const statusCode = Number(res.statusCode || 0);
        const location = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
          if (redirectsLeft <= 0) {
            res.resume();
            reject(new Error(`Too many redirects for ${requestUrl}`));
            return;
          }

          const nextUrl = new URL(location, parsedUrl).toString();
          const downgradeToGet = statusCode === 303 || ((statusCode === 301 || statusCode === 302) && currentMethod !== 'GET' && currentMethod !== 'HEAD');
          res.resume();
          send(nextUrl, downgradeToGet ? 'GET' : currentMethod, downgradeToGet ? null : currentBody, redirectsLeft - 1);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      });

      req.on('timeout', () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
      req.on('error', reject);
      if (currentBody) {
        req.write(currentBody);
      }
      req.end();
    };

    send(url, method, payload, maxRedirects);
  });
}

function parseJsonResponse(response, context) {
  let payload;
  const raw = response.body.toString('utf8');
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${context} returned non-JSON (HTTP ${response.statusCode})`);
  }

  if (response.statusCode >= 400) {
    throw new Error(`${context} failed (HTTP ${response.statusCode}): ${JSON.stringify(payload).slice(0, 200)}`);
  }

  return payload;
}

async function startRequest(normalizedUrl) {
  const payload = JSON.stringify({
    url: normalizedUrl,
    metadata: false,
    compat: true,
    private: false,
    handoff: true,
    account: { type: 'country', id: 'US' },
    upload: { enabled: false, service: 'catbox' },
    downscale: 'original'
  });

  let lastError = null;
  for (const host of DIRECT_HOSTS) {
    const url = `https://${host}/api/fetch/stream/v2`;
    try {
      const response = await requestWithRedirects({
        url,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: payload
      });
      const data = parseJsonResponse(response, `stream init (${host})`);
      if (data.success === true && data.handoff && data.name) {
        return { data, host };
      }
      lastError = new Error(`stream init (${host}) returned unexpected payload`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('stream init failed');
}

function makeCandidateHosts(serverName, startHost) {
  const normalizedServer = String(serverName || '').trim().toLowerCase();
  const guessed = normalizedServer && !normalizedServer.includes('.')
    ? `${normalizedServer}.lucida.to`
    : normalizedServer;
  const ordered = [];
  const seen = new Set();

  for (const host of [guessed, startHost, ...DIRECT_HOSTS]) {
    if (!host || seen.has(host)) {
      continue;
    }
    seen.add(host);
    ordered.push(host);
  }

  return ordered;
}

async function pollUntilCompleted(handoff, serverName, startHost) {
  const candidateHosts = makeCandidateHosts(serverName, startHost);

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    let lastError = null;
    for (const host of candidateHosts) {
      const url = `https://${host}/api/fetch/request/${handoff}?force=${encodeURIComponent(serverName)}`;
      try {
        const response = await requestWithRedirects({
          url,
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        const data = parseJsonResponse(response, `poll (${host})`);
        if (data.success !== true) {
          lastError = new Error(`poll (${host}) returned success=false`);
          continue;
        }
        if (data.status === 'completed') {
          return { data, host };
        }
        if (data.status === 'error') {
          throw new Error(`Lucida reported status=error: ${data.message || 'unknown'}`);
        }
        lastError = new Error(`status=${data.status || 'unknown'}`);
      } catch (error) {
        lastError = error;
      }
    }
    if (attempt === MAX_POLL_ATTEMPTS) {
      throw lastError || new Error('poll timed out');
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error('poll failed unexpectedly');
}

async function verifyDownloadHead(handoff, serverName, startHost) {
  const candidateHosts = makeCandidateHosts(serverName, startHost);
  let lastError = null;

  for (const host of candidateHosts) {
    const url = `https://${host}/api/fetch/request/${handoff}/download?force=${encodeURIComponent(serverName)}&redirect=true`;
    try {
      const response = await requestWithRedirects({
        url,
        method: 'HEAD',
        headers: { Accept: '*/*' }
      });
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return {
          host,
          contentType: String(response.headers['content-type'] || ''),
          contentLength: String(response.headers['content-length'] || '')
        };
      }
      lastError = new Error(`download HEAD (${host}) returned HTTP ${response.statusCode}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('download HEAD failed');
}

async function testOne(url) {
  const normalized = cleanTidalUrl(url);
  const init = await startRequest(normalized);
  await pollUntilCompleted(init.data.handoff, init.data.name, init.host);
  const head = await verifyDownloadHead(init.data.handoff, init.data.name, init.host);
  return {
    normalized,
    handoff: init.data.handoff,
    server: init.data.name,
    headHost: head.host,
    contentType: head.contentType,
    contentLength: head.contentLength
  };
}

async function main() {
  const args = process.argv.slice(2);
  const urls = args.length > 0
    ? args
    : [
      'https://tidal.com/track/157588870/u',
      'https://tidal.com/track/345574822/u'
    ];

  let failures = 0;
  console.log(`Running Lucida e2e smoke test for ${urls.length} URL(s)\n`);
  for (const url of urls) {
    try {
      const result = await testOne(url);
      console.log(`PASS ${url}`);
      console.log(`  normalized: ${result.normalized}`);
      console.log(`  handoff: ${result.handoff} (${result.server})`);
      console.log(`  download host: ${result.headHost}`);
      console.log(`  content-type: ${result.contentType || '(empty)'}`);
      console.log(`  content-length: ${result.contentLength || '(empty)'}\n`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${url}`);
      console.log(`  reason: ${error.message}\n`);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal: ${error.message}`);
  process.exit(1);
});
