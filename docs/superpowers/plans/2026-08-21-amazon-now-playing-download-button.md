# Amazon Now-Playing Download Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place the Amazon Music now-playing queue button immediately after the favorite control and before the context-menu control, while keeping one button updated across track changes.

**Architecture:** Extend the existing Amazon now-playing path in the content script with a control-group locator and a dedicated idempotent insertion helper. Keep the existing `MutationObserver` as the retry and track-change trigger. Exercise the complete content script in JSDOM so placement and dynamic URL updates are verified against DOM behavior rather than source-code patterns.

**Tech Stack:** Chrome Manifest V3 content script, plain JavaScript, CSS, Node.js `assert`, JSDOM from the existing Electron app dependencies.

---

## File Structure

- Create `test-amazon-now-playing-placement.js`: DOM-level regression test for control ordering, canonical URL assignment, and duplicate prevention.
- Modify `browser-extension/tidal-quick-queue/content.js`: locate the native now-playing control group and insert/update the extension button at the required sibling position.
- Modify `browser-extension/tidal-quick-queue/content.css`: align and size the dedicated now-playing control without changing track-row buttons.

### Task 1: Reproduce Now-Playing Placement in JSDOM

**Files:**
- Create: `test-amazon-now-playing-placement.js`
- Test: `test-amazon-now-playing-placement.js`

- [ ] **Step 1: Write the failing DOM regression test**

```javascript
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

async function main() {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <div id="transport">
            <div id="track-info">
              <music-horizontal-item
                id="miniNPVTrackInfo"
                primary-text="Song One"
                secondary-text="Artist"
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
          <music-image-row
            id="active-track-row"
            primary-text="Song One"
            secondary-text-1="Artist"
            primary-href="/albums/ALBUM1?trackAsin=ASIN1"
          ></music-image-row>
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
  const button = controls.querySelector('.tqq-now-playing-button');
  assert.ok(button, 'now-playing download button should be inside the native control group');
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
  const activeRow = window.document.getElementById('active-track-row');
  miniPlayer.setAttribute('primary-text', 'Song Two');
  activeRow.setAttribute('primary-text', 'Song Two');
  activeRow.setAttribute('primary-href', '/albums/ALBUM2?trackAsin=ASIN2');
  window.document.body.appendChild(window.document.createElement('div'));
  await wait(window);

  const updatedButtons = controls.querySelectorAll('.tqq-now-playing-button');
  assert.strictEqual(updatedButtons.length, 1, 'track changes should not duplicate the button');
  assert.strictEqual(
    updatedButtons[0].dataset.trackUrl,
    'https://music.amazon.com/tracks/ASIN2',
    'track changes should update the existing button URL'
  );

  window.close();
  console.log('Amazon now-playing placement tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run the test and verify the current implementation fails**

Run:

```bash
node test-amazon-now-playing-placement.js
```

Expected: FAIL with `now-playing download button should be inside the native control group`, because the current implementation appends the button to `miniNPVTrackInfo.parentElement`.

### Task 2: Insert and Update the Button Between Native Controls

**Files:**
- Modify: `browser-extension/tidal-quick-queue/content.js:1-10`
- Modify: `browser-extension/tidal-quick-queue/content.js:488-503`
- Modify: `browser-extension/tidal-quick-queue/content.css:1-26`
- Test: `test-amazon-now-playing-placement.js`

- [ ] **Step 1: Add dedicated now-playing selectors**

Add these constants beside `INLINE_BUTTON_CLASS`:

```javascript
const NOW_PLAYING_BUTTON_CLASS = 'tqq-now-playing-button';
const NOW_PLAYING_CONTROL_CLASS = 'tqq-now-playing-control';
```

- [ ] **Step 2: Add a stable native-control locator**

Add this helper before `upsertButtonForAmazonNowPlaying`:

```javascript
function findAmazonNowPlayingControls(miniPlayer) {
  let searchRoot = miniPlayer && miniPlayer.parentElement;

  while (searchRoot && searchRoot !== document.body) {
    const favoriteButton = searchRoot.querySelector('music-button[icon-name="favorite"]');
    const contextButton = searchRoot.querySelector('music-button[icon-name="more"]');
    const favoriteContainer = favoriteButton && favoriteButton.parentElement;
    const contextContainer = contextButton && contextButton.parentElement;

    if (
      favoriteContainer &&
      contextContainer &&
      favoriteContainer.parentElement === contextContainer.parentElement
    ) {
      return {
        group: favoriteContainer.parentElement,
        contextContainer
      };
    }

    searchRoot = searchRoot.parentElement;
  }

  return null;
}
```

- [ ] **Step 3: Add the idempotent now-playing insertion helper**

Add this helper after `findAmazonNowPlayingControls`:

```javascript
function upsertAmazonNowPlayingButton(controls, normalizedUrl) {
  if (!controls || !normalizedUrl) {
    return;
  }

  let control = Array.from(controls.group.children).find((child) =>
    child.classList && child.classList.contains(NOW_PLAYING_CONTROL_CLASS)
  );
  let button = control && control.querySelector(`.${NOW_PLAYING_BUTTON_CLASS}`);

  if (!control) {
    control = document.createElement('div');
    control.className = NOW_PLAYING_CONTROL_CLASS;
  }

  if (!button) {
    button = buildInlineButton(normalizedUrl);
    button.classList.add(NOW_PLAYING_BUTTON_CLASS);
    control.appendChild(button);
  } else {
    updateInlineButton(button, normalizedUrl);
  }

  controls.contextContainer.before(control);
}
```

- [ ] **Step 4: Replace the incorrect now-playing attachment logic**

Replace the last four lines of `upsertButtonForAmazonNowPlaying` with:

```javascript
const controls = findAmazonNowPlayingControls(miniPlayer);
if (!controls) {
  return;
}

upsertAmazonNowPlayingButton(controls, normalizedUrl);
```

- [ ] **Step 5: Add now-playing-only layout styles**

Add after the base `.tqq-inline-button` block:

```css
.tqq-now-playing-control {
  display: flex;
  align-items: center;
  justify-content: center;
}

.tqq-now-playing-button {
  width: 32px;
  height: 32px;
  margin: 0 4px;
  font-size: 16px;
}
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
node test-amazon-now-playing-placement.js
```

Expected: `Amazon now-playing placement tests passed.`

- [ ] **Step 7: Commit the focused feature**

Inspect the diff first because the worktree already contains unrelated modifications:

```bash
git diff -- browser-extension/tidal-quick-queue/content.js \
  browser-extension/tidal-quick-queue/content.css \
  test-amazon-now-playing-placement.js
```

Then stage only the feature files after confirming their full contents are intended:

```bash
git add browser-extension/tidal-quick-queue/content.js \
  browser-extension/tidal-quick-queue/content.css \
  test-amazon-now-playing-placement.js
git diff --cached --check
git commit -m "extension: place download beside Amazon favorite"
```

Expected: one commit containing the placement helper, scoped CSS, and DOM regression test. If the content-script diff includes unrelated uncommitted work that must remain separate, do not create this commit; leave the verified files uncommitted instead.

### Task 3: Run Regression and Build Verification

**Files:**
- Test: `test-amazon-now-playing-placement.js`
- Test: `test-amazon-url-normalization.js`
- Test: `test-extension-delegated-click.js`
- Verify: `browser-extension/tidal-quick-queue/content.js`
- Verify: `browser-extension/tidal-quick-queue/background.js`
- Verify: `tidal-electron-app/`

- [ ] **Step 1: Run all extension regression tests and syntax checks**

Run:

```bash
set -o pipefail
node test-amazon-now-playing-placement.js
node test-amazon-url-normalization.js
node test-extension-delegated-click.js
node --check browser-extension/tidal-quick-queue/content.js
node --check browser-extension/tidal-quick-queue/background.js
```

Expected: all three tests print their pass messages and both syntax checks exit with code 0.

- [ ] **Step 2: Build the Electron application**

Run:

```bash
npm --prefix tidal-electron-app run build
```

Expected: `Compiled successfully.` and exit code 0. The existing Browserslist age warning is informational and does not fail the build.

- [ ] **Step 3: Perform the live extension handoff**

Reload the unpacked extension at `chrome://extensions`, refresh Amazon Music, and play a track. Verify that the button appears in this order:

```text
Favorite | Download | Context menu
```

Before clicking, record the queue length:

```bash
curl -sS http://127.0.0.1:43893/api/health
```

Click the now-playing download button once, then run the same health request again. Expected: `queueLength` increases by one and the Amazon page shows the existing `Queued` success toast.
