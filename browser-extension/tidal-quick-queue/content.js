(function initTidalQuickQueueInlineButtons() {
  const TRACK_LINK_SELECTOR = 'a[href*="/track/"]';
  const INLINE_BUTTON_CLASS = 'tqq-inline-button';
  const INLINE_BUTTON_FLAG = 'tqqButtonBound';
  const TOAST_ID = 'tqq-toast';
  const VALID_PATH_RE = /^\/(?:browse\/)?(track|album|playlist|video)\//i;
  let activeRequests = 0;

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

  function findAttachNode(anchor) {
    const row = anchor.closest('[role="row"], article, li, div');
    if (row) {
      const actionButtons = row.querySelectorAll('button');
      if (actionButtons.length > 0) {
        const lastButton = actionButtons[actionButtons.length - 1];
        if (lastButton && lastButton.parentElement) {
          return lastButton.parentElement;
        }
      }
    }
    return anchor.parentElement || anchor;
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

  function buildInlineButton(normalizedUrl) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = INLINE_BUTTON_CLASS;
    button.title = 'Send to Tidal Downloader queue';
    button.textContent = '⇣';
    button.dataset.trackUrl = normalizedUrl;
    button.dataset[INLINE_BUTTON_FLAG] = '1';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      sendTrackToQueue(button, normalizedUrl);
    });
    return button;
  }

  function upsertButtonsForTrackLinks() {
    const anchors = document.querySelectorAll(TRACK_LINK_SELECTOR);
    anchors.forEach((anchor) => {
      if (!isVisible(anchor)) {
        return;
      }

      const normalizedUrl = normalizeTidalUrl(anchor.href);
      if (!normalizedUrl) {
        return;
      }

      const attachNode = findAttachNode(anchor);
      if (!attachNode) {
        return;
      }

      const existing = attachNode.querySelector(`${'.' + INLINE_BUTTON_CLASS}[data-track-url="${normalizedUrl}"]`);
      if (existing) {
        return;
      }

      const button = buildInlineButton(normalizedUrl);
      attachNode.appendChild(button);
    });
  }

  function runOnce() {
    upsertButtonsForTrackLinks();
  }

  function watchDomChanges() {
    const observer = new MutationObserver(() => {
      runOnce();
    });
    observer.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      attributes: true
    });
  }

  function bootstrap() {
    runOnce();
    watchDomChanges();
    setInterval(runOnce, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
}());
