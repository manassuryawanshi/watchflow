/**
 * YouTube Focus - Dashboard Application Logic
 */

(function () {
  'use strict';

  const storage = window.YTF_STORAGE;
  const { DEFAULT_SETTINGS, ACTIONS } = window.YTF_CONSTANTS;

  let currentSettings = Object.assign({}, DEFAULT_SETTINGS);

  // Tab Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');
  const navQueueCount = document.getElementById('nav-queue-count');

  // Overview elements
  const ovWatchTime = document.getElementById('ov-watch-time');
  const ovWatchSub = document.getElementById('ov-watch-sub');
  const ovQueueCount = document.getElementById('ov-queue-count');
  const ovQueueSub = document.getElementById('ov-queue-sub');
  const ovFocusStatus = document.getElementById('ov-focus-status');

  // Focus Toggles
  const dashFocusMode = document.getElementById('dash-focus-mode');
  const dashHideHome = document.getElementById('dash-hide-home');
  const dashHideShorts = document.getElementById('dash-hide-shorts');
  const dashHideRecs = document.getElementById('dash-hide-recs');
  const dashHideEndscreens = document.getElementById('dash-hide-endscreens');
  const dashHideComments = document.getElementById('dash-hide-comments');

  // Limits
  const dashDailyLimit = document.getElementById('dash-daily-limit');
  const dashWarningLimit = document.getElementById('dash-warning-limit');
  const dashCooldownWatch = document.getElementById('dash-cooldown-watch');

  // Queue
  const addVideoForm = document.getElementById('add-video-form');
  const queueInputUrl = document.getElementById('queue-input-url');
  const queueInputTitle = document.getElementById('queue-input-title');
  const queueInputChannel = document.getElementById('queue-input-channel');
  const fullQueueList = document.getElementById('full-queue-list');
  const queueTotalTime = document.getElementById('queue-total-time');

  // Data
  const btnExportData = document.getElementById('btn-export-data');
  const btnResetDefaults = document.getElementById('btn-reset-defaults');
  const btnClearAll = document.getElementById('btn-clear-all');

  function formatMins(totalMins) {
    if (!totalMins) return '0m';
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  async function init() {
    setupNavigation();
    await loadData();
    setupEventListeners();
  }

  function setupNavigation() {
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-section');
        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        item.classList.add('active');
        const activeSection = document.getElementById(`section-${target}`);
        if (activeSection) {
          activeSection.classList.add('active');
        }
      });
    });
  }

  async function loadData() {
    currentSettings = await storage.getSettings();
    const { today } = await storage.getDailyStats();
    const queue = await storage.getLearningQueue();

    // Overview KPIs
    const todayMins = Math.round((today?.watchTimeSeconds || 0) / 60);
    ovWatchTime.textContent = formatMins(todayMins);
    ovWatchSub.textContent = `Goal: ${currentSettings.dailyLimitMinutes || 90}m`;

    const pendingCount = queue.filter(q => !q.completed).length;
    const completedCount = queue.filter(q => q.completed).length;
    ovQueueCount.textContent = pendingCount;
    ovQueueSub.textContent = `${completedCount} completed`;
    navQueueCount.textContent = pendingCount;

    ovFocusStatus.textContent = currentSettings.focusModeEnabled ? 'Active' : 'Paused';
    ovFocusStatus.className = currentSettings.focusModeEnabled ? 'kpi-val text-accent' : 'kpi-val';

    // Focus Toggles
    dashFocusMode.checked = !!currentSettings.focusModeEnabled;
    dashHideHome.checked = !!currentSettings.hideHomeFeed;
    dashHideShorts.checked = !!currentSettings.hideShorts;
    dashHideRecs.checked = !!currentSettings.hideRecommendations;
    dashHideEndscreens.checked = !!currentSettings.hideEndScreens;
    dashHideComments.checked = !!currentSettings.hideComments;

    // Limits
    dashDailyLimit.value = currentSettings.dailyLimitMinutes || 90;
    dashWarningLimit.value = currentSettings.dailyWarningMinutes || 75;
    dashCooldownWatch.value = currentSettings.cooldownWatchMinutes || 45;

    renderQueueList(queue);
  }

  function renderQueueList(queue) {
    fullQueueList.innerHTML = '';
    if (!queue || queue.length === 0) {
      fullQueueList.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--text-muted);">
          No videos in your queue. Add one above or from YouTube.
        </div>
      `;
      queueTotalTime.textContent = 'Total: 0m';
      return;
    }

    queueTotalTime.textContent = `${queue.length} items (${queue.filter(q => !q.completed).length} pending)`;

    queue.forEach(item => {
      const row = document.createElement('div');
      row.className = 'queue-row';

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !!item.completed;
      check.addEventListener('change', async () => {
        await storage.toggleQueueItem(item.id);
        const updated = await storage.getLearningQueue();
        renderQueueList(updated);
        navQueueCount.textContent = updated.filter(q => !q.completed).length;
      });

      const info = document.createElement('div');
      info.style.flex = '1';

      const title = document.createElement('a');
      title.className = `queue-row-title ${item.completed ? 'completed' : ''}`;
      title.href = item.url;
      title.target = '_blank';
      title.textContent = item.title;

      const meta = document.createElement('div');
      meta.className = 'queue-row-meta';
      meta.textContent = `${item.channel || 'YouTube'}${item.duration ? ' • ' + item.duration : ''}`;

      info.appendChild(title);
      info.appendChild(meta);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger';
      delBtn.style.padding = '4px 10px';
      delBtn.style.fontSize = '11px';
      delBtn.textContent = 'Remove';
      delBtn.addEventListener('click', async () => {
        await storage.removeFromLearningQueue(item.id);
        const updated = await storage.getLearningQueue();
        renderQueueList(updated);
        navQueueCount.textContent = updated.filter(q => !q.completed).length;
      });

      row.appendChild(check);
      row.appendChild(info);
      row.appendChild(delBtn);
      fullQueueList.appendChild(row);
    });
  }

  function setupEventListeners() {
    // Add video manually
    addVideoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = queueInputUrl.value.trim();
      const title = queueInputTitle.value.trim();
      const channel = queueInputChannel.value.trim() || 'Custom';

      if (!url || !title) return;

      await storage.addToLearningQueue({
        url,
        title,
        channel,
        id: 'vid_' + Date.now()
      });

      queueInputUrl.value = '';
      queueInputTitle.value = '';
      queueInputChannel.value = '';

      const updated = await storage.getLearningQueue();
      renderQueueList(updated);
      navQueueCount.textContent = updated.filter(q => !q.completed).length;
    });

    // Auto-save setting toggles
    const toggles = [
      { el: dashFocusMode, key: 'focusModeEnabled' },
      { el: dashHideHome, key: 'hideHomeFeed' },
      { el: dashHideShorts, key: 'hideShorts' },
      { el: dashHideRecs, key: 'hideRecommendations' },
      { el: dashHideEndscreens, key: 'hideEndScreens' },
      { el: dashHideComments, key: 'hideComments' },
    ];

    toggles.forEach(({ el, key }) => {
      el.addEventListener('change', async () => {
        const update = { [key]: el.checked };
        currentSettings = await storage.saveSettings(update);
        ovFocusStatus.textContent = currentSettings.focusModeEnabled ? 'Active' : 'Paused';
        ovFocusStatus.className = currentSettings.focusModeEnabled ? 'kpi-val text-accent' : 'kpi-val';

        // Notify tabs
        chrome.runtime.sendMessage({
          action: ACTIONS.SETTINGS_CHANGED,
          settings: currentSettings
        }).catch(() => {});
      });
    });

    // Time Management Inputs
    [
      { el: dashDailyLimit, key: 'dailyLimitMinutes' },
      { el: dashWarningLimit, key: 'dailyWarningMinutes' },
      { el: dashCooldownWatch, key: 'cooldownWatchMinutes' },
    ].forEach(({ el, key }) => {
      el.addEventListener('change', async () => {
        const val = parseInt(el.value, 10);
        if (!isNaN(val) && val > 0) {
          await storage.saveSettings({ [key]: val });
          ovWatchSub.textContent = `Goal: ${dashDailyLimit.value}m`;
        }
      });
    });

    // Export Data
    btnExportData.addEventListener('click', async () => {
      const settings = await storage.getSettings();
      const { all } = await storage.getDailyStats();
      const queue = await storage.getLearningQueue();

      const dump = {
        exportDate: new Date().toISOString(),
        settings,
        stats: all,
        queue
      };

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `youtube-focus-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Reset Defaults
    btnResetDefaults.addEventListener('click', async () => {
      if (confirm('Reset all settings to default values? Your learning queue and history will not be deleted.')) {
        await storage.resetSettings();
        await loadData();
      }
    });

    // Clear All Data
    btnClearAll.addEventListener('click', async () => {
      if (confirm('Are you sure you want to permanently delete ALL local extension data? This cannot be undone.')) {
        await chrome.storage.local.clear();
        await storage.resetSettings();
        await loadData();
      }
    });
  }

  init();
})();
