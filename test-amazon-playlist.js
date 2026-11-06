#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const mainPath = path.join(__dirname, 'tidal-electron-app/electron/main.js');
const source = fs.readFileSync(mainPath, 'utf8');
const playlistUrl = 'https://music.amazon.com/user-playlists/cf591a3e-bd13-42a2-a187-34fab3076fa9';
const firstTrackUrl = 'https://music.amazon.com/tracks/B0CR5P7D5G';
const secondTrackUrl = 'https://music.amazon.com/tracks/B0DJC7KN8M?musicTerritory=US';

function amazonPlaylist() {
  return {
    success: true,
    type: 'playlist',
    title: 'Personal DJ Playlist',
    tracks: [
      { url: `${firstTrackUrl}?ref=share#player`, title: 'First', artists: [{ name: 'Artist A' }] },
      { url: 'https://music.amazon.com/albums/B0CR5RZ35F?trackAsin=B0DJC7KN8M&musicTerritory=US', title: 'Second', artists: [{ name: 'Artist B' }, { name: 'Artist C' }] },
      null,
      { url: 'https://music.amazon.com/albums/B0CR5RZ35F' },
      { url: 'https://tidal.com/track/12345' },
      { url: firstTrackUrl, title: 'First again' }
    ]
  };
}

// Load the real main process; substitute only Electron startup, I/O and downloads.
function loadMain(payload = amazonPlaylist(), requestError = null) {
  const calls = { requests: [], browserRequests: [], opened: [], timers: new Map(), broadcasts: 0, processQueue: 0, singleMetadata: 0 };
  const handlers = new Map();
  const localRequire = createRequire(mainPath);
  const server = { once() {}, removeListener() {}, listen(_port, _host, callback) { callback(); } };
  const context = vm.createContext({
    __dirname: path.dirname(mainPath),
    Buffer, URL, URLSearchParams, process,
    setTimeout(callback) { const timer = {}; calls.timers.set(timer, callback); return timer; },
    clearTimeout(timer) { calls.timers.delete(timer); },
    console: { log() {}, info() {}, warn() {}, error() {} },
    require(name) {
      if (name === 'electron') {
        return {
          app: { on() {}, whenReady: () => new Promise(() => {}) },
          ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
          shell: { openExternal: async (url) => { calls.opened.push(url); if (calls.openError) throw calls.openError; } }
        };
      }
      if (name === 'fs') return { ...fs, appendFileSync() {} };
      if (name === 'http') return { ...localRequire(name), createServer(handler) { calls.httpHandler = handler; return server; } };
      return localRequire(name);
    },
    request: async (options) => {
      calls.requests.push(options);
      if (requestError) throw requestError;
      return { payload };
    },
    requestBrowser: async (url) => {
      calls.browserRequests.push(url);
      if (requestError) throw requestError;
      return payload;
    },
    broadcast: () => { calls.broadcasts += 1; },
    processQueueStub: () => { calls.processQueue += 1; },
    singleMetadata: async () => {
      calls.singleMetadata += 1;
      return { title: 'Single Track', artist: 'Artist', url: firstTrackUrl };
    }
  });
  vm.runInContext(`${source}
    requestLucidaJson = request;
    emitQueueUpdated = broadcast;
    processQueue = processQueueStub;
    fetchLucidaMetadata = singleMetadata;
    fetchSongMetadata = singleMetadata;
    this.api = {
      isAmazonPlaylistUrl: typeof isAmazonPlaylistUrl === 'function' ? isAmazonPlaylistUrl : () => false,
      canonicalizeAmazonTrackUrl: typeof canonicalizeAmazonTrackUrl === 'function' ? canonicalizeAmazonTrackUrl : () => null,
      fetchLucidaPlaylistTracks, addToQueueInternal, normalizeMusicUrl,
      startLocalIngestServer,
      realBrowserRequest: typeof requestAmazonPlaylistFromBrowser === 'function' ? requestAmazonPlaylistFromBrowser : null,
      completeBrowserImport: typeof completeAmazonPlaylistImport === 'function' ? completeAmazonPlaylistImport : null,
      fetchAmazonPlaylistTracks: typeof fetchAmazonPlaylistTracks === 'function' ? fetchAmazonPlaylistTracks : fetchLucidaPlaylistTracks,
      queue: () => downloadQueue
    };
    requestAmazonPlaylistFromBrowser = requestBrowser;
    this.api.useRealBrowser = () => { requestAmazonPlaylistFromBrowser = this.api.realBrowserRequest; };
  `, context, { filename: mainPath });
  return { api: context.api, calls, handlers };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('recognizes the supplied personal playlist and catalog playlists', () => {
  const { api } = loadMain();
  assert.equal(api.isAmazonPlaylistUrl(playlistUrl), true);
  assert.equal(api.isAmazonPlaylistUrl(`${playlistUrl}/?ref=share#player`), true);
  assert.equal(api.isAmazonPlaylistUrl('https://music.amazon.com/playlists/B07X999999'), true);
  assert.equal(api.isAmazonPlaylistUrl('https://amazon.com/music/player/user-playlists/example'), true);
});

test('does not classify a selected song or unrelated URL as a playlist', () => {
  const { api } = loadMain();
  for (const url of [
    `${playlistUrl}?trackAsin=B0CR5P7D5G`,
    firstTrackUrl,
    'https://music.amazon.com/albums/B0CR5RZ35F',
    'https://music.amazon.com/user-playlists/',
    'https://music.amazon.com/user-playlists/id/extra',
    'https://music.amazon.com.evil.test/user-playlists/id',
    'https://evil.music.amazon.com/user-playlists/id',
    'https://example.com/user-playlists/id',
    'https://tidal.com/playlist/example',
    'not a URL'
  ]) assert.equal(api.isAmazonPlaylistUrl(url), false, url);
});

test('canonicalizes Amazon track links without losing territory', () => {
  const { api } = loadMain();
  assert.equal(api.canonicalizeAmazonTrackUrl(`${firstTrackUrl}?ref=share#player`), firstTrackUrl);
  assert.equal(api.canonicalizeAmazonTrackUrl(
    `${playlistUrl}?trackAsin=B0DJC7KN8M&musicTerritory=US&ref=share`
  ), secondTrackUrl);
  assert.equal(api.canonicalizeAmazonTrackUrl(
    'https://www.amazon.com/music/player/albums/B0CR5RZ35F?trackAsin=B0CR5P7D5G&marketplaceId=ATVPDKIKX0DER'
  ), `${firstTrackUrl}?marketplaceId=ATVPDKIKX0DER`);
});

test('rejects non-track, cross-service and untrusted Amazon entry URLs', () => {
  const { api } = loadMain();
  for (const url of [
    null, '', 123, {}, playlistUrl,
    'https://music.amazon.com/albums/B0CR5RZ35F',
    'https://music.amazon.com/tracks/',
    'https://music.amazon.com/tracks/B0CR5P7D5G/extra',
    'https://music.amazon.com/tracks/invalid%20track',
    'https://music.amazon.com/artists/ARTIST?trackAsin=B0CR5P7D5G',
    'https://evil.music.amazon.com/tracks/B0CR5P7D5G',
    'https://music.amazon.com.evil.test/tracks/B0CR5P7D5G',
    'https://tidal.com/track/12345',
    'ftp://music.amazon.com/tracks/B0CR5P7D5G'
  ]) assert.equal(api.canonicalizeAmazonTrackUrl(url), null, String(url));
});

test('reads Amazon playlist from the browser, preserving order and repeats without a playlist API call', async () => {
  const { api, calls } = loadMain();
  const playlist = plain(await api.fetchAmazonPlaylistTracks(playlistUrl));
  assert.equal(playlist.playlistTitle, 'Personal DJ Playlist');
  assert.equal(playlist.originalTrackCount, 6);
  assert.deepEqual(playlist.tracks, [
    { trackNumber: 1, url: firstTrackUrl, title: 'First', artist: 'Artist A' },
    { trackNumber: 2, url: secondTrackUrl, title: 'Second', artist: 'Artist B, Artist C' },
    { trackNumber: 6, url: firstTrackUrl, title: 'First again', artist: 'Unknown Artist' }
  ]);
  assert.deepEqual(calls.browserRequests, [playlistUrl]);
  assert.equal(calls.requests.length, 0, 'Amazon playlists must not use Lucida playlist metadata');
});

for (const downloadMethod of ['lucida', 'doubledouble']) {
  test(`batches Amazon tracks with selected options using ${downloadMethod}`, async () => {
    const { api, calls, handlers } = loadMain();
    const result = await handlers.get('add-to-queue')(null, {
      url: `${playlistUrl}?ref=share`, format: 'flac', downloadPath: '/tmp/dj-playlist', downloadMethod
    });
    assert.equal(result.success, true);
    assert.equal(result.isPlaylist, true);
    assert.equal(result.playlistTitle, 'Personal DJ Playlist');
    assert.equal(result.addedCount, 3);
    assert.equal(result.skippedCount, 3);
    const queue = plain(api.queue());
    assert.deepEqual(queue.map((track) => track.url), [firstTrackUrl, secondTrackUrl, firstTrackUrl]);
    assert.equal(new Set(queue.map((track) => track.id)).size, 3);
    for (const track of queue) {
      assert.equal(track.originalUrl, playlistUrl);
      assert.equal(track.format, 'flac');
      assert.equal(track.downloadPath, '/tmp/dj-playlist');
      assert.equal(track.downloadMethod, downloadMethod);
      assert.equal(track.status, 'queued');
      assert.equal(track.progress, 0);
    }
    assert.equal(calls.broadcasts, 1);
    assert.equal(calls.processQueue, 1);
    assert.equal(calls.singleMetadata, 0);
    assert.equal(calls.requests.length, 0);
    assert.deepEqual(calls.browserRequests, [playlistUrl]);
  });
}

test('selected playlist tracks still follow the single-track queue path', async () => {
  const { api, calls } = loadMain();
  const result = await api.addToQueueInternal({
    url: `${playlistUrl}?trackAsin=B0CR5P7D5G`,
    format: 'mp3_320', downloadPath: '/tmp/dj-playlist', downloadMethod: 'lucida'
  });
  assert.equal(result.success, true);
  assert.equal(result.isPlaylist, undefined);
  assert.equal(api.queue().length, 1);
  assert.equal(calls.requests.length, 0);
  assert.equal(calls.singleMetadata, 1);
});

test('retains TIDAL playlist expansion', async () => {
  const { api } = loadMain({
    success: true, type: 'playlist', title: 'TIDAL set',
    tracks: [{ url: 'https://tidal.com/browse/track/12345?u=share', title: 'TIDAL Track', artists: [{ name: 'DJ' }] }]
  });
  const result = await api.addToQueueInternal({
    url: 'https://tidal.com/playlist/abcdef', format: 'mp3_320', downloadPath: '/tmp/dj-playlist'
  });
  assert.equal(result.addedCount, 1);
  assert.equal(result.skippedCount, 0);
  assert.equal(api.queue()[0].url, 'https://tidal.com/track/12345');
});

for (const [name, payload, message] of [
  ['private or missing playlist', { success: false, error: 'Playlist is private or unavailable' }, /private or unavailable/],
  ['wrong metadata type', { success: true, type: 'track' }, /not a playlist/],
  ['empty playlist', { success: true, type: 'playlist', tracks: [] }, /no downloadable tracks/],
  ['invalid tracks', { success: true, type: 'playlist', tracks: [null, {}, { url: firstTrackUrl.replace('music.amazon.com', 'example.com') }] }, /no downloadable tracks/],
  ['missing track collection', { success: true, type: 'playlist' }, /no downloadable tracks/]
]) {
  test(`${name} fails without changing the existing queue`, async () => {
    const { api, calls, handlers } = loadMain(payload);
    await api.addToQueueInternal({ url: firstTrackUrl, format: 'mp3_320', downloadPath: '/tmp/dj-playlist' });
    const before = plain(api.queue());
    const result = await handlers.get('add-to-queue')(null, {
      url: playlistUrl, format: 'mp3_320', downloadPath: '/tmp/dj-playlist', downloadMethod: 'lucida'
    });
    assert.equal(result.success, false);
    assert.match(result.error, message);
    assert.deepEqual(plain(api.queue()), before);
    assert.equal(calls.processQueue, 1);
    assert.equal(calls.broadcasts, 1);
    assert.equal(calls.singleMetadata, 1);
  });
}

test('browser extraction failure never queues the playlist as a single track', async () => {
  const { api, calls } = loadMain(null, new Error('Sign in to Amazon Music in your browser'));
  await assert.rejects(api.addToQueueInternal({
    url: playlistUrl, format: 'mp3_320', downloadPath: '/tmp/dj-playlist'
  }), /Sign in to Amazon/);
  assert.equal(api.queue().length, 0);
  assert.equal(calls.processQueue, 0);
  assert.equal(calls.singleMetadata, 0);
});

test('opens a paired browser read and accepts its result exactly once', async () => {
  const { api, calls } = loadMain();
  assert.equal(typeof api.realBrowserRequest, 'function');
  const pending = api.realBrowserRequest(playlistUrl);
  await Promise.resolve();
  assert.equal(calls.opened.length, 1);
  const opened = new URL(calls.opened[0]);
  const requestId = new URLSearchParams(opened.hash.slice(1)).get('tqq-import');
  assert.ok(requestId);
  assert.equal(`${opened.origin}${opened.pathname}`, playlistUrl);
  assert.equal(api.completeBrowserImport({ requestId, url: 'https://music.amazon.com/user-playlists/wrong', ...amazonPlaylist() }).success, false);
  assert.equal(calls.timers.size, 1);
  const message = { requestId, url: playlistUrl, ...amazonPlaylist() };
  assert.equal(api.completeBrowserImport(message).success, true);
  assert.deepEqual(plain(await pending), amazonPlaylist());
  assert.equal(calls.timers.size, 0);
  assert.equal(api.completeBrowserImport(message).success, false, 'replayed callbacks cannot queue again');
});

test('missing extension times out cleanly and removes the pending read', async () => {
  const { api, calls } = loadMain();
  assert.equal(typeof api.realBrowserRequest, 'function');
  const pending = api.realBrowserRequest(playlistUrl);
  const rejected = assert.rejects(pending, /extension|Quick Queue/i);
  await Promise.resolve();
  const requestId = new URLSearchParams(new URL(calls.opened[0]).hash.slice(1)).get('tqq-import');
  Array.from(calls.timers.values())[0]();
  await rejected;
  assert.equal(api.completeBrowserImport({ requestId, url: playlistUrl, ...amazonPlaylist() }).success, false);
});

test('real HTTP callback completes a browser import into individual queue items', async () => {
  const { api, calls } = loadMain();
  await api.startLocalIngestServer();
  api.useRealBrowser();
  const queued = api.addToQueueInternal({url:playlistUrl,format:'mp3_320',downloadPath:'/tmp/dj-playlist',downloadMethod:'lucida'});
  await Promise.resolve();
  const requestId = new URLSearchParams(new URL(calls.opened[0]).hash.slice(1)).get('tqq-import');
  const { PassThrough } = require('node:stream');
  const req = new PassThrough();
  req.method = 'POST';
  req.url = '/api/playlist/result';
  let status, response;
  const handled = calls.httpHandler(req, {
    writeHead(code) { status = code; }, end(body) { response = JSON.parse(body); }
  });
  req.end(JSON.stringify({requestId,url:playlistUrl,...amazonPlaylist()}));
  await handled;
  assert.equal(status,200);
  assert.equal(response.success,true);
  const result = await queued;
  assert.equal(result.addedCount,3);
  assert.equal(api.queue().length,3);
  assert.equal(calls.requests.length,0);
  assert.equal(calls.processQueue,1);
});

test('invalid browser results reject both the waiting app and the browser callback', async () => {
  const { api, calls } = loadMain();
  const pending = api.realBrowserRequest(playlistUrl);
  const rejected = assert.rejects(pending,/no downloadable tracks/);
  await Promise.resolve();
  const requestId = new URLSearchParams(new URL(calls.opened[0]).hash.slice(1)).get('tqq-import');
  const result = api.completeBrowserImport({requestId,url:playlistUrl,success:true,type:'playlist',tracks:[]});
  assert.equal(result.success,false);
  assert.match(result.error,/no downloadable tracks/);
  await rejected;
  assert.equal(calls.timers.size,0);
});

test('failure to open the browser rejects the import and clears its timer', async () => {
  const { api, calls } = loadMain();
  calls.openError = new Error('No default browser');
  await assert.rejects(api.realBrowserRequest(playlistUrl), /No default browser/);
  assert.equal(calls.timers.size,0);
});
