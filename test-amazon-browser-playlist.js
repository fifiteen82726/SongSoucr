const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('./tidal-electron-app/node_modules/jsdom');
const readerPath = path.join(__dirname, 'browser-extension/tidal-quick-queue/amazon-playlist.js');
const reader = fs.existsSync(readerPath) ? require(readerPath) : {};
const url = 'https://music.amazon.com/user-playlists/cf591a3e-bd13-42a2-a187-34fab3076fa9';

// Semantic structure observed in the user's signed-in Amazon playlist on Nov 3.
function song(number, asin, title = 'CRASH', artist = 'ALLDAY PROJECT') {
  return `<div><button data-testid="ListItem" aria-label="${title} by ${artist}">
    <div aria-label="Track ${number}">${number}</div>
    <div tabindex="-1" aria-label="${title}">${title}</div>
    <a href="/artists/B0FCM3C61T">${artist}</a><a href="/albums/B0HJZ65LLZ">Album</a>
    </button><div data-testid="ListItemStack"><button
    data-testid="IconButton,PlaylistTrack_ContextMenu" id="${asin}" aria-label="More options for ${title}"></button></div></div>`;
}

function page(rows, count = 3) {
  return new JSDOM(`<body><h1>DJ Set</h1><div data-testid="PageHeaderMetadata_TertiaryBox_TrackCount">${count} SONGS</div><div>PRIVATE</div>${rows}
    <section aria-label="Suggestions"><a href="/tracks/RECOMMENDED">Other song</a></section>
    <div id="miniNPVTrackInfo"><a href="/tracks/NOWPLAYING">Now playing</a></div></body>`, { url });
}

test('reads actual React playlist row IDs, ignoring album links, suggestions and player', () => {
  assert.equal(typeof reader.readSnapshot, 'function');
  const dom = page(song(1, 'B0HJZGSXZL') + song(2, 'B0HCBL33F7', 'Pop Off Pop Off', 'KiiiKiii') + song(3, 'B0HJZGSXZL'));
  const result = reader.readSnapshot(dom.window.document);
  assert.equal(result.title, 'DJ Set');
  assert.equal(result.expectedCount, 3);
  assert.deepEqual(result.tracks.map(t=>[t.trackNumber,t.url,t.title,t.artists[0].name]), [
    [1,'https://music.amazon.com/tracks/B0HJZGSXZL','CRASH','ALLDAY PROJECT'],
    [2,'https://music.amazon.com/tracks/B0HCBL33F7','Pop Off Pop Off','KiiiKiii'],
    [3,'https://music.amazon.com/tracks/B0HJZGSXZL','CRASH','ALLDAY PROJECT']
  ]);
  dom.window.close();
});

test('retains unavailable row positions for skipped counts', () => {
  assert.equal(typeof reader.readSnapshot, 'function');
  const dom = page(song(1, 'B0HJZGSXZL') + song(2, '') + song(3, 'B0HCBL33F7'));
  const result = reader.readSnapshot(dom.window.document);
  assert.equal(result.tracks.length, 3);
  assert.equal(result.tracks[1].url, null);
  dom.window.close();
});

test('reads the count field instead of song-count text in the playlist title or description', () => {
  const dom = page(song(1,'B0HJZGSXZL')+song(2,'B0HCBL33F7')+song(3,'B0HJZGSXZL'));
  dom.window.document.querySelector('h1').textContent = '1 Song';
  dom.window.document.querySelector('h1').insertAdjacentHTML('afterend','<p>My 2 songs for tonight</p>');
  assert.equal(reader.readSnapshot(dom.window.document).expectedCount,3);
  dom.window.close();
});

test('legacy unavailable songs retain their positions and count as skipped entries', async () => {
  const dom = page(`<music-image-row primary-text="First" primary-href="/tracks/B0HJZGSXZL"></music-image-row>
    <music-image-row primary-text="Unavailable"></music-image-row>
    <music-image-row primary-text="Third" primary-href="/tracks/B0HCBL33F7"></music-image-row>`);
  const snapshot = reader.readSnapshot(dom.window.document);
  assert.equal(snapshot.tracks.length,3);
  assert.equal(snapshot.tracks[1].url,null);
  assert.deepEqual(snapshot.tracks.map(t=>t.trackNumber),[1,2,3]);
  assert.equal((await reader.collectPlaylist(dom.window,{timeoutMs:50,pollMs:5,scroll:()=>{}})).tracks.length,3);
  dom.window.close();
});

test('keeps legacy Amazon playlist trackAsin rows supported', () => {
  assert.equal(typeof reader.readSnapshot, 'function');
  const dom = page(`<music-image-row primary-text="Legacy" secondary-text-1="DJ"
    primary-href="/albums/B0HJZ65LLZ?trackAsin=B0HJZGSXZL"></music-image-row>`, 1);
  const result = reader.readSnapshot(dom.window.document);
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].url, 'https://music.amazon.com/tracks/B0HJZGSXZL');
  dom.window.close();
});

test('collects delayed/virtualized rows by playlist position, retaining duplicates', async () => {
  assert.equal(typeof reader.collectPlaylist, 'function');
  const dom = page(song(1, 'B0HJZGSXZL'));
  const pending = reader.collectPlaylist(dom.window, { timeoutMs: 500, pollMs: 5, scroll: () => {} });
  dom.window.setTimeout(() => {
    dom.window.document.body.innerHTML = `<h1>DJ Set</h1><div data-testid="PageHeaderMetadata_TertiaryBox_TrackCount">3 SONGS</div>${song(2,'B0HCBL33F7')}${song(3,'B0HJZGSXZL')}`;
  }, 15);
  const result = await pending;
  assert.equal(result.type, 'playlist');
  assert.deepEqual(result.tracks.map(t=>t.trackNumber), [1,2,3]);
  assert.deepEqual(result.tracks.map(t=>t.url), ['https://music.amazon.com/tracks/B0HJZGSXZL','https://music.amazon.com/tracks/B0HCBL33F7','https://music.amazon.com/tracks/B0HJZGSXZL']);
  dom.window.close();
});

test('fails on incomplete extraction instead of silently importing a partial playlist', async () => {
  assert.equal(typeof reader.collectPlaylist, 'function');
  const dom = page(song(1, 'B0HJZGSXZL'));
  await assert.rejects(reader.collectPlaylist(dom.window, { timeoutMs: 25, pollMs: 5, scroll: () => {} }), /1 of 3|incomplete/i);
  dom.window.close();
});

test('fails when navigation leaves the requested playlist', async () => {
  assert.equal(typeof reader.collectPlaylist, 'function');
  const dom = page(song(1, 'B0HJZGSXZL'));
  const pending = reader.collectPlaylist(dom.window, { timeoutMs: 100, pollMs: 5, scroll: () => {} });
  dom.window.history.replaceState(null, '', '/');
  await assert.rejects(pending, /sign in|playlist page|navigat/i);
  dom.window.close();
});

test('waits through Amazon startup routing to home before the requested playlist renders', async () => {
  const dom = page('', 3);
  try {
    const pending = reader.collectPlaylist(dom.window, { timeoutMs: 250, pollMs: 5, scroll: () => {} });
    dom.window.history.replaceState(null, '', '/');
    dom.window.document.body.innerHTML = '<div>Loading Amazon Music</div>';
    dom.window.setTimeout(() => {
      dom.window.history.replaceState(null, '', url);
      dom.window.document.body.innerHTML = `<h1>DJ Set</h1><div data-testid="PageHeaderMetadata_TertiaryBox_TrackCount">3 SONGS</div>
        ${song(1,'B0HJZGSXZL')}${song(2,'B0HCBL33F7')}${song(3,'B0HJZGSXZL')}`;
    }, 25);
    const result = await pending;
    assert.equal(result.title, 'DJ Set');
    assert.deepEqual(result.tracks.map(track => track.trackNumber), [1,2,3]);
  } finally {
    dom.window.close();
  }
});

test('never collects another playlist while waiting for the original page to initialize', async () => {
  const dom = page('', 3);
  try {
    const pending = reader.collectPlaylist(dom.window, { timeoutMs: 40, pollMs: 5, scroll: () => {} });
    dom.window.history.replaceState(null, '', '/user-playlists/different');
    dom.window.document.body.innerHTML = `<h1>Wrong Playlist</h1><div data-testid="PageHeaderMetadata_TertiaryBox_TrackCount">1 SONG</div>${song(1,'B0HCBL33F7')}`;
    await assert.rejects(pending, /requested playlist|playlist page|sign in/i);
  } finally {
    dom.window.close();
  }
});

test('the import marker sends DOM tracks to the app without enqueueing the playlist URL', async () => {
  const dom = page(song(1, 'B0HJZGSXZL'), 1);
  dom.window.history.replaceState(null, '', `${url}#tqq-import=12345678-1234-4234-8234-123456789012`);
  const messages = [];
  dom.window.chrome = { runtime: { lastError: null, sendMessage(message, cb) { messages.push(message); cb({ok:true,data:{success:true}}); } } };
  // Execute the shipped scripts in their manifest order.
  dom.window.eval = undefined;
  const vm = require('node:vm');
  const context = vm.createContext({ window:dom.window, document:dom.window.document, chrome:dom.window.chrome,
    URL, URLSearchParams, MutationObserver:dom.window.MutationObserver, Element:dom.window.Element,
    requestAnimationFrame:fn=>dom.window.setTimeout(fn,0), setTimeout, clearTimeout });
  if (fs.existsSync(readerPath)) vm.runInContext(fs.readFileSync(readerPath,'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'browser-extension/tidal-quick-queue/content.js'),'utf8'),context);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(messages.length,1);
  assert.equal(messages[0].type,'AMAZON_PLAYLIST_RESULT');
  assert.equal(messages[0].result.tracks[0].url,'https://music.amazon.com/tracks/B0HJZGSXZL');
  assert.equal(messages[0].result.requestId,'12345678-1234-4234-8234-123456789012');
  dom.window.close();
});
