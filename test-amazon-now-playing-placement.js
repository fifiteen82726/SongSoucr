#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('./tidal-electron-app/node_modules/jsdom');

const contentScriptPath = path.join(
  __dirname,
  'browser-extension/tidal-quick-queue/content.js'
);
const contentScript = fs.readFileSync(contentScriptPath, 'utf8');

function wait(window, milliseconds = 40) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function verifyCanonicalLocationCandidate() {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <div id="transport">
            <div id="track-info">
              <music-horizontal-item id="miniNPVTrackInfo"></music-horizontal-item>
            </div>
            <div id="now-playing-controls">
              <div><music-button icon-name="favorite"></music-button></div>
              <div><music-button icon-name="more"></music-button></div>
            </div>
          </div>
        </body>
      </html>`,
    {
      url: 'https://music.amazon.com/tracks/LOCATION1',
      runScripts: 'outside-only',
      pretendToBeVisual: true
    }
  );

  const { window } = dom;
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(_message, callback) {
        callback({ ok: true, data: {} });
      }
    }
  };
  window.Element.prototype.getClientRects = function getClientRects() {
    return [{ width: 10, height: 10 }];
  };

  window.eval(contentScript);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await wait(window);

  const button = window.document.querySelector('.tqq-now-playing-button');
  assert.ok(button, 'canonical Amazon track locations should render the now-playing button');
  assert.strictEqual(button.dataset.trackUrl, 'https://music.amazon.com/tracks/LOCATION1');
  window.close();
}

async function verifyDirectSiblingControls() {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <div id="transport">
            <div id="track-info">
              <music-horizontal-item
                id="miniNPVTrackInfo"
                primary-href="/albums/ALBUM1?trackAsin=DIRECT1"
              ></music-horizontal-item>
            </div>
            <div id="now-playing-controls">
              <music-button icon-name="favorite"></music-button>
              <music-button icon-name="more"></music-button>
            </div>
          </div>
        </body>
      </html>`,
    {
      url: 'https://music.amazon.com/my/music',
      runScripts: 'outside-only',
      pretendToBeVisual: true
    }
  );

  const { window } = dom;
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(_message, callback) {
        callback({ ok: true, data: {} });
      }
    }
  };
  window.Element.prototype.getClientRects = function getClientRects() {
    return [{ width: 10, height: 10 }];
  };

  window.eval(contentScript);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await wait(window);

  const controls = window.document.getElementById('now-playing-controls');
  assert.deepStrictEqual(
    Array.from(controls.children).map((node) =>
      node.getAttribute('icon-name') || (node.classList.contains('tqq-now-playing-control') ? 'download' : '')
    ),
    ['favorite', 'download', 'more'],
    'direct sibling controls should contain the download control between favorite and context menu'
  );
  assert.strictEqual(
    controls.querySelector('.tqq-now-playing-button').dataset.trackUrl,
    'https://music.amazon.com/tracks/DIRECT1'
  );
  window.close();
}

async function verifyHrefOnlyUpdate() {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <div id="transport">
            <div id="track-info">
              <music-horizontal-item id="miniNPVTrackInfo">
                <a id="mini-player-link" href="/albums/ALBUM1?trackAsin=ONE"></a>
              </music-horizontal-item>
            </div>
            <div id="now-playing-controls">
              <div><music-button icon-name="favorite"></music-button></div>
              <div><music-button icon-name="more"></music-button></div>
            </div>
          </div>
        </body>
      </html>`,
    {
      url: 'https://music.amazon.com/my/music',
      runScripts: 'outside-only',
      pretendToBeVisual: true
    }
  );

  const { window } = dom;
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(_message, callback) {
        callback({ ok: true, data: {} });
      }
    }
  };
  window.Element.prototype.getClientRects = function getClientRects() {
    return [{ width: 10, height: 10 }];
  };

  window.eval(contentScript);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await wait(window);

  const button = window.document.querySelector('.tqq-now-playing-button');
  assert.strictEqual(button.dataset.trackUrl, 'https://music.amazon.com/tracks/ONE');
  window.document.getElementById('mini-player-link').setAttribute('href', '/albums/ALBUM2?trackAsin=TWO');
  await wait(window);
  assert.strictEqual(
    button.dataset.trackUrl,
    'https://music.amazon.com/tracks/TWO',
    'href-only mini-player updates should refresh the now-playing URL'
  );
  window.close();
}

async function verifyAmazonSearchSongItems() {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <section id="songs">
            <music-horizontal-item
              id="song-one"
              primary-text="Now You See Me"
              secondary-text="Jay Chou"
              primary-href="/tracks/B0CR5KW14W"
            >
              <music-button slot="buttons" icon-name="favorite"></music-button>
              <music-button slot="buttons" icon-name="more"></music-button>
            </music-horizontal-item>
            <music-horizontal-item
              id="song-two"
              primary-text="Now You See Me"
              secondary-text="Brian Tyler"
              primary-href="/tracks/B0DJC7KN8M"
            >
              <music-button slot="buttons" icon-name="favorite"></music-button>
              <music-button slot="buttons" icon-name="more"></music-button>
            </music-horizontal-item>
            <music-vertical-item
              id="album"
              primary-text="Now You See Me 2"
              primary-href="/albums/B01GKFZ83W"
            ></music-vertical-item>
          </section>
        </body>
      </html>`,
    {
      url: 'https://music.amazon.com/search/now+you+see+me',
      runScripts: 'outside-only',
      pretendToBeVisual: true
    }
  );

  const { window } = dom;
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(_message, callback) {
        callback({ ok: true, data: {} });
      }
    }
  };
  window.Element.prototype.getClientRects = function getClientRects() {
    return [{ width: 10, height: 10 }];
  };

  window.eval(contentScript);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await wait(window);

  const songOne = window.document.getElementById('song-one');
  const songTwo = window.document.getElementById('song-two');
  const firstButton = songOne.querySelector('.tqq-inline-button');
  const secondButton = songTwo.querySelector('.tqq-inline-button');
  assert.ok(firstButton, 'each Amazon search song item should receive a download button');
  assert.ok(secondButton, 'every Amazon search song item should receive a download button');
  assert.strictEqual(firstButton.getAttribute('slot'), 'buttons');
  assert.strictEqual(secondButton.getAttribute('slot'), 'buttons');
  assert.strictEqual(firstButton.dataset.trackUrl, 'https://music.amazon.com/tracks/B0CR5KW14W');
  assert.strictEqual(secondButton.dataset.trackUrl, 'https://music.amazon.com/tracks/B0DJC7KN8M');
  assert.strictEqual(
    window.document.getElementById('album').querySelector('.tqq-inline-button'),
    null,
    'albums are not individual tracks and should not receive a song download button'
  );

  window.close();
}

async function main() {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <div id="transport">
            <div id="unrelated-controls">
              <div id="unrelated-favorite-control">
                <music-button icon-name="favorite"></music-button>
              </div>
              <div id="unrelated-context-control">
                <music-button icon-name="more"></music-button>
              </div>
            </div>
            <div id="track-info">
              <music-horizontal-item
                id="miniNPVTrackInfo"
                primary-text="Song One"
                secondary-text="Artist"
                primary-href="/albums/ALBUM1?trackAsin=ASIN1"
              ></music-horizontal-item>
            </div>
            <div id="now-playing-controls">
              <div id="favorite-control">
                <music-button icon-name="favorite"></music-button>
              </div>
              <div id="context-control">
                <music-button icon-name="more"></music-button>
              </div>
            </div>
          </div>
        </body>
      </html>`,
    {
      url: 'https://music.amazon.com/my/music',
      runScripts: 'outside-only',
      pretendToBeVisual: true
    }
  );

  const { window } = dom;
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(_message, callback) {
        callback({ ok: true, data: {} });
      }
    }
  };
  window.Element.prototype.getClientRects = function getClientRects() {
    return [{ width: 10, height: 10 }];
  };

  window.eval(contentScript);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await wait(window);

  const controls = window.document.getElementById('now-playing-controls');
  const unrelatedControls = window.document.getElementById('unrelated-controls');
  const button = controls.querySelector('.tqq-now-playing-button');
  assert.ok(button, 'now-playing download button should be inside the native control group');
  assert.strictEqual(
    unrelatedControls.querySelector('.tqq-now-playing-button'),
    null,
    'unrelated favorite and context controls must not receive the now-playing button'
  );
  assert.deepStrictEqual(
    Array.from(controls.children).map((node) =>
      node.id || (node.classList.contains('tqq-now-playing-control') ? 'download-control' : '')
    ),
    ['favorite-control', 'download-control', 'context-control'],
    'download control should be after favorite and before context menu'
  );
  assert.strictEqual(
    button.dataset.trackUrl,
    'https://music.amazon.com/tracks/ASIN1',
    'button should target the canonical current-track URL'
  );

  const miniPlayer = window.document.getElementById('miniNPVTrackInfo');
  miniPlayer.setAttribute('primary-text', 'Song Two');
  miniPlayer.setAttribute('primary-href', '/albums/ALBUM2?trackAsin=ASIN2');
  await wait(window);

  const updatedButtons = controls.querySelectorAll('.tqq-now-playing-button');
  assert.strictEqual(updatedButtons.length, 1, 'track changes should not duplicate the button');
  assert.strictEqual(
    updatedButtons[0].dataset.trackUrl,
    'https://music.amazon.com/tracks/ASIN2',
    'attribute-only track changes should update the existing button URL'
  );

  window.close();
  await verifyCanonicalLocationCandidate();
  await verifyDirectSiblingControls();
  await verifyHrefOnlyUpdate();
  await verifyAmazonSearchSongItems();
  console.log('Amazon now-playing placement tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
