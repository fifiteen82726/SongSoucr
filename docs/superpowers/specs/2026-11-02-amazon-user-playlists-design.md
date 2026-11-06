# Amazon Personal Playlist Import

Superseded by `2026-11-03-amazon-browser-playlist-design.md` following the user's
clarification: open the signed-in playlist page and process individual tracks.

The user requested support for Amazon Music personal playlist URLs such as
`https://music.amazon.com/user-playlists/cf591a3e-bd13-42a2-a187-34fab3076fa9`.
Pasting a playlist and choosing Add to Queue must expand it into individual
Amazon tracks using the existing playlist metadata service and queue workflow.

## Approach

Extend the existing Lucida playlist flow rather than add a second scraping or
authentication system. A dedicated Amazon playlist predicate recognizes
`/user-playlists/<id>` and `/playlists/<id>`. Links selecting a specific
`trackAsin` remain single tracks. The metadata parser canonicalizes each entry
according to the source service, preserves ordering and intentional duplicates,
and skips entries without valid track URLs from that service.

Direct Amazon track URLs and album/playlist links with `trackAsin` become
`https://music.amazon.com/tracks/<asin>`, retaining marketplace and territory
parameters. Tracking parameters and fragments are removed. Cross-service and
non-track links are excluded. Existing TIDAL playlist behavior is preserved.

Queue changes occur only after successful parsing. The existing response reports
playlist title, added count and skipped count, and every track inherits format,
download method and destination. Errors, empty playlists and unavailable/private
playlists must leave the queue unchanged. Do not fall through to single-track
metadata on playlist failure.

## User interface and extension

The URL field explains that track and playlist URLs are accepted. Existing
playlist completion messages display the title and counts. The extension's
single-track URL normalizer also accepts `trackAsin` links whose path is
`/user-playlists/...`; importing a whole playlist uses the app URL field.

## Validation and external dependency

Use Node regression tests against real main-process functions with only network
and download side effects substituted. Verify playlist detection, canonical URL
validation, Amazon and TIDAL metadata expansion, queue ordering/options/counts,
duplicate preservation and failures with no queue mutation. Run the existing
Amazon URL and extension DOM tests and rebuild the Electron/React output.

Live exploration on November 2, 2026 found Lucida's public entry returning HTTP
403 and its configured backend hosts returning HTTP 404. Amazon's anonymous page
redirects to its homepage. These external responses prevent an end-to-end import
of the supplied playlist in this environment; automated tests must not claim to
prove service availability or private playlist access.
