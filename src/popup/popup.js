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
  const limitProgressVal = document.getElementById('limit-progress-val');
  const metricGoalVal = document.getElementById('metric-goal-val');
  const goalProgressBar = document.getElementById('goal-progress-bar');

  const toggleFocusMode = document.getElementById('toggle-focus-mode');
  const toggleWindowFs = document.getElementById('toggle-window-fullscreen');
  const focusStatusTag = document.getElementById('focus-status-tag');

  const queueSummaryText = document.getElementById('queue-summary-text');
  const queueCountBadge = document.getElementById('queue-count-badge');
  const btnQuickFs = document.getElementById('btn-quick-fs');
  const quickFsText = document.getElementById('quick-fs-text');
  const btnQuickFocus = document.getElementById('btn-quick-focus');
  const btnQuickAdd = document.getElementById('btn-quick-add');
  const quickAddText = document.getElementById('quick-add-text');
  const btnOpenQueue = document.getElementById('btn-open-queue');
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');

  const activeVideoCard = document.getElementById('active-video-card');
  const activeVideoTitle = document.getElementById('active-video-title');
  const activeVideoChannel = document.getElementById('active-video-channel');

  // Queue Drawer
  const queueDrawer = document.getElementById('queue-drawer');
  const queueDrawerClose = document.getElementById('queue-drawer-close');
  const queueItemsList = document.getElementById('queue-items-list');

  function formatMins(totalMins) {
    if (!totalMins) return '0m';
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
    const watchMins = Math.round(watchSecs / 60);
    const limitMins = settings.dailyLimitMinutes || 60;

    todayTimeVal.textContent = formatMins(watchMins);
    metricGoalVal.textContent = `${limitMins}m`;
    limitProgressVal.textContent = `${watchMins} / ${limitMins}m`;

    const pct = Math.min(100, Math.round((watchMins / limitMins) * 100));
    goalProgressBar.style.width = `${pct}%`;

    toggleFocusMode.checked = !!settings.focusModeEnabled;
    updateFocusTag(settings.focusModeEnabled);
  }

  function updateFocusTag(enabled) {
    if (focusStatusTag) {
      focusStatusTag.textContent = enabled ? 'ON' : 'OFF';
      focusStatusTag.classList.toggle('on', !!enabled);
    }
  }

  function setNotOnYouTube() {
    isTabOnYouTube = false;
    isContentScriptConnected = false;
    tabStatusPill.className = 'tab-status-pill status-offline';
    tabStatusText.textContent = 'Not on YouTube';
    connectionAlert.classList.add('hidden');
    toggleWindowFs.disabled = true;
    btnQuickFs.disabled = true;
    btnQuickAdd.disabled = true;
    activeVideoCard.classList.add('hidden');
  }

  function setIntegrationUnavailable() {
    isTabOnYouTube = true;
    isContentScriptConnected = false;
    tabStatusPill.className = 'tab-status-pill status-warning';
    tabStatusText.textContent = 'Needs Reload';
    connectionAlert.classList.remove('hidden');
    toggleWindowFs.disabled = true;
    btnQuickFs.disabled = true;
    btnQuickAdd.disabled = true;
    activeVideoCard.classList.add('hidden');
  }

  function setConnectedOnYouTube() {
    isTabOnYouTube = true;
    isContentScriptConnected = true;
    tabStatusPill.className = 'tab-status-pill status-online';
    tabStatusText.textContent = 'Active on YouTube';
    connectionAlert.classList.add('hidden');
    toggleWindowFs.disabled = false;
    btnQuickFs.disabled = false;
    btnQuickAdd.disabled = false;
  }

  /**
   * Safe PING Handshake to check if content script is running
   */
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
        console.warn('[YTF] PING failed:', err.message);
      }

      if (!pingResult || !pingResult.connected) {
        setIntegrationUnavailable();
        return;
      }

      setConnectedOnYouTube();

      // Retrieve live page status
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: ACTIONS.GET_STATUS || 'GET_STATUS' });
        if (response) {
          if (typeof response.focusModeEnabled === 'boolean') {
            toggleFocusMode.checked = response.focusModeEnabled;
            updateFocusTag(response.focusModeEnabled);
          }

          if (typeof response.isWindowFullscreen === 'boolean') {
            toggleWindowFs.checked = response.isWindowFullscreen;
            quickFsText.textContent = response.isWindowFullscreen ? 'Exit Fullscreen' : 'Window Fullscreen';
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
      console.warn('[YTF] Tab query error:', err);
      setNotOnYouTube();
    }
  }

  async function showActiveVideoCard(videoInfo, isFs) {
    if (!videoInfo || !videoInfo.title) return;

    activeVideoCard.classList.remove('hidden');
    activeVideoTitle.textContent = videoInfo.title;
    activeVideoChannel.textContent = `${videoInfo.channel || 'YouTube'}${videoInfo.duration ? ' • ' + videoInfo.duration : ''}`;

    const isQueued = await storage.isItemInQueue(videoInfo.videoId || videoInfo.id);
    quickAddText.textContent = isQueued ? 'In Queue ✓' : 'Add to Queue';
    quickFsText.textContent = isFs ? 'Exit Fullscreen' : 'Window Fullscreen';
  }

  async function updateQueueBadge() {
    const queue = await storage.getLearningQueue();
    const remaining = queue.filter(q => {
      if (q.type === 'playlist') return q.completedCount < q.totalCount;
      return !q.completed;
    }).length;

    queueCountBadge.textContent = remaining;
    queueSummaryText.textContent = `${queue.length} items (${remaining} remaining)`;
  }

  async function renderQueueDrawer() {
    const queue = await storage.getLearningQueue();
    queueItemsList.innerHTML = '';

    if (!queue || queue.length === 0) {
      queueItemsList.innerHTML = `
        <div class="empty-state">
          <p>No items in your queue.</p>
          <span class="empty-hint">Click "+ Add to Queue" on YouTube or in the dashboard to save videos intentionally.</span>
        </div>
      `;
      return;
    }

    queue.forEach(item => {
      const card = document.createElement('div');
      card.style.display = 'flex';
      card.style.alignItems = 'center';
      card.style.gap = '10px';
      card.style.padding = '8px 10px';
      card.style.backgroundColor = 'var(--bg-surface)';
      card.style.borderRadius = 'var(--radius-sm)';
      card.style.border = '1px solid var(--border-subtle)';

      const isCompleted = item.type === 'playlist' ? (item.completedCount === item.totalCount && item.totalCount > 0) : item.completed;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !!isCompleted;
      check.addEventListener('change', async () => {
        await storage.toggleQueueItem(item.id);
        await renderQueueDrawer();
        await updateQueueBadge();
      });

      const info = document.createElement('div');
      info.style.flex = '1';
      info.style.minWidth = '0';

      const title = document.createElement('a');
      title.href = item.sourceUrl || item.url;
      title.target = '_blank';
      title.textContent = item.title;
      title.style.color = isCompleted ? 'var(--text-muted)' : 'var(--text-primary)';
      title.style.textDecoration = isCompleted ? 'line-through' : 'none';
      title.style.fontSize = '12px';
      title.style.fontWeight = '500';
      title.style.display = 'block';
      title.style.whiteSpace = 'nowrap';
      title.style.overflow = 'hidden';
      title.style.textOverflow = 'ellipsis';

      const meta = document.createElement('div');
      meta.style.fontSize = '10px';
      meta.style.color = 'var(--text-muted)';
      meta.textContent = item.type === 'playlist'
        ? `Playlist • ${item.completedCount}/${item.totalCount} completed`
        : (item.channelTitle || item.channel || 'YouTube');

      info.appendChild(title);
      info.appendChild(meta);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '×';
      delBtn.style.background = 'transparent';
      delBtn.style.border = 'none';
      delBtn.style.color = 'var(--text-muted)';
      delBtn.style.fontSize = '16px';
      delBtn.style.cursor = 'pointer';
      delBtn.addEventListener('click', async () => {
        await storage.removeFromLearningQueue(item.id);
        await renderQueueDrawer();
        await updateQueueBadge();
      });

      card.appendChild(check);
      card.appendChild(info);
      card.appendChild(delBtn);
      queueItemsList.appendChild(card);
    });
  }

  function bindEvents() {
    // Window Fullscreen Toggle
    toggleWindowFs.addEventListener('change', async () => {
      if (!isContentScriptConnected || !activeTab) return;
      try {
        const response = await chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.TOGGLE_FULLSCREEN || 'TOGGLE_FULLSCREEN'
        });
        if (response) {
          toggleWindowFs.checked = response.isWindowFullscreen;
          quickFsText.textContent = response.isWindowFullscreen ? 'Exit Fullscreen' : 'Window Fullscreen';
        }
      } catch (err) {
        console.warn('[YTF] Toggle fullscreen error:', err);
      }
    });

    // Quick Fullscreen Button
    btnQuickFs.addEventListener('click', () => {
      toggleWindowFs.click();
    });

    // Focus Mode Toggle
    toggleFocusMode.addEventListener('change', async () => {
      const targetState = toggleFocusMode.checked;
      updateFocusTag(targetState);
      await storage.saveSettings({ focusModeEnabled: targetState });

      if (isContentScriptConnected && activeTab) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.TOGGLE_FOCUS || 'TOGGLE_FOCUS',
          enabled: targetState
        }).catch(() => {});
      }
    });

    // Quick Focus Button
    btnQuickFocus.addEventListener('click', () => {
      toggleFocusMode.click();
    });

    // Quick Add Button
    btnQuickAdd.addEventListener('click', async () => {
      if (!isContentScriptConnected || !activeTab) {
        chrome.runtime.openOptionsPage();
        return;
      }
      try {
        const res = await chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.ADD_TO_QUEUE || 'ADD_TO_QUEUE'
        });
        if (res && res.success) {
          quickAddText.textContent = 'In Queue ✓';
          await updateQueueBadge();
        }
      } catch (err) {
        console.warn('[YTF] Quick add error:', err);
      }
    });

    // Open Queue Drawer
    btnOpenQueue.addEventListener('click', async () => {
      await renderQueueDrawer();
      queueDrawer.classList.remove('hidden');
    });

    queueDrawerClose.addEventListener('click', () => {
      queueDrawer.classList.add('hidden');
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
