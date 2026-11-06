# Tidal Quick Queue Extension

This extension adds an inline icon button next to supported music rows and sends that URL directly to the local queue in the Electron app.

## Behavior

- Endpoint: `http://127.0.0.1:43893/api/queue/add`
- Default method: `lucida`
- Default format: `mp3_320`
- Download folder: current folder from app preferences
- Works for:
  - TIDAL `track`, `album`, `playlist`, `video` URLs
  - Amazon Music track rows on `music.amazon.com` playlist and album pages
  - Individual track links with `trackAsin` on Amazon personal playlist pages

To import an entire Amazon playlist, paste its `/user-playlists/<id>` or
`/playlists/<id>` URL into the Electron app and choose **Add to Queue**. The app
opens the playlist in your default browser. Keep this extension enabled and sign
in to Amazon there; private playlists visible to that account are supported.

The extension reads each track's ID, title and artist from the playlist page,
loads additional rows when needed, and returns the full ordered list to the app.
Each song then uses the app's existing single-track queue/download flow. The
playlist itself is never submitted for a Lucida playlist lookup. Incomplete
reads fail without adding a partial queue. Inline buttons still queue one track.

## Install (Chrome / Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:
   - `browser-extension/tidal-quick-queue` inside your local repository checkout.

After pulling an update, click the extension's **Reload** button on the extensions
page, then refresh Amazon Music. Version 0.2.0 adds the browser playlist reader;
version 0.2.1 waits through Amazon's temporary Home route during playlist startup.

## Use

1. Start the Electron app (`tidal-electron-app`) so local API is running.
2. Open a supported TIDAL or Amazon Music page.
3. Click the `⇣` icon on any track row.
4. The URL is added to queue immediately.

## API health check (optional)

When the app is running:

```bash
curl http://127.0.0.1:43893/api/health
```
