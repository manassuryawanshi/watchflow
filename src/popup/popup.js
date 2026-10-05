/**
 * YouTube Focus - Popup Script
 * Coordinates UI with storage and active YouTube tab via safe PING handshake.
 */

(function () {
  'use strict';

  const { ACTIONS } = window.YTF_CONSTANTS || {
    ACTIONS: {
      PING: 'PING',
      GET_STATUS: 'GET_STATUS',
      TOGGLE_FULLSCREEN: 'TOGGLE_FULLSCREEN',
      TOGGLE_FOCUS: 'TOGGLE_FOCUS',
      ADD_TO_QUEUE: 'ADD_TO_QUEUE',
      SETTINGS_CHANGED: 'SETTINGS_CHANGED',
    }
  };
  const storage = window.YTF_STORAGE;

  let activeTab = null;
  let currentVideoInfo = null;
  let isTabOnYouTube = false;
  let isContentScriptConnected = false;

  // DOM Elements
  const tabStatusPill = document.getElementById('tab-status');
  const tabStatusText = document.getElementById('tab-status-text');
  const connectionAlert = document.getElementById('connection-alert');
  const btnReloadYouTube = document.getElementById('btn-reload-youtube');

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

  async function init() {
    await loadSettingsAndStats();
    await checkActiveTab();
    await updateQueueBadge();
    bindEvents();
  }

  async function loadSettingsAndStats() {
    const settings = await storage.getSettings();
    const { today } = await storage.getDailyStats();

    const watchSecs = today ? (today.watchTimeSeconds || 0) : 0;
    todayTimeVal.textContent = formatSeconds(watchSecs);
    sessionTimeVal.textContent = formatSeconds(watchSecs);

    const goalMins = settings.dailyLimitMinutes || 90;
    metricGoalVal.textContent = `${goalMins}m`;

    const pct = Math.min(100, Math.round(((watchSecs / 60) / goalMins) * 100));
    goalProgressBar.style.width = `${pct}%`;

    toggleFocusMode.checked = !!settings.focusModeEnabled;

    settingHideHome.checked = !!settings.hideHomeFeed;
    settingHideShorts.checked = !!settings.hideShorts;
    settingHideRecs.checked = !!settings.hideRecommendations;
    settingHideEndscreens.checked = !!settings.hideEndScreens;
    settingHideComments.checked = !!settings.hideComments;
  }

  function setNotOnYouTube() {
    isTabOnYouTube = false;
    isContentScriptConnected = false;
    tabStatusPill.className = 'tab-status-pill status-offline';
    tabStatusText.textContent = 'Not on YouTube';
    connectionAlert.classList.add('hidden');
    toggleWindowFs.disabled = true;
    activeVideoCard.classList.add('hidden');
  }

  function setIntegrationUnavailable() {
    isTabOnYouTube = true;
    isContentScriptConnected = false;
    tabStatusPill.className = 'tab-status-pill status-warning';
    tabStatusText.textContent = 'Integration Unavailable';
    connectionAlert.classList.remove('hidden');
    toggleWindowFs.disabled = true;
    activeVideoCard.classList.add('hidden');
  }

  function setConnectedOnYouTube() {
    isTabOnYouTube = true;
    isContentScriptConnected = true;
    tabStatusPill.className = 'tab-status-pill status-online';
    tabStatusText.textContent = 'Active on YouTube';
    connectionAlert.classList.add('hidden');
    toggleWindowFs.disabled = false;
  }

  /**
   * Safe PING Handshake to check if content script is actually running in tab
   */
  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tab;

      if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
        setNotOnYouTube();
        return;
      }

      // Tab URL is on YouTube; now check if content script receiver is responsive
      let pingResult = null;
      try {
        pingResult = await chrome.tabs.sendMessage(tab.id, { action: ACTIONS.PING || 'PING' });
      } catch (err) {
        console.warn('[YTF] PING failed (content script not ready or tab needs reload):', err.message);
      }

      if (!pingResult || !pingResult.connected) {
        setIntegrationUnavailable();
        return;
      }

      // Handshake succeeded!
      setConnectedOnYouTube();

      // Retrieve live page status
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: ACTIONS.GET_STATUS || 'GET_STATUS' });
        if (response) {
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
        }
      } catch (err) {
        console.warn('[YTF] GET_STATUS error:', err.message);
      }
    } catch (err) {
      console.warn('[YTF] Active tab query error:', err);
      setNotOnYouTube();
    }
  }

  async function showActiveVideoCard(videoInfo, isFs) {
    if (!videoInfo || !videoInfo.title) return;

    activeVideoCard.classList.remove('hidden');
    activeVideoTitle.textContent = videoInfo.title;
    activeVideoChannel.textContent = `${videoInfo.channel || 'YouTube'}${videoInfo.duration ? ' • ' + videoInfo.duration : ''}`;

    const queue = await storage.getLearningQueue();
    const alreadyInQueue = queue.some(item => item.url === videoInfo.url || (item.id && item.id === videoInfo.id));

    if (alreadyInQueue) {
      addQueueText.textContent = 'In Queue ✓';
      btnAddQueue.classList.add('btn-secondary');
    } else {
      addQueueText.textContent = 'Add to Queue';
      btnAddQueue.classList.remove('btn-secondary');
    }

    quickFsText.textContent = isFs ? 'Exit Window Fullscreen' : 'Window Fullscreen';
  }

  async function updateQueueBadge() {
    const queue = await storage.getLearningQueue();
    const pendingCount = queue.filter(q => !q.completed).length;
    queueCountBadge.textContent = pendingCount;
  }

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

  function bindEvents() {
    // Reload YouTube Tab Button
    btnReloadYouTube.addEventListener('click', async () => {
      if (activeTab && activeTab.id) {
        btnReloadYouTube.textContent = 'Reloading...';
        await chrome.tabs.reload(activeTab.id);
        window.close();
      }
    });

    // Focus Mode Toggle
    toggleFocusMode.addEventListener('change', async () => {
      const isChecked = toggleFocusMode.checked;
      await storage.saveSettings({ focusModeEnabled: isChecked });

      if (isContentScriptConnected && activeTab && activeTab.id) {
        try {
          await chrome.tabs.sendMessage(activeTab.id, {
            action: ACTIONS.TOGGLE_FOCUS || 'TOGGLE_FOCUS',
            enabled: isChecked
          });
        } catch (err) {
          console.warn('[YTF] Failed to message tab for focus toggle:', err.message);
        }
      }
    });

    // Window Fullscreen Toggle
    toggleWindowFs.addEventListener('change', async () => {
      if (isContentScriptConnected && activeTab && activeTab.id) {
        try {
          const response = await chrome.tabs.sendMessage(activeTab.id, {
            action: ACTIONS.TOGGLE_FULLSCREEN || 'TOGGLE_FULLSCREEN'
          });
          if (response && typeof response.isWindowFullscreen === 'boolean') {
            toggleWindowFs.checked = response.isWindowFullscreen;
            quickFsText.textContent = response.isWindowFullscreen ? 'Exit Window Fullscreen' : 'Window Fullscreen';
          }
        } catch (err) {
          console.warn('[YTF] Failed to message tab for fullscreen toggle:', err.message);
        }
      }
    });

    // Quick Window Fullscreen button
    btnQuickFs.addEventListener('click', async () => {
      if (isContentScriptConnected && activeTab && activeTab.id) {
        try {
          const response = await chrome.tabs.sendMessage(activeTab.id, {
            action: ACTIONS.TOGGLE_FULLSCREEN || 'TOGGLE_FULLSCREEN'
          });
          if (response && typeof response.isWindowFullscreen === 'boolean') {
            toggleWindowFs.checked = response.isWindowFullscreen;
            quickFsText.textContent = response.isWindowFullscreen ? 'Exit Window Fullscreen' : 'Window Fullscreen';
          }
        } catch (err) {
          console.warn('[YTF] Failed to message tab for quick fullscreen:', err.message);
        }
      }
    });

    // Add to Queue button
    btnAddQueue.addEventListener('click', async () => {
      if (!currentVideoInfo) return;
      await storage.addToLearningQueue(currentVideoInfo);
      addQueueText.textContent = 'In Queue ✓';
      btnAddQueue.classList.add('btn-secondary');
      updateQueueBadge();
    });

    // Drawer Toggles
    btnOpenQueue.addEventListener('click', () => {
      renderQueueDrawer();
      queueDrawer.classList.remove('hidden');
    });

    queueDrawerClose.addEventListener('click', () => {
      queueDrawer.classList.add('hidden');
    });

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
        if (isContentScriptConnected && activeTab && activeTab.id) {
          try {
            await chrome.tabs.sendMessage(activeTab.id, {
              action: ACTIONS.SETTINGS_CHANGED || 'SETTINGS_CHANGED',
              settings: saved
            });
          } catch (err) {
            console.warn('[YTF] Failed to notify tab of settings change:', err.message);
          }
        }
      });
    }

    // Open Dashboard Button
    btnOpenDashboard.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
    });
  }

  init();
})();
