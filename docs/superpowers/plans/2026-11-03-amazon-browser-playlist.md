# Amazon Browser Playlist Implementation Plan

**Goal:** Read the signed-in Amazon playlist page and download each song through
the existing single-track queue.

- [x] Confirm the actual private playlist DOM in a separate browser tab; identify
  all 31 track IDs from context-menu buttons and their numbered song rows.
- [x] Write failing browser-reader, handoff and queue regression tests.
- [x] Add `amazon-playlist.js` with current React and legacy DOM parsing,
  position-based collection, lazy-load scrolling and completeness checking.
- [x] Add app/browser request pairing with random IDs, timeout cleanup and a local
  callback endpoint. Route Amazon playlists through the browser reader; keep
  TIDAL's existing metadata lookup and the common individual-track queue.
- [x] Wire the extension's content/background scripts and manifest; propagate
  collection errors to the waiting app and callback errors to the page.
- [x] Update app help, README and architecture for private signed-in playlists.
- [x] Run all feature/extension tests, review the implementation and rebuild.
- [x] Verify the parser against the actual 31-song playlist and report exact
  validation coverage without claiming that every audio download was tested.

Validation: 31 browser-reader, bridge and queue tests passed, including the real
HTTP callback-to-queue path. Existing Amazon URL normalization, now-playing DOM
and delegated-click regressions passed. `yarn build` compiled successfully.
Independent review's count-field and unavailable legacy-row findings were fixed
with regression tests; the follow-up review found no remaining actionable issues.
Live DOM validation returned 31/31 canonical song URLs and complete positions,
from CRASH (B0HJZGSXZL) through LOVE ATTACK (B0DFCJKYNM). This checked playlist
extraction; it did not download all audio files or change the user's queue.

Follow-up: the original 31-song playlist later passed a full live download test,
including 31 MP3 files with 320 kbps stereo audio and full decoding validation.
The user's second playlist (`dd4b318a-bf22-445b-b2ce-0d2a0878c0ae`, currently nine
songs) exposed a startup race. An isolated browser trace showed the requested
playlist path → Home (`/`) → requested playlist path before rows rendered.
Version 0.2.1 waits through that initial transition, without collecting another
page, while retaining navigation rejection after collection begins. The exact
failure was reproduced in a regression test before the fix; all 33 feature tests
and existing Amazon/extension regressions now pass. Independent review found no
actionable defects. Full live retesting requires reloading the updated extension.
