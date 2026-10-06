/**
 * WatchFlow - Popup Script
 * Coordinates UI with storage and active YouTube tab.
 * Authentic WatchFlow dark theme with master switch, playlist detection, and queue preview.
 */

(function () {
  'use strict';

  const { ACTIONS } = window.YTF_CONSTANTS || {
    ACTIONS: {
      PING: 'PING',
      GET_STATUS: 'GET_STATUS',
      TOGGLE_EXTENSION: 'TOGGLE_EXTENSION',
      TOGGLE_FULLSCREEN: 'TOGGLE_FULLSCREEN',
      TOGGLE_FOCUS: 'TOGGLE_FOCUS',
      ADD_TO_QUEUE: 'ADD_TO_QUEUE',
      ADD_PLAYLIST_TO_QUEUE: 'ADD_PLAYLIST_TO_QUEUE',
      GET_PLAYLIST_CONTEXT: 'GET_PLAYLIST_CONTEXT'
    }
  };
  const storage = window.YTF_STORAGE;

  let activeTab = null;
  let currentVideoInfo = null;
  let currentPlaylistInfo = null;
  let currentPlaylistContext = null;
  let isTabOnYouTube = false;
  let isContentScriptConnected = false;

  // DOM Elements - Shell & Views
  const disabledView = document.getElementById('extension-disabled-view');
  const activeView = document.getElementById('extension-active-view');
  const btnEnableExtension = document.getElementById('btn-enable-extension');

  // DOM Elements - Header & Status
  const tabStatusPill = document.getElementById('tab-status');
  const tabStatusText = document.getElementById('tab-status-text');
  const connectionAlert = document.getElementById('connection-alert');
  const btnReloadYouTube = document.getElementById('btn-reload-youtube');

  // DOM Elements - Watch Time
  const todayTimeVal = document.getElementById('today-time-val');
  const limitProgressVal = document.getElementById('limit-progress-val');
  const metricGoalVal = document.getElementById('metric-goal-val');
  const metricGoalLabel = document.getElementById('metric-goal-label');
  const goalProgressBar = document.getElementById('goal-progress-bar');
  const goalProgressTrack = document.getElementById('goal-progress-track');

  // DOM Elements - Controls
  const toggleMasterExt = document.getElementById('toggle-master-extension');
  const toggleFocusMode = document.getElementById('toggle-focus-mode');
  const toggleWindowFs = document.getElementById('toggle-window-fullscreen');

  // DOM Elements - Media Context
  const currentVideoCard = document.getElementById('current-video-card');
  const currVidThumb = document.getElementById('curr-vid-thumb');
  const currVidThumbFallback = document.getElementById('curr-vid-thumb-fallback');
  const currVidTitle = document.getElementById('curr-vid-title');
  const currVidMeta = document.getElementById('curr-vid-meta');

  const playlistDetectedCard = document.getElementById('playlist-detected-card');
  const currPlTitle = document.getElementById('curr-pl-title');
  const currPlIdx = document.getElementById('curr-pl-idx');

  const btnQuickAdd = document.getElementById('btn-quick-add');
  const quickAddText = document.getElementById('quick-add-text');
  const btnQuickAddPlaylist = document.getElementById('btn-quick-add-playlist');
  const quickAddPlText = document.getElementById('quick-add-pl-text');

  // DOM Elements - Queue Preview
  const queueSummaryText = document.getElementById('queue-summary-text');
  const queuePreviewList = document.getElementById('queue-preview-list');
  const queueViewAllRow = document.getElementById('queue-view-all-row');
  const btnViewAllQueue = document.getElementById('btn-view-all-queue');
  const viewAllText = document.getElementById('view-all-text');

  // DOM Elements - Nav
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');

  function formatMins(totalMins) {
    if (!totalMins) return '0m';
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function init() {
    await loadSettingsAndStats();
    await checkActiveTab();
    await renderQueuePreview();
    bindEvents();
  }

  async function loadSettingsAndStats() {
    const settings = await storage.getSettings();
    const isExtEnabled = settings.extensionEnabled !== false;

    // Apply Master Extension view state (Section 4)
    if (!isExtEnabled) {
      disabledView.classList.remove('hidden');
      activeView.classList.add('hidden');
      tabStatusPill.className = 'tab-status-pill status-offline';
      tabStatusText.textContent = 'Disabled';
      return;
    } else {
      disabledView.classList.add('hidden');
      activeView.classList.remove('hidden');
      toggleMasterExt.checked = true;
    }

    const { today } = await storage.getDailyStats();
    const watchSecs = today ? (today.watchTimeSeconds || 0) : 0;
    const watchMins = Math.round(watchSecs / 60);
    const limitMins = typeof settings.dailyLimitMinutes === 'number' ? settings.dailyLimitMinutes : 60;

    todayTimeVal.textContent = formatMins(watchMins);

    if (limitMins === 0) {
      // No Limit mode (Section 15)
      metricGoalLabel.textContent = 'Daily Limit: No Limit';
      limitProgressVal.textContent = `${watchMins}m (No Limit)`;
      goalProgressBar.style.width = '0%';
      goalProgressTrack.style.display = 'none';
    } else {
      goalProgressTrack.style.display = 'block';
      metricGoalLabel.innerHTML = `Limit: <span id="metric-goal-val">${limitMins}m</span>`;
      limitProgressVal.textContent = `${watchMins} / ${limitMins}m`;
      const pct = Math.min(100, Math.round((watchMins / limitMins) * 100));
      goalProgressBar.style.width = `${pct}%`;
    }

    toggleFocusMode.checked = !!settings.focusModeEnabled;
  }

  function setNotOnYouTube() {
    isTabOnYouTube = false;
    isContentScriptConnected = false;
    tabStatusPill.className = 'tab-status-pill status-offline';
    tabStatusText.textContent = 'Not on YouTube';
    connectionAlert.classList.add('hidden');
    toggleWindowFs.disabled = true;
    btnQuickAdd.disabled = true;
    btnQuickAddPlaylist.disabled = true;
    currVidTitle.textContent = 'Not on YouTube watch page';
    currVidMeta.textContent = 'Open YouTube to enable playback controls';
    currVidThumb.classList.add('hidden');
    currVidThumbFallback.classList.remove('hidden');
    playlistDetectedCard.classList.add('hidden');
    btnQuickAddPlaylist.classList.add('hidden');
  }

  function setIntegrationUnavailable() {
    isTabOnYouTube = true;
    isContentScriptConnected = false;
    tabStatusPill.className = 'tab-status-pill status-warning';
    tabStatusText.textContent = 'Needs Reload';
    connectionAlert.classList.remove('hidden');
    toggleWindowFs.disabled = true;
    btnQuickAdd.disabled = true;
    btnQuickAddPlaylist.disabled = true;
  }

  function setConnectedOnYouTube() {
    isTabOnYouTube = true;
    isContentScriptConnected = true;
    tabStatusPill.className = 'tab-status-pill status-online';
    tabStatusText.textContent = 'Active on YouTube';
    connectionAlert.classList.add('hidden');
    toggleWindowFs.disabled = false;
  }

  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tab;

      if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
        setNotOnYouTube();
        return;
      }

      let pingResult = null;
      try {
        pingResult = await chrome.tabs.sendMessage(tab.id, { action: ACTIONS.PING || 'PING' });
      } catch (err) {
        console.warn('[WatchFlow] PING failed:', err.message);
      }

      if (!pingResult || !pingResult.connected) {
        setIntegrationUnavailable();
        return;
      }

      setConnectedOnYouTube();

      // Retrieve live page status & playlist context
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: ACTIONS.GET_STATUS || 'GET_STATUS' });
        if (response) {
          if (typeof response.focusModeEnabled === 'boolean') {
            toggleFocusMode.checked = response.focusModeEnabled;
          }

          if (typeof response.isWindowFullscreen === 'boolean') {
            toggleWindowFs.checked = response.isWindowFullscreen;
          }

          // Handle Video Context
          if (response.videoInfo && response.videoInfo.videoId) {
            currentVideoInfo = response.videoInfo;
            currVidTitle.textContent = response.videoInfo.title || 'YouTube Video';
            currVidMeta.textContent = `${response.videoInfo.channelTitle || 'YouTube'}${response.videoInfo.duration ? ` · ${response.videoInfo.duration}` : ''}`;
            
            if (response.videoInfo.thumbnail) {
              currVidThumb.src = response.videoInfo.thumbnail;
              currVidThumb.classList.remove('hidden');
              currVidThumbFallback.classList.add('hidden');
            }

            btnQuickAdd.disabled = false;
            const isVidQueued = await storage.isVideoInQueue(response.videoInfo.videoId);
            btnQuickAdd.classList.toggle('queued', isVidQueued);
            quickAddText.textContent = isVidQueued ? 'In Queue ✓' : '+ Add Video';
          } else {
            currVidTitle.textContent = 'No active video playing';
            currVidMeta.textContent = 'YouTube';
            currVidThumb.classList.add('hidden');
            currVidThumbFallback.classList.remove('hidden');
            btnQuickAdd.disabled = true;
          }

          // Handle Playlist Context (Section 5 & 8)
          const plCtx = response.playlistContext || (response.playlistInfo?.playlistId ? {
            isInPlaylist: true,
            playlistId: response.playlistInfo.playlistId,
            playlistTitle: response.playlistInfo.title,
            currentIndex: response.playlistInfo.currentIndex,
            totalCount: response.playlistInfo.totalCount
          } : null);

          if (plCtx && plCtx.isInPlaylist && plCtx.playlistId) {
            currentPlaylistContext = plCtx;
            currentPlaylistInfo = response.playlistInfo || {
              type: 'playlist',
              playlistId: plCtx.playlistId,
              title: plCtx.playlistTitle || 'YouTube Playlist',
              sourceUrl: `https://www.youtube.com/playlist?list=${plCtx.playlistId}`,
              totalCount: plCtx.totalCount || 0
            };

            playlistDetectedCard.classList.remove('hidden');
            btnQuickAddPlaylist.classList.remove('hidden');
            btnQuickAddPlaylist.disabled = false;

            currPlTitle.textContent = plCtx.playlistTitle || 'YouTube Playlist';
            if (plCtx.currentIndex && plCtx.totalCount) {
              currPlIdx.textContent = `Lesson ${plCtx.currentIndex} of ${plCtx.totalCount}`;
            } else if (plCtx.totalCount) {
              currPlIdx.textContent = `${plCtx.totalCount} lessons`;
            } else {
              currPlIdx.textContent = 'Playlist active';
            }

            const isPlQueued = await storage.isPlaylistInQueue(plCtx.playlistId);
            btnQuickAddPlaylist.classList.toggle('queued', isPlQueued);
            quickAddPlText.textContent = isPlQueued ? 'Playlist Queued ✓' : '+ Add Playlist';
          } else {
            currentPlaylistContext = null;
            currentPlaylistInfo = null;
            playlistDetectedCard.classList.add('hidden');
            btnQuickAddPlaylist.classList.add('hidden');
            btnQuickAddPlaylist.disabled = true;
          }
        }
      } catch (err) {
        console.warn('[WatchFlow] GET_STATUS error:', err.message);
      }
    } catch (err) {
      console.warn('[WatchFlow] Tab query error:', err);
      setNotOnYouTube();
    }
  }

  // Render 3-4 Queue Items Directly in Popup (Section 12)
  async function renderQueuePreview() {
    const queue = await storage.getLearningQueue();
    const count = queue.length;
    queueSummaryText.textContent = `${count} item${count === 1 ? '' : 's'}`;

    queuePreviewList.innerHTML = '';

    if (count === 0) {
      queuePreviewList.innerHTML = `
        <div class="queue-empty-state">
          Queue is empty · Add videos or playlists above
        </div>
      `;
      queueViewAllRow.classList.add('hidden');
      return;
    }

    const previewItems = queue.slice(0, 3);

    previewItems.forEach(item => {
      const isPl = item.type === 'playlist';
      const el = document.createElement('div');
      el.className = 'queue-preview-item';
      
      const thumbUrl = item.thumbnail || (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` : '');
      const badgeText = isPl ? 'Playlist' : 'Video';
      
      let metaDetails = '';
      if (isPl) {
        const total = item.totalCount || item.videos?.length || 0;
        const comp = item.completedCount || (item.videos ? item.videos.filter(v => v.completed).length : 0);
        const pct = total > 0 ? Math.round((comp / total) * 100) : 0;
        metaDetails = `${total} lessons${pct > 0 ? ` · <span class="queue-item-progress">${pct}% complete</span>` : ''}`;
      } else {
        metaDetails = item.duration || 'Video';
      }

      el.innerHTML = `
        <img class="queue-item-thumb" src="${thumbUrl}" alt="Thumbnail" onerror="this.style.display='none'">
        <div class="queue-item-info">
          <div class="queue-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="queue-item-meta">
            <span class="queue-item-badge ${isPl ? 'badge-playlist' : ''}">${badgeText}</span>
            <span>${metaDetails}</span>
          </div>
        </div>
      `;

      el.addEventListener('click', () => {
        const destUrl = item.sourceUrl || item.url || (item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : '');
        if (destUrl) {
          chrome.tabs.create({ url: destUrl });
        }
      });

      queuePreviewList.appendChild(el);
    });

    if (count > 3) {
      queueViewAllRow.classList.remove('hidden');
      viewAllText.textContent = `View all ${count} items →`;
    } else {
      queueViewAllRow.classList.add('hidden');
    }
  }

  function bindEvents() {
    // Master Extension Toggle (Section 4)
    toggleMasterExt.addEventListener('change', async () => {
      const targetState = toggleMasterExt.checked;
      await storage.saveSettings({ extensionEnabled: targetState });

      if (isContentScriptConnected && activeTab) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.TOGGLE_EXTENSION || 'TOGGLE_EXTENSION',
          enabled: targetState
        }).catch(() => {});
      }

      if (!targetState) {
        disabledView.classList.remove('hidden');
        activeView.classList.add('hidden');
        tabStatusPill.className = 'tab-status-pill status-offline';
        tabStatusText.textContent = 'Disabled';
      }
    });

    // Turn On button from disabled view
    btnEnableExtension.addEventListener('click', async () => {
      await storage.saveSettings({ extensionEnabled: true });
      toggleMasterExt.checked = true;
      disabledView.classList.add('hidden');
      activeView.classList.remove('hidden');

      if (activeTab && activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.TOGGLE_EXTENSION || 'TOGGLE_EXTENSION',
          enabled: true
        }).catch(() => {});
      }

      await checkActiveTab();
    });

    // Window Fullscreen Toggle
    toggleWindowFs.addEventListener('change', async () => {
      if (!isContentScriptConnected || !activeTab) return;
      try {
        const response = await chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.TOGGLE_FULLSCREEN || 'TOGGLE_FULLSCREEN'
        });
        if (response) {
          toggleWindowFs.checked = response.isWindowFullscreen;
        }
      } catch (err) {
        console.warn('[WatchFlow] Toggle fullscreen error:', err);
      }
    });

    // Focus Mode Toggle
    toggleFocusMode.addEventListener('change', async () => {
      const targetState = toggleFocusMode.checked;
      await storage.saveSettings({ focusModeEnabled: targetState });

      if (isContentScriptConnected && activeTab) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.TOGGLE_FOCUS || 'TOGGLE_FOCUS',
          enabled: targetState
        }).catch(() => {});
      }
    });

    // Add Current Video Button (Section 7)
    btnQuickAdd.addEventListener('click', async () => {
      if (!currentVideoInfo || !currentVideoInfo.videoId) return;
      const alreadyQueued = await storage.isVideoInQueue(currentVideoInfo.videoId);
      if (alreadyQueued) {
        return;
      }
      await storage.addVideoToQueue(currentVideoInfo);
      btnQuickAdd.classList.add('queued');
      quickAddText.textContent = 'In Queue ✓';
      await renderQueuePreview();
    });

    // Add Playlist Button (Section 7 & 8)
    btnQuickAddPlaylist.addEventListener('click', async () => {
      if (!currentPlaylistInfo || !currentPlaylistInfo.playlistId) return;
      const alreadyQueued = await storage.isPlaylistInQueue(currentPlaylistInfo.playlistId);
      if (alreadyQueued) {
        return;
      }
      await storage.addPlaylistToQueue(currentPlaylistInfo);
      btnQuickAddPlaylist.classList.add('queued');
      quickAddPlText.textContent = 'Playlist Queued ✓';
      await renderQueuePreview();
    });

    // View All in Learning Queue
    btnViewAllQueue.addEventListener('click', () => {
      const url = chrome.runtime.getURL('src/dashboard/dashboard.html#learning');
      chrome.tabs.create({ url });
    });

    // Open Dashboard Button
    btnOpenDashboard.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Reload tab button on connection alert
    btnReloadYouTube.addEventListener('click', () => {
      if (activeTab && activeTab.id) {
        chrome.tabs.reload(activeTab.id, () => window.close());
      }
    });
  }

  init();
})();
