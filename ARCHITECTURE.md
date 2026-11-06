# Tidal Downloader Architecture

## Overview
This project is an Electron desktop app with a React UI and a Python download engine.

- Renderer: user interface, queue handling, status display.
- Main process: IPC handlers, process orchestration, metadata scraping, queue execution.
- Downloader: Python script that calls `https://us.doubledouble.top` and handles file processing.

## Main Components

### 1. Electron Renderer (`/tidal-electron-app/src`)
- Collects URL, format, and output directory.
- Manages tabs: add songs, batch import, queue, failed list.
- Sends actions via `window.electronAPI` (preload bridge).
- Receives progress updates through `download-progress` and `queue-updated`.

### 2. Electron Main (`/tidal-electron-app/electron/main.js`)
- Hosts all IPC handlers (`start-download`, `add-to-queue`, `retry-download`, etc.).
- Runs queue items sequentially.
- Spawns downloader process (Python in dev, bundled binary in packaged app).
- Maps downloader stdout to UI progress states.
- Handles DoubleDouble CAPTCHA flow:
  - detects CAPTCHA failure from downloader output
  - opens in-app verification popup
  - reads CAPTCHA artifacts from popup session storage
  - retries download automatically

### 3. Python Downloader (`/tidal_downloader.py`, `/tidal-electron-app/python/tidal_downloader.py`)
- Detects service type (Tidal/Amazon Music).
- Normalizes service URLs.
- Calls DoubleDouble `/dl` and polls `/dl/{id}`.
- Downloads result file, extracts ZIP (if needed), converts audio to MP3 (if enabled).
- Supports CAPTCHA arguments:
  - `--captcha-token`
  - `--captcha-response`

## End-to-End Flows

### Queue Download
1. Renderer adds item to queue.
2. Main process marks next item as downloading.
3. Main spawns downloader with selected format/output.
4. Progress updates are pushed back to renderer.
5. On completion/failure, queue item state is updated and next item starts.

### Direct Download
1. Renderer sends `start-download`.
2. Main process runs downloader once.
3. If CAPTCHA is required, main process starts verification popup and retries automatically.
4. Final status is reported to renderer.

### Playlist Import
1. The shared `addToQueueInternal` path handles both the renderer IPC request and
   the local HTTP queue endpoint.
2. TIDAL `/playlist/` URLs use Lucida playlist metadata. Amazon Music
   `/user-playlists/` or `/playlists/` URLs open in the user's default browser with
   a unique, expiring import ID in the fragment. The Tidal Quick Queue extension
   reads the signed-in playlist page, including private playlists, and posts the
   ordered track list to `/api/playlist/result`. This requires no Amazon cookies
   or credentials in Electron and no third-party playlist lookup. Amazon URLs
   with `trackAsin` select a single track and bypass batch expansion.
3. Each playlist entry is canonicalized for its source service. Valid tracks keep
   their original order and repeated occurrences; unusable entries are skipped.
4. All prepared items are appended together, then the queue is broadcast and
   processing starts. Each item retains the chosen method, format and destination.
5. The response includes playlist title and added/skipped counts. Failed lookups,
   incomplete browser reads or playlists without downloadable tracks leave the
   queue unchanged. Browser callbacks must match the pending import ID and source
   URL; successful callbacks consume the ID so replays cannot add duplicates.

### CAPTCHA Verification
1. Downloader returns error indicating CAPTCHA requirement/token invalid.
2. Main process opens DoubleDouble in modal popup.
3. User completes CAPTCHA and triggers one download action there.
4. Main process captures `captchaToken` or `captcha-response` from popup session storage.
5. Main process retries original download with captured artifacts.

## Persistence
- User preferences: `~/.tidal_downloader_prefs.json`
- Downloader logs: `/tmp/tidal_downloader.log`
- CAPTCHA artifacts are kept in-memory in the main process for reuse during the app session.

## Build and Runtime Modes
- Dev mode:
  - main process spawns `python3 ../../tidal_downloader.py`
- Packaged mode:
  - main process spawns bundled downloader binary under `resources/binaries/`
  - bundled `ffmpeg` path is injected into `PATH`

## Key Risks and Notes
- CAPTCHA/token behavior is controlled by DoubleDouble/Cloudflare and can change.
- CAPTCHA artifacts may expire; popup verification may be required again.
- Amazon URL acceptance now includes both `music.amazon.com` and `amazon.com/music/...`.
- Amazon playlist import requires the updated extension in the default browser
  and an Amazon session that can view the playlist. The browser read has a
  60-second collection limit and the app's pending request expires after 90
  seconds. The selected service is only used for individual song downloads.
