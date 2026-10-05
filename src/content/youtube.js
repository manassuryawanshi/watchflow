/**
 * YouTube Focus - Content Script
 * Manages Window Fullscreen, Focus Mode, Intentional Hub, and SPA Navigation.
 */

// Immediate initialization logs required for connection verification
console.log('[YTF] YouTube content script initialized');
console.log('[YTF] URL:', location.href);

(function () {
  'use strict';

  const { ACTIONS, SELECTORS, CSS_CLASSES, DEFAULT_SETTINGS } = window.YTF_CONSTANTS || {
    ACTIONS: {
      PING: 'PING',
      GET_STATUS: 'GET_STATUS',
      TOGGLE_FULLSCREEN: 'TOGGLE_FULLSCREEN',
      TOGGLE_FOCUS: 'TOGGLE_FOCUS',
      ADD_TO_QUEUE: 'ADD_TO_QUEUE',
    },
    SELECTORS: {
      moviePlayer: '#movie_player',
      videoElement: 'video.html5-main-video',
      videoTitle: 'h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, ytd-watch-metadata h1',
      channelName: '#owner #channel-name a, ytd-channel-name a',
      rightControls: '.ytp-right-controls',
      sizeButton: '.ytp-size-button',
      fullscreenButton: '.ytp-fullscreen-button',
      homeBrowse: 'ytd-browse[page-subtype="home"]',
      homePrimary: 'ytd-browse[page-subtype="home"] #primary',
    },
    CSS_CLASSES: {
      WINDOW_FULLSCREEN_ACTIVE: 'yt-focus-window-fullscreen',
      FOCUS_MODE_ACTIVE: 'yt-focus-mode-active',
      HIDE_COMMENTS: 'yt-focus-hide-comments',
      PLAYER_BUTTON: 'yt-focus-player-btn',
      PLAYER_BUTTON_ACTIVE: 'yt-focus-player-btn-active',
      STATUS_PILL: 'yt-focus-status-pill',
      HOME_FOCUS_HUB: 'yt-focus-home-hub',
    },
    DEFAULT_SETTINGS: {
      focusModeEnabled: true,
      windowFullscreenEnabled: false,
      hideHomeFeed: true,
      hideShorts: true,
      hideRecommendations: true,
      hideComments: false,
      hideEndScreens: true,
      redirectShortsToWatch: true,
      showPlayerButton: true,
      showStatusIndicator: true,
      enableKeyboardShortcuts: true,
      debugMode: false,
    }
  };

  const storage = window.YTF_STORAGE;
  const logger = window.YTF_LOGGER || console;

  let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
  let isWindowFullscreen = false;
  let lastUrl = window.location.href;
  let homeHubInjected = false;

  // Icons for Window Fullscreen Player Button
  const ICON_EXPAND = `
    <svg viewBox="0 0 24 24" width="24" height="24">
      <path d="M4 4h6v2H6v4H4V4zm16 0h-6v2h4v4h2V4zM4 20h6v-2H6v-4H4v6zm16 0h-6v-2h4v-4h2v6z" fill="currentColor"/>
    </svg>`;

  const ICON_COMPRESS = `
    <svg viewBox="0 0 24 24" width="24" height="24">
      <path d="M9 9H4V7h3V4h2v5zm6 0h5V7h-3V4h-2v5zm-6 6H4v2h3v3h2v-5zm6 0h5v2h-3v3h-2v-5z" fill="currentColor"/>
    </svg>`;

  // =========================================================================
  // 1. SYNCHRONOUS MESSAGE LISTENER (Registered immediately at script start)
  // =========================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return false;

    console.log('[YTF] Content script received message:', message.action);

    // Handshake PING
    if (message.action === 'PING') {
      sendResponse({
        connected: true,
        youtube: true,
        url: location.href
      });
      return true;
    }

    // GET_STATUS
    if (message.action === 'GET_STATUS' || message.action === 'GET_PAGE_STATUS') {
      sendResponse({
        connected: true,
        youtube: true,
        url: location.href,
        isWatchPage: isWatchPage(),
        isWindowFullscreen: isWindowFullscreen,
        focusModeEnabled: currentSettings.focusModeEnabled,
        videoInfo: getCurrentVideoInfo()
      });
      return true;
    }

    // TOGGLE_FULLSCREEN
    if (message.action === 'TOGGLE_FULLSCREEN' || message.action === 'TOGGLE_WINDOW_FULLSCREEN') {
      toggleWindowFullscreen();
      sendResponse({
        success: true,
        isWindowFullscreen: isWindowFullscreen,
        isWatchPage: isWatchPage()
      });
      return true;
    }

    // TOGGLE_FOCUS
    if (message.action === 'TOGGLE_FOCUS' || message.action === 'TOGGLE_FOCUS_MODE') {
      const targetState = typeof message.enabled === 'boolean'
        ? message.enabled
        : !currentSettings.focusModeEnabled;
      currentSettings.focusModeEnabled = targetState;
      if (storage) {
        storage.saveSettings({ focusModeEnabled: targetState });
      }
      applyFocusMode(targetState);
      sendResponse({
        success: true,
        focusModeEnabled: targetState
      });
      return true;
    }

    // ADD_TO_QUEUE
    if (message.action === 'ADD_TO_QUEUE' || message.action === 'ADD_CURRENT_TO_QUEUE') {
      const videoInfo = getCurrentVideoInfo();
      if (videoInfo && storage) {
        storage.addVideoToQueue(videoInfo).then(res => {
          showToast('Added to Learning Queue', '📚');
          sendResponse({ success: true, item: res.item, queue: res.queue });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;
      } else {
        sendResponse({ success: !!videoInfo, videoInfo });
        return true;
      }
    }

    // ADD_PLAYLIST_TO_QUEUE
    if (message.action === 'ADD_PLAYLIST_TO_QUEUE') {
      const playlistInfo = getCurrentPlaylistInfo();
      if (playlistInfo && storage) {
        storage.addPlaylistToQueue(playlistInfo).then(res => {
          showToast(`Playlist added (${playlistInfo.videos.length} videos)`, '📑');
          sendResponse({ success: true, item: res.item, queue: res.queue });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;
      } else {
        sendResponse({ success: false, error: 'No active playlist found on this page' });
        return true;
      }
    }

    // GET_CURRENT_VIDEO_INFO
    if (message.action === 'GET_CURRENT_VIDEO_INFO') {
      sendResponse({
        success: true,
        videoInfo: getCurrentVideoInfo(),
        playlistInfo: getCurrentPlaylistInfo()
      });
      return true;
    }

    // CHECK_LIMITS
    if (message.action === 'CHECK_LIMITS') {
      checkLimitsAndSchedules().then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    // SETTINGS_CHANGED
    if (message.action === 'SETTINGS_CHANGED') {
      if (message.settings) {
        currentSettings = message.settings;
        applyFocusMode(currentSettings.focusModeEnabled);
        ensureCourseBanner();
        checkLimitsAndSchedules();
      }
      sendResponse({ success: true });
      return true;
    }

    return false;
  });

  // =========================================================================
  // 2. HELPER FUNCTIONS
  // =========================================================================

  function isWatchPage() {
    return window.location.pathname === '/watch';
  }

  function isHomePage() {
    return window.location.pathname === '/' && !window.location.search;
  }

  function isShortsPage() {
    return window.location.pathname.startsWith('/shorts/');
  }

  function isTypingContext(target) {
    const candidates = [];
    if (target instanceof Element) {
      candidates.push(target);
    } else if (target && target.parentElement instanceof Element) {
      candidates.push(target.parentElement);
    }
    if (document.activeElement instanceof Element && !candidates.includes(document.activeElement)) {
      candidates.push(document.activeElement);
    }

    if (candidates.length === 0) return false;

    for (const el of candidates) {
      if (el.isContentEditable) return true;
      if (typeof el.matches === 'function') {
        if (el.matches('input, textarea, select, [contenteditable="true"]')) return true;
      }
      if (typeof el.closest === 'function') {
        if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
      }
    }

    return false;
  }

  function formatDuration(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function getCurrentVideoInfo() {
    if (!isWatchPage()) return null;

    const titleEl = document.querySelector(SELECTORS.videoTitle);
    const channelEl = document.querySelector(SELECTORS.channelName);
    const videoEl = document.querySelector(SELECTORS.videoElement);

    const title = titleEl 
      ? titleEl.textContent.trim() 
      : (document.title ? document.title.replace(' - YouTube', '').trim() : 'YouTube Video');
    const channel = channelEl ? channelEl.textContent.trim() : 'YouTube';
    const durationSecs = videoEl && !isNaN(videoEl.duration) ? Math.round(videoEl.duration) : 0;
    const duration = formatDuration(durationSecs);
    const url = window.location.href;
    let id = '';
    try {
      const urlObj = new URL(url);
      id = urlObj.searchParams.get('v') || '';
    } catch (e) {
      // Fallback
    }

    return {
      id,
      videoId: id,
      title,
      channel,
      channelTitle: channel,
      duration,
      durationSeconds: durationSecs,
      url,
      sourceUrl: url,
      thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''
    };
  }

  function getCurrentPlaylistInfo() {
    try {
      const urlObj = new URL(window.location.href);
      const playlistId = urlObj.searchParams.get('list');
      if (!playlistId || playlistId === 'WL' || playlistId === 'LL') return null;

      let title = 'YouTube Playlist';
      const plTitleEl = document.querySelector('ytd-playlist-panel-renderer .title, ytd-playlist-header-renderer h1, #header-description h3, h1.ytd-playlist-header-renderer');
      if (plTitleEl && plTitleEl.textContent.trim()) {
        title = plTitleEl.textContent.trim();
      }

      let channelTitle = 'YouTube';
      const plChannelEl = document.querySelector('ytd-playlist-panel-renderer #publisher-container, ytd-playlist-header-renderer #owner-container a');
      if (plChannelEl && plChannelEl.textContent.trim()) {
        channelTitle = plChannelEl.textContent.trim();
      }

      const videos = [];
      const itemElements = document.querySelectorAll('ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer');

      itemElements.forEach((el, idx) => {
        const titleEl = el.querySelector('#video-title, #video-title-link, span#video-title');
        const linkEl = el.querySelector('a#wc-endpoint, a#thumbnail, a#video-title');
        const timeEl = el.querySelector('.ytd-thumbnail-overlay-time-status-renderer, span.badge-shape-wiz__text');

        let vId = '';
        if (linkEl && linkEl.href) {
          try {
            const parsed = new URL(linkEl.href, window.location.origin);
            vId = parsed.searchParams.get('v') || '';
          } catch(e) {}
        }

        const vTitle = titleEl ? titleEl.textContent.trim() : `Video ${idx + 1}`;
        const vDuration = timeEl ? timeEl.textContent.trim() : '';

        if (vId && !videos.some(v => v.videoId === vId)) {
          videos.push({
            videoId: vId,
            title: vTitle,
            duration: vDuration,
            thumbnail: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
            completed: false
          });
        }
      });

      return {
        playlistId,
        title,
        channelTitle,
        sourceUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
        videos,
        totalCount: videos.length
      };
    } catch(err) {
      console.warn('[YTF] Error extracting playlist info:', err);
      return null;
    }
  }

  function showToast(message, icon = '🎯', duration = 3500) {
    try {
      let container = document.getElementById(CSS_CLASSES.TOAST_CONTAINER);
      if (!container) {
        container = document.createElement('div');
        container.id = CSS_CLASSES.TOAST_CONTAINER;
        container.className = CSS_CLASSES.TOAST_CONTAINER;
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = CSS_CLASSES.TOAST;
      toast.innerHTML = `
        <span class="yt-focus-toast-icon">${icon}</span>
        <span class="yt-focus-toast-msg">${message}</span>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 250);
      }, duration);
    } catch (e) {
      console.log('[YTF Toast]', message);
    }
  }

  // =========================================================================
  // 3. WINDOW FULLSCREEN ENGINE
  // =========================================================================

  function enableWindowFullscreen() {
    if (!isWatchPage()) {
      logger.warn('Window Fullscreen can only be activated on a video watch page.');
      return;
    }

    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.add(CSS_CLASSES.WINDOW_FULLSCREEN_ACTIVE);
    }
    if (document.body && document.body.classList) {
      document.body.classList.add(CSS_CLASSES.WINDOW_FULLSCREEN_ACTIVE);
    }
    isWindowFullscreen = true;

    updatePlayerButtonState(true);
    if (typeof window.dispatchEvent === 'function' && typeof Event !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }
    console.log('[YTF] Window Fullscreen enabled');
  }

  function disableWindowFullscreen() {
    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.remove(CSS_CLASSES.WINDOW_FULLSCREEN_ACTIVE);
    }
    if (document.body && document.body.classList) {
      document.body.classList.remove(CSS_CLASSES.WINDOW_FULLSCREEN_ACTIVE);
    }
    isWindowFullscreen = false;

    updatePlayerButtonState(false);
    if (typeof window.dispatchEvent === 'function' && typeof Event !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }
    console.log('[YTF] Window Fullscreen disabled');
  }

  function toggleWindowFullscreen() {
    if (isWindowFullscreen) {
      disableWindowFullscreen();
    } else {
      enableWindowFullscreen();
    }
  }

  function ensurePlayerButtonInjected() {
    if (!currentSettings.showPlayerButton) return;
    if (!isWatchPage()) return;

    try {
      // Step A: Find the current live .ytp-right-controls container
      const rightControls = document.querySelector(SELECTORS.rightControls);
      if (!rightControls || !rightControls.isConnected) {
        return;
      }

      // Step B: Check whether .yt-focus-player-btn already exists inside that CURRENT live container
      const existingBtn = rightControls.querySelector(`.${CSS_CLASSES.PLAYER_BUTTON}`);
      if (existingBtn && existingBtn.isConnected) {
        // Step C: If it exists in current controls, sync active state and do nothing else
        updatePlayerButtonState(isWindowFullscreen);
        return;
      }

      // Clean up any stale or orphaned buttons in detached or obsolete elements
      const staleButtons = document.querySelectorAll(`.${CSS_CLASSES.PLAYER_BUTTON}`);
      for (const stale of staleButtons) {
        if (!rightControls.contains(stale)) {
          stale.remove();
        }
      }

      // Step D: Create the new button
      const btn = document.createElement('button');
      btn.className = `ytp-button ${CSS_CLASSES.PLAYER_BUTTON}${isWindowFullscreen ? ' ' + CSS_CLASSES.PLAYER_BUTTON_ACTIVE : ''}`;
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-label', isWindowFullscreen ? 'Exit Window Fullscreen (Esc or W)' : 'Window Fullscreen (W)');
      btn.setAttribute('title', isWindowFullscreen ? 'Exit Window Fullscreen (Esc or W)' : 'Window Fullscreen (W)');
      btn.innerHTML = isWindowFullscreen ? ICON_COMPRESS : ICON_EXPAND;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWindowFullscreen();
      });

      // Step E: Look for live reference elements whose parent is rightControls
      let referenceNode = null;
      const sizeBtn = rightControls.querySelector(SELECTORS.sizeButton);
      const fullscreenBtn = rightControls.querySelector(SELECTORS.fullscreenButton);

      if (sizeBtn && sizeBtn.isConnected) {
        if (sizeBtn.parentNode === rightControls) {
          referenceNode = sizeBtn;
        } else if (sizeBtn.parentElement && sizeBtn.parentElement.parentNode === rightControls) {
          referenceNode = sizeBtn.parentElement;
        }
      }

      if (!referenceNode && fullscreenBtn && fullscreenBtn.isConnected) {
        if (fullscreenBtn.parentNode === rightControls) {
          referenceNode = fullscreenBtn;
        } else if (fullscreenBtn.parentElement && fullscreenBtn.parentElement.parentNode === rightControls) {
          referenceNode = fullscreenBtn.parentElement;
        }
      }

      // Step F: Safe insertion with strict parentNode verification
      if (referenceNode && referenceNode.parentNode === rightControls && referenceNode.isConnected) {
        rightControls.insertBefore(btn, referenceNode);
      } else {
        rightControls.appendChild(btn);
      }

      console.log('[YTF] Window Fullscreen player button injected successfully');
    } catch (err) {
      console.warn('[YTF] Safe player button injection notice:', err);
    }
  }

  function updatePlayerButtonState(active) {
    try {
      const rightControls = document.querySelector(SELECTORS.rightControls);
      const btn = (rightControls && rightControls.isConnected)
        ? rightControls.querySelector(`.${CSS_CLASSES.PLAYER_BUTTON}`)
        : document.querySelector(`.${CSS_CLASSES.PLAYER_BUTTON}`);

      if (!btn || !btn.isConnected) return;

      if (active) {
        btn.classList.add(CSS_CLASSES.PLAYER_BUTTON_ACTIVE);
        btn.innerHTML = ICON_COMPRESS;
        btn.setAttribute('title', 'Exit Window Fullscreen (Esc or W)');
        btn.setAttribute('aria-label', 'Exit Window Fullscreen (Esc or W)');
      } else {
        btn.classList.remove(CSS_CLASSES.PLAYER_BUTTON_ACTIVE);
        btn.innerHTML = ICON_EXPAND;
        btn.setAttribute('title', 'Window Fullscreen (W)');
        btn.setAttribute('aria-label', 'Window Fullscreen (W)');
      }
    } catch (err) {
      // Safe no-op
    }
  }

  // =========================================================================
  // 4. FOCUS MODE ENGINE
  // =========================================================================

  function applyFocusMode(enabled) {
    // Apply to html element immediately (safe before body exists)
    if (document.documentElement && document.documentElement.classList) {
      if (enabled) {
        document.documentElement.classList.add(CSS_CLASSES.FOCUS_MODE_ACTIVE);
      } else {
        document.documentElement.classList.remove(CSS_CLASSES.FOCUS_MODE_ACTIVE);
      }
    }

    if (!document.body || !document.body.classList) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyFocusMode(enabled), { once: true });
      }
      return;
    }

    if (enabled) {
      document.body.classList.add(CSS_CLASSES.FOCUS_MODE_ACTIVE);

      if (currentSettings.hideComments) {
        document.body.classList.add(CSS_CLASSES.HIDE_COMMENTS);
      } else {
        document.body.classList.remove(CSS_CLASSES.HIDE_COMMENTS);
      }

      if (isHomePage() && currentSettings.hideHomeFeed) {
        ensureHomeFocusHub();
      }
    } else {
      document.body.classList.remove(CSS_CLASSES.FOCUS_MODE_ACTIVE);
      document.body.classList.remove(CSS_CLASSES.HIDE_COMMENTS);
      removeHomeFocusHub();
    }

    updateStatusPill();
  }

  function ensureHomeFocusHub() {
    if (!isHomePage() || !currentSettings.focusModeEnabled || !currentSettings.hideHomeFeed) {
      removeHomeFocusHub();
      return;
    }

    if (document.getElementById(CSS_CLASSES.HOME_FOCUS_HUB)) return;

    const homeBrowse = document.querySelector(SELECTORS.homeBrowse);
    const primary = document.querySelector(SELECTORS.homePrimary) || (homeBrowse && homeBrowse.querySelector('#primary'));

    if (!primary) {
      setTimeout(ensureHomeFocusHub, 300);
      return;
    }

    const hub = document.createElement('div');
    hub.id = CSS_CLASSES.HOME_FOCUS_HUB;
    hub.innerHTML = `
      <div class="yt-focus-hub-badge">
        <span style="font-size: 14px;">🎯</span> Focus Mode Active
      </div>
      <h1 class="yt-focus-hub-title">Watch Intentionally. Not Endlessly.</h1>
      <p class="yt-focus-hub-subtitle">
        What do you want to learn today? Search directly without algorithmic distractions.
      </p>
      <form class="yt-focus-hub-search-form" id="yt-focus-hub-form">
        <input 
          type="text" 
          class="yt-focus-hub-search-input" 
          placeholder="Search for tutorials, topics, or lectures..." 
          id="yt-focus-hub-search-input"
          autocomplete="off"
        />
        <button type="submit" class="yt-focus-hub-search-btn">Search</button>
      </form>
      <div class="yt-focus-hub-actions">
        <a href="/feed/subscriptions" class="yt-focus-hub-btn">
          <span>📺</span> Subscriptions
        </a>
        <a href="/feed/history" class="yt-focus-hub-btn">
          <span>⏱️</span> Watch History
        </a>
      </div>
      <div>
        <button type="button" class="yt-focus-hub-toggle-feed-btn" id="yt-focus-hub-temp-toggle">
          Temporarily reveal home feed
        </button>
      </div>
    `;

    const form = hub.querySelector('#yt-focus-hub-form');
    const input = hub.querySelector('#yt-focus-hub-search-input');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) {
        window.location.href = `/results?search_query=${encodeURIComponent(q)}`;
      }
    });

    const toggleBtn = hub.querySelector('#yt-focus-hub-temp-toggle');
    toggleBtn.addEventListener('click', () => {
      const isRevealed = document.body.classList.toggle('yt-focus-temp-feed-revealed');
      toggleBtn.textContent = isRevealed ? 'Hide home feed' : 'Temporarily reveal home feed';
    });

    primary.prepend(hub);
    homeHubInjected = true;
    console.log('[YTF] Home Focus Hub injected');
  }

  function removeHomeFocusHub() {
    const hub = document.getElementById(CSS_CLASSES.HOME_FOCUS_HUB);
    if (hub) {
      hub.remove();
      homeHubInjected = false;
    }
  }

  function injectStatusPill() {
    if (!document.body || document.getElementById(CSS_CLASSES.STATUS_PILL)) return;

    const pill = document.createElement('div');
    pill.id = CSS_CLASSES.STATUS_PILL;
    pill.setAttribute('title', 'Click to toggle Focus Mode');
    pill.innerHTML = `
      <div class="status-dot"></div>
      <span class="pill-text">FOCUS MODE Active</span>
    `;

    pill.addEventListener('click', async () => {
      const nextFocus = !currentSettings.focusModeEnabled;
      if (storage) {
        await storage.saveSettings({ focusModeEnabled: nextFocus });
      }
      applyFocusMode(nextFocus);
    });

    document.body.appendChild(pill);
    updateStatusPill();
  }

  function updateStatusPill() {
    const pill = document.getElementById(CSS_CLASSES.STATUS_PILL);
    if (!pill) return;

    const textEl = pill.querySelector('.pill-text');
    if (currentSettings.focusModeEnabled) {
      pill.classList.remove('paused');
      textEl.textContent = 'FOCUS MODE Active';
    } else {
      pill.classList.add('paused');
      textEl.textContent = 'Focus Mode Paused';
    }
  }

  // =========================================================================
  // 5. SPA NAVIGATION & SHORTCUTS
  // =========================================================================

  function handleUrlChange(newUrl) {
    lastUrl = newUrl;
    console.log('[YTF] URL changed:', newUrl);

    if (isShortsPage() && currentSettings.redirectShortsToWatch) {
      const shortId = window.location.pathname.replace('/shorts/', '').split('?')[0];
      if (shortId) {
        console.log(`[YTF] Redirecting Shorts (${shortId}) to regular watch page`);
        window.location.replace(`https://www.youtube.com/watch?v=${shortId}`);
        return;
      }
    }

    if (isWatchPage()) {
      homeHubInjected = false;
      ensurePlayerButtonInjected();
      initActiveSession();
      setTimeout(() => {
        ensureQuickAddButtons();
        ensureCourseBanner();
        checkLimitsAndSchedules();
      }, 500);
    } else {
      if (isWindowFullscreen) {
        disableWindowFullscreen();
      }
      flushActiveSession();
      removeCourseBanner();
      if (window.location.pathname === '/playlist') {
        setTimeout(ensureQuickAddButtons, 500);
      }
    }

    if (isHomePage() && currentSettings.focusModeEnabled && currentSettings.hideHomeFeed) {
      ensureHomeFocusHub();
    }
  }

  let injectionDebounceTimer = null;

  function scheduleButtonCheck() {
    if (!isWatchPage() || !currentSettings.showPlayerButton) return;
    if (injectionDebounceTimer) return;

    injectionDebounceTimer = requestAnimationFrame(() => {
      injectionDebounceTimer = null;
      const rightControls = document.querySelector(SELECTORS.rightControls);
      if (rightControls && rightControls.isConnected && !rightControls.querySelector(`.${CSS_CLASSES.PLAYER_BUTTON}`)) {
        ensurePlayerButtonInjected();
      }
    });
  }

  function setupNavigationListeners() {
    window.addEventListener('yt-navigate-finish', () => {
      handleUrlChange(window.location.href);
    });

    window.addEventListener('yt-page-data-updated', () => {
      if (isWatchPage()) {
        ensurePlayerButtonInjected();
        ensureQuickAddButtons();
        ensureCourseBanner();
      } else if (window.location.pathname === '/playlist') {
        ensureQuickAddButtons();
      }
      if (isHomePage() && currentSettings.focusModeEnabled) {
        ensureHomeFocusHub();
      }
    });

    // Handle player control recreation on resize and fullscreen changes
    window.addEventListener('resize', scheduleButtonCheck);
    document.addEventListener('fullscreenchange', scheduleButtonCheck);

    const bodyObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        handleUrlChange(window.location.href);
      } else if (isWatchPage()) {
        scheduleButtonCheck();
      }
    });
    bodyObserver.observe(document.documentElement, { subtree: true, childList: true });
  }

  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Escape: Exit window fullscreen
      if (e.key === 'Escape' && isWindowFullscreen) {
        const openPopup = document.querySelector('.ytp-popup[style*="display: block"]');
        if (!openPopup) {
          e.preventDefault();
          e.stopPropagation();
          disableWindowFullscreen();
          return;
        }
      }

      // W shortcut for Window Fullscreen (case-insensitive, shift-friendly, watch pages only)
      if (e.key && e.key.toLowerCase() === 'w') {
        // Prevent repeated toggling when W is held down
        if (e.repeat) return;

        // Ignore modifier combinations (Ctrl+W, Cmd+W, Alt+W, Option+W)
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Must not trigger while typing in inputs, textareas, contenteditable, search
        if (isTypingContext(e.target)) return;

        // Only activate on YouTube watch pages (/watch?v=...)
        if (!isWatchPage()) return;

        e.preventDefault();
        toggleWindowFullscreen();
        return;
      }

      // Alt+F: Toggle Focus Mode
      if (e.altKey && (e.key === 'f' || e.key === 'F') && !isTypingContext(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        const nextState = !currentSettings.focusModeEnabled;
        if (storage) {
          storage.saveSettings({ focusModeEnabled: nextState });
        }
        applyFocusMode(nextState);
        return;
      }
    }, true);
  }

  // =========================================================================
  // 6. QUICK ADD BUTTONS & COURSE / LEARNING MODE
  // =========================================================================

  async function ensureQuickAddButtons() {
    if (!storage) return;

    if (isWatchPage()) {
      const videoInfo = getCurrentVideoInfo();
      if (!videoInfo || !videoInfo.videoId) return;

      const actionsContainer = document.querySelector('#top-row #actions #top-level-buttons-computed, #top-row #actions-inner, #actions #top-level-buttons-computed, #actions.ytd-watch-metadata');
      if (!actionsContainer) return;

      // Video Quick Add Button
      let videoBtn = actionsContainer.querySelector(`.${CSS_CLASSES.QUICK_ADD_BTN}`);
      const isVideoQueued = await storage.isItemInQueue(videoInfo.videoId);

      if (!videoBtn) {
        videoBtn = document.createElement('button');
        videoBtn.className = `${CSS_CLASSES.QUICK_ADD_BTN}${isVideoQueued ? ' queued' : ''}`;
        videoBtn.type = 'button';
        videoBtn.innerHTML = isVideoQueued
          ? `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>In Queue</span>`
          : `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> <span>Queue</span>`;

        videoBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const currentQueued = await storage.isItemInQueue(videoInfo.videoId);
          if (currentQueued) {
            showToast('Already in Learning Queue', '✓');
          } else {
            await storage.addVideoToQueue(videoInfo);
            videoBtn.classList.add('queued');
            videoBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>In Queue</span>`;
            showToast('Added to Learning Queue', '📚');
          }
        });

        actionsContainer.appendChild(videoBtn);
      } else {
        videoBtn.classList.toggle('queued', isVideoQueued);
        videoBtn.innerHTML = isVideoQueued
          ? `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>In Queue</span>`
          : `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> <span>Queue</span>`;
      }

      // Playlist Quick Add Button (if watching inside a playlist)
      const playlistInfo = getCurrentPlaylistInfo();
      let plBtn = actionsContainer.querySelector(`.${CSS_CLASSES.QUICK_ADD_PLAYLIST_BTN}`);
      if (playlistInfo && playlistInfo.playlistId) {
        const isPlQueued = await storage.isItemInQueue(playlistInfo.playlistId);
        if (!plBtn) {
          plBtn = document.createElement('button');
          plBtn.className = `${CSS_CLASSES.QUICK_ADD_PLAYLIST_BTN}${isPlQueued ? ' queued' : ''}`;
          plBtn.type = 'button';
          plBtn.innerHTML = isPlQueued
            ? `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`
            : `<svg viewBox="0 0 24 24"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg> <span>+ Playlist</span>`;

          plBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const freshPl = getCurrentPlaylistInfo() || playlistInfo;
            await storage.addPlaylistToQueue(freshPl);
            plBtn.classList.add('queued');
            plBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`;
            showToast(`Playlist added (${freshPl.videos.length} videos)`, '📑');
          });

          actionsContainer.appendChild(plBtn);
        } else {
          plBtn.classList.toggle('queued', isPlQueued);
        }
      } else if (plBtn) {
        plBtn.remove();
      }
    } else if (window.location.pathname === '/playlist') {
      const playlistInfo = getCurrentPlaylistInfo();
      if (!playlistInfo || !playlistInfo.playlistId) return;

      const headerContainer = document.querySelector('ytd-playlist-header-renderer #action-buttons, ytd-playlist-header-renderer .immersive-header-content, ytd-playlist-header-renderer');
      if (!headerContainer || headerContainer.querySelector(`.${CSS_CLASSES.QUICK_ADD_PLAYLIST_BTN}`)) return;

      const isPlQueued = await storage.isItemInQueue(playlistInfo.playlistId);
      const btn = document.createElement('button');
      btn.className = `${CSS_CLASSES.QUICK_ADD_PLAYLIST_BTN}${isPlQueued ? ' queued' : ''}`;
      btn.type = 'button';
      btn.innerHTML = isPlQueued
        ? `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`
        : `<svg viewBox="0 0 24 24"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg> <span>Add Playlist to Queue</span>`;

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const freshPl = getCurrentPlaylistInfo() || playlistInfo;
        await storage.addPlaylistToQueue(freshPl);
        btn.classList.add('queued');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`;
        showToast(`Playlist added (${freshPl.videos.length} videos)`, '📑');
      });

      headerContainer.appendChild(btn);
    }
  }

  async function ensureCourseBanner() {
    if (!storage || !isWatchPage() || !currentSettings.courseModeEnabled) {
      removeCourseBanner();
      return;
    }

    const videoInfo = getCurrentVideoInfo();
    if (!videoInfo || !videoInfo.videoId) return;

    const queue = await storage.getLearningQueue();
    const matchedPlaylist = queue.find(q => q.type === 'playlist' && Array.isArray(q.videos) && q.videos.some(v => v.videoId === videoInfo.videoId));

    if (!matchedPlaylist) {
      removeCourseBanner();
      return;
    }

    const videoIndex = matchedPlaylist.videos.findIndex(v => v.videoId === videoInfo.videoId);
    const lessonNum = videoIndex >= 0 ? videoIndex + 1 : 1;
    const totalLessons = matchedPlaylist.videos.length;
    const completedCount = matchedPlaylist.videos.filter(v => v.completed).length;
    const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    let nextVideo = null;
    if (videoIndex >= 0 && videoIndex + 1 < totalLessons) {
      nextVideo = matchedPlaylist.videos[videoIndex + 1];
    } else {
      nextVideo = matchedPlaylist.videos.find(v => !v.completed && v.videoId !== videoInfo.videoId);
    }

    const targetContainer = document.querySelector('#primary-inner #below, #primary #below, ytd-watch-metadata');
    if (!targetContainer) return;

    let banner = document.querySelector(`.${CSS_CLASSES.COURSE_BANNER}`);
    if (!banner) {
      banner = document.createElement('div');
      banner.className = CSS_CLASSES.COURSE_BANNER;
      targetContainer.parentNode.insertBefore(banner, targetContainer);
    }

    banner.innerHTML = `
      <div class="yt-focus-course-info">
        <div class="yt-focus-course-title-row">
          <span class="yt-focus-course-badge">Course Mode</span>
          <span class="yt-focus-course-title">${matchedPlaylist.title}</span>
        </div>
        <div class="yt-focus-course-meta">
          <span>Lesson ${lessonNum} of ${totalLessons}</span>
          <div class="yt-focus-course-progress-bar">
            <div class="yt-focus-course-progress-fill" style="width: ${pct}%;"></div>
          </div>
          <span>${pct}% completed</span>
        </div>
      </div>
      ${nextVideo ? `
        <a href="https://www.youtube.com/watch?v=${nextVideo.videoId}&list=${matchedPlaylist.playlistId}" class="yt-focus-course-action-btn">
          <span>Next Lesson</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-8.29-1.42 1.42L16.86 11H5v2z"/></svg>
        </a>
      ` : ''}
    `;
  }

  function removeCourseBanner() {
    const existing = document.querySelector(`.${CSS_CLASSES.COURSE_BANNER}`);
    if (existing) existing.remove();
  }

  // =========================================================================
  // 7. WATCH TIME TRACKING, AUTO-COMPLETION & LIMITS ENFORCEMENT
  // =========================================================================

  let activeSession = null;
  let trackerInterval = null;
  let warnedToday75 = false;
  let warnedToday90 = false;
  let warnedToday100 = false;
  let cooldownTimerInterval = null;

  function initActiveSession() {
    if (!isWatchPage()) {
      flushActiveSession();
      return;
    }

    const videoInfo = getCurrentVideoInfo();
    if (!videoInfo || !videoInfo.videoId) return;

    if (activeSession && activeSession.videoId === videoInfo.videoId) return;

    flushActiveSession();

    activeSession = {
      videoId: videoInfo.videoId,
      videoTitle: videoInfo.title,
      channelTitle: videoInfo.channelTitle,
      playlistId: new URL(window.location.href).searchParams.get('list') || null,
      startTime: Date.now(),
      durationSeconds: 0,
      autoCompleted: false
    };
  }

  function flushActiveSession() {
    if (activeSession && activeSession.durationSeconds >= 5 && storage) {
      storage.recordWatchSession(activeSession);
    }
    activeSession = null;
  }

  function setupWatchTimeTracker() {
    if (trackerInterval) clearInterval(trackerInterval);

    trackerInterval = setInterval(async () => {
      const videoEl = document.querySelector(SELECTORS.videoElement);
      if (!videoEl || videoEl.paused || videoEl.ended || document.visibilityState !== 'visible') {
        return;
      }

      if (!activeSession) {
        initActiveSession();
      }

      if (activeSession) {
        activeSession.durationSeconds += 10;

        if (storage) {
          const isQueue = await storage.isItemInQueue(activeSession.videoId);
          await storage.recordWatchTime(10, isShortsPage(), isQueue, currentSettings.focusModeEnabled);

          // Auto-mark completed at 90% threshold
          if (videoEl.duration > 30 && (videoEl.currentTime / videoEl.duration >= (currentSettings.autoCompleteThreshold || 0.9)) && !activeSession.autoCompleted) {
            activeSession.autoCompleted = true;
            const res = await storage.autoCompleteVideo(activeSession.videoId);
            if (res && res.success) {
              showToast(`Marked as complete (90% watched)`, '🎉');
              ensureCourseBanner();
            }
          }
        }
      }

      await checkLimitsAndSchedules();
    }, 10000);

    window.addEventListener('beforeunload', flushActiveSession);
  }

  async function checkLimitsAndSchedules() {
    if (!storage) return;

    // 1. Check Cooldown
    const cooldown = await storage.getCooldownState();
    if (cooldown && cooldown.active) {
      renderCooldownOverlay(cooldown.remainingSeconds);
      return;
    } else {
      removeCooldownOverlay();
    }

    // 2. Check Schedule
    if (currentSettings.scheduleEnabled) {
      const activeSchedule = await storage.isScheduleActiveNow();
      if (activeSchedule) {
        if (activeSchedule.mode === 'block') {
          renderScheduleOverlay(activeSchedule);
          return;
        } else if (activeSchedule.mode === 'focus' && !currentSettings.focusModeEnabled) {
          applyFocusMode(true);
        }
      } else {
        removeScheduleOverlay();
      }
    } else {
      removeScheduleOverlay();
    }

    // 3. Check Daily Limits
    const { today } = await storage.getDailyStats();
    const todayMins = Math.round((today?.watchTimeSeconds || 0) / 60);
    const limitMins = currentSettings.dailyLimitMinutes || 60;

    if (todayMins >= limitMins) {
      if (currentSettings.limitMode === 'hard') {
        const cd = await storage.setCooldownState(true, currentSettings.cooldownMinutes || 10, 'limit');
        if (cd) renderCooldownOverlay(cd.remainingSeconds);
      } else if (!warnedToday100) {
        warnedToday100 = true;
        showToast(`Daily YouTube limit reached (${limitMins}m). Consider taking a break!`, '⏳', 6000);
      }
    } else if (todayMins >= limitMins * 0.9 && !warnedToday90) {
      warnedToday90 = true;
      const rem = Math.max(1, limitMins - todayMins);
      showToast(`${rem} minutes remaining before your daily limit.`, '⚠️', 5000);
    } else if (todayMins >= limitMins * 0.75 && !warnedToday75) {
      warnedToday75 = true;
      showToast(`You have used 75% of your daily YouTube limit (${todayMins}/${limitMins}m).`, '💡', 4000);
    }
  }

  function renderCooldownOverlay(remainingSeconds) {
    const videoEl = document.querySelector(SELECTORS.videoElement);
    if (videoEl && !videoEl.paused) videoEl.pause();

    let overlay = document.getElementById(CSS_CLASSES.COOLDOWN_OVERLAY);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = CSS_CLASSES.COOLDOWN_OVERLAY;
      overlay.className = CSS_CLASSES.COOLDOWN_OVERLAY;
      overlay.innerHTML = `
        <div class="yt-focus-overlay-card">
          <div class="yt-focus-overlay-icon">🧘</div>
          <h2 class="yt-focus-overlay-title">Time for a Mindful Break</h2>
          <p class="yt-focus-overlay-desc">You've reached your configured daily limit. Take a short pause before resuming.</p>
          <div class="yt-focus-cooldown-timer-box">
            <div class="yt-focus-cooldown-time" id="yt-focus-cd-timer">--:--</div>
            <div class="yt-focus-cooldown-label">Cooldown Remaining</div>
          </div>
          <div class="yt-focus-overlay-actions">
            <button type="button" class="yt-focus-btn-secondary" id="yt-focus-btn-dismiss-cd">Dismiss (Resume Watching)</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const dismissBtn = overlay.querySelector('#yt-focus-btn-dismiss-cd');
      dismissBtn.addEventListener('click', async () => {
        await storage.setCooldownState(false);
        removeCooldownOverlay();
      });
    }

    let secsLeft = remainingSeconds;
    const timerEl = overlay.querySelector('#yt-focus-cd-timer');

    function updateTimer() {
      if (secsLeft <= 0) {
        clearInterval(cooldownTimerInterval);
        removeCooldownOverlay();
        return;
      }
      const m = Math.floor(secsLeft / 60);
      const s = secsLeft % 60;
      if (timerEl) {
        timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
      }
      secsLeft--;
    }

    updateTimer();
    if (cooldownTimerInterval) clearInterval(cooldownTimerInterval);
    cooldownTimerInterval = setInterval(updateTimer, 1000);
  }

  function removeCooldownOverlay() {
    if (cooldownTimerInterval) clearInterval(cooldownTimerInterval);
    const overlay = document.getElementById(CSS_CLASSES.COOLDOWN_OVERLAY);
    if (overlay) overlay.remove();
  }

  function renderScheduleOverlay(schedule) {
    const videoEl = document.querySelector(SELECTORS.videoElement);
    if (videoEl && !videoEl.paused) videoEl.pause();

    let overlay = document.getElementById(CSS_CLASSES.SCHEDULE_OVERLAY);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = CSS_CLASSES.SCHEDULE_OVERLAY;
      overlay.className = CSS_CLASSES.SCHEDULE_OVERLAY;
      overlay.innerHTML = `
        <div class="yt-focus-overlay-card">
          <div class="yt-focus-overlay-icon">🔒</div>
          <h2 class="yt-focus-overlay-title">Scheduled Focus Period</h2>
          <p class="yt-focus-overlay-desc">YouTube viewing is paused during <strong>${schedule.name || 'Scheduled Hours'}</strong> (${schedule.startTime} – ${schedule.endTime}).</p>
          <div class="yt-focus-overlay-actions">
            <a href="${chrome.runtime.getURL('src/dashboard/dashboard.html')}" target="_blank" class="yt-focus-btn-secondary">Manage Schedules</a>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
  }

  function removeScheduleOverlay() {
    const overlay = document.getElementById(CSS_CLASSES.SCHEDULE_OVERLAY);
    if (overlay) overlay.remove();
  }

  // =========================================================================
  // 8. INITIALIZATION SEQUENCE
  // =========================================================================

  async function init() {
    try {
      if (storage) {
        currentSettings = await storage.getSettings();
      }

      applyFocusMode(currentSettings.focusModeEnabled);
      handleUrlChange(window.location.href);

      if (currentSettings.showStatusIndicator) {
        injectStatusPill();
      }

      setupNavigationListeners();
      setupKeyboardShortcuts();
      setupWatchTimeTracker();
      checkLimitsAndSchedules();

      if (storage && storage.onSettingsChanged) {
        storage.onSettingsChanged((newSettings) => {
          currentSettings = newSettings;
          applyFocusMode(currentSettings.focusModeEnabled);
          updateStatusPill();
          ensureCourseBanner();
          checkLimitsAndSchedules();
        });
      }
    } catch (err) {
      console.error('[YTF] Content script init error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
