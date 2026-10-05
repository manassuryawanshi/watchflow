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
        storage.addToLearningQueue(videoInfo).then(queue => {
          sendResponse({ success: true, videoInfo, queue });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;
      } else {
        sendResponse({ success: !!videoInfo, videoInfo });
        return true;
      }
    }

    // GET_CURRENT_VIDEO_INFO
    if (message.action === 'GET_CURRENT_VIDEO_INFO') {
      sendResponse({
        success: true,
        videoInfo: getCurrentVideoInfo()
      });
      return true;
    }

    // SETTINGS_CHANGED
    if (message.action === 'SETTINGS_CHANGED') {
      if (message.settings) {
        currentSettings = message.settings;
        applyFocusMode(currentSettings.focusModeEnabled);
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
      : (document.title ? document.title.replace(' - YouTube', '') : 'YouTube Video');
    const channel = channelEl ? channelEl.textContent.trim() : 'YouTube';
    const duration = videoEl && !isNaN(videoEl.duration) ? formatDuration(videoEl.duration) : '';
    const url = window.location.href;
    let id = '';
    try {
      const urlObj = new URL(url);
      id = urlObj.searchParams.get('v') || '';
    } catch (e) {
      // Fallback
    }

    return { id, title, channel, duration, url };
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
    } else {
      if (isWindowFullscreen) {
        disableWindowFullscreen();
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
  // 6. INITIALIZATION SEQUENCE
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

      if (storage && storage.onSettingsChanged) {
        storage.onSettingsChanged((newSettings) => {
          currentSettings = newSettings;
          applyFocusMode(currentSettings.focusModeEnabled);
          updateStatusPill();
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
