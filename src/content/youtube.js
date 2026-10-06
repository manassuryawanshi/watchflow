/**
 * WatchFlow - Content Script
 * Manages Window Fullscreen, Focus Mode, Intentional Hub, and SPA Navigation.
 */

// Immediate initialization logs required for connection verification
console.log('[WatchFlow] YouTube content script initialized');
console.log('[WatchFlow] URL:', location.href);

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
      blockShorts: true,
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
  let cachedQueue = [];
  let isCurrentVideoAllowed = true;

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

    console.log('[WatchFlow] Content script received message:', message.action);

    // Handshake PING
    if (message.action === 'PING') {
      sendResponse({
        connected: true,
        youtube: true,
        url: location.href,
        extensionEnabled: currentSettings.extensionEnabled !== false
      });
      return true;
    }

    // GET_STATUS
    if (message.action === 'GET_STATUS' || message.action === 'GET_PAGE_STATUS') {
      sendResponse({
        connected: true,
        youtube: true,
        url: location.href,
        extensionEnabled: currentSettings.extensionEnabled !== false,
        isWatchPage: isWatchPage(),
        isWindowFullscreen: isWindowFullscreen,
        focusModeEnabled: currentSettings.focusModeEnabled,
        isCurrentVideoAllowed: isCurrentVideoAllowed,
        videoInfo: getCurrentVideoInfo(),
        playlistInfo: getCurrentPlaylistInfo(),
        playlistContext: getCurrentPlaylistContext()
      });
      return true;
    }

    // TOGGLE_EXTENSION
    if (message.action === 'TOGGLE_EXTENSION' || message.action === (ACTIONS && ACTIONS.TOGGLE_EXTENSION)) {
      const targetState = typeof message.enabled === 'boolean'
        ? message.enabled
        : (currentSettings.extensionEnabled === false ? true : false);
      currentSettings.extensionEnabled = targetState;
      if (storage) {
        storage.saveSettings({ extensionEnabled: targetState });
      }
      applyExtensionEnabledState(targetState);
      sendResponse({
        success: true,
        extensionEnabled: targetState
      });
      return true;
    }

    // GET_PLAYLIST_CONTEXT
    if (message.action === 'GET_PLAYLIST_CONTEXT' || message.action === (ACTIONS && ACTIONS.GET_PLAYLIST_CONTEXT)) {
      sendResponse(getCurrentPlaylistContext());
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
    if (window.location.pathname !== '/' && window.location.pathname !== '/browse') {
      return false;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has('v') || params.has('search_query')) {
      return false;
    }
    return true;
  }

  function isShortsPage() {
    return window.location.pathname.startsWith('/shorts/');
  }

  function isSearchPage() {
    return window.location.pathname === '/results' || window.location.pathname === '/search';
  }

  function isChannelPage() {
    return window.location.pathname.startsWith('/@') || window.location.pathname.startsWith('/channel') || window.location.pathname.startsWith('/c/');
  }

  function pausePlayerImmediately() {
    try {
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach(v => {
        try {
          if (!v.paused) v.pause();
          v.currentTime = 0;
        } catch (e) {}
      });
      const moviePlayer = document.querySelector(SELECTORS.moviePlayer);
      if (moviePlayer && typeof moviePlayer.pauseVideo === 'function') {
        try { moviePlayer.pauseVideo(); } catch (e) {}
      }
    } catch (e) {}
  }

  function disableYouTubeAutonav() {
    try {
      const autonavToggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
      if (autonavToggle) {
        autonavToggle.click();
      }
    } catch (e) {}
  }

  function openDashboardSection(section = 'overview') {
    const targetSection = (section === 'learning' || section === 'learning-queue') ? 'learning-queue' : section;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD', section: targetSection }).then(res => {
          if (!res || !res.success) {
            fallbackOpen();
          }
        }).catch(() => {
          fallbackOpen();
        });
        return;
      }
    } catch (e) {}
    fallbackOpen();

    function fallbackOpen() {
      try {
        const url = chrome.runtime.getURL(`src/dashboard/dashboard.html?section=${targetSection}`);
        window.open(url, '_blank');
      } catch (err) {
        console.error('[WatchFlow] Failed to open dashboard section:', err);
      }
    }
  }

  function openLearningQueue() {
    openDashboardSection('learning-queue');
  }

  function openAnalytics() {
    openDashboardSection('analytics');
  }

  function openSettings() {
    openDashboardSection('limits');
  }

  async function handleContinueLearning() {
    if (storage) {
      const item = await storage.getContinueLearningItem();
      if (item && item.url) {
        window.location.href = item.url;
        return;
      }
    }
    openLearningQueue();
  }

  async function refreshQueueCache() {
    if (storage) {
      try {
        cachedQueue = await storage.getLearningQueue();
      } catch (e) {
        console.warn('[WatchFlow] Error refreshing queue cache:', e);
      }
    }
  }

  function isVideoAllowedInFocusModeSync(videoId, context = {}) {
    if (!videoId) return false;
    if (isShortsPage() || context.isShort || (window.location.pathname && window.location.pathname.startsWith('/shorts'))) {
      return false;
    }

    // 1. Check individual videos
    const inIndividual = cachedQueue.some(item =>
      item.type === 'video' && (item.videoId === videoId || item.id === videoId)
    );
    if (inIndividual) return true;

    // 2. Check playlist lessons
    const inPlaylistLessons = cachedQueue.some(item =>
      item.type === 'playlist' && Array.isArray(item.videos) && item.videos.some(v => v.videoId === videoId)
    );
    if (inPlaylistLessons) return true;

    // 3. Check playlist context
    const playlistId = context.playlistId || (getCurrentPlaylistContext && getCurrentPlaylistContext().playlistId);
    if (playlistId) {
      const isApprovedPl = cachedQueue.some(item =>
        item.type === 'playlist' && (item.playlistId === playlistId || item.id === playlistId || item.id === 'pl_' + playlistId)
      );
      if (isApprovedPl) return true;
    }

    return false;
  }

  async function isVideoAllowedInFocusMode(videoId, context = {}) {
    if (!videoId) return false;
    if (isShortsPage() || context.isShort || (window.location.pathname && window.location.pathname.startsWith('/shorts'))) {
      return false;
    }

    if (isVideoAllowedInFocusModeSync(videoId, context)) {
      return true;
    }

    await refreshQueueCache();
    return isVideoAllowedInFocusModeSync(videoId, context);
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

  function formatTime12(timeStr) {
    if (window.YTF_CONSTANTS && typeof window.YTF_CONSTANTS.formatTime12 === 'function') {
      return window.YTF_CONSTANTS.formatTime12(timeStr);
    }
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return timeStr;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minsFormatted = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${minsFormatted} ${ampm}`;
  }

  function getCurrentPlaylistContext() {
    try {
      const urlObj = new URL(window.location.href);
      const playlistId = urlObj.searchParams.get('list');
      if (!playlistId || playlistId === 'WL' || playlistId === 'LL') {
        return { isInPlaylist: false };
      }

      const currentVideoId = urlObj.searchParams.get('v') || '';
      let currentIndex = null;
      const indexParam = urlObj.searchParams.get('index');
      if (indexParam) {
        currentIndex = parseInt(indexParam, 10) || null;
      }

      let playlistTitle = '';
      const plTitleEl = document.querySelector(
        'ytd-playlist-panel-renderer .title, ytd-playlist-panel-renderer #header-description h3, ytd-playlist-header-renderer h1, #header-description h3, h1.ytd-playlist-header-renderer'
      );
      if (plTitleEl && plTitleEl.textContent.trim()) {
        playlistTitle = plTitleEl.textContent.trim();
      }

      let totalCount = null;
      const indexMsgEl = document.querySelector('ytd-playlist-panel-renderer .index-message, ytd-playlist-panel-renderer #publisher-container');
      if (indexMsgEl && indexMsgEl.textContent) {
        const match = indexMsgEl.textContent.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i);
        if (match) {
          if (!currentIndex) currentIndex = parseInt(match[1], 10);
          totalCount = parseInt(match[2], 10);
        }
      }

      const itemElements = document.querySelectorAll('ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer');
      if (itemElements && itemElements.length > 0) {
        if (!totalCount) totalCount = itemElements.length;
        if (!currentIndex) {
          const selectedItem = document.querySelector('ytd-playlist-panel-video-renderer[selected]');
          if (selectedItem) {
            const idx = Array.from(itemElements).indexOf(selectedItem);
            if (idx !== -1) currentIndex = idx + 1;
          }
        }
      }

      return {
        isInPlaylist: true,
        playlistId,
        playlistTitle: playlistTitle || 'YouTube Playlist',
        currentVideoId,
        currentIndex,
        totalCount
      };
    } catch (err) {
      console.warn('[WatchFlow] Error extracting playlist context:', err);
      return { isInPlaylist: false };
    }
  }

  function getCurrentPlaylistInfo() {
    const ctx = getCurrentPlaylistContext();
    if (!ctx || !ctx.isInPlaylist) return null;

    try {
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
        type: 'playlist',
        playlistId: ctx.playlistId,
        title: ctx.playlistTitle,
        thumbnail: (videos[0] && videos[0].thumbnail) || (ctx.currentVideoId ? `https://i.ytimg.com/vi/${ctx.currentVideoId}/hqdefault.jpg` : ''),
        channelTitle,
        sourceUrl: `https://www.youtube.com/playlist?list=${ctx.playlistId}`,
        videos,
        currentIndex: ctx.currentIndex || 0,
        completedCount: 0,
        totalCount: ctx.totalCount || videos.length
      };
    } catch(err) {
      console.warn('[WatchFlow] Error extracting playlist info:', err);
      return null;
    }
  }

  function applyExtensionEnabledState(enabled) {
    if (!enabled) {
      disableWindowFullscreen();
      applyFocusMode(false);
      removeHomeFocusHub();
      removeShortsBlock();
      removeVideoBlockOverlay();
      removeSearchBlockOverlay();
      removeCooldownOverlay();
      removeScheduleOverlay();
      removeCourseBanner();
      removePlayerButton();
      removeStatusPill();
      removeQuickAddButtons();
      flushActiveSession();
    } else {
      applyFocusMode(currentSettings.focusModeEnabled);
      if (currentSettings.showStatusIndicator) {
        injectStatusPill();
      }
      handleUrlChange(window.location.href);
    }
  }

  function removePlayerButton() {
    document.querySelectorAll(`.${CSS_CLASSES.PLAYER_BUTTON}`).forEach(el => el.remove());
  }

  function removeStatusPill() {
    const pill = document.getElementById(CSS_CLASSES.STATUS_PILL);
    if (pill) pill.remove();
  }

  function removeQuickAddButtons() {
    document.querySelectorAll(`.${CSS_CLASSES.QUICK_ADD_BTN}, .${CSS_CLASSES.QUICK_ADD_PLAYLIST_BTN}`).forEach(el => el.remove());
  }

  function showToast(message, icon = '✓', duration = 3500) {
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
    console.log('[WatchFlow] Window Fullscreen enabled');
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
    console.log('[WatchFlow] Window Fullscreen disabled');
  }

  function toggleWindowFullscreen() {
    if (isWindowFullscreen) {
      disableWindowFullscreen();
    } else {
      enableWindowFullscreen();
    }
  }

  function ensurePlayerButtonInjected() {
    if (currentSettings.extensionEnabled === false) return;
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

      console.log('[WatchFlow] Window Fullscreen player button injected successfully');
    } catch (err) {
      console.warn('[WatchFlow] Safe player button injection notice:', err);
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
    } else {
      document.body.classList.remove(CSS_CLASSES.FOCUS_MODE_ACTIVE);
      document.body.classList.remove(CSS_CLASSES.HIDE_COMMENTS);
      removeHomeFocusHub();
      removeShortsBlock();
      removeVideoBlockOverlay();
      removeSearchBlockOverlay();
    }

    updateStatusPill();
    handleFocusModeNavigation(window.location.href);
  }

  let isMountingFocusHome = false;
  let homeHubUpdateTimer = null;

  function removeHomeFocusHub() {
    isMountingFocusHome = false;
    if (homeHubUpdateTimer) {
      clearTimeout(homeHubUpdateTimer);
      homeHubUpdateTimer = null;
    }
    const allHubs = document.querySelectorAll('#' + CSS_CLASSES.HOME_FOCUS_HUB);
    allHubs.forEach(hub => hub.remove());
    homeHubInjected = false;
  }

  function resolveHomeParent() {
    return document.querySelector('ytd-browse[page-subtype="home"] #primary') ||
           document.querySelector('ytd-browse #primary') ||
           document.querySelector('#primary') ||
           document.querySelector('ytd-browse[page-subtype="home"]') ||
           document.querySelector('ytd-browse');
  }

  async function fetchFocusHomeData() {
    let settings = currentSettings;
    let queue = cachedQueue || [];
    let continueItem = null;
    let dailyStats = null;
    let analytics7d = null;

    if (storage) {
      try {
        const [loadedSettings, loadedQueue, loadedCont, loadedDaily, loadedAnalytics] = await Promise.all([
          storage.getSettings(),
          storage.getLearningQueue(),
          storage.getContinueLearningItem(),
          storage.getDailyStats(),
          storage.getWatchAnalytics('7d')
        ]);
        settings = loadedSettings || settings;
        queue = loadedQueue || queue;
        cachedQueue = queue;
        continueItem = loadedCont;
        dailyStats = loadedDaily;
        analytics7d = loadedAnalytics;
      } catch (err) {
        console.warn('[WatchFlow] Error loading Today hub data:', err);
      }
    }

    // 1. Today's Learning Time & Goal
    const todayData = (dailyStats && dailyStats.today) || {};
    const todayWatchSecs = todayData.learningTimeSeconds || todayData.focusTimeSeconds || todayData.watchTimeSeconds || 0;
    const todayMins = Math.round(todayWatchSecs / 60);
    const dailyGoalMins = settings.dailyLimitMinutes || 0;
    const goalPct = dailyGoalMins > 0 ? Math.min(100, Math.round((todayMins / dailyGoalMins) * 100)) : 0;
    const remainingMins = dailyGoalMins > 0 ? Math.max(0, dailyGoalMins - todayMins) : 0;

    // 2. Queue Summary & Next Up
    const isQueueEmpty = !queue || queue.length === 0;
    let totalLessons = 0;
    let completedLessons = 0;
    let playlistsCount = 0;
    const upcomingLessons = [];

    if (!isQueueEmpty) {
      for (const item of queue) {
        if (item.type === 'video') {
          totalLessons++;
          if (item.completed) completedLessons++;
          else if (upcomingLessons.length < 3) {
            upcomingLessons.push({
              title: item.title,
              url: item.sourceUrl || `https://www.youtube.com/watch?v=${item.videoId}`
            });
          }
        } else if (item.type === 'playlist') {
          playlistsCount++;
          const vids = Array.isArray(item.videos) ? item.videos : [];
          const count = item.totalCount || vids.length;
          totalLessons += count;
          completedLessons += (item.completedCount || 0);

          if (upcomingLessons.length < 3 && vids.length > 0) {
            for (const v of vids) {
              if (!v.completed && upcomingLessons.length < 3) {
                upcomingLessons.push({
                  title: `${item.title ? item.title + ': ' : ''}${v.title}`,
                  url: `https://www.youtube.com/watch?v=${v.videoId}&list=${item.playlistId}`
                });
              }
            }
          }
        }
      }
    }

    const remainingLessons = Math.max(0, totalLessons - completedLessons);
    const isQueueAllCompleted = !isQueueEmpty && remainingLessons === 0 && !continueItem;

    // 3. Quick Stats (Week & Focus %)
    const weekSecs = (analytics7d && analytics7d.totalWatchTimeSeconds) || todayWatchSecs;
    const weekMins = Math.round(weekSecs / 60);
    const weekHours = Math.floor(weekMins / 60);
    const weekRemMins = weekMins % 60;
    const weekFormatted = weekHours > 0 ? `${weekHours}h ${weekRemMins}m` : `${weekMins}m`;
    const focusPct = analytics7d && typeof analytics7d.focusPct === 'number' ? analytics7d.focusPct : (todayWatchSecs > 0 ? 100 : 0);
    const hasHistory = weekSecs > 0 || todayWatchSecs > 0;

    return {
      todayMins,
      dailyGoalMins,
      goalPct,
      remainingMins,
      continueItem,
      isQueueEmpty,
      isQueueAllCompleted,
      totalLessons,
      completedLessons,
      remainingLessons,
      playlistsCount,
      upcomingLessons,
      weekFormatted,
      focusPct,
      hasHistory
    };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderTodayHubContent(hub, data) {
    const wordmarkUrl = chrome.runtime.getURL('src/assets/watchflow-wordmark.png');

    // Handle Empty Queue State
    if (data.isQueueEmpty) {
      hub.className = 'yt-focus-today-hub empty-state';
      hub.innerHTML = `
        <header class="yt-focus-today-header">
          <div class="yt-focus-today-brand-col">
            <div class="yt-focus-today-brand">
              <img src="${wordmarkUrl}" alt="WatchFlow" class="yt-focus-today-wordmark yt-focus-hub-logo-img">
              <span class="yt-focus-hub-title" style="display:none;">WATCHFLOW</span>
            </div>
            <div class="yt-focus-today-sub">Your learning, at a glance.</div>
          </div>
          <div class="yt-focus-today-badge">
            <span class="yt-focus-hub-dot"></span>
            <span class="yt-focus-hub-subheading">FOCUS MODE ACTIVE</span>
          </div>
        </header>

        <div class="yt-focus-today-empty-card">
          <div class="yt-focus-empty-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
            </svg>
          </div>
          <h2 class="yt-focus-empty-title">YOUR LEARNING QUEUE IS EMPTY</h2>
          <p class="yt-focus-empty-subtitle">Add videos or playlists to start building your learning path.</p>
          <div class="yt-focus-empty-actions">
            <button type="button" class="yt-focus-btn-primary" id="yt-focus-hub-btn-queue">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              <span>Open Learning Queue →</span>
            </button>
          </div>
        </div>
      `;
      const qBtn = hub.querySelector('#yt-focus-hub-btn-queue');
      if (qBtn) qBtn.addEventListener('click', openLearningQueue);
      return;
    }

    // Handle All Completed Queue State
    if (data.isQueueAllCompleted) {
      hub.className = 'yt-focus-today-hub completed-state';
      hub.innerHTML = `
        <header class="yt-focus-today-header">
          <div class="yt-focus-today-brand-col">
            <div class="yt-focus-today-brand">
              <img src="${wordmarkUrl}" alt="WatchFlow" class="yt-focus-today-wordmark yt-focus-hub-logo-img">
              <span class="yt-focus-hub-title" style="display:none;">WATCHFLOW</span>
            </div>
            <div class="yt-focus-today-sub">Your learning, at a glance.</div>
          </div>
          <div class="yt-focus-today-badge">
            <span class="yt-focus-hub-dot"></span>
            <span class="yt-focus-hub-subheading">FOCUS MODE ACTIVE</span>
          </div>
        </header>

        <div class="yt-focus-today-empty-card">
          <div class="yt-focus-empty-icon success">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <h2 class="yt-focus-empty-title">YOU'RE ALL CAUGHT UP</h2>
          <p class="yt-focus-empty-subtitle">Your Learning Queue is complete.</p>
          <div class="yt-focus-empty-actions">
            <button type="button" class="yt-focus-btn-primary" id="yt-focus-hub-btn-queue">
              <span>Review Learning Queue →</span>
            </button>
          </div>
        </div>
      `;
      const qBtn = hub.querySelector('#yt-focus-hub-btn-queue');
      if (qBtn) qBtn.addEventListener('click', openLearningQueue);
      return;
    }

    // Standard "WatchFlow Today" Interface
    hub.className = 'yt-focus-today-hub';

    // 1. Goal Progress markup
    let progressSectionHtml = '';
    if (data.dailyGoalMins > 0) {
      progressSectionHtml = `
        <div class="yt-focus-today-section yt-focus-today-progress-card">
          <div class="yt-focus-card-header">
            <span class="yt-focus-section-label">TODAY</span>
            <span class="yt-focus-goal-meta">${data.goalPct}% completed</span>
          </div>
          <div class="yt-focus-stat-headline">
            <span class="yt-focus-stat-val">${data.todayMins} min</span>
            <span class="yt-focus-stat-desc">Learning Time</span>
          </div>
          <div class="yt-focus-progress-bar-bg">
            <div class="yt-focus-progress-bar-fill" style="width: ${data.goalPct}%;"></div>
          </div>
          <div class="yt-focus-progress-footer">
            <span>${data.todayMins} / ${data.dailyGoalMins} min</span>
            <span>${data.remainingMins > 0 ? data.remainingMins + ' min remaining' : 'Daily goal achieved! 🎉'}</span>
          </div>
        </div>
      `;
    } else {
      progressSectionHtml = `
        <div class="yt-focus-today-section yt-focus-today-progress-card">
          <div class="yt-focus-card-header">
            <span class="yt-focus-section-label">TODAY</span>
          </div>
          <div class="yt-focus-stat-headline">
            <span class="yt-focus-stat-val">${data.todayMins} min</span>
            <span class="yt-focus-stat-desc">Learning Time</span>
          </div>
          <div class="yt-focus-no-goal-banner">
            <span>No daily goal set</span>
            <button type="button" class="yt-focus-text-link" id="yt-focus-link-set-goal">Set a daily learning goal →</button>
          </div>
        </div>
      `;
    }

    // 2. Continue Learning markup
    let continueSectionHtml = '';
    const cont = data.continueItem;
    if (cont) {
      const thumbUrl = cont.thumbnail || (cont.videoId ? `https://i.ytimg.com/vi/${cont.videoId}/hqdefault.jpg` : '');
      const rawContTitle = cont.lessonTitle || cont.title || 'Untitled Lesson';
      const safeContTitle = escapeHtml(rawContTitle);
      const displayTitle = safeContTitle;
      const lessonMeta = escapeHtml(cont.playlistTitle 
        ? `${cont.playlistTitle} • Lesson ${cont.lessonNumber || 1} of ${cont.totalLessons || '?'}`
        : (cont.channel || 'Video'));
      const progressText = escapeHtml(cont.progress || (cont.progressPct ? cont.progressPct + '%' : '0%'));
      const progressPctVal = cont.progressPct || 0;

      continueSectionHtml = `
        <div class="yt-focus-today-section yt-focus-continue-card">
          <div class="yt-focus-card-header">
            <span class="yt-focus-section-label">CONTINUE LEARNING</span>
            <span class="yt-focus-continue-badge">${progressText} complete</span>
          </div>
          <div class="yt-focus-continue-body">
            <div class="yt-focus-continue-thumb-wrap">
              ${thumbUrl ? `<img src="${thumbUrl}" alt="Thumbnail" class="yt-focus-continue-thumb">` : `<div class="yt-focus-thumb-placeholder">▶</div>`}
              ${cont.duration ? `<span class="yt-focus-thumb-duration">${cont.duration}</span>` : ''}
            </div>
            <div class="yt-focus-continue-info">
              <h3 class="yt-focus-continue-title" title="${safeContTitle}">${displayTitle}</h3>
              <div class="yt-focus-continue-context">${lessonMeta}</div>
              <div class="yt-focus-continue-progress-row">
                <div class="yt-focus-progress-bar-bg mini">
                  <div class="yt-focus-progress-bar-fill" style="width: ${progressPctVal}%;"></div>
                </div>
              </div>
            </div>
            <div class="yt-focus-continue-action">
              <button type="button" class="yt-focus-btn-primary yt-focus-btn-continue" id="yt-focus-hub-btn-continue">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span>Continue Learning →</span>
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      continueSectionHtml = `
        <div class="yt-focus-today-section yt-focus-continue-card">
          <div class="yt-focus-card-header">
            <span class="yt-focus-section-label">CONTINUE LEARNING</span>
          </div>
          <div class="yt-focus-continue-body">
            <div class="yt-focus-continue-info">
              <h3 class="yt-focus-continue-title">Resume your queue</h3>
              <div class="yt-focus-continue-context">Open your Learning Queue to pick a lesson.</div>
            </div>
            <div class="yt-focus-continue-action">
              <button type="button" class="yt-focus-btn-primary yt-focus-btn-continue" id="yt-focus-hub-btn-continue">
                <span>Open Queue →</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // 3. Learning Queue Compact Summary
    let queueNextUpHtml = '';
    if (data.upcomingLessons.length > 0) {
      queueNextUpHtml = `
        <div class="yt-focus-queue-next-list">
          <div class="yt-focus-next-label">Next up</div>
          ${data.upcomingLessons.map((item, idx) => {
            const rawTitle = item.title || 'Untitled Lesson';
            const safeTitle = escapeHtml(rawTitle);
            const numStr = String(idx + 1).padStart(2, '0');
            return `
            <div class="yt-focus-next-item">
              <span class="yt-focus-next-num">${numStr}</span>
              <span class="yt-focus-next-title" title="${safeTitle}">${safeTitle}</span>
            </div>
          `;
          }).join('')}
        </div>
      `;
    }

    const queueSectionHtml = `
      <div class="yt-focus-today-section yt-focus-summary-card">
        <div class="yt-focus-card-header">
          <span class="yt-focus-section-label">LEARNING QUEUE</span>
        </div>
        <div class="yt-focus-summary-metrics">
          <div class="yt-focus-pill-stat"><strong>${data.totalLessons}</strong> lessons</div>
          <div class="yt-focus-pill-stat"><strong>${data.playlistsCount}</strong> playlists</div>
          <div class="yt-focus-pill-stat"><strong>${data.remainingLessons}</strong> remaining</div>
        </div>
        ${queueNextUpHtml}
        <div class="yt-focus-card-footer">
          <button type="button" class="yt-focus-btn-secondary" id="yt-focus-hub-btn-queue">
            <span>View Learning Queue →</span>
          </button>
        </div>
      </div>
    `;

    // 4. Quick Analytics Strip
    let statsSectionHtml = '';
    if (data.hasHistory) {
      statsSectionHtml = `
        <div class="yt-focus-today-section yt-focus-summary-card">
          <div class="yt-focus-card-header">
            <span class="yt-focus-section-label">QUICK STATS</span>
          </div>
          <div class="yt-focus-stats-grid">
            <div class="yt-focus-stat-col">
              <div class="yt-focus-stat-tiny-lbl">TODAY</div>
              <div class="yt-focus-stat-tiny-val">${data.todayMins}m</div>
            </div>
            <div class="yt-focus-stat-col">
              <div class="yt-focus-stat-tiny-lbl">THIS WEEK</div>
              <div class="yt-focus-stat-tiny-val">${data.weekFormatted}</div>
            </div>
            <div class="yt-focus-stat-col">
              <div class="yt-focus-stat-tiny-lbl">FOCUS</div>
              <div class="yt-focus-stat-tiny-val">${data.focusPct}%</div>
            </div>
          </div>
          <div class="yt-focus-card-footer">
            <button type="button" class="yt-focus-btn-secondary" id="yt-focus-hub-btn-analytics">
              <span>View Analytics →</span>
            </button>
          </div>
        </div>
      `;
    } else {
      statsSectionHtml = `
        <div class="yt-focus-today-section yt-focus-summary-card">
          <div class="yt-focus-card-header">
            <span class="yt-focus-section-label">QUICK STATS</span>
          </div>
          <div class="yt-focus-no-history-box">
            <div class="yt-focus-no-history-title">START YOUR FIRST SESSION</div>
            <p class="yt-focus-no-history-sub">Your learning activity will appear here as you learn.</p>
          </div>
          <div class="yt-focus-card-footer">
            <button type="button" class="yt-focus-btn-secondary" id="yt-focus-hub-btn-analytics">
              <span>View Analytics →</span>
            </button>
          </div>
        </div>
      `;
    }

    hub.innerHTML = `
      <header class="yt-focus-today-header">
        <div class="yt-focus-today-brand-col">
          <div class="yt-focus-today-brand">
            <img src="${wordmarkUrl}" alt="WatchFlow" class="yt-focus-today-wordmark yt-focus-hub-logo-img">
            <span class="yt-focus-hub-title" style="display:none;">WATCHFLOW</span>
          </div>
          <div class="yt-focus-today-sub">Your learning, at a glance.</div>
        </div>
        <div class="yt-focus-today-badge">
          <span class="yt-focus-hub-dot"></span>
          <span class="yt-focus-hub-subheading">FOCUS MODE ACTIVE</span>
        </div>
      </header>

      <div class="yt-focus-today-body">
        ${progressSectionHtml}
        ${continueSectionHtml}
        <div class="yt-focus-today-bottom-grid">
          ${queueSectionHtml}
          ${statsSectionHtml}
        </div>
      </div>
    `;

    // Attach button event listeners
    const contBtn = hub.querySelector('#yt-focus-hub-btn-continue');
    if (contBtn) contBtn.addEventListener('click', handleContinueLearning);

    const qBtn = hub.querySelector('#yt-focus-hub-btn-queue');
    if (qBtn) qBtn.addEventListener('click', openLearningQueue);

    const aBtn = hub.querySelector('#yt-focus-hub-btn-analytics');
    if (aBtn) aBtn.addEventListener('click', openAnalytics);

    const goalLink = hub.querySelector('#yt-focus-link-set-goal');
    if (goalLink) goalLink.addEventListener('click', openSettings);
  }

  function scheduleHomeHubDataUpdate() {
    if (homeHubUpdateTimer) clearTimeout(homeHubUpdateTimer);
    homeHubUpdateTimer = setTimeout(async () => {
      homeHubUpdateTimer = null;
      const hub = document.getElementById(CSS_CLASSES.HOME_FOCUS_HUB);
      if (hub && isHomePage() && currentSettings.focusModeEnabled && currentSettings.extensionEnabled !== false) {
        const data = await fetchFocusHomeData();
        renderTodayHubContent(hub, data);
      }
    }, 150);
  }

  async function ensureFocusHomeMounted() {
    if (currentSettings.extensionEnabled === false || !isHomePage() || !currentSettings.focusModeEnabled) {
      removeHomeFocusHub();
      return null;
    }

    // 1. Idempotency: If existing hub already mounted, deduplicate and return it
    const existingHubs = document.querySelectorAll('#' + CSS_CLASSES.HOME_FOCUS_HUB);
    if (existingHubs.length > 0) {
      for (let i = 1; i < existingHubs.length; i++) {
        existingHubs[i].remove();
      }
      const existing = existingHubs[0];
      if (existing.isConnected) {
        scheduleHomeHubDataUpdate();
        return existing;
      }
    }

    // 2. Lock: If mount is currently in flight, do not start parallel mount
    if (isMountingFocusHome) {
      return null;
    }

    isMountingFocusHome = true;
    try {
      const targetParent = resolveHomeParent();

      if (!targetParent) {
        setTimeout(() => {
          if (isHomePage() && currentSettings.focusModeEnabled && currentSettings.extensionEnabled !== false) {
            ensureFocusHomeMounted();
          }
        }, 150);
        return null;
      }

      // Deduplicate before async operations
      const preCheck = document.querySelectorAll('#' + CSS_CLASSES.HOME_FOCUS_HUB);
      if (preCheck.length > 0 && preCheck[0].isConnected) {
        for (let i = 1; i < preCheck.length; i++) {
          preCheck[i].remove();
        }
        scheduleHomeHubDataUpdate();
        return preCheck[0];
      }

      await refreshQueueCache();
      const data = await fetchFocusHomeData();

      // If context changed during await
      if (currentSettings.extensionEnabled === false || !isHomePage() || !currentSettings.focusModeEnabled) {
        removeHomeFocusHub();
        return null;
      }

      // Check if an instance appeared during await
      const postCheck = document.querySelectorAll('#' + CSS_CLASSES.HOME_FOCUS_HUB);
      if (postCheck.length > 0 && postCheck[0].isConnected) {
        for (let i = 1; i < postCheck.length; i++) {
          postCheck[i].remove();
        }
        renderTodayHubContent(postCheck[0], data);
        return postCheck[0];
      }

      const hub = document.createElement('div');
      hub.id = CSS_CLASSES.HOME_FOCUS_HUB;
      renderTodayHubContent(hub, data);

      const freshParent = resolveHomeParent() || targetParent;

      if (freshParent) {
        // Pre-insertion deduplication sweep
        const cleanSweep = document.querySelectorAll('#' + CSS_CLASSES.HOME_FOCUS_HUB);
        cleanSweep.forEach(h => h.remove());

        freshParent.prepend(hub);
        homeHubInjected = true;
        console.log('[WatchFlow] WatchFlow Today Focus Home mounted');
      }

      // Post-insertion deduplication guarantee
      const finalSweep = document.querySelectorAll('#' + CSS_CLASSES.HOME_FOCUS_HUB);
      if (finalSweep.length > 1) {
        for (let i = 1; i < finalSweep.length; i++) {
          finalSweep[i].remove();
        }
      }

      return hub;
    } catch (err) {
      console.error('[WatchFlow] Error mounting Today Focus Home:', err);
      return null;
    } finally {
      isMountingFocusHome = false;
    }
  }

  const ensureHomeFocusHub = ensureFocusHomeMounted;

  function ensureVideoBlockOverlay(customMsg = null) {
    if (!currentSettings.focusModeEnabled) return;
    let overlay = document.getElementById(CSS_CLASSES.VIDEO_BLOCK_OVERLAY);
    const msg = customMsg || "This video isn't in your Learning Queue.<br>Focus Mode only allows videos you've chosen to learn from.";

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = CSS_CLASSES.VIDEO_BLOCK_OVERLAY;
      overlay.className = CSS_CLASSES.VIDEO_BLOCK_OVERLAY;
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="yt-focus-shorts-block-card">
        <div class="yt-focus-shorts-block-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
        </div>
        <h2 class="yt-focus-shorts-block-title">FOCUS MODE</h2>
        <div class="yt-focus-shorts-block-sub">Learning-Only Mode Active</div>
        <p class="yt-focus-shorts-block-desc">${msg}</p>
        <div class="yt-focus-shorts-block-actions">
          <button type="button" class="yt-focus-btn-primary" id="yt-focus-block-continue-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <span>Continue Learning</span>
          </button>
          <button type="button" class="yt-focus-btn-secondary" id="yt-focus-block-queue-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>
            <span>Open Learning Queue</span>
          </button>
        </div>
      </div>
    `;

    overlay.querySelector('#yt-focus-block-continue-btn').addEventListener('click', handleContinueLearning);
    overlay.querySelector('#yt-focus-block-queue-btn').addEventListener('click', openLearningQueue);
  }

  function removeVideoBlockOverlay() {
    const overlay = document.getElementById(CSS_CLASSES.VIDEO_BLOCK_OVERLAY);
    if (overlay) overlay.remove();
  }

  function ensureSearchBlockOverlay() {
    if (!currentSettings.focusModeEnabled) return;
    if (document.getElementById(CSS_CLASSES.SEARCH_BLOCK_OVERLAY)) return;

    const overlay = document.createElement('div');
    overlay.id = CSS_CLASSES.SEARCH_BLOCK_OVERLAY;
    overlay.className = CSS_CLASSES.SEARCH_BLOCK_OVERLAY;
    overlay.innerHTML = `
      <div class="yt-focus-shorts-block-card">
        <div class="yt-focus-shorts-block-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
        </div>
        <h2 class="yt-focus-shorts-block-title">SEARCH BLOCKED</h2>
        <div class="yt-focus-shorts-block-sub">YouTube Search is disabled in Focus Mode.</div>
        <p class="yt-focus-shorts-block-desc">Focus Mode only allows videos you've chosen to learn from.</p>
        <div class="yt-focus-shorts-block-actions">
          <button type="button" class="yt-focus-btn-primary" id="yt-focus-search-continue-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <span>Continue Learning</span>
          </button>
          <button type="button" class="yt-focus-btn-secondary" id="yt-focus-search-queue-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>
            <span>Open Learning Queue</span>
          </button>
        </div>
      </div>
    `;

    overlay.querySelector('#yt-focus-search-continue-btn').addEventListener('click', handleContinueLearning);
    overlay.querySelector('#yt-focus-search-queue-btn').addEventListener('click', openLearningQueue);
    document.body.appendChild(overlay);
  }

  function removeSearchBlockOverlay() {
    const overlay = document.getElementById(CSS_CLASSES.SEARCH_BLOCK_OVERLAY);
    if (overlay) overlay.remove();
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
    console.log('[WatchFlow] URL changed:', newUrl);
    handleFocusModeNavigation(newUrl);
  }

  async function handleFocusModeNavigation(newUrl) {
    if (currentSettings.extensionEnabled === false) {
      applyExtensionEnabledState(false);
      return;
    }

    await refreshQueueCache();

    if (!currentSettings.focusModeEnabled) {
      isCurrentVideoAllowed = true;
      removeVideoBlockOverlay();
      removeSearchBlockOverlay();
      removeShortsBlock();
      removeHomeFocusHub();

      if (isWatchPage()) {
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
      return;
    }

    // FOCUS MODE IS ON: STRICT LEARNING-ONLY MODE
    // 1. YouTube Shorts
    if (isShortsPage()) {
      isCurrentVideoAllowed = false;
      removeVideoBlockOverlay();
      removeSearchBlockOverlay();
      removeHomeFocusHub();
      handleShortsPage();
      return;
    } else {
      removeShortsBlock();
    }

    // 2. YouTube Search
    if (isSearchPage()) {
      isCurrentVideoAllowed = false;
      pausePlayerImmediately();
      flushActiveSession();
      removeVideoBlockOverlay();
      removeHomeFocusHub();
      ensureSearchBlockOverlay();
      return;
    } else {
      removeSearchBlockOverlay();
    }

    // 3. YouTube Home / Browse
    if (isHomePage()) {
      isCurrentVideoAllowed = false;
      pausePlayerImmediately();
      flushActiveSession();
      removeVideoBlockOverlay();
      removeSearchBlockOverlay();
      ensureHomeFocusHub();
      return;
    } else {
      removeHomeFocusHub();
    }

    // 4. Watch Page: Authoritative Allowlist Check
    if (isWatchPage()) {
      let videoId = '';
      let playlistId = '';
      try {
        const u = new URL(window.location.href);
        videoId = u.searchParams.get('v') || '';
        playlistId = u.searchParams.get('list') || '';
      } catch (e) {}

      const allowed = await isVideoAllowedInFocusMode(videoId, { playlistId });
      isCurrentVideoAllowed = allowed;

      if (allowed) {
        removeVideoBlockOverlay();
        ensurePlayerButtonInjected();
        initActiveSession();
        disableYouTubeAutonav();
        setTimeout(() => {
          ensureQuickAddButtons();
          ensureCourseBanner();
          checkLimitsAndSchedules();
        }, 500);
      } else {
        pausePlayerImmediately();
        flushActiveSession();
        removeCourseBanner();
        ensureVideoBlockOverlay();
      }
      return;
    } else {
      if (isWindowFullscreen) {
        disableWindowFullscreen();
      }
      flushActiveSession();
      removeCourseBanner();
    }

    // 5. Channel Pages
    if (isChannelPage()) {
      isCurrentVideoAllowed = false;
      pausePlayerImmediately();
      flushActiveSession();
      ensureVideoBlockOverlay('Channel browsing is disabled in Focus Mode.<br>Only videos in your Learning Queue are allowed.');
      return;
    }

    // 6. Playlist Pages
    if (window.location.pathname === '/playlist') {
      let playlistId = '';
      try {
        playlistId = new URL(window.location.href).searchParams.get('list') || '';
      } catch (e) {}

      const isPlApproved = cachedQueue.some(item =>
        item.type === 'playlist' && (item.playlistId === playlistId || item.id === playlistId || item.id === 'pl_' + playlistId)
      );

      if (isPlApproved) {
        removeVideoBlockOverlay();
        setTimeout(ensureQuickAddButtons, 500);
      } else {
        pausePlayerImmediately();
        flushActiveSession();
        ensureVideoBlockOverlay('This playlist is not in your Learning Queue.<br>Only approved playlists are accessible in Focus Mode.');
      }
      return;
    }

    // 7. Any other YouTube discovery route
    isCurrentVideoAllowed = false;
    pausePlayerImmediately();
    flushActiveSession();
    ensureVideoBlockOverlay('This YouTube surface is disabled in Focus Mode.<br>Only videos in your Learning Queue are allowed.');
  }

  function handleShortsPage() {
    if (isWindowFullscreen) {
      disableWindowFullscreen();
    }
    flushActiveSession();
    removeCourseBanner();
    removeHomeFocusHub();

    if (currentSettings.extensionEnabled === false || !currentSettings.focusModeEnabled) {
      removeShortsBlock();
      return;
    }

    ensureShortsBlock();
    pausePlayerImmediately();
  }

  function ensureShortsBlock() {
    if (!currentSettings.focusModeEnabled) return;
    if (document.getElementById(CSS_CLASSES.SHORTS_BLOCK_OVERLAY)) return;
    if (!document.body) return;

    const overlay = document.createElement('div');
    overlay.id = CSS_CLASSES.SHORTS_BLOCK_OVERLAY;
    overlay.className = CSS_CLASSES.SHORTS_BLOCK_OVERLAY;
    overlay.innerHTML = `
      <div class="yt-focus-shorts-block-card">
        <div class="yt-focus-shorts-block-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
            <path d="M10 14.65v-5.3L15 12l-5 2.65zm7.8-8.99A10.016 10.016 0 0 0 12 2C6.48 2 2 6.48 2 12c0 2.38.83 4.57 2.21 6.3L17.8 5.66zM21.79 12c0-2.38-.83-4.57-2.21-6.3L6.2 18.34A10.016 10.016 0 0 0 12 22c5.52 0 10-4.48 10-10z"/>
          </svg>
        </div>
        <h2 class="yt-focus-shorts-block-title">SHORTS BLOCKED</h2>
        <div class="yt-focus-shorts-block-sub">Focus Mode is active in WatchFlow.</div>
        <p class="yt-focus-shorts-block-desc">Short-form content is hidden while you're focusing.</p>
        <div class="yt-focus-shorts-block-actions">
          <button type="button" class="yt-focus-btn-primary" id="yt-focus-shorts-continue-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <span>Continue Learning</span>
          </button>
          <button type="button" class="yt-focus-btn-secondary" id="yt-focus-shorts-queue-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>
            <span>Open Learning Queue</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#yt-focus-shorts-continue-btn').addEventListener('click', handleContinueLearning);
    overlay.querySelector('#yt-focus-shorts-queue-btn').addEventListener('click', openLearningQueue);
  }

  function removeShortsBlock() {
    const overlay = document.getElementById(CSS_CLASSES.SHORTS_BLOCK_OVERLAY);
    if (overlay) overlay.remove();
  }

  let injectionDebounceTimer = null;

  function scheduleButtonCheck() {
    if (currentSettings.extensionEnabled === false || !isWatchPage() || !currentSettings.showPlayerButton) return;
    if (injectionDebounceTimer) return;

    injectionDebounceTimer = requestAnimationFrame(() => {
      injectionDebounceTimer = null;
      if (currentSettings.extensionEnabled === false) return;
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

    window.addEventListener('popstate', () => {
      handleUrlChange(window.location.href);
    });

    window.addEventListener('hashchange', () => {
      handleUrlChange(window.location.href);
    });

    try {
      const origPush = history.pushState;
      history.pushState = function (...args) {
        const ret = origPush.apply(this, args);
        handleUrlChange(window.location.href);
        return ret;
      };
      const origReplace = history.replaceState;
      history.replaceState = function (...args) {
        const ret = origReplace.apply(this, args);
        handleUrlChange(window.location.href);
        return ret;
      };
    } catch (e) {}

    window.addEventListener('yt-page-data-updated', () => {
      if (currentSettings.extensionEnabled === false) return;
      if (currentSettings.focusModeEnabled) {
        handleFocusModeNavigation(window.location.href);
      } else {
        if (isWatchPage()) {
          ensurePlayerButtonInjected();
          ensureQuickAddButtons();
          ensureCourseBanner();
        } else if (window.location.pathname === '/playlist') {
          ensureQuickAddButtons();
        }
      }
    });

    window.addEventListener('resize', scheduleButtonCheck);
    document.addEventListener('fullscreenchange', scheduleButtonCheck);

    const bodyObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        handleUrlChange(window.location.href);
      } else if (isWatchPage() && currentSettings.extensionEnabled !== false && isCurrentVideoAllowed) {
        scheduleButtonCheck();
      } else if (isHomePage() && currentSettings.extensionEnabled !== false && currentSettings.focusModeEnabled) {
        const hub = document.getElementById(CSS_CLASSES.HOME_FOCUS_HUB);
        if (!hub || !hub.isConnected) {
          ensureFocusHomeMounted();
        }
      }
    });
    bodyObserver.observe(document.documentElement, { subtree: true, childList: true });
  }

  function setupInteractionGuards() {
    // 1. Instant Play Protection (capture phase)
    document.addEventListener('play', (e) => {
      if (currentSettings.extensionEnabled === false || !currentSettings.focusModeEnabled) return;
      if (isShortsPage() || isSearchPage() || (isWatchPage() && !isCurrentVideoAllowed)) {
        try {
          e.target.pause();
          e.target.currentTime = 0;
        } catch (err) {}
      }
    }, true);

    // 2. Navigation Click Interception (capture phase)
    document.addEventListener('click', (e) => {
      if (currentSettings.extensionEnabled === false || !currentSettings.focusModeEnabled) return;

      const anchor = e.target.closest('a');
      if (!anchor || !anchor.href) return;

      try {
        const parsed = new URL(anchor.href, window.location.origin);
        if (!parsed.hostname.includes('youtube.com')) return;

        // Block search link clicks
        if (parsed.pathname === '/results' || parsed.pathname === '/search') {
          e.preventDefault();
          e.stopPropagation();
          showToast('Search is disabled in Focus Mode', '🔒');
          return;
        }

        // Intercept watch links to unapproved videos
        if (parsed.pathname === '/watch') {
          const vId = parsed.searchParams.get('v');
          const listId = parsed.searchParams.get('list');
          if (vId) {
            const allowed = isVideoAllowedInFocusModeSync(vId, { playlistId: listId });
            if (!allowed) {
              e.preventDefault();
              e.stopPropagation();
              pausePlayerImmediately();
              ensureVideoBlockOverlay();
              showToast('Video not in Learning Queue', '🔒');
              return;
            }
          }
        }

        // Allow navigation to home (will render WatchFlow Focus Home)
        if (parsed.pathname === '/' || parsed.pathname === '/browse') {
          return;
        }

        // Block shorts links
        if (parsed.pathname.startsWith('/shorts')) {
          e.preventDefault();
          e.stopPropagation();
          showToast('Shorts are blocked in Focus Mode', '🔒');
          return;
        }

        // Block channel or feed browsing
        if (parsed.pathname.startsWith('/@') || parsed.pathname.startsWith('/channel') || parsed.pathname.startsWith('/feed')) {
          e.preventDefault();
          e.stopPropagation();
          showToast('Browsing is disabled in Focus Mode', '🔒');
          return;
        }
      } catch (err) {}
    }, true);
  }

  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (currentSettings.extensionEnabled === false) return;
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

      // 1. Video Quick Add Button
      let videoBtn = actionsContainer.querySelector(`.${CSS_CLASSES.QUICK_ADD_BTN}`);
      const isVideoQueued = await storage.isVideoInQueue(videoInfo.videoId);

      if (!videoBtn) {
        videoBtn = document.createElement('button');
        videoBtn.className = `${CSS_CLASSES.QUICK_ADD_BTN}${isVideoQueued ? ' queued' : ''}`;
        videoBtn.type = 'button';
        videoBtn.innerHTML = isVideoQueued
          ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>In Queue</span>`
          : `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> <span>Queue</span>`;

        videoBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const currentQueued = await storage.isVideoInQueue(videoInfo.videoId);
          if (currentQueued) {
            showToast('Video already in Learning Queue', '✓');
          } else {
            await storage.addVideoToQueue(videoInfo);
            videoBtn.classList.add('queued');
            videoBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>In Queue</span>`;
            showToast('Added video to Learning Queue', '✓');
          }
        });

        actionsContainer.appendChild(videoBtn);
      } else {
        videoBtn.classList.toggle('queued', isVideoQueued);
        videoBtn.innerHTML = isVideoQueued
          ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>In Queue</span>`
          : `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> <span>Queue</span>`;
      }

      // 2. Playlist Quick Add Button (if watching inside a playlist)
      const playlistInfo = getCurrentPlaylistInfo();
      let plBtn = actionsContainer.querySelector(`.${CSS_CLASSES.QUICK_ADD_PLAYLIST_BTN}`);
      if (playlistInfo && playlistInfo.playlistId) {
        const isPlQueued = await storage.isPlaylistInQueue(playlistInfo.playlistId);
        if (!plBtn) {
          plBtn = document.createElement('button');
          plBtn.className = `${CSS_CLASSES.QUICK_ADD_PLAYLIST_BTN}${isPlQueued ? ' queued' : ''}`;
          plBtn.type = 'button';
          plBtn.innerHTML = isPlQueued
            ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`
            : `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg> <span>+ Playlist</span>`;

          plBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentPlQueued = await storage.isPlaylistInQueue(playlistInfo.playlistId);
            if (currentPlQueued) {
              showToast('Playlist already in Learning Queue', '✓');
            } else {
              const freshPl = getCurrentPlaylistInfo() || playlistInfo;
              await storage.addPlaylistToQueue(freshPl);
              plBtn.classList.add('queued');
              plBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`;
              showToast(`Added playlist (${freshPl.videos.length} lessons)`, '✓');
            }
          });

          actionsContainer.appendChild(plBtn);
        } else {
          plBtn.classList.toggle('queued', isPlQueued);
          plBtn.innerHTML = isPlQueued
            ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`
            : `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg> <span>+ Playlist</span>`;
        }
      } else if (plBtn) {
        plBtn.remove();
      }
    } else if (window.location.pathname === '/playlist') {
      const playlistInfo = getCurrentPlaylistInfo();
      if (!playlistInfo || !playlistInfo.playlistId) return;

      const headerContainer = document.querySelector('ytd-playlist-header-renderer #action-buttons, ytd-playlist-header-renderer .immersive-header-content, ytd-playlist-header-renderer');
      if (!headerContainer) return;

      const isPlQueued = await storage.isPlaylistInQueue(playlistInfo.playlistId);
      let btn = headerContainer.querySelector(`.${CSS_CLASSES.QUICK_ADD_PLAYLIST_BTN}`);

      if (!btn) {
        btn = document.createElement('button');
        btn.className = `${CSS_CLASSES.QUICK_ADD_PLAYLIST_BTN}${isPlQueued ? ' queued' : ''}`;
        btn.type = 'button';
        btn.innerHTML = isPlQueued
          ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`
          : `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg> <span>Add Playlist to Queue</span>`;

        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const currentPlQueued = await storage.isPlaylistInQueue(playlistInfo.playlistId);
          if (currentPlQueued) {
            showToast('Playlist already in Learning Queue', '✓');
          } else {
            const freshPl = getCurrentPlaylistInfo() || playlistInfo;
            await storage.addPlaylistToQueue(freshPl);
            btn.classList.add('queued');
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`;
            showToast(`Added playlist (${freshPl.videos.length} lessons)`, '✓');
          }
        });

        headerContainer.appendChild(btn);
      } else {
        btn.classList.toggle('queued', isPlQueued);
        btn.innerHTML = isPlQueued
          ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg> <span>Playlist Queued</span>`
          : `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg> <span>Add Playlist to Queue</span>`;
      }
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

    if (currentSettings.focusModeEnabled && !isCurrentVideoAllowed) {
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
      if (currentSettings.extensionEnabled === false) return;
      if (currentSettings.focusModeEnabled && !isCurrentVideoAllowed) {
        flushActiveSession();
        return;
      }
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

    document.addEventListener('ended', async (e) => {
      if (e.target && e.target.tagName === 'VIDEO') {
        if (currentSettings.extensionEnabled === false || !currentSettings.focusModeEnabled) return;

        const plContext = getCurrentPlaylistContext();
        if (plContext && plContext.isInPlaylist && plContext.playlistId) {
          const isPlApproved = cachedQueue.some(item =>
            item.type === 'playlist' && (item.playlistId === plContext.playlistId || item.id === plContext.playlistId || item.id === 'pl_' + plContext.playlistId)
          );
          if (isPlApproved) {
            const nextBtn = document.querySelector('.ytp-next-button');
            if (nextBtn && !nextBtn.getAttribute('aria-disabled')) {
              return;
            }
          }
        }

        pausePlayerImmediately();

        const nextItem = storage ? await storage.getContinueLearningItem() : null;
        if (nextItem && nextItem.url && nextItem.videoId !== plContext?.currentVideoId) {
          window.location.href = nextItem.url;
        } else {
          window.location.href = '/';
        }
      }
    }, true);
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
    const limitMins = typeof currentSettings.dailyLimitMinutes === 'number' ? currentSettings.dailyLimitMinutes : 60;

    // A limit of 0 means "No Limit" - skip all warnings and cooldowns
    if (limitMins > 0 && todayMins >= limitMins) {
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
          <div class="yt-focus-overlay-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
          </div>
          <h2 class="yt-focus-overlay-title">TIME OUT</h2>
          <p class="yt-focus-overlay-desc">You've reached today's YouTube limit.<br>Take a short break before continuing.</p>
          <div class="yt-focus-cooldown-timer-box">
            <div class="yt-focus-cooldown-time" id="yt-focus-cd-timer">--:--</div>
            <div class="yt-focus-cooldown-label">Cooldown remaining</div>
          </div>
          <div class="yt-focus-overlay-actions">
            <button type="button" class="yt-focus-btn-primary" id="yt-focus-btn-open-dash-cd">Open Dashboard</button>
            <button type="button" class="yt-focus-btn-secondary" id="yt-focus-btn-dismiss-cd">Dismiss</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const dashBtn = overlay.querySelector('#yt-focus-btn-open-dash-cd');
      if (dashBtn) {
        dashBtn.addEventListener('click', () => {
          const url = chrome.runtime.getURL('src/dashboard/dashboard.html');
          window.open(url, '_blank');
        });
      }

      const dismissBtn = overlay.querySelector('#yt-focus-btn-dismiss-cd');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', async () => {
          await storage.setCooldownState(false);
          removeCooldownOverlay();
        });
      }
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
          <div class="yt-focus-overlay-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
          </div>
          <h2 class="yt-focus-overlay-title">Scheduled Focus Period</h2>
          <p class="yt-focus-overlay-desc">YouTube viewing is paused during <strong>${schedule.name || 'Scheduled Hours'}</strong> (${formatTime12(schedule.startTime)} – ${formatTime12(schedule.endTime)}).</p>
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

  let isInitialized = false;

  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    try {
      if (storage) {
        currentSettings = await storage.getSettings();
        await refreshQueueCache();
      }

      setupInteractionGuards();
      setupNavigationListeners();
      setupKeyboardShortcuts();
      setupWatchTimeTracker();

      if (currentSettings.extensionEnabled !== false) {
        lastUrl = window.location.href;
        applyFocusMode(currentSettings.focusModeEnabled);
        handleUrlChange(window.location.href);

        if (currentSettings.showStatusIndicator) {
          injectStatusPill();
        }
      } else {
        applyExtensionEnabledState(false);
      }

      checkLimitsAndSchedules();

      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'WF_CHECK_LIMITS') {
          checkLimitsAndSchedules();
        }
      });

      if (storage && storage.onSettingsChanged) {
        storage.onSettingsChanged((newSettings) => {
          const prevEnabled = currentSettings.extensionEnabled !== false;
          const nowEnabled = newSettings.extensionEnabled !== false;
          currentSettings = newSettings;
          if (prevEnabled !== nowEnabled) {
            applyExtensionEnabledState(nowEnabled);
            return;
          }
          if (!nowEnabled) return;
          applyFocusMode(currentSettings.focusModeEnabled);
          updateStatusPill();
          ensureCourseBanner();
          checkLimitsAndSchedules();
          if (isHomePage() && currentSettings.focusModeEnabled) {
            scheduleHomeHubDataUpdate();
          }
        });
      }

      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(async (changes, area) => {
          if (area === 'local') {
            if (changes['yt_focus_learning_queue']) {
              await refreshQueueCache();
              if (currentSettings.extensionEnabled !== false && currentSettings.focusModeEnabled) {
                if (isHomePage()) {
                  scheduleHomeHubDataUpdate();
                } else {
                  handleFocusModeNavigation(window.location.href);
                }
              }
            }
            if (changes['yt_focus_daily_stats'] || changes['yt_focus_analytics']) {
              if (currentSettings.extensionEnabled !== false && currentSettings.focusModeEnabled && isHomePage()) {
                scheduleHomeHubDataUpdate();
              }
            }
            if (changes['yt_focus_cooldown_state'] || changes['yt_focus_schedules']) {
              checkLimitsAndSchedules();
            }
          }
        });
      }
    } catch (err) {
      console.error('[WatchFlow] Content script init error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
