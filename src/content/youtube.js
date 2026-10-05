/**
 * YouTube Focus - Content Script
 * Manages Window Fullscreen, Focus Mode, Intentional Hub, and SPA Navigation.
 */

(function () {
  'use strict';

  const { ACTIONS, SELECTORS, CSS_CLASSES, DEFAULT_SETTINGS } = window.YTF_CONSTANTS || {};
  const storage = window.YTF_STORAGE;
  const logger = window.YTF_LOGGER || console;

  let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
  let isWindowFullscreen = false;
  let lastUrl = window.location.href;
  let playerButtonObserver = null;
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

  /**
   * Initialize content script
   */
  async function init() {
    try {
      if (storage) {
        currentSettings = await storage.getSettings();
        if (logger.setDebug) {
          logger.setDebug(currentSettings.debugMode);
        }
      }

      logger.info('Content script initialized on YouTube.');

      // Check current page type and apply rules
      handleUrlChange(window.location.href);

      // Apply initial focus mode
      applyFocusMode(currentSettings.focusModeEnabled);

      // Inject floating status indicator if enabled
      if (currentSettings.showStatusIndicator) {
        injectStatusPill();
      }

      // Attach SPA navigation listeners
      setupNavigationListeners();

      // Attach keyboard shortcuts
      setupKeyboardShortcuts();

      // Listen for runtime messages from popup and service worker
      setupMessageListeners();

      // Listen for storage changes across tabs
      if (storage && storage.onSettingsChanged) {
        storage.onSettingsChanged((newSettings) => {
          logger.debug('Settings updated via storage change:', newSettings);
          currentSettings = newSettings;
          applyFocusMode(currentSettings.focusModeEnabled);
          updateStatusPill();
        });
      }
    } catch (err) {
      logger.error('Failed to initialize content script:', err);
    }
  }

  /**
   * Helper: check if active element is an input or editable field
   */
  function isEditingText() {
    const el = document.activeElement;
    if (!el) return false;
    const tagName = el.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || el.isContentEditable;
  }

  /**
   * Extract video info from current watch page
   */
  function getCurrentVideoInfo() {
    if (!isWatchPage()) return null;

    const titleEl = document.querySelector(SELECTORS.videoTitle);
    const channelEl = document.querySelector(SELECTORS.channelName);
    const videoEl = document.querySelector(SELECTORS.videoElement);

    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(' - YouTube', '');
    const channel = channelEl ? channelEl.textContent.trim() : 'Unknown';
    const duration = videoEl && !isNaN(videoEl.duration) ? formatDuration(videoEl.duration) : '';
    const url = window.location.href;
    const urlObj = new URL(url);
    const id = urlObj.searchParams.get('v') || '';

    return { id, title, channel, duration, url };
  }

  function formatDuration(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function isWatchPage() {
    return window.location.pathname === '/watch' || window.location.search.includes('v=');
  }

  function isHomePage() {
    return window.location.pathname === '/' && !window.location.search;
  }

  function isShortsPage() {
    return window.location.pathname.startsWith('/shorts/');
  }

  /**
   * Handle SPA URL and page navigation
   */
  function handleUrlChange(newUrl) {
    logger.debug('URL changed:', newUrl);
    lastUrl = newUrl;

    // Check Shorts redirection
    if (isShortsPage() && currentSettings.redirectShortsToWatch) {
      const shortId = window.location.pathname.replace('/shorts/', '').split('?')[0];
      if (shortId) {
        logger.info(`Redirecting Shorts (${shortId}) to regular watch page for intentional viewing`);
        window.location.replace(`https://www.youtube.com/watch?v=${shortId}`);
        return;
      }
    }

    // Check watch page
    if (isWatchPage()) {
      homeHubInjected = false;
      // Wait for player controls to mount and inject button
      ensurePlayerButtonInjected();
    } else {
      // If we navigated away from watch page and was in window fullscreen, exit
      if (isWindowFullscreen) {
        disableWindowFullscreen();
      }
    }

    // Check home page
    if (isHomePage() && currentSettings.focusModeEnabled && currentSettings.hideHomeFeed) {
      ensureHomeFocusHub();
    }
  }

  /**
   * Setup SPA Navigation Listeners
   */
  function setupNavigationListeners() {
    // YouTube's custom navigation events
    window.addEventListener('yt-navigate-finish', (e) => {
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

    // Fallback: observe URL changes via MutationObserver
    const bodyObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        handleUrlChange(window.location.href);
      }
    });
    bodyObserver.observe(document.documentElement, { subtree: true, childList: true });
  }

  /**
   * Setup Keyboard Shortcuts
   */
  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Escape: exit window fullscreen
      if (e.key === 'Escape' && isWindowFullscreen) {
        // If a YouTube native menu popup is open, let user close it first
        const openPopup = document.querySelector('.ytp-popup[style*="display: block"]');
        if (!openPopup) {
          e.preventDefault();
          e.stopPropagation();
          disableWindowFullscreen();
          return;
        }
      }

      // Alt+W: toggle window fullscreen
      if (e.altKey && (e.key === 'w' || e.key === 'W') && !isEditingText()) {
        e.preventDefault();
        e.stopPropagation();
        toggleWindowFullscreen();
        return;
      }

      // Alt+F: toggle focus mode
      if (e.altKey && (e.key === 'f' || e.key === 'F') && !isEditingText()) {
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

  /**
   * WINDOW FULLSCREEN: Enable
   */
  function enableWindowFullscreen() {
    if (!isWatchPage()) {
      logger.warn('Window Fullscreen can only be activated on a video watch page.');
      return;
    }

    const player = document.querySelector(SELECTORS.moviePlayer);
    if (!player) {
      logger.warn('YouTube movie player element not found.');
      return;
    }

    document.body.classList.add(CSS_CLASSES.WINDOW_FULLSCREEN_ACTIVE);
    document.documentElement.classList.add(CSS_CLASSES.WINDOW_FULLSCREEN_ACTIVE);
    isWindowFullscreen = true;

    // Update player button icon & title
    updatePlayerButtonState(true);

    // Notify YouTube player to recalculate sizing
    window.dispatchEvent(new Event('resize'));

    logger.info('Window Fullscreen enabled.');
  }

  /**
   * WINDOW FULLSCREEN: Disable
   */
  function disableWindowFullscreen() {
    document.body.classList.remove(CSS_CLASSES.WINDOW_FULLSCREEN_ACTIVE);
    document.documentElement.classList.remove(CSS_CLASSES.WINDOW_FULLSCREEN_ACTIVE);
    isWindowFullscreen = false;

    // Update player button icon & title
    updatePlayerButtonState(false);

    // Notify YouTube player to recalculate sizing
    window.dispatchEvent(new Event('resize'));

    logger.info('Window Fullscreen disabled.');
  }

  /**
   * WINDOW FULLSCREEN: Toggle
   */
  function toggleWindowFullscreen() {
    if (isWindowFullscreen) {
      disableWindowFullscreen();
    } else {
      enableWindowFullscreen();
    }
  }

  /**
   * Injected Player Button in .ytp-right-controls
   */
  function ensurePlayerButtonInjected() {
    if (!currentSettings.showPlayerButton) return;

    const rightControls = document.querySelector(SELECTORS.rightControls);
    if (!rightControls) {
      // If controls not mounted yet, try again briefly
      setTimeout(ensurePlayerButtonInjected, 400);
      return;
    }

    if (document.querySelector(`.${CSS_CLASSES.PLAYER_BUTTON}`)) {
      // Button already present; ensure its active state matches
      updatePlayerButtonState(isWindowFullscreen);
      return;
    }

    // Create the button
    const btn = document.createElement('button');
    btn.className = `ytp-button ${CSS_CLASSES.PLAYER_BUTTON}`;
    btn.setAttribute('aria-label', 'Window Fullscreen (Alt+W)');
    btn.setAttribute('title', 'Window Fullscreen (Alt+W)');
    btn.innerHTML = isWindowFullscreen ? ICON_COMPRESS : ICON_EXPAND;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleWindowFullscreen();
    });

    // Insert before theater mode button or fullscreen button
    const sizeBtn = rightControls.querySelector(SELECTORS.sizeButton);
    const fullscreenBtn = rightControls.querySelector(SELECTORS.fullscreenButton);

    if (sizeBtn) {
      rightControls.insertBefore(btn, sizeBtn);
    } else if (fullscreenBtn) {
      rightControls.insertBefore(btn, fullscreenBtn);
    } else {
      rightControls.appendChild(btn);
    }

    logger.debug('Window Fullscreen button injected into YouTube player controls.');
  }

  /**
   * Update Player Button State Icon & Tooltip
   */
  function updatePlayerButtonState(active) {
    const btn = document.querySelector(`.${CSS_CLASSES.PLAYER_BUTTON}`);
    if (!btn) return;

    if (active) {
      btn.classList.add(CSS_CLASSES.PLAYER_BUTTON_ACTIVE);
      btn.innerHTML = ICON_COMPRESS;
      btn.setAttribute('title', 'Exit Window Fullscreen (Esc or Alt+W)');
      btn.setAttribute('aria-label', 'Exit Window Fullscreen (Esc or Alt+W)');
    } else {
      btn.classList.remove(CSS_CLASSES.PLAYER_BUTTON_ACTIVE);
      btn.innerHTML = ICON_EXPAND;
      btn.setAttribute('title', 'Window Fullscreen (Alt+W)');
      btn.setAttribute('aria-label', 'Window Fullscreen (Alt+W)');
    }
  }

  /**
   * FOCUS MODE: Apply / Update
   */
  function applyFocusMode(enabled) {
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

  /**
   * Ensure Home Focus Hub is displayed on YouTube home
   */
  function ensureHomeFocusHub() {
    if (!isHomePage() || !currentSettings.focusModeEnabled || !currentSettings.hideHomeFeed) {
      removeHomeFocusHub();
      return;
    }

    if (document.getElementById(CSS_CLASSES.HOME_FOCUS_HUB)) {
      return;
    }

    // Locate primary browse container
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
        What do you want to learn today? Search directly without algorithm rabbit holes.
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

    // Hook up intentional search form
    const form = hub.querySelector('#yt-focus-hub-form');
    const input = hub.querySelector('#yt-focus-hub-search-input');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) {
        window.location.href = `/results?search_query=${encodeURIComponent(q)}`;
      }
    });

    // Hook up temporary feed toggle
    const toggleBtn = hub.querySelector('#yt-focus-hub-temp-toggle');
    toggleBtn.addEventListener('click', () => {
      const isRevealed = document.body.classList.toggle('yt-focus-temp-feed-revealed');
      toggleBtn.textContent = isRevealed ? 'Hide home feed' : 'Temporarily reveal home feed';
    });

    primary.prepend(hub);
    homeHubInjected = true;
    logger.debug('Home Focus Hub injected successfully.');
  }

  function removeHomeFocusHub() {
    const hub = document.getElementById(CSS_CLASSES.HOME_FOCUS_HUB);
    if (hub) {
      hub.remove();
      homeHubInjected = false;
    }
  }

  /**
   * Floating Focus Mode Status Pill
   */
  function injectStatusPill() {
    if (document.getElementById(CSS_CLASSES.STATUS_PILL)) return;

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

  /**
   * Listen to Messages from Popup and Background
   */
  function setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.action) return false;

      logger.debug('Content script received message:', message.action);

      switch (message.action) {
        case ACTIONS.TOGGLE_WINDOW_FULLSCREEN:
          toggleWindowFullscreen();
          sendResponse({
            success: true,
            isWindowFullscreen,
            isWatchPage: isWatchPage()
          });
          return true;

        case ACTIONS.TOGGLE_FOCUS_MODE:
          const targetState = typeof message.enabled === 'boolean'
            ? message.enabled
            : !currentSettings.focusModeEnabled;
          applyFocusMode(targetState);
          sendResponse({ success: true, focusModeEnabled: targetState });
          return true;

        case ACTIONS.GET_PAGE_STATUS:
          sendResponse({
            success: true,
            isWatchPage: isWatchPage(),
            isWindowFullscreen,
            focusModeEnabled: currentSettings.focusModeEnabled,
            videoInfo: getCurrentVideoInfo(),
            url: window.location.href
          });
          return true;

        case ACTIONS.GET_CURRENT_VIDEO_INFO:
          sendResponse({
            success: true,
            videoInfo: getCurrentVideoInfo()
          });
          return true;

        case ACTIONS.SETTINGS_CHANGED:
          if (message.settings) {
            currentSettings = message.settings;
            applyFocusMode(currentSettings.focusModeEnabled);
          }
          sendResponse({ success: true });
          return true;

        default:
          return false;
      }
    });
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
