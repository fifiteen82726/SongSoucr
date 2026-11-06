# Amazon Playlist Page → Individual Track Downloads

The user clarified that individual Amazon songs already work. The required flow
is to open the playlist link, read each song, and use the working single-track
downloader for every song. This replaces the November 2 Lucida playlist lookup.

## Observed evidence

The supplied playlist is private and visible in the user's signed-in Chrome
session. Its normal page displays 31 songs. The current React UI exposes track
ASINs in `IconButton,PlaylistTrack_ContextMenu` button IDs and positions in
`aria-label="Track N"` elements. Album links in those rows are not song links.
The original tab is in edit mode and must remain unchanged; a separate read-only
tab confirmed all 31 individual track IDs, titles and artists.

## Flow

The Electron app opens the source playlist in the default browser with a random
import ID in the fragment. Its local server keeps an expiring pending promise.
The existing extension collects playlist rows from the signed-in page, scrolling
to load additional rows, and posts them to `/api/playlist/result` via its background
worker. No Amazon credentials leave the browser. No external playlist metadata
request is involved. Private playlists work when the browser account can view them.

The app validates the pending ID and source URL, prepares canonical Amazon track
URLs, then appends individual queue entries. Their format, method and destination
come from the original app action. The existing queue processes one song at a
time. Preserve order and repeated tracks; count unavailable entries as skipped.

## Failure handling

Track positions and the displayed song count must agree before reporting a full
read. Before the first requested-playlist snapshot with both count and rows,
temporary routes during Amazon initialization are waited out without reading
their DOM. After collection starts, leaving the requested playlist fails the
read. Missing rows, navigation away, an inactive extension, malformed results and
timeouts fail without changing the queue. Collection has a 60-second deadline;
pending app reads expire after 90 seconds. Consume request IDs exactly once and
clean up pending timers after success or failure. Leave TIDAL import unchanged.

## Validation

Test current React and legacy row DOM, virtualized/delayed rows, duplicates,
recommendation/player exclusion, incomplete reads, source changes, app/browser
pairing, replay rejection, error propagation and the complete HTTP-to-queue path.
Verify all 31 song IDs against the live DOM. Run existing Amazon/extension tests
and rebuild the app. Reloading an installed extension and restarting a running
app are required before the new workflow is available there.
