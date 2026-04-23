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

## Install (Chrome / Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:
   - `/Users/codachang/Desktop/DJ/tidalDownloader/browser-extension/tidal-quick-queue`

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
