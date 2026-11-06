# Amazon Personal Playlist Import Implementation Plan

Superseded by `2026-11-03-amazon-browser-playlist.md` after the user clarified
that the playlist page should supply individual tracks for the working downloader.

> Execute inline in the current checkout to preserve existing local packaging changes.

**Goal:** Expand Amazon Music personal playlist URLs into ordered individual queue items.

**Architecture:** Reuse `fetchLucidaPlaylistTracks` and the existing atomic playlist
queue path. Add strict Amazon playlist/track URL helpers, use the source service
to normalize playlist entries, and retain the existing renderer response contract.

**Tech Stack:** Electron, Node.js, React, Node's built-in test runner.

## Tasks

- [x] Add `test-amazon-playlist.js` exercising the main-process functions in a VM
  with network and download side effects stubbed. Cover the supplied URL,
  `/playlists`, non-playlist and hostile hosts, track selection, canonical Amazon
  URLs, mixed valid/unavailable tracks, TIDAL regression, queue order/settings,
  duplicates, invalid metadata and service errors. Run
  `node --test test-amazon-playlist.js` and confirm failures from missing behavior.
- [x] Add `isAmazonPlaylistUrl` and `canonicalizeAmazonTrackUrl` in
  `tidal-electron-app/electron/main.js`. Select the track canonicalizer using
  `detectMusicService(normalizedUrl)` in `fetchLucidaPlaylistTracks`, and route
  Amazon playlists through the existing batch branch in `addToQueueInternal`.
  Run the new tests and confirm success.
- [x] Extend `test-amazon-url-normalization.js` with a personal-playlist
  `trackAsin` case, observe failure, and update the extension normalizer to accept
  that path while rejecting a whole playlist as a single track. Remove Amazon URL
  fragments consistently. Run URL and extension DOM regression tests.
- [x] Update `URLSection.js` placeholder/help, the root README playlist usage,
  extension README and architecture documentation with shared-playlist support
  and service/privacy limitations.
- [x] Run new tests, existing Amazon/extension regressions, packaging regressions,
  `yarn build` and `git diff --check`. Review the feature diff without staging or
  discarding the user's existing changes. Report verification evidence and the
  live-service limitation.

## Results

The 15 playlist regression tests passed, as did Amazon URL normalization,
extension now-playing DOM/delegated-click checks, and seven packaging/signing
regressions. `yarn build` compiled successfully and updated `build/electron.js`;
its syntax check and `git diff --check` passed. Independent code review found no
actionable issues. Live service availability and import of the supplied playlist
remain unverified due to the HTTP 403/404 responses recorded in the design.
