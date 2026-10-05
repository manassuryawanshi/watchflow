/**
 * YouTube Focus - Popup Script
 * Coordinates UI with storage and active YouTube tab.
 */

(function () {
  'use strict';

  const { ACTIONS } = window.YTF_CONSTANTS;
  const storage = window.YTF_STORAGE;

  let activeTab = null;
  let currentVideoInfo = null;
  let isTabOnYouTube = false;

  // DOM Elements
  const tabStatusPill = document.getElementById('tab-status');
  const tabStatusText = document.getElementById('tab-status-text');
  const todayTimeVal = document.getElementById('today-time-val');
  const sessionTimeVal = document.getElementById('session-time-val');
  const metricGoalVal = document.getElementById('metric-goal-val');
  const goalProgressBar = document.getElementById('goal-progress-bar');

  const toggleFocusMode = document.getElementById('toggle-focus-mode');
  const toggleWindowFs = document.getElementById('toggle-window-fullscreen');

  const activeVideoCard = document.getElementById('active-video-card');
  const activeVideoTitle = document.getElementById('active-video-title');
  const activeVideoChannel = document.getElementById('active-video-channel');
  const btnQuickFs = document.getElementById('btn-quick-window-fs');
  const quickFsText = document.getElementById('quick-fs-text');
  const btnAddQueue = document.getElementById('btn-add-queue');
  const addQueueText = document.getElementById('add-queue-text');
  const queueCountBadge = document.getElementById('queue-count-badge');

  // Drawers
  const btnOpenQueue = document.getElementById('btn-open-queue');
  const queueDrawer = document.getElementById('queue-drawer');
  const queueDrawerClose = document.getElementById('queue-drawer-close');
  const queueItemsList = document.getElementById('queue-items-list');

  const btnOpenSettings = document.getElementById('btn-open-settings');
  const settingsDrawer = document.getElementById('settings-drawer');
  const settingsDrawerClose = document.getElementById('settings-drawer-close');
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');

  // Settings Checkboxes
  const settingHideHome = document.getElementById('setting-hide-home');
  const settingHideShorts = document.getElementById('setting-hide-shorts');
  const settingHideRecs = document.getElementById('setting-hide-recs');
  const settingHideEndscreens = document.getElementById('setting-hide-endscreens');
  const settingHideComments = document.getElementById('setting-hide-comments');

  /**
   * Format seconds to concise readable string
   */
  function formatSeconds(totalSeconds) {
    if (!totalSeconds || totalSeconds < 60) {
      return `${Math.round(totalSeconds || 0)}s`;
    }
    const mins = Math.floor(totalSeconds / 60);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours > 0) {
      return `${hours}h ${remMins}m`;
    }
    return `${mins}m`;
  }

  /**
   * Initialize Popup
   */
  async function init() {
    await loadSettingsAndStats();
    await checkActiveTab();
    await updateQueueBadge();
    bindEvents();
  }

  /**
   * Load stored settings and stats
   */
  async function loadSettingsAndStats() {
    const settings = await storage.getSettings();
    const { today } = await storage.getDailyStats();

    // Stats
    const watchSecs = today ? (today.watchTimeSeconds || 0) : 0;
    todayTimeVal.textContent = formatSeconds(watchSecs);
    sessionTimeVal.textContent = formatSeconds(watchSecs);

    const goalMins = settings.dailyLimitMinutes || 90;
    metricGoalVal.textContent = `${goalMins}m`;

    const pct = Math.min(100, Math.round(((watchSecs / 60) / goalMins) * 100));
    goalProgressBar.style.width = `${pct}%`;

    // Focus toggle
    toggleFocusMode.checked = !!settings.focusModeEnabled;

    // Settings drawer checkboxes
    settingHideHome.checked = !!settings.hideHomeFeed;
    settingHideShorts.checked = !!settings.hideShorts;
    settingHideRecs.checked = !!settings.hideRecommendations;
    settingHideEndscreens.checked = !!settings.hideEndScreens;
    settingHideComments.checked = !!settings.hideComments;
  }

  /**
   * Check Active Browser Tab
   */
  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tab;

      if (tab && tab.url && tab.url.includes('youtube.com')) {
        isTabOnYouTube = true;
        tabStatusPill.className = 'tab-status-pill status-online';
        tabStatusText.textContent = 'Active on YouTube';

        // Query content script for live status
        chrome.tabs.sendMessage(tab.id, { action: ACTIONS.GET_PAGE_STATUS }, (response) => {
          if (chrome.runtime.lastError || !response) {
            // Content script might not be injected yet
            return;
          }

          if (typeof response.focusModeEnabled === 'boolean') {
            toggleFocusMode.checked = response.focusModeEnabled;
          }

          if (typeof response.isWindowFullscreen === 'boolean') {
            toggleWindowFs.checked = response.isWindowFullscreen;
            quickFsText.textContent = response.isWindowFullscreen ? 'Exit Window Fullscreen' : 'Window Fullscreen';
          }

          if (response.isWatchPage && response.videoInfo) {
            currentVideoInfo = response.videoInfo;
            showActiveVideoCard(response.videoInfo, response.isWindowFullscreen);
          } else {
            activeVideoCard.classList.add('hidden');
          }
        });
      } else {
        isTabOnYouTube = false;
        tabStatusPill.className = 'tab-status-pill status-offline';
        tabStatusText.textContent = 'Not on YouTube';
        toggleWindowFs.disabled = true;
        activeVideoCard.classList.add('hidden');
      }
    } catch (err) {
      console.warn('Error querying active tab:', err);
    }
  }

  /**
   * Render active video information
   */
  async function showActiveVideoCard(videoInfo, isFs) {
    if (!videoInfo || !videoInfo.title) return;

    activeVideoCard.classList.remove('hidden');
    activeVideoTitle.textContent = videoInfo.title;
    activeVideoChannel.textContent = `${videoInfo.channel || 'YouTube'}${videoInfo.duration ? ' • ' + videoInfo.duration : ''}`;

    // Check if video is already in learning queue
    const queue = await storage.getLearningQueue();
    const alreadyInQueue = queue.some(item => item.url === videoInfo.url || (item.id && item.id === videoInfo.id));

    if (alreadyInQueue) {
      addQueueText.textContent = 'In Queue ✓';
      btnAddQueue.classList.add('btn-secondary');
    } else {
      addQueueText.textContent = 'Add to Queue';
    }

    quickFsText.textContent = isFs ? 'Exit Window Fullscreen' : 'Window Fullscreen';
  }

  /**
   * Update Queue Count Badge
   */
  async function updateQueueBadge() {
    const queue = await storage.getLearningQueue();
    const pendingCount = queue.filter(q => !q.completed).length;
    queueCountBadge.textContent = pendingCount;
  }

  /**
   * Render Queue Items inside Drawer
   */
  async function renderQueueDrawer() {
    const queue = await storage.getLearningQueue();
    queueItemsList.innerHTML = '';

    if (!queue || queue.length === 0) {
      queueItemsList.innerHTML = `
        <div class="empty-state">
          <p>No videos in your queue.</p>
          <span class="empty-hint">Click "Add to Queue" on any YouTube video page to save it for intentional learning.</span>
        </div>
      `;
      return;
    }

    for (const item of queue) {
      const card = document.createElement('div');
      card.className = 'queue-card';

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'queue-check';
      check.checked = !!item.completed;
      check.addEventListener('change', async () => {
        await storage.toggleQueueItem(item.id);
        renderQueueDrawer();
        updateQueueBadge();
      });

      const info = document.createElement('div');
      info.className = 'queue-info';

      const link = document.createElement('a');
      link.className = `queue-title ${item.completed ? 'completed' : ''}`;
      link.href = item.url;
      link.target = '_blank';
      link.textContent = item.title;

      const meta = document.createElement('div');
      meta.className = 'queue-meta';
      meta.textContent = `${item.channel || 'YouTube'}${item.duration ? ' • ' + item.duration : ''}`;

      info.appendChild(link);
      info.appendChild(meta);

      const delBtn = document.createElement('button');
      delBtn.className = 'queue-delete';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Remove from queue';
      delBtn.addEventListener('click', async () => {
        await storage.removeFromLearningQueue(item.id);
        renderQueueDrawer();
        updateQueueBadge();
      });

      card.appendChild(check);
      card.appendChild(info);
      card.appendChild(delBtn);
      queueItemsList.appendChild(card);
    }
  }

  /**
   * Bind DOM Events
   */
  function bindEvents() {
    // Focus Mode Toggle
    toggleFocusMode.addEventListener('change', async () => {
      const isChecked = toggleFocusMode.checked;
      await storage.saveSettings({ focusModeEnabled: isChecked });

      if (isTabOnYouTube && activeTab && activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.TOGGLE_FOCUS_MODE,
          enabled: isChecked
        }).catch(() => {});
      }
    });

    // Window Fullscreen Toggle
    toggleWindowFs.addEventListener('change', () => {
      if (isTabOnYouTube && activeTab && activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.TOGGLE_WINDOW_FULLSCREEN
        }, (response) => {
          if (response && typeof response.isWindowFullscreen === 'boolean') {
            toggleWindowFs.checked = response.isWindowFullscreen;
            quickFsText.textContent = response.isWindowFullscreen ? 'Exit Window Fullscreen' : 'Window Fullscreen';
          }
        });
      }
    });

    // Quick Window Fullscreen button on active video card
    btnQuickFs.addEventListener('click', () => {
      if (isTabOnYouTube && activeTab && activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.TOGGLE_WINDOW_FULLSCREEN
        }, (response) => {
          if (response && typeof response.isWindowFullscreen === 'boolean') {
            toggleWindowFs.checked = response.isWindowFullscreen;
            quickFsText.textContent = response.isWindowFullscreen ? 'Exit Window Fullscreen' : 'Window Fullscreen';
          }
        });
      }
    });

    // Add to Queue button on active video card
    btnAddQueue.addEventListener('click', async () => {
      if (!currentVideoInfo) return;
      await storage.addToLearningQueue(currentVideoInfo);
      addQueueText.textContent = 'Added ✓';
      updateQueueBadge();
    });

    // Queue Drawer toggles
    btnOpenQueue.addEventListener('click', () => {
      renderQueueDrawer();
      queueDrawer.classList.remove('hidden');
    });

    queueDrawerClose.addEventListener('click', () => {
      queueDrawer.classList.add('hidden');
    });

    // Settings Drawer toggles
    btnOpenSettings.addEventListener('click', () => {
      settingsDrawer.classList.remove('hidden');
    });

    settingsDrawerClose.addEventListener('click', () => {
      settingsDrawer.classList.add('hidden');
    });

    // Settings Checkboxes Auto-Save
    const settingMap = [
      { el: settingHideHome, key: 'hideHomeFeed' },
      { el: settingHideShorts, key: 'hideShorts' },
      { el: settingHideRecs, key: 'hideRecommendations' },
      { el: settingHideEndscreens, key: 'hideEndScreens' },
      { el: settingHideComments, key: 'hideComments' },
    ];

    for (const { el, key } of settingMap) {
      el.addEventListener('change', async () => {
        const update = { [key]: el.checked };
        const saved = await storage.saveSettings(update);
        if (isTabOnYouTube && activeTab && activeTab.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: ACTIONS.SETTINGS_CHANGED,
            settings: saved
          }).catch(() => {});
        }
      });
    }

    // Open Dashboard Button
    btnOpenDashboard.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
    });
  }

  // Initialize
  init();
})();
