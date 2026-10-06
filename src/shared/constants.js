/**
 * WatchFlow - Shared Constants & Selectors
 * Works in Content Scripts, Background Workers, and Popup Pages.
 */

(function (root) {
  'use strict';

  const ACTIONS = {
    PING: 'PING',
    GET_STATUS: 'GET_STATUS',
    TOGGLE_EXTENSION: 'TOGGLE_EXTENSION',
    TOGGLE_FULLSCREEN: 'TOGGLE_FULLSCREEN',
    TOGGLE_FOCUS: 'TOGGLE_FOCUS',
    ADD_TO_QUEUE: 'ADD_TO_QUEUE',
    ADD_PLAYLIST_TO_QUEUE: 'ADD_PLAYLIST_TO_QUEUE',
    AUTO_COMPLETE_VIDEO: 'AUTO_COMPLETE_VIDEO',
    GET_PAGE_STATUS: 'GET_STATUS',
    TOGGLE_WINDOW_FULLSCREEN: 'TOGGLE_FULLSCREEN',
    TOGGLE_FOCUS_MODE: 'TOGGLE_FOCUS',
    GET_CURRENT_VIDEO_INFO: 'GET_CURRENT_VIDEO_INFO',
    GET_PLAYLIST_CONTEXT: 'GET_PLAYLIST_CONTEXT',
    ADD_CURRENT_TO_QUEUE: 'ADD_TO_QUEUE',
    SETTINGS_CHANGED: 'SETTINGS_CHANGED',
    CHECK_LIMITS: 'CHECK_LIMITS',
    TRIGGER_COOLDOWN: 'TRIGGER_COOLDOWN',
    DISMISS_COOLDOWN: 'DISMISS_COOLDOWN',
    OPEN_DASHBOARD: 'OPEN_DASHBOARD',
    OPEN_LEARNING_QUEUE: 'OPEN_LEARNING_QUEUE'
  };

  const STORAGE_KEYS = {
    SETTINGS: 'yt_focus_settings',
    DAILY_STATS: 'yt_focus_daily_stats',
    LEARNING_QUEUE: 'yt_focus_learning_queue',
    WATCH_SESSIONS: 'yt_focus_watch_sessions',
    SCHEDULES: 'yt_focus_schedules',
    COOLDOWN_STATE: 'yt_focus_cooldown_state'
  };

  const DEFAULT_SETTINGS = {
    // Master Extension state
    extensionEnabled: true,

    // Focus Mode features
    focusModeEnabled: true,
    hideHomeFeed: true,
    hideShorts: true,
    blockShorts: true,
    hideRecommendations: true,
    hideComments: false,
    hideEndScreens: true,

    // Window Fullscreen
    windowFullscreenEnabled: false,

    // UI & Controls
    showPlayerButton: true,
    showStatusIndicator: true,
    enableKeyboardShortcuts: true,

    // Time Management & Limits
    dailyLimitMinutes: 60,
    dailyWarningMinutes: 45,
    warningThresholdPct: 75,
    limitMode: 'soft', // 'soft' (warnings only) | 'hard' (cooldown & blocking)
    cooldownMinutes: 10,
    cooldownWatchMinutes: 45,
    cooldownBreakMinutes: 10,

    // Learning & Queue Intelligence
    autoCompleteThreshold: 0.9, // 90% watched marks video as completed
    courseModeEnabled: true,

    // Scheduling
    scheduleEnabled: false,
    scheduleBlocks: [],

    // Intent (Foundations)
    askIntentOnOpen: false,
    defaultIntent: 'learn',

    // Debugging
    debugMode: false,
  };

  const SELECTORS = {
    // Watch page & Player
    moviePlayer: '#movie_player',
    videoElement: 'video.html5-main-video',
    playerContainerOuter: '#player-container-outer',
    playerContainerInner: '#player-container-inner',
    playerTheaterContainer: '#player-theater-container',
    playerContainer: '#player-container',
    watchFlexy: 'ytd-watch-flexy',
    watchNextSecondary: '#secondary ytd-watch-next-secondary-results-renderer',
    relatedVideos: '#secondary #related',
    playlistPanel: 'ytd-playlist-panel-renderer',
    belowPlayer: '#primary #below',
    videoTitle: 'h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, ytd-watch-metadata h1',
    channelName: '#owner #channel-name a, ytd-channel-name a',
    rightControls: '.ytp-right-controls',
    chromeBottom: '.ytp-chrome-bottom',
    sizeButton: '.ytp-size-button',
    fullscreenButton: '.ytp-fullscreen-button',

    // Home and Browse
    homeBrowse: 'ytd-browse[page-subtype="home"]',
    homeContents: 'ytd-browse[page-subtype="home"] #contents',
    homePrimary: 'ytd-browse[page-subtype="home"] #primary',
    richGrid: 'ytd-rich-grid-renderer',

    // Shorts
    shortsShelf: 'ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer',
    guideShortsEntry: 'ytd-guide-entry-renderer:has(a[href^="/shorts"]), a[title="Shorts"]',
    miniGuideShortsEntry: 'ytd-mini-guide-entry-renderer[aria-label="Shorts"], ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',

    // End screens
    endScreenElements: '.ytp-ce-element, .ytp-endscreen-content',

    // Masthead & Comments
    masthead: '#masthead-container',
    comments: '#comments, ytd-comments',
  };

  const CSS_CLASSES = {
    WINDOW_FULLSCREEN_ACTIVE: 'yt-focus-window-fullscreen',
    FOCUS_MODE_ACTIVE: 'yt-focus-mode-active',
    HIDE_COMMENTS: 'yt-focus-hide-comments',
    PLAYER_BUTTON: 'yt-focus-player-btn',
    PLAYER_BUTTON_ACTIVE: 'yt-focus-player-btn-active',
    STATUS_PILL: 'yt-focus-status-pill',
    HOME_FOCUS_HUB: 'yt-focus-home-hub',
    COOLDOWN_OVERLAY: 'yt-focus-cooldown-overlay',
    SCHEDULE_OVERLAY: 'yt-focus-schedule-overlay',
    COURSE_BANNER: 'yt-focus-course-banner',
    QUICK_ADD_BTN: 'yt-focus-quick-add-btn',
    QUICK_ADD_PLAYLIST_BTN: 'yt-focus-quick-playlist-btn',
    SHORTS_BLOCK_OVERLAY: 'yt-focus-shorts-block-overlay',
    VIDEO_BLOCK_OVERLAY: 'yt-focus-video-block-overlay',
    SEARCH_BLOCK_OVERLAY: 'yt-focus-search-block-overlay',
    TOAST_CONTAINER: 'yt-focus-toast-container',
    TOAST: 'yt-focus-toast',
  };

  const SHORTCUTS = {
    WINDOW_FULLSCREEN: 'W',
    FOCUS_MODE: 'Alt+F',
    EXIT_FULLSCREEN: 'Escape',
  };

  function formatTime12(timeStr) {
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

  const YTF_CONSTANTS = {
    ACTIONS,
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    SELECTORS,
    CSS_CLASSES,
    SHORTCUTS,
    formatTime12,
  };

  root.YTF_CONSTANTS = YTF_CONSTANTS;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = YTF_CONSTANTS;
  }
})(typeof self !== 'undefined' ? self : this);

