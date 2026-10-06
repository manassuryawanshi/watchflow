/**
 * WatchFlow - Dashboard Application Logic
 * Coordinates Navigation, Learning Queue (Videos & Playlists), Analytics Charts,
 * Focus Mode Controls, Limits, Cooldown, Schedules, and Local Data Management.
 * Follows YouTube & YouTube Studio Visual Architecture.
 */

(function () {
  'use strict';

  const storage = window.YTF_STORAGE;
  const { DEFAULT_SETTINGS, ACTIONS } = window.YTF_CONSTANTS;

  let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
  let currentFilter = 'all';
  let currentAnalyticsRange = '7d';

  // UI-Level Expanded Playlist State (keyed by stable playlist identifier)
  const SESSION_STORAGE_EXPANDED_KEY = 'wf_expanded_playlists';
  const expandedPlaylistIds = new Set();

  function loadExpandedStateFromSession() {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_EXPANDED_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          arr.forEach(id => {
            if (id) expandedPlaylistIds.add(String(id));
          });
        }
      }
    } catch (e) {}
  }

  function saveExpandedStateToSession() {
    try {
      sessionStorage.setItem(SESSION_STORAGE_EXPANDED_KEY, JSON.stringify(Array.from(expandedPlaylistIds)));
    } catch (e) {}
  }

  function getPlaylistKey(item) {
    if (!item) return '';
    if (typeof item === 'string') {
      return item.startsWith('pl_') ? item.substring(3) : item;
    }
    if (item.playlistId) return String(item.playlistId);
    if (typeof item.id === 'string') {
      return item.id.startsWith('pl_') ? item.id.substring(3) : item.id;
    }
    return '';
  }

  function isPlaylistExpanded(item) {
    const key = getPlaylistKey(item);
    return key ? expandedPlaylistIds.has(key) : false;
  }

  function setPlaylistExpanded(item, expanded) {
    const key = getPlaylistKey(item);
    if (!key) return;
    if (expanded) {
      expandedPlaylistIds.add(key);
    } else {
      expandedPlaylistIds.delete(key);
    }
    saveExpandedStateToSession();
  }

  // Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');
  const navQueueCount = document.getElementById('nav-queue-count');

  // Overview Elements
  const ovWatchTime = document.getElementById('ov-watch-time');
  const ovWatchSub = document.getElementById('ov-watch-sub');
  const ovWatchBar = document.getElementById('ov-watch-bar');
  const ovFocusTime = document.getElementById('ov-focus-time');
  const ovFocusPct = document.getElementById('ov-focus-pct');
  const ovQueueCount = document.getElementById('ov-queue-count');
  const ovQueueSub = document.getElementById('ov-queue-sub');
  const ovFocusStatus = document.getElementById('ov-focus-status');

  // Spotlight Media Card (Continue Learning)
  const spotlightThumbWrap = document.getElementById('spotlight-thumb-wrap');
  const spotlightThumb = document.getElementById('spotlight-thumb');
  const spotlightDuration = document.getElementById('spotlight-duration');
  const spotlightTitle = document.getElementById('spotlight-title');
  const spotlightMeta = document.getElementById('spotlight-meta');
  const spotlightTypeBadge = document.getElementById('spotlight-type-badge');
  const spotlightProgressWrap = document.getElementById('spotlight-progress-wrap');
  const spotlightBar = document.getElementById('spotlight-bar');
  const spotlightProgressText = document.getElementById('spotlight-progress-text');
  const spotlightActionBtn = document.getElementById('spotlight-action-btn');

  // Recent Activity
  const recentActivityList = document.getElementById('recent-activity-list');

  // Learning Queue Elements
  const queueIntelVideos = document.getElementById('queue-intel-videos');
  const queueIntelRemaining = document.getElementById('queue-intel-remaining');
  const queueIntelPlaylists = document.getElementById('queue-intel-playlists');
  const queueIntelPlCompleted = document.getElementById('queue-intel-pl-completed');
  const queueIntelTime = document.getElementById('queue-intel-time');
  const queueIntelTimeRem = document.getElementById('queue-intel-time-rem');
  const queueIntelPct = document.getElementById('queue-intel-pct');
  const queueIntelBar = document.getElementById('queue-intel-bar');
  const learningQueueList = document.getElementById('learning-queue-list');
  const filterChips = document.querySelectorAll('.chip[data-filter]');

  // Modals: Add Video & Add Playlist
  const btnShowAddVideo = document.getElementById('btn-show-add-video');
  const modalAddVideo = document.getElementById('modal-add-video');
  const modalAddVideoClose = document.getElementById('modal-add-video-close');
  const btnCancelAddVideo = document.getElementById('btn-cancel-add-video');
  const formAddVideo = document.getElementById('form-add-video');
  const inputVideoUrl = document.getElementById('input-video-url');
  const inputVideoTitle = document.getElementById('input-video-title');
  const inputVideoChannel = document.getElementById('input-video-channel');

  const btnShowAddPlaylist = document.getElementById('btn-show-add-playlist');
  const modalAddPlaylist = document.getElementById('modal-add-playlist');
  const modalAddPlaylistClose = document.getElementById('modal-add-playlist-close');
  const btnCancelAddPlaylist = document.getElementById('btn-cancel-add-playlist');
  const formAddPlaylist = document.getElementById('form-add-playlist');
  const inputPlaylistUrl = document.getElementById('input-playlist-url');
  const inputPlaylistTitle = document.getElementById('input-playlist-title');
  const inputPlaylistChannel = document.getElementById('input-playlist-channel');

  // Analytics Elements
  const anTotalTime = document.getElementById('an-total-time');
  const anPeriodLabel = document.getElementById('an-period-label');
  const anFocusTime = document.getElementById('an-focus-time');
  const anFocusPct = document.getElementById('an-focus-pct');
  const anLearningTime = document.getElementById('an-learning-time');
  const anLearningPct = document.getElementById('an-learning-pct');
  const anAvgSession = document.getElementById('an-avg-session');
  const anLongestSession = document.getElementById('an-longest-session');
  const analyticsBarChart = document.getElementById('analytics-bar-chart');
  const rangeChips = document.querySelectorAll('.chip[data-range]');

  // Master Extension & Focus Toggles
  const dashMasterExtension = document.getElementById('dash-master-extension');
  const dashFocusMode = document.getElementById('dash-focus-mode');
  const dashHideHome = document.getElementById('dash-hide-home');
  const dashHideShorts = document.getElementById('dash-hide-shorts');
  const dashHideRecs = document.getElementById('dash-hide-recs');
  const dashHideEndscreens = document.getElementById('dash-hide-endscreens');
  const dashHideComments = document.getElementById('dash-hide-comments');

  // Time & Cooldown
  const dashDailyLimit = document.getElementById('dash-daily-limit');
  const limitPresetBtns = document.querySelectorAll('.preset-btn[data-limit]');
  const btnModeSoft = document.getElementById('btn-mode-soft');
  const btnModeHard = document.getElementById('btn-mode-hard');
  const dashWarningLimit = document.getElementById('dash-warning-limit');
  const dashCooldownMins = document.getElementById('dash-cooldown-mins');
  const btnTestCooldown = document.getElementById('btn-test-cooldown');

  // Schedules
  const dashScheduleMaster = document.getElementById('dash-schedule-master');
  const schedulesList = document.getElementById('schedules-list');
  const btnShowAddSchedule = document.getElementById('btn-show-add-schedule');
  const modalAddSchedule = document.getElementById('modal-add-schedule');
  const modalAddScheduleClose = document.getElementById('modal-add-schedule-close');
  const btnCancelAddSch = document.getElementById('btn-cancel-add-sch');
  const formAddSchedule = document.getElementById('form-add-schedule');
  const inputSchName = document.getElementById('input-sch-name');
  const inputSchStart = document.getElementById('input-sch-start');
  const inputSchEnd = document.getElementById('input-sch-end');
  const selectSchMode = document.getElementById('select-sch-mode');
  const schTimePreview = document.getElementById('sch-time-preview');

  // Preferences & Data
  const dashCourseMode = document.getElementById('dash-course-mode');
  const btnExportData = document.getElementById('btn-export-data');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const btnClearQueue = document.getElementById('btn-clear-queue');
  const btnResetAll = document.getElementById('btn-reset-all');

  function formatMins(totalMins) {
    if (!totalMins) return '0m';
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function formatSecs(totalSecs) {
    const mins = Math.round((totalSecs || 0) / 60);
    return formatMins(mins);
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

  function showDashToast(message, icon = '✓') {
    const existing = document.querySelector('.dash-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'dash-toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  async function init() {
    loadExpandedStateFromSession();
    setupNavigation();
    setupModals();
    setupEventListeners();
    await loadAllData();
    handleInitialNavigation();
  }

  function navigateToSection(target) {
    const normalized = (target === 'learning-queue' || target === 'learning') ? 'learning' : target;
    navItems.forEach(n => {
      n.classList.toggle('active', n.getAttribute('data-section') === normalized);
    });
    sections.forEach(s => {
      s.classList.toggle('active', s.id === `section-${normalized}`);
    });

    if (normalized === 'analytics') {
      loadAnalytics(currentAnalyticsRange);
    }
  }

  function handleInitialNavigation() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sectionParam = urlParams.get('section');
      const hash = window.location.hash.replace('#', '');
      const target = sectionParam || hash;
      if (target) {
        navigateToSection(target);
      }
    } catch (e) {
      const hash = window.location.hash.replace('#', '');
      if (hash) navigateToSection(hash);
    }
  }

  function setupNavigation() {
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-section');
        window.location.hash = target;
        navigateToSection(target);
      });
    });

    window.addEventListener('hashchange', () => {
      handleInitialNavigation();
    });

    filterChips.forEach(chip => {
      chip.addEventListener('click', async () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.getAttribute('data-filter');
        const queue = await storage.getLearningQueue();
        renderLearningQueue(queue);
      });
    });

    rangeChips.forEach(chip => {
      chip.addEventListener('click', () => {
        rangeChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentAnalyticsRange = chip.getAttribute('data-range');
        loadAnalytics(currentAnalyticsRange);
      });
    });
  }

  function setupModals() {
    // Add Video Modal
    btnShowAddVideo.addEventListener('click', () => modalAddVideo.classList.remove('hidden'));
    modalAddVideoClose.addEventListener('click', () => modalAddVideo.classList.add('hidden'));
    btnCancelAddVideo.addEventListener('click', () => modalAddVideo.classList.add('hidden'));

    // Add Playlist Modal
    btnShowAddPlaylist.addEventListener('click', () => modalAddPlaylist.classList.remove('hidden'));
    modalAddPlaylistClose.addEventListener('click', () => modalAddPlaylist.classList.add('hidden'));
    btnCancelAddPlaylist.addEventListener('click', () => modalAddPlaylist.classList.add('hidden'));

    // Add Schedule Modal
    btnShowAddSchedule.addEventListener('click', () => modalAddSchedule.classList.remove('hidden'));
    modalAddScheduleClose.addEventListener('click', () => modalAddSchedule.classList.add('hidden'));
    btnCancelAddSch.addEventListener('click', () => modalAddSchedule.classList.add('hidden'));

    // Close on backdrop click
    [modalAddVideo, modalAddPlaylist, modalAddSchedule].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    });
  }

  async function loadAllData() {
    currentSettings = await storage.getSettings();
    const { today } = await storage.getDailyStats();
    const queue = await storage.getLearningQueue();
    const intel = await storage.getQueueIntelligence();

    // 1. Overview Tab
    const todayMins = Math.round((today?.watchTimeSeconds || 0) / 60);
    const limitMins = typeof currentSettings.dailyLimitMinutes === 'number' ? currentSettings.dailyLimitMinutes : 60;
    const focusMins = Math.round((today?.focusTimeSeconds || 0) / 60);
    const focusPctVal = todayMins > 0 ? Math.min(100, Math.round((focusMins / todayMins) * 100)) : 0;

    ovWatchTime.textContent = formatMins(todayMins);
    if (limitMins === 0) {
      ovWatchSub.textContent = 'Daily Limit: No Limit';
      ovWatchBar.style.width = '0%';
    } else {
      ovWatchSub.textContent = `Limit: ${limitMins}m`;
      ovWatchBar.style.width = `${Math.min(100, Math.round((todayMins / limitMins) * 100))}%`;
    }

    ovFocusTime.textContent = formatMins(focusMins);
    ovFocusPct.textContent = `${focusPctVal}% of today's time`;

    ovQueueCount.textContent = intel.totalVideos;
    ovQueueSub.textContent = `${intel.completedVideos} completed`;
    navQueueCount.textContent = intel.remainingVideos;

    ovFocusStatus.textContent = currentSettings.focusModeEnabled ? 'Active' : 'Paused';
    ovFocusStatus.className = currentSettings.focusModeEnabled ? 'kpi-val text-red' : 'kpi-val text-muted';

    // 2. Spotlight Card (Continue Learning)
    if (intel.nextItem) {
      const isPlaylist = intel.nextItem.type === 'playlist';
      spotlightTitle.textContent = intel.nextItem.title;
      spotlightTypeBadge.textContent = isPlaylist ? 'Course in Progress' : 'Next Video';

      if (intel.nextItem.thumbnail) {
        spotlightThumb.src = intel.nextItem.thumbnail;
        spotlightThumbWrap.style.display = 'block';
      } else {
        spotlightThumbWrap.style.display = 'none';
      }

      if (isPlaylist) {
        spotlightMeta.textContent = `${intel.nextItem.playlistTitle || intel.nextItem.channel || 'YouTube'} • Lesson ${intel.nextItem.lessonNumber} of ${intel.nextItem.totalLessons}`;
        spotlightDuration.textContent = intel.nextItem.duration || `${intel.nextItem.totalLessons} lessons`;

        const compCount = Math.max(0, (intel.nextItem.lessonNumber || 1) - 1);
        const totalCount = intel.nextItem.totalLessons || 1;
        const plPct = Math.round((compCount / totalCount) * 100);

        spotlightProgressWrap.style.display = 'flex';
        spotlightBar.style.width = `${plPct}%`;
        spotlightProgressText.textContent = `${compCount} / ${totalCount} lessons completed (${plPct}%)`;
      } else {
        spotlightMeta.textContent = `${intel.nextItem.channel || 'YouTube'} • ${intel.nextItem.duration || 'In Queue'}`;
        spotlightDuration.textContent = intel.nextItem.duration || '';
        spotlightProgressWrap.style.display = 'none';
      }

      spotlightActionBtn.href = intel.nextItem.url;
      spotlightActionBtn.querySelector('span').textContent = 'Continue →';
    } else {
      spotlightThumbWrap.style.display = 'none';
      spotlightTitle.textContent = 'Learning Queue is empty';
      spotlightMeta.textContent = 'Add videos or entire playlists from YouTube to track your intentional learning progress.';
      spotlightTypeBadge.textContent = 'Queue Empty';
      spotlightProgressWrap.style.display = 'none';
      spotlightActionBtn.href = 'https://www.youtube.com';
      spotlightActionBtn.querySelector('span').textContent = 'Browse YouTube';
    }

    // 3. Learning Queue Tab Intelligence
    queueIntelVideos.textContent = intel.totalVideos;
    queueIntelRemaining.textContent = `${intel.remainingVideos} remaining`;
    queueIntelPlaylists.textContent = intel.playlistsCount;
    queueIntelPlCompleted.textContent = `${intel.completedPlaylistsCount} completed`;
    queueIntelTime.textContent = formatSecs(intel.totalDurationSecs);
    queueIntelTimeRem.textContent = `${formatSecs(intel.remainingDurationSecs)} remaining`;
    queueIntelPct.textContent = `${intel.completionPct}%`;
    queueIntelBar.style.width = `${intel.completionPct}%`;

    renderLearningQueue(queue);

    // 4. Focus Settings
    dashFocusMode.checked = !!currentSettings.focusModeEnabled;
    dashHideHome.checked = !!currentSettings.hideHomeFeed;
    dashHideShorts.checked = !!currentSettings.hideShorts;
    dashHideRecs.checked = !!currentSettings.hideRecommendations;
    dashHideEndscreens.checked = !!currentSettings.hideEndScreens;
    dashHideComments.checked = !!currentSettings.hideComments;

    // 5. Time & Limits
    dashDailyLimit.value = limitMins === 0 ? 0 : limitMins;
    dashWarningLimit.value = currentSettings.dailyWarningMinutes || 45;
    dashCooldownMins.value = currentSettings.cooldownMinutes || 10;

    limitPresetBtns.forEach(btn => {
      const val = parseInt(btn.getAttribute('data-limit'), 10);
      btn.classList.toggle('active', val === limitMins);
    });

    if (dashMasterExtension) {
      dashMasterExtension.checked = currentSettings.extensionEnabled !== false;
    }

    const isHard = currentSettings.limitMode === 'hard';
    btnModeSoft.classList.toggle('active', !isHard);
    btnModeHard.classList.toggle('active', isHard);

    // 6. Schedules
    dashScheduleMaster.checked = !!currentSettings.scheduleEnabled;
    await loadSchedules();

    // 7. Preferences
    dashCourseMode.checked = currentSettings.courseModeEnabled !== false;

    // 8. Recent Activity
    await loadRecentActivity();
  }

  function getScrollPosition() {
    const sc = document.querySelector('.main-content');
    if (sc && sc.scrollTop > 0) {
      return { container: sc, top: sc.scrollTop };
    }
    const winTop = window.scrollY || document.documentElement.scrollTop || (document.body ? document.body.scrollTop : 0) || 0;
    return { container: window, top: winTop };
  }

  function restoreScrollPosition(saved) {
    if (!saved || typeof saved.top !== 'number') return;
    if (saved.container && saved.container !== window) {
      saved.container.scrollTop = saved.top;
    }
    if (saved.top > 0) {
      window.scrollTo(0, saved.top);
    }
  }

  function renderLearningQueue(queue) {
    const savedScroll = getScrollPosition();

    learningQueueList.innerHTML = '';

    let filtered = queue;
    if (currentFilter === 'video') {
      filtered = queue.filter(q => q.type !== 'playlist');
    } else if (currentFilter === 'playlist') {
      filtered = queue.filter(q => q.type === 'playlist');
    } else if (currentFilter === 'inprogress') {
      filtered = queue.filter(q => {
        if (q.type === 'playlist') return (q.completedCount || 0) < (q.totalCount || (q.videos || []).length);
        return !q.completed;
      });
    } else if (currentFilter === 'completed') {
      filtered = queue.filter(q => {
        if (q.type === 'playlist') {
          const total = q.totalCount || (q.videos || []).length;
          return total > 0 && (q.completedCount || 0) === total;
        }
        return q.completed;
      });
    }

    if (filtered.length === 0) {
      learningQueueList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--ytf-text-muted)" style="margin-bottom: 12px;">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
          </svg>
          <h3>Your learning queue is empty</h3>
          <p>Add individual videos or entire playlists from YouTube to track your intentional learning progress.</p>
          <div style="display: flex; gap: 12px; justify-content: center; margin-top: 16px;">
            <button type="button" class="btn btn-secondary" id="empty-add-vid">+ Add Video</button>
            <button type="button" class="btn btn-primary" id="empty-add-pl">+ Add Playlist</button>
          </div>
        </div>
      `;
      document.getElementById('empty-add-vid')?.addEventListener('click', () => modalAddVideo.classList.remove('hidden'));
      document.getElementById('empty-add-pl')?.addEventListener('click', () => modalAddPlaylist.classList.remove('hidden'));
      return;
    }

    filtered.forEach(item => {
      if (item.type === 'playlist') {
        renderPlaylistCard(item);
      } else {
        renderVideoCard(item);
      }
    });

    restoreScrollPosition(savedScroll);
  }

  function renderVideoCard(item) {
    const card = document.createElement('div');
    card.className = 'queue-card';

    const thumb = item.thumbnail || (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` : '');

    card.innerHTML = `
      <div class="queue-card-main">
        <input type="checkbox" ${item.completed ? 'checked' : ''} class="item-complete-check" title="Toggle completed">
        ${thumb ? `
          <div class="queue-thumb-wrap">
            <img src="${thumb}" class="queue-card-thumb" alt="Thumbnail">
            ${item.duration ? `<span class="thumb-duration">${item.duration}</span>` : ''}
          </div>
        ` : ''}
        <div class="queue-card-info">
          <div class="queue-badge-row">
            <span class="type-tag">Video</span>
            ${item.completed ? '<span class="badge badge-red">Completed</span>' : ''}
          </div>
          <a href="${item.sourceUrl || item.url}" target="_blank" class="queue-card-title ${item.completed ? 'completed' : ''}">${escapeHtml(item.title)}</a>
          <div class="queue-card-meta">
            <span>${escapeHtml(item.channelTitle || item.channel || 'YouTube')}</span>
            ${item.duration ? `<span>• ${item.duration}</span>` : ''}
            <span>• Added ${new Date(item.addedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="queue-card-actions">
          <a href="${item.sourceUrl || item.url}" target="_blank" class="btn btn-secondary btn-sm">Watch</a>
          <button type="button" class="btn btn-danger btn-sm btn-delete-item">Remove</button>
        </div>
      </div>
    `;

    card.querySelector('.item-complete-check').addEventListener('change', async () => {
      await storage.toggleQueueItem(item.id);
      await loadAllData();
      showDashToast(item.completed ? 'Marked as incomplete' : 'Marked as complete', '✓');
    });

    card.querySelector('.btn-delete-item').addEventListener('click', async () => {
      await storage.removeFromLearningQueue(item.id);
      await loadAllData();
      showDashToast('Removed from Learning Queue', '🗑️');
    });

    learningQueueList.appendChild(card);
  }

  function renderPlaylistCard(item) {
    const card = document.createElement('div');
    card.className = 'queue-card';
    const plKey = getPlaylistKey(item);
    if (plKey) card.setAttribute('data-playlist-id', plKey);

    const total = item.totalCount || (item.videos || []).length || 0;
    const completed = item.completedCount || 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const thumb = item.thumbnail || (item.videos && item.videos[0] ? item.videos[0].thumbnail : '');
    const isExpanded = isPlaylistExpanded(item);

    card.innerHTML = `
      <div class="queue-card-main">
        <input type="checkbox" ${completed === total && total > 0 ? 'checked' : ''} class="item-complete-check" title="Toggle all completed">
        ${thumb ? `
          <div class="queue-thumb-wrap">
            <img src="${thumb}" class="queue-card-thumb" alt="Thumbnail">
            <div class="playlist-badge-overlay">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg>
              <span>${total}</span>
            </div>
          </div>
        ` : ''}
        <div class="queue-card-info">
          <div class="queue-badge-row">
            <span class="type-tag playlist">Playlist</span>
            <span class="badge ${completed === total && total > 0 ? 'badge-red' : ''}">${completed} / ${total} completed</span>
          </div>
          <a href="${item.sourceUrl}" target="_blank" class="queue-card-title ${completed === total && total > 0 ? 'completed' : ''}">${escapeHtml(item.title)}</a>
          <div class="queue-card-meta">
            <span>${escapeHtml(item.channelTitle || 'YouTube')}</span>
            <span>• ${total} lessons</span>
            <span>• ${pct}% complete</span>
          </div>
          <div class="progress-bar-container" style="max-width: 260px; margin-top: 4px;">
            <div class="progress-bar-fill" style="width: ${pct}%;"></div>
          </div>
        </div>
        <div class="queue-card-actions">
          <button type="button" class="btn btn-secondary btn-sm btn-expand-pl ${isExpanded ? 'active' : ''}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="Toggle course curriculum">
            <span>Lessons</span>
            <svg class="expand-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 17l5-5-5-5v10z"/></svg>
          </button>
          <a href="${item.sourceUrl}" target="_blank" class="btn btn-primary btn-sm">Continue</a>
          <button type="button" class="btn btn-danger btn-sm btn-delete-item">Remove</button>
        </div>
      </div>
      <div class="playlist-drawer" style="display: ${isExpanded ? 'block' : 'none'};">
        <div class="playlist-drawer-header">Course Curriculum (${total} lessons)</div>
        <div class="lessons-container">
          <!-- Lessons injected dynamically -->
        </div>
      </div>
    `;

    // Toggle playlist all complete
    card.querySelector('.item-complete-check').addEventListener('change', async () => {
      await storage.toggleQueueItem(item.id);
      await loadAllData();
    });

    // Remove entire playlist
    card.querySelector('.btn-delete-item').addEventListener('click', async () => {
      await storage.removeFromLearningQueue(item.id);
      setPlaylistExpanded(item, false);
      await loadAllData();
      showDashToast('Playlist removed from queue', '🗑️');
    });

    // Expand / collapse drawer
    const drawer = card.querySelector('.playlist-drawer');
    const lessonsContainer = card.querySelector('.lessons-container');
    const expandBtn = card.querySelector('.btn-expand-pl');

    if (isExpanded) {
      renderPlaylistLessons(item, lessonsContainer);
    }

    expandBtn.addEventListener('click', () => {
      const nowExpanded = drawer.style.display === 'none';
      drawer.style.display = nowExpanded ? 'block' : 'none';
      expandBtn.classList.toggle('active', nowExpanded);
      expandBtn.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
      setPlaylistExpanded(item, nowExpanded);

      if (nowExpanded && (!lessonsContainer.children.length)) {
        renderPlaylistLessons(item, lessonsContainer);
      }
    });

    learningQueueList.appendChild(card);
  }

  function renderPlaylistLessons(playlistItem, container) {
    container.innerHTML = '';
    const vids = playlistItem.videos || [];

    if (vids.length === 0) {
      container.innerHTML = `
        <div class="empty-lessons-state" style="padding: 12px 10px; text-align: center; color: var(--ytf-text-muted); font-size: 13px;">
          No lessons remaining in this course curriculum.
        </div>
      `;
      return;
    }

    vids.forEach((vid, idx) => {
      const row = document.createElement('div');
      row.className = 'lesson-row';

      const numStr = String(idx + 1).padStart(2, '0');

      row.innerHTML = `
        <input type="checkbox" ${vid.completed ? 'checked' : ''} class="lesson-check" title="Toggle complete">
        <span class="lesson-num">${numStr}</span>
        <a href="https://www.youtube.com/watch?v=${vid.videoId}&list=${playlistItem.playlistId}" target="_blank" class="lesson-title ${vid.completed ? 'completed' : ''}">${escapeHtml(vid.title)}</a>
        ${vid.duration ? `<span class="lesson-duration">${vid.duration}</span>` : ''}
        <button type="button" class="btn btn-danger btn-sm btn-delete-lesson" style="padding: 2px 6px; font-size: 11px;" title="Remove lesson">×</button>
      `;

      // Checkbox toggle
      row.querySelector('.lesson-check').addEventListener('change', async () => {
        await storage.toggleQueueItem(playlistItem.id, vid.videoId);
        await loadAllData();
      });

      // Remove single lesson
      row.querySelector('.btn-delete-lesson').addEventListener('click', async () => {
        await storage.removeFromLearningQueue(playlistItem.id, vid.videoId);
        await loadAllData();
      });

      container.appendChild(row);
    });
  }

  async function loadAnalytics(range) {
    const data = await storage.getWatchAnalytics(range);

    anTotalTime.textContent = formatSecs(data.totalWatchTimeSeconds);
    anPeriodLabel.textContent = range === 'today' ? "Today" : (range === 'yesterday' ? "Yesterday" : (range === '30d' ? "Last 30 days" : "Last 7 days"));
    anFocusTime.textContent = formatSecs(data.focusedTimeSeconds);
    anFocusPct.textContent = `${data.focusPercentage}% of total`;
    anLearningTime.textContent = formatSecs(data.learningTimeSeconds);
    anLearningPct.textContent = `${data.learningPercentage}% of total`;
    anAvgSession.textContent = formatSecs(data.averageSessionSeconds);
    anLongestSession.textContent = `Longest: ${formatSecs(data.longestSessionSeconds)}`;

    renderAnalyticsChart(data.dailyBreakdown);
  }

  function renderAnalyticsChart(daily) {
    analyticsBarChart.innerHTML = '';

    if (!daily || daily.length === 0 || daily.every(d => d.totalMins === 0)) {
      analyticsBarChart.innerHTML = `
        <div style="width: 100%; text-align: center; color: var(--ytf-text-muted); padding: 40px 0; font-size: 13px;">
          No watch-time recorded yet. Play a YouTube video to see real local analytics here.
        </div>
      `;
      return;
    }

    const maxMins = Math.max(...daily.map(d => d.totalMins), 60);

    daily.forEach(d => {
      const col = document.createElement('div');
      col.className = 'chart-bar-group';
      col.title = `${d.date}: ${d.totalMins}m total (${d.focusMins}m focused)`;

      const totalHeightPct = Math.min(100, Math.round((d.totalMins / maxMins) * 100));
      const focusHeightPct = d.totalMins > 0 ? Math.min(100, Math.round((d.focusMins / d.totalMins) * 100)) : 0;

      col.innerHTML = `
        <div class="chart-bar-container">
          <div class="chart-bar-fill" style="height: ${totalHeightPct}%;">
            ${focusHeightPct > 0 ? `<div class="chart-bar-fill focus-highlight" style="height: ${focusHeightPct}%; position: absolute; bottom: 0; left: 0; width: 100%;"></div>` : ''}
          </div>
        </div>
        <span class="chart-bar-label">${d.label}</span>
      `;

      analyticsBarChart.appendChild(col);
    });
  }

  async function loadRecentActivity() {
    const data = await storage.getWatchAnalytics('30d');
    recentActivityList.innerHTML = '';

    if (!data.recentSessions || data.recentSessions.length === 0) {
      recentActivityList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--ytf-text-muted); font-size: 13px;">
          No recent activity recorded yet. Play a YouTube video to start tracking study sessions.
        </div>
      `;
      return;
    }

    data.recentSessions.slice(0, 6).forEach(s => {
      const row = document.createElement('div');
      row.className = 'recent-media-row';

      const mins = Math.max(1, Math.round((s.durationSeconds || 0) / 60));
      const thumb = s.videoId ? `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg` : '';

      row.innerHTML = `
        <div class="recent-thumb-wrap">
          ${thumb ? `<img src="${thumb}" class="recent-thumb" alt="Thumbnail">` : ''}
          <span class="thumb-duration">${mins}m</span>
        </div>
        <div class="recent-info">
          <a href="https://www.youtube.com/watch?v=${s.videoId}" target="_blank" class="recent-title">${escapeHtml(s.videoTitle || 'YouTube Video')}</a>
          <div class="recent-meta">
            <span>${escapeHtml(s.channelTitle || 'YouTube')}</span>
            <span>• ${s.date || 'Today'}</span>
            ${s.inFocusMode ? '<span class="badge badge-red" style="padding: 1px 5px; font-size: 10px;">Focused</span>' : ''}
          </div>
        </div>
        <a href="https://www.youtube.com/watch?v=${s.videoId}" target="_blank" class="btn btn-secondary btn-sm">Watch</a>
      `;

      recentActivityList.appendChild(row);
    });
  }

  async function loadSchedules() {
    const schedules = await storage.getSchedules();
    schedulesList.innerHTML = '';

    if (schedules.length === 0) {
      schedulesList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--ytf-text-muted)" style="margin-bottom: 12px;">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/>
          </svg>
          <h3>No schedules created</h3>
          <p>Create scheduled windows to enforce Focus Mode or block YouTube during study or rest hours.</p>
        </div>
      `;
      return;
    }

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    schedules.forEach((sch, idx) => {
      const card = document.createElement('div');
      card.className = 'queue-card';

      const isBlock = sch.mode === 'block';

      card.innerHTML = `
        <div class="queue-card-main">
          <label class="switch">
            <input type="checkbox" class="sch-enable-toggle" ${sch.enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
          <div class="queue-card-info">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="queue-card-title">${escapeHtml(sch.name)}</span>
              <span class="badge ${isBlock ? 'badge-red' : ''}">${isBlock ? 'Block YouTube' : 'Focus Mode'}</span>
            </div>
            <div class="queue-card-meta">
              <span>⏰ ${formatTime12(sch.startTime)} – ${formatTime12(sch.endTime)}</span>
              <span>• ${(sch.days || []).map(d => dayLabels[d]).join(', ')}</span>
            </div>
          </div>
          <button type="button" class="btn btn-danger btn-sm btn-delete-sch">Delete</button>
        </div>
      `;

      card.querySelector('.sch-enable-toggle').addEventListener('change', async (e) => {
        sch.enabled = e.target.checked;
        await storage.saveSchedules(schedules);
        showDashToast(`Schedule ${sch.enabled ? 'enabled' : 'disabled'}`, '⏰');
      });

      card.querySelector('.btn-delete-sch').addEventListener('click', async () => {
        schedules.splice(idx, 1);
        await storage.saveSchedules(schedules);
        await loadSchedules();
        showDashToast('Schedule deleted', '🗑️');
      });

      schedulesList.appendChild(card);
    });
  }

  function setupEventListeners() {
    // Add Video Form
    formAddVideo.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = inputVideoUrl.value.trim();
      const title = inputVideoTitle.value.trim();
      const channel = inputVideoChannel.value.trim() || 'YouTube';

      if (!url || !title) return;

      await storage.addVideoToQueue({
        sourceUrl: url,
        title,
        channelTitle: channel
      });

      formAddVideo.reset();
      modalAddVideo.classList.add('hidden');
      await loadAllData();
      showDashToast('Video added to Learning Queue', '📚');
    });

    // Add Playlist Form
    formAddPlaylist.addEventListener('submit', async (e) => {
      e.preventDefault();
      const urlOrId = inputPlaylistUrl.value.trim();
      const title = inputPlaylistTitle.value.trim();
      const channel = inputPlaylistChannel.value.trim() || 'YouTube';

      let playlistId = urlOrId;
      try {
        if (urlOrId.includes('list=')) {
          const parsed = new URL(urlOrId);
          playlistId = parsed.searchParams.get('list');
        }
      } catch (err) {}

      await storage.addPlaylistToQueue({
        playlistId: playlistId || 'pl_' + Date.now(),
        title,
        channelTitle: channel,
        sourceUrl: urlOrId.startsWith('http') ? urlOrId : `https://www.youtube.com/playlist?list=${playlistId}`,
        videos: []
      });

      formAddPlaylist.reset();
      modalAddPlaylist.classList.add('hidden');
      await loadAllData();
      showDashToast('Playlist added to Learning Queue', '📑');
    });

    // Add Schedule Form
    formAddSchedule.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = inputSchName.value.trim();
      const startTime = inputSchStart.value;
      const endTime = inputSchEnd.value;
      const mode = selectSchMode.value;

      const schedules = await storage.getSchedules();
      schedules.push({
        id: 'sch_' + Date.now(),
        name,
        startTime,
        endTime,
        days: [0, 1, 2, 3, 4, 5, 6],
        mode,
        enabled: true
      });

      await storage.saveSchedules(schedules);
      formAddSchedule.reset();
      modalAddSchedule.classList.add('hidden');
      await loadSchedules();
      showDashToast('Schedule added', '⏰');
    });

    // Auto-save setting toggles
    const focusToggles = [
      { el: dashMasterExtension, key: 'extensionEnabled' },
      { el: dashFocusMode, key: 'focusModeEnabled' },
      { el: dashHideHome, key: 'hideHomeFeed' },
      { el: dashHideShorts, key: 'hideShorts' },
      { el: dashHideRecs, key: 'hideRecommendations' },
      { el: dashHideEndscreens, key: 'hideEndScreens' },
      { el: dashHideComments, key: 'hideComments' },
      { el: dashCourseMode, key: 'courseModeEnabled' },
      { el: dashScheduleMaster, key: 'scheduleEnabled' }
    ];

    focusToggles.forEach(({ el, key }) => {
      el.addEventListener('change', async () => {
        const update = { [key]: el.checked };
        currentSettings = await storage.saveSettings(update);
        ovFocusStatus.textContent = currentSettings.focusModeEnabled ? 'Active' : 'Paused';
        ovFocusStatus.className = currentSettings.focusModeEnabled ? 'kpi-val text-red' : 'kpi-val text-muted';

        chrome.runtime.sendMessage({
          action: ACTIONS.SETTINGS_CHANGED,
          settings: currentSettings
        }).catch(() => {});

        showDashToast('Setting updated', '⚙️');
      });
    });

    // Daily Limit Presets (Section 15: Support No Limit)
    limitPresetBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        limitPresetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const limitVal = parseInt(btn.getAttribute('data-limit'), 10);
        dashDailyLimit.value = limitVal;
        await storage.saveSettings({ dailyLimitMinutes: limitVal });
        await loadAllData();
        showDashToast(limitVal === 0 ? 'Daily limit set to No Limit' : `Daily limit set to ${limitVal} minutes`, '⏱️');
      });
    });

    dashDailyLimit.addEventListener('change', async () => {
      const val = parseInt(dashDailyLimit.value, 10);
      if (!isNaN(val) && val >= 0) {
        await storage.saveSettings({ dailyLimitMinutes: val });
        await loadAllData();
        showDashToast(val === 0 ? 'Daily limit set to No Limit' : `Daily limit set to ${val} minutes`, '⏱️');
      }
    });

    // 12-Hour Schedule Time Preview
    function updateSchPreview() {
      if (schTimePreview && inputSchStart && inputSchEnd) {
        schTimePreview.textContent = `Scheduled: ${formatTime12(inputSchStart.value)} – ${formatTime12(inputSchEnd.value)}`;
      }
    }
    if (inputSchStart && inputSchEnd) {
      inputSchStart.addEventListener('input', updateSchPreview);
      inputSchEnd.addEventListener('input', updateSchPreview);
      updateSchPreview();
    }

    // Soft vs Hard Limit
    btnModeSoft.addEventListener('click', async () => {
      btnModeSoft.classList.add('active');
      btnModeHard.classList.remove('active');
      await storage.saveSettings({ limitMode: 'soft' });
      showDashToast('Limit mode set to Soft Limit (warnings only)', '💡');
    });

    btnModeHard.addEventListener('click', async () => {
      btnModeHard.classList.add('active');
      btnModeSoft.classList.remove('active');
      await storage.saveSettings({ limitMode: 'hard' });
      showDashToast('Limit mode set to Hard Limit (triggers cooldown break)', '🔒');
    });

    // Warning and Cooldown inputs
    dashWarningLimit.addEventListener('change', async () => {
      const val = parseInt(dashWarningLimit.value, 10);
      if (val > 0) {
        await storage.saveSettings({ dailyWarningMinutes: val });
        showDashToast('Warning threshold updated', '⚠️');
      }
    });

    dashCooldownMins.addEventListener('change', async () => {
      const val = parseInt(dashCooldownMins.value, 10);
      if (val > 0) {
        await storage.saveSettings({ cooldownMinutes: val });
        showDashToast('Cooldown break duration updated', '🧘');
      }
    });

    // Test Cooldown
    btnTestCooldown.addEventListener('click', async () => {
      const mins = parseInt(dashCooldownMins.value, 10) || 10;
      await storage.setCooldownState(true, mins, 'test');
      showDashToast(`Cooldown break triggered for ${mins} minutes! Check any YouTube tab.`, '🧘');
      window.open('https://www.youtube.com', '_blank');
    });

    // Export Data
    btnExportData.addEventListener('click', async () => {
      const settings = await storage.getSettings();
      const { all } = await storage.getDailyStats();
      const queue = await storage.getLearningQueue();
      const analytics = await storage.getWatchAnalytics('30d');
      const schedules = await storage.getSchedules();

      const dump = {
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        settings,
        stats: all,
        queue,
        schedules,
        analytics
      };

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `youtube-focus-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showDashToast('Backup downloaded successfully', '💾');
    });

    // Clear Watch History
    btnClearHistory.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear your local watch history and sessions?')) {
        await storage.clearWatchHistory();
        await loadAllData();
        showDashToast('Watch history cleared', '🗑️');
      }
    });

    // Clear Learning Queue
    btnClearQueue.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear your entire Learning Queue?')) {
        await storage.clearLearningQueue();
        expandedPlaylistIds.clear();
        saveExpandedStateToSession();
        await loadAllData();
        showDashToast('Learning Queue cleared', '🗑️');
      }
    });

    // Reset All Data
    btnResetAll.addEventListener('click', async () => {
      if (confirm('WARNING: This will permanently wipe ALL local data (queue, history, analytics, settings) and restore factory defaults. Continue?')) {
        await storage.resetAllData();
        expandedPlaylistIds.clear();
        saveExpandedStateToSession();
        await loadAllData();
        showDashToast('All extension data reset to defaults', '🔄');
      }
    });

    // Multi-context sync: when queue or daily stats change in other tabs
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          if (changes['yt_focus_learning_queue'] || changes['yt_focus_daily_stats']) {
            loadAllData();
          }
        }
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.loadAllData = loadAllData;
  window.getExpandedPlaylistIds = () => Array.from(expandedPlaylistIds);
  window.isPlaylistExpanded = isPlaylistExpanded;
  init();
})();
