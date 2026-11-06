(function initAmazonPlaylistReader() {
  function readSnapshot(document) {
    const heading = document.querySelector('h1, [role="heading"][aria-label]');
    const title = (heading?.getAttribute('aria-label') || heading?.textContent || document.title).trim();
    const legacyHeader = document.querySelector('music-detail-header');
    const countText = document.querySelector('[data-testid="PageHeaderMetadata_TertiaryBox_TrackCount"]')?.textContent ||
      ['secondary-text', 'secondary-text-1', 'secondary-text-2', 'secondary-text-3']
        .map(name => legacyHeader?.getAttribute(name) || '').join(' ');
    const countMatch = countText.match(/([\d,]+)\s+(?:SONGS?\b|首歌曲|首歌|曲)/i);
    const expectedCount = countMatch ? Number(countMatch[1].replace(/,/g, '')) : null;
    const tracks = [];

    // Current Amazon React UI: the context-menu button ID is the track ASIN.
    // Album anchors in the same row identify the album, not the selected song.
    const rows = document.querySelectorAll('[data-testid="ListItem"]');
    for (const row of rows) {
      const number = row.querySelector('[aria-label^="Track "]')?.getAttribute('aria-label')?.match(/^Track (\d+)$/);
      if (!number) continue;
      const trackNumber = Number(number[1]);
      const menu = row.parentElement.querySelector('[data-testid="IconButton,PlaylistTrack_ContextMenu"]');
      const asin = menu?.id || '';
      const rowTitle = row.querySelector('[tabindex="-1"][aria-label]')?.getAttribute('aria-label');
      const artist = Array.from(row.querySelectorAll('a[href*="/artists/"]')).map(a=>a.textContent.trim()).filter(Boolean).join(', ');
      tracks.push({
        trackNumber,
        url: /^[a-z0-9]{10}$/i.test(asin) ? `https://music.amazon.com/tracks/${asin}` : null,
        title: rowTitle || row.getAttribute('aria-label')?.split(' by ')[0] || `Track ${trackNumber}`,
        artists: artist ? [{ name: artist }] : []
      });
    }

    // Older Amazon UI exposes a track link on its custom row element.
    if (tracks.length === 0) {
      const legacyRows = Array.from(document.querySelectorAll('music-image-row, music-text-row'))
        .filter(row => !row.closest('#miniNPVTrackInfo, [aria-label="Suggestions"], music-detail-header'));
      for (const [index, row] of legacyRows.entries()) {
        const rawUrl = row.getAttribute('primary-href') || row.querySelector('a[href*="trackAsin="], a[href*="/tracks/"]')?.getAttribute('href');
        let canonicalUrl = null;
        try {
          const parsed = new URL(rawUrl, document.location.origin);
          const asin = parsed.searchParams.get('trackAsin') || parsed.pathname.match(/^\/tracks\/([a-z0-9]+)\/?$/i)?.[1];
          if (parsed.hostname === 'music.amazon.com' && asin && /^[a-z0-9]+$/i.test(asin)) {
            const trackUrl = new URL(`https://music.amazon.com/tracks/${asin}`);
            for (const key of ['marketplaceId', 'musicTerritory']) {
              if (parsed.searchParams.get(key)) trackUrl.searchParams.set(key, parsed.searchParams.get(key));
            }
            canonicalUrl = trackUrl.toString();
          }
        } catch (error) { /* Ignore unrelated links. */ }
        const artist = row.getAttribute('secondary-text-1') || row.getAttribute('secondary-text') || '';
        tracks.push({
          trackNumber: Number(row.getAttribute('aria-rowindex')) || index + 1,
          url: canonicalUrl,
          title: row.getAttribute('primary-text') || `Track ${index + 1}`,
          artists: artist ? [{ name: artist }] : []
        });
      }
    }
    return { title, expectedCount, tracks };
  }

  function scrollPlaylist(window) {
    const document = window.document;
    const lastRow = Array.from(document.querySelectorAll('[data-testid="ListItem"], music-image-row, music-text-row'))
      .filter(row => !row.closest('#miniNPVTrackInfo, [aria-label="Suggestions"], music-detail-header'))
      .filter(row => row.matches('music-image-row, music-text-row') || row.querySelector('[aria-label^="Track "]'))
      .pop();
    if (lastRow?.scrollIntoView) lastRow.scrollIntoView({ block: 'end' });
    let node = lastRow?.parentElement;
    while (node && node !== document.body) {
      if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(window.getComputedStyle(node).overflowY)) {
        node.scrollTop += Math.max(300, node.clientHeight / 2);
        return;
      }
      node = node.parentElement;
    }
    const root = document.scrollingElement;
    if (root) root.scrollTop += Math.max(300, window.innerHeight / 2);
  }

  async function collectPlaylist(window, { timeoutMs = 60000, pollMs = 300, scroll = () => scrollPlaylist(window) } = {}) {
    const sourcePath = window.location.pathname;
    if (!/^\/(?:user-playlists|playlists)\/[^/]+\/?$/.test(sourcePath)) {
      throw new Error('Open the Amazon playlist page and sign in before importing.');
    }
    const byPosition = new Map();
    const deadline = Date.now() + timeoutMs;
    let expectedCount = null;
    let playlistStarted = false;
    while (Date.now() < deadline) {
      if (window.location.pathname !== sourcePath) {
        if (playlistStarted) {
          throw new Error('Amazon left the playlist page. Sign in and try importing again.');
        }
        // Amazon briefly routes through Home while initializing a deep link.
        // Wait for the requested page; never read rows from the temporary route.
        await new Promise(resolve => window.setTimeout(resolve, pollMs));
        continue;
      }
      const snapshot = readSnapshot(window.document);
      if (snapshot.expectedCount !== null && snapshot.tracks.length > 0) playlistStarted = true;
      if (snapshot.expectedCount !== null) expectedCount = snapshot.expectedCount;
      if (expectedCount === 0) throw new Error('Playlist contains no downloadable tracks.');
      for (const track of snapshot.tracks) {
        if (track.trackNumber > 0) byPosition.set(track.trackNumber, track);
      }
      if (expectedCount !== null && expectedCount > 0 &&
        Array.from({ length: expectedCount }, (_, index) => byPosition.has(index + 1)).every(Boolean)) {
        return {
          success: true,
          type: 'playlist',
          title: snapshot.title,
          tracks: Array.from({ length: expectedCount }, (_, index) => byPosition.get(index + 1))
        };
      }
      scroll();
      await new Promise(resolve => window.setTimeout(resolve, pollMs));
    }
    if (window.location.pathname !== sourcePath) {
      throw new Error('Amazon did not finish opening the requested playlist. Sign in and retry.');
    }
    throw new Error(expectedCount === null
      ? 'Could not read the playlist. Sign in to Amazon Music and finish editing before retrying.'
      : `Playlist read incomplete (${byPosition.size} of ${expectedCount} tracks). Scroll to load the full playlist and retry.`);
  }

  const api = { readSnapshot, collectPlaylist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.TqqAmazonPlaylist = api;
}());
