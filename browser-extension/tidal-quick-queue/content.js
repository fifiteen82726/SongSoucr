(function initTidalQuickQueueInlineButtons() {
  const TRACK_LINK_SELECTOR = 'a[href*="/track/"], a[href*="/tracks/"], a[href*="trackAsin="]';
  const INLINE_BUTTON_CLASS = 'tqq-inline-button';
  const NOW_PLAYING_BUTTON_CLASS = 'tqq-now-playing-button';
  const NOW_PLAYING_CONTROL_CLASS = 'tqq-now-playing-control';
  const INLINE_BUTTON_FLAG = 'tqqButtonBound';
  const TOAST_ID = 'tqq-toast';
  const VALID_PATH_RE = /^\/(?:browse\/)?(track|album|playlist|video)\//i;
  const TRACK_ID_RE = /(?:^|-)track-(\d+)(?:-|$)/i;
  const AMAZON_HOST_RE = /(^|\.)music\.amazon\.com$/i;
  const AMAZON_ALLOWED_PATH_RE = /^\/(?:albums|playlists|tracks)\//i;
  const AMAZON_TRACK_PATH_RE = /^\/tracks\/([a-z0-9]+)/i;
  const ROW_SELECTOR = [
    '[data-test^="tracklist-row"]',
    '[class*="rowContainer"]',
    '[role="row"]',
    'article',
    'li',
    'tr',
    'td'
  ].join(', ');
  let activeRequests = 0;
  let scanScheduled = false;

  function isVisible(el) {
    if (!el) {
      return false;
    }
    return el.getClientRects().length > 0;
  }

  function normalizeTidalUrl(rawUrl) {
    if (!rawUrl) {
      return null;
    }
    try {
      const parsed = new URL(rawUrl);
      if (!parsed.hostname.toLowerCase().includes('tidal.com')) {
        return null;
      }

      let pathname = parsed.pathname || '/';
      pathname = pathname.replace(/^\/browse(?=\/)/i, '');
      pathname = pathname.replace(/\/+$/, '');
      pathname = pathname.replace(/\/u$/i, '');
      if (!VALID_PATH_RE.test(pathname)) {
        return null;
      }

      const trackMatch = pathname.match(/^\/track\/(\d+)$/i);
      const albumMatch = pathname.match(/^\/album\/(\d+)$/i);
      const playlistMatch = pathname.match(/^\/playlist\/([0-9a-f-]+)$/i);
      const videoMatch = pathname.match(/^\/video\/(\d+)$/i);

      parsed.hostname = 'tidal.com';
      if (trackMatch) {
        parsed.pathname = `/track/${trackMatch[1]}`;
      } else if (albumMatch) {
        parsed.pathname = `/album/${albumMatch[1]}`;
      } else if (playlistMatch) {
        parsed.pathname = `/playlist/${playlistMatch[1]}`;
      } else if (videoMatch) {
        parsed.pathname = `/video/${videoMatch[1]}`;
      } else {
        parsed.pathname = pathname;
      }

      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch (error) {
      return null;
    }
  }

  function normalizeAmazonUrl(rawUrl) {
    if (!rawUrl) {
      return null;
    }

    try {
      const parsed = new URL(rawUrl, window.location.origin);
      if (!AMAZON_HOST_RE.test(parsed.hostname)) {
        return null;
      }

      if (!AMAZON_ALLOWED_PATH_RE.test(parsed.pathname || '/')) {
        return null;
      }

      const trackAsin = parsed.searchParams.get('trackAsin');
      const trackPathMatch = (parsed.pathname || '').match(AMAZON_TRACK_PATH_RE);
      if (trackAsin && /^[a-z0-9]+$/i.test(trackAsin)) {
        parsed.pathname = `/tracks/${trackAsin}`;
      } else if (trackPathMatch && trackPathMatch[1]) {
        parsed.pathname = `/tracks/${trackPathMatch[1]}`;
      } else {
        return null;
      }

      const nextSearch = new URLSearchParams();
      ['marketplaceId', 'musicTerritory'].forEach((key) => {
        const value = parsed.searchParams.get(key);
        if (value) {
          nextSearch.set(key, value);
        }
      });

      parsed.protocol = 'https:';
      parsed.hostname = 'music.amazon.com';
      parsed.search = nextSearch.toString();
      parsed.hash = '';
      return parsed.toString();
    } catch (error) {
      return null;
    }
  }

  function normalizeTrackUrl(rawUrl) {
    if (!rawUrl) {
      return null;
    }

    const absoluteUrl = (() => {
      try {
        return new URL(rawUrl, window.location.origin).toString();
      } catch (error) {
        return rawUrl;
      }
    })();

    return normalizeTidalUrl(absoluteUrl) || normalizeAmazonUrl(absoluteUrl);
  }

  function buildTrackUrlFromId(trackId) {
    if (!trackId) {
      return null;
    }
    return `https://tidal.com/track/${trackId}`;
  }

  function extractTrackId(value) {
    if (!value) {
      return null;
    }
    const match = String(value).match(TRACK_ID_RE);
    return match ? match[1] : null;
  }

  function ensureToast() {
    let toast = document.getElementById(TOAST_ID);
    if (toast) {
      return toast;
    }
    toast = document.createElement('div');
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
    return toast;
  }

  let toastTimer = null;
  function showToast(message, tone) {
    const toast = ensureToast();
    toast.textContent = message;
    toast.setAttribute('data-tone', tone || 'info');
    toast.classList.add('show');
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2600);
  }

  function getAttachTarget(element) {
    const amazonTrackItem = element.closest('music-horizontal-item, music-vertical-item');
    if (amazonTrackItem) {
      return {
        node: amazonTrackItem,
        slot: amazonTrackItem.querySelector('music-button[slot="buttons"]') ? 'buttons' : undefined
      };
    }

    const amazonRow = element.closest('music-image-row');
    if (amazonRow) {
      return {
        node: amazonRow,
        slot: amazonRow.querySelector('music-button[slot="contextMenu"]') ? 'contextMenu' : 'buttons'
      };
    }
    const amazonTextRow = element.closest('music-text-row');
    if (amazonTextRow) {
      return {
        node: amazonTextRow,
        slot: amazonTextRow.querySelector('music-button[slot="contextMenu"]') ? 'contextMenu' : 'buttons'
      };
    }

    const titleContainer = element.closest(
      '[data-test="footer-track-title"], [data-test="artist-name"], [data-test="title"]'
    );
    if (titleContainer) {
      return { node: titleContainer };
    }

    const row = element.closest(ROW_SELECTOR);
    if (row) {
      const actionColumn = row.querySelector(
        '[class*="buttonColumn"], [class*="actions"], [class*="actionContainer"]'
      );
      if (actionColumn) {
        return { node: actionColumn };
      }

      const actionButtons = row.querySelectorAll('button');
      if (actionButtons.length > 0) {
        const lastButton = actionButtons[actionButtons.length - 1];
        if (lastButton && lastButton.parentElement) {
          return { node: lastButton.parentElement };
        }
      }
    }

    return { node: element.parentElement || element };
  }

  function setBusyState(button, busy) {
    if (!button) {
      return;
    }
    button.disabled = Boolean(busy);
    button.textContent = busy ? '…' : '⇣';
  }

  function sendTrackToQueue(button, normalizedUrl) {
    if (!normalizedUrl || !button) {
      return;
    }
    if (button.disabled) {
      return;
    }

    activeRequests += 1;
    setBusyState(button, true);

    chrome.runtime.sendMessage(
      {
        type: 'ENQUEUE_TIDAL_URL',
        url: normalizedUrl
      },
      (response) => {
        activeRequests = Math.max(0, activeRequests - 1);
        setBusyState(button, false);

        if (chrome.runtime.lastError) {
          showToast(`Extension error: ${chrome.runtime.lastError.message}`, 'error');
          return;
        }

        if (!response || response.ok !== true) {
          const message = response && response.error ? response.error : 'Unknown error';
          showToast(`Send failed: ${message}`, 'error');
          return;
        }

        const data = response.data || {};
        if (data.isPlaylist) {
          const count = Number(data.addedCount || 0);
          showToast(`Queued playlist (${count} tracks)`, 'success');
        } else {
          showToast('Queued', 'success');
        }
      }
    );
  }

  function handleInlineButtonClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest(`.${INLINE_BUTTON_CLASS}`);
    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendTrackToQueue(button, button.dataset.trackUrl);
  }

  function buildInlineButton(normalizedUrl, slotName) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = INLINE_BUTTON_CLASS;
    button.title = 'Send to Tidal Downloader queue';
    button.textContent = '⇣';
    button.dataset.trackUrl = normalizedUrl;
    button.dataset[INLINE_BUTTON_FLAG] = '1';
    if (slotName) {
      button.setAttribute('slot', slotName);
    }
    return button;
  }

  function updateInlineButton(button, normalizedUrl) {
    if (!button || !normalizedUrl) {
      return;
    }
    button.dataset.trackUrl = normalizedUrl;
    setBusyState(button, false);
  }

  function upsertButtonInNode(attachNode, normalizedUrl, slotName) {
    if (!attachNode || !normalizedUrl) {
      return;
    }

    const existing = attachNode.querySelector(`.${INLINE_BUTTON_CLASS}`);
    if (existing) {
      updateInlineButton(existing, normalizedUrl);
      return;
    }

    const button = buildInlineButton(normalizedUrl, slotName);
    attachNode.appendChild(button);
  }

  function upsertButtonForTarget(target, normalizedUrl) {
    if (!target || !normalizedUrl || !isVisible(target)) {
      return;
    }

    const attachTarget = getAttachTarget(target);
    const attachNode = attachTarget && attachTarget.node;
    if (!attachNode) {
      return;
    }

    upsertButtonInNode(attachNode, normalizedUrl, attachTarget.slot);
  }

  function upsertButtonsForTrackLinks() {
    const anchors = document.querySelectorAll(TRACK_LINK_SELECTOR);
    anchors.forEach((anchor) => {
      const normalizedUrl = normalizeTrackUrl(anchor.href);
      upsertButtonForTarget(anchor, normalizedUrl);
    });
  }

  function upsertButtonsForTrackRows() {
    const rowTriggers = document.querySelectorAll(
      '[data-test^="image-container-track-"], [data-test*="tracklist-id-"][data-test$="-context-menu-button"]'
    );

    rowTriggers.forEach((trigger) => {
      const trackId =
        extractTrackId(trigger.getAttribute('data-test')) ||
        extractTrackId(trigger.dataset.test);
      if (!trackId) {
        return;
      }

      const normalizedUrl = buildTrackUrlFromId(trackId);
      upsertButtonForTarget(trigger, normalizedUrl);
    });
  }

  function upsertButtonsForAmazonRows() {
    const rows = document.querySelectorAll('music-image-row[primary-href*="trackAsin="]');

    rows.forEach((row) => {
      const primaryHref = row.getAttribute('primary-href');
      const fallbackHref = row.querySelector('.content .col1 a[href*="trackAsin="]')?.getAttribute('href');
      const normalizedUrl = normalizeTrackUrl(primaryHref || fallbackHref);
      upsertButtonForTarget(row, normalizedUrl);
    });
  }

  function upsertButtonsForAmazonTrackItems() {
    if (!AMAZON_HOST_RE.test(window.location.hostname)) {
      return;
    }

    const items = document.querySelectorAll(
      'music-horizontal-item[primary-href], music-vertical-item[primary-href], music-image-row[primary-href], music-text-row[primary-href]'
    );

    items.forEach((item) => {
      const normalizedUrl = normalizeTrackUrl(readRowHref(item));
      if (normalizedUrl) {
        upsertButtonForTarget(item, normalizedUrl);
      }
    });
  }

  function readRowHref(row) {
    if (!row) {
      return null;
    }
    return (
      row.getAttribute('primary-href') ||
      row.getAttribute('secondary-href-2') ||
      row.primaryHref ||
      row.secondaryHref2 ||
      row.querySelector('.content .col1 a[href]')?.getAttribute('href') ||
      row.querySelector('.content .col3 a[href]')?.getAttribute('href') ||
      null
    );
  }

  function upsertButtonsForAmazonTextRows() {
    if (!AMAZON_HOST_RE.test(window.location.hostname)) {
      return;
    }

    const rows = document.querySelectorAll('music-text-row');
    if (!rows.length) {
      return;
    }

    const nowPlayingUrl = resolveAmazonNowPlayingUrl();
    const pageFallbackUrl = normalizeTrackUrl(window.location.href);

    rows.forEach((row) => {
      let normalizedUrl = normalizeTrackUrl(readRowHref(row));

      if (!normalizedUrl && (row.getAttribute('icon-name') || '').match(/^(pause|resume)$/i)) {
        normalizedUrl = nowPlayingUrl;
      }

      if (!normalizedUrl) {
        normalizedUrl = pageFallbackUrl;
      }

      upsertButtonForTarget(row, normalizedUrl);
    });
  }

  function resolveAmazonNowPlayingUrl() {
    if (!AMAZON_HOST_RE.test(window.location.hostname)) {
      return null;
    }

    const locationUrl = normalizeTrackUrl(window.location.href);
    if (locationUrl && AMAZON_TRACK_PATH_RE.test(new URL(locationUrl).pathname)) {
      return locationUrl;
    }

    const miniPlayer = document.querySelector('#miniNPVTrackInfo');
    if (!miniPlayer) {
      return null;
    }

    const directCandidates = [
      miniPlayer.getAttribute('primary-href'),
      miniPlayer.getAttribute('secondary-href-2'),
      miniPlayer.querySelector('a[href*="trackAsin="]')?.getAttribute('href')
    ];
    for (const candidate of directCandidates) {
      const normalized = normalizeTrackUrl(candidate);
      if (normalized && AMAZON_TRACK_PATH_RE.test(new URL(normalized).pathname)) {
        return normalized;
      }
    }

    const activeRowIcon = document.querySelector('music-image-row music-icon[name="equalizeron"]');
    if (activeRowIcon) {
      const activeRow = activeRowIcon.closest('music-image-row');
      const activeRowUrl = normalizeTrackUrl(
        activeRow?.getAttribute('primary-href') ||
        activeRow?.querySelector('.content .col1 a[href*="trackAsin="]')?.getAttribute('href')
      );
      if (activeRowUrl) {
        return activeRowUrl;
      }
    }

    const nowPlayingTitle = (miniPlayer.getAttribute('primary-text') || '').trim().toLowerCase();
    const nowPlayingArtist = (miniPlayer.getAttribute('secondary-text') || '').trim().toLowerCase();
    if (!nowPlayingTitle) {
      return null;
    }

    const rows = document.querySelectorAll('music-image-row[primary-href*="trackAsin="]');
    for (const row of rows) {
      const rowTitle = (row.getAttribute('primary-text') || '').trim().toLowerCase();
      if (!rowTitle || rowTitle !== nowPlayingTitle) {
        continue;
      }

      const rowArtist = (
        row.getAttribute('secondary-text-1') ||
        row.getAttribute('secondary-text') ||
        ''
      ).trim().toLowerCase();
      if (nowPlayingArtist && rowArtist && rowArtist !== nowPlayingArtist) {
        continue;
      }

      const normalized = normalizeTrackUrl(
        row.getAttribute('primary-href') ||
        row.querySelector('.content .col1 a[href*="trackAsin="]')?.getAttribute('href')
      );
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  function findAmazonNowPlayingControls(miniPlayer) {
    let searchRoot = miniPlayer && miniPlayer.parentElement;

    while (searchRoot && searchRoot !== document.body) {
      let playerBranch = miniPlayer;
      while (playerBranch.parentElement && playerBranch.parentElement !== searchRoot) {
        playerBranch = playerBranch.parentElement;
      }

      const siblings = [];
      for (let sibling = playerBranch.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
        siblings.push(sibling);
      }
      for (let sibling = playerBranch.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        siblings.push(sibling);
      }

      for (const sibling of siblings) {
        const favoriteButton = sibling.querySelector('music-button[icon-name="favorite"]');
        const contextButton = sibling.querySelector('music-button[icon-name="more"]');
        const favoriteContainer = favoriteButton && favoriteButton.parentElement;
        const contextContainer = contextButton && contextButton.parentElement;

        if (favoriteContainer && favoriteContainer === contextContainer) {
          return {
            group: favoriteContainer,
            contextContainer: contextButton
          };
        }

        if (favoriteContainer && contextContainer && favoriteContainer.parentElement === contextContainer.parentElement) {
          return {
            group: favoriteContainer.parentElement,
            contextContainer
          };
        }
      }

      searchRoot = searchRoot.parentElement;
    }

    return null;
  }

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

  function upsertButtonForAmazonNowPlaying() {
    const miniPlayer = document.querySelector('#miniNPVTrackInfo');
    if (!miniPlayer || !isVisible(miniPlayer)) {
      return;
    }

    const normalizedUrl = resolveAmazonNowPlayingUrl();
    if (!normalizedUrl) {
      return;
    }

    const controls = findAmazonNowPlayingControls(miniPlayer);
    if (!controls) {
      return;
    }

    upsertAmazonNowPlayingButton(controls, normalizedUrl);
  }

  function runOnce() {
    upsertButtonsForTrackLinks();
    upsertButtonsForTrackRows();
    upsertButtonsForAmazonTrackItems();
    upsertButtonsForAmazonRows();
    upsertButtonsForAmazonTextRows();
    upsertButtonForAmazonNowPlaying();
  }

  function scheduleRun() {
    if (scanScheduled) {
      return;
    }
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      runOnce();
    });
  }

  function watchDomChanges() {
    const observer = new MutationObserver((mutations) => {
      const shouldRun = mutations.some((mutation) => {
        if (mutation.type === 'attributes') {
          return true;
        }

        if (mutation.type !== 'childList') {
          return false;
        }

        const addedNodes = Array.from(mutation.addedNodes || []);
        return addedNodes.some((node) => {
          if (!(node instanceof Element)) {
            return false;
          }
          if (node.id === TOAST_ID || node.classList.contains(INLINE_BUTTON_CLASS)) {
            return false;
          }
          if (node.querySelector && node.querySelector(`#${TOAST_ID}, .${INLINE_BUTTON_CLASS}`)) {
            return false;
          }
          return true;
        });
      });

      if (shouldRun) {
        scheduleRun();
      }
    });
    observer.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['href', 'primary-href', 'secondary-href-2', 'primary-text', 'secondary-text']
    });
  }

  function bootstrap() {
    document.addEventListener('click', handleInlineButtonClick, true);
    runOnce();
    watchDomChanges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
}());
