/**
 * WatchFlow - Universal Storage Service
 * Wraps chrome.storage.local with defaults, error handling, and clean helpers.
 * Handles Settings, Learning Queue (Videos & Playlists), Watch-Time Sessions, Analytics, Cooldown & Schedules.
 */

(function (root) {
  'use strict';

  const { STORAGE_KEYS, DEFAULT_SETTINGS } = (root.YTF_CONSTANTS || {});

  function getTodayDateString(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDurationToSeconds(durationStr) {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const parts = durationStr.split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 1) {
      return parts[0];
    }
    return 0;
  }

  const storageService = {
    // =========================================================================
    // 1. SETTINGS MANAGEMENT
    // =========================================================================

    /**
     * Get settings merged with defaults
     */
    async getSettings() {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.SETTINGS) || 'yt_focus_settings';
        const defaults = DEFAULT_SETTINGS || {};
        const result = await chrome.storage.local.get(key);
        return Object.assign({}, defaults, result[key] || {});
      } catch (err) {
        console.error('[WatchFlow] Error fetching settings:', err);
        return Object.assign({}, DEFAULT_SETTINGS || {});
      }
    },

    /**
     * Update settings
     */
    async saveSettings(partial) {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.SETTINGS) || 'yt_focus_settings';
        const current = await this.getSettings();
        const updated = Object.assign({}, current, partial);
        await chrome.storage.local.set({ [key]: updated });
        return updated;
      } catch (err) {
        console.error('[WatchFlow] Error saving settings:', err);
        throw err;
      }
    },

    /**
     * Reset settings to defaults
     */
    async resetSettings() {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.SETTINGS) || 'yt_focus_settings';
        await chrome.storage.local.set({ [key]: DEFAULT_SETTINGS });
        return Object.assign({}, DEFAULT_SETTINGS);
      } catch (err) {
        console.error('[WatchFlow] Error resetting settings:', err);
        throw err;
      }
    },

    // =========================================================================
    // 2. LEARNING QUEUE (VIDEOS & PLAYLISTS)
    // =========================================================================

    /**
     * Get learning queue items
     */
    async getLearningQueue() {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const result = await chrome.storage.local.get(key);
        return Array.isArray(result[key]) ? result[key] : [];
      } catch (err) {
        console.error('[WatchFlow] Error getting learning queue:', err);
        return [];
      }
    },

    /**
     * Check if a top-level video or playlist is already in queue
     */
    async isItemInQueue(identifier) {
      if (!identifier) return false;
      const queue = await this.getLearningQueue();
      return queue.some(q => {
        if (q.id === identifier || q.videoId === identifier || q.playlistId === identifier) return true;
        if (q.sourceUrl && q.sourceUrl.includes(identifier)) return true;
        return false;
      });
    },

    /**
     * Check specifically if an individual video is in queue
     */
    async isVideoInQueue(videoId) {
      if (!videoId) return false;
      const queue = await this.getLearningQueue();
      return queue.some(q => q.type === 'video' && (q.videoId === videoId || q.id === videoId));
    },

    /**
     * Check specifically if an entire playlist is in queue
     */
    async isPlaylistInQueue(playlistId) {
      if (!playlistId) return false;
      const queue = await this.getLearningQueue();
      return queue.some(q => q.type === 'playlist' && (q.playlistId === playlistId || q.id === playlistId || q.id === 'pl_' + playlistId));
    },

    /**
     * Check if a video is a lesson in any queued playlist
     */
    async isLessonInQueuedPlaylist(videoId) {
      if (!videoId) return false;
      const queue = await this.getLearningQueue();
      return queue.some(q => q.type === 'playlist' && Array.isArray(q.videos) && q.videos.some(v => v.videoId === videoId));
    },

    /**
     * Authoritative Focus Mode permission check
     * Allowed only if individual video is queued OR belongs to an explicitly queued playlist.
     * YouTube Shorts are NEVER allowed.
     */
    async isVideoAllowed(videoId, context = {}) {
      if (!videoId) return false;
      if (context.isShort) return false;
      const queue = await this.getLearningQueue();
      if (queue.some(q => q.type === 'video' && (q.videoId === videoId || q.id === videoId))) {
        return true;
      }
      if (queue.some(q => q.type === 'playlist' && Array.isArray(q.videos) && q.videos.some(v => v.videoId === videoId))) {
        return true;
      }
      if (context.playlistId) {
        if (queue.some(q => q.type === 'playlist' && (q.playlistId === context.playlistId || q.id === context.playlistId || q.id === 'pl_' + context.playlistId))) {
          return true;
        }
      }
      return false;
    },

    /**
     * Add an individual video to the learning queue
     */
    async addVideoToQueue(video) {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const queue = await this.getLearningQueue();

        const videoId = video.videoId || (video.sourceUrl ? this.extractVideoId(video.sourceUrl) : null) || 'vid_' + Date.now();
        const existingIndex = queue.findIndex(q => q.type === 'video' && (q.videoId === videoId || (q.sourceUrl && video.sourceUrl && q.sourceUrl === video.sourceUrl)));

        const newItem = {
          type: 'video',
          id: videoId,
          videoId: videoId,
          title: video.title || 'Untitled Video',
          thumbnail: video.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
          channelTitle: video.channelTitle || video.channel || 'YouTube',
          duration: video.duration || '',
          durationSeconds: video.durationSeconds || parseDurationToSeconds(video.duration),
          sourceUrl: video.sourceUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
          addedAt: Date.now(),
          completed: !!video.completed,
          completedAt: video.completedAt || null,
          lastPositionSeconds: typeof video.lastPositionSeconds === 'number' ? video.lastPositionSeconds : 0,
          progressPct: typeof video.progressPct === 'number' ? video.progressPct : 0
        };

        if (existingIndex >= 0) {
          queue[existingIndex] = Object.assign({}, queue[existingIndex], newItem);
        } else {
          queue.unshift(newItem);
        }

        await chrome.storage.local.set({ [key]: queue });
        return { success: true, item: newItem, queue };
      } catch (err) {
        console.error('[WatchFlow] Error adding video to queue:', err);
        throw err;
      }
    },

    /**
     * Add an entire playlist as a first-class queue item
     */
    async addPlaylistToQueue(playlist) {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const queue = await this.getLearningQueue();

        const playlistId = playlist.playlistId || 'pl_' + Date.now();
        const existingIndex = queue.findIndex(q => q.type === 'playlist' && (q.playlistId === playlistId || q.id === playlistId));

        const cleanVideos = (playlist.videos || []).map((v, idx) => ({
          videoId: v.videoId || 'vid_' + idx,
          title: v.title || `Video ${idx + 1}`,
          thumbnail: v.thumbnail || (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : ''),
          duration: v.duration || '',
          durationSeconds: v.durationSeconds || parseDurationToSeconds(v.duration),
          completed: !!v.completed,
          completedAt: v.completedAt || null
        }));

        const completedCount = cleanVideos.filter(v => v.completed).length;
        const nextIncompleteIdx = cleanVideos.findIndex(v => !v.completed);
        const currentIndex = nextIncompleteIdx >= 0 ? nextIncompleteIdx : 0;

        const newPlaylistItem = {
          type: 'playlist',
          id: 'pl_' + playlistId,
          playlistId: playlistId,
          title: playlist.title || 'Curated Playlist',
          thumbnail: playlist.thumbnail || (cleanVideos[0] ? cleanVideos[0].thumbnail : ''),
          channelTitle: playlist.channelTitle || playlist.channel || 'YouTube',
          sourceUrl: playlist.sourceUrl || `https://www.youtube.com/playlist?list=${playlistId}`,
          addedAt: Date.now(),
          videos: cleanVideos,
          currentIndex: currentIndex,
          completedCount: completedCount,
          totalCount: cleanVideos.length
        };

        if (existingIndex >= 0) {
          queue[existingIndex] = Object.assign({}, queue[existingIndex], newPlaylistItem);
        } else {
          queue.unshift(newPlaylistItem);
        }

        await chrome.storage.local.set({ [key]: queue });
        return { success: true, item: newPlaylistItem, queue };
      } catch (err) {
        console.error('[WatchFlow] Error adding playlist to queue:', err);
        throw err;
      }
    },

    /**
     * Universal add to queue wrapper (backward-compatible)
     */
    async addToLearningQueue(item) {
      if (item.type === 'playlist' || item.playlistId) {
        return (await this.addPlaylistToQueue(item)).queue;
      }
      return (await this.addVideoToQueue({
        videoId: item.videoId || item.id,
        title: item.title,
        channelTitle: item.channelTitle || item.channel,
        duration: item.duration,
        durationSeconds: item.durationSeconds,
        sourceUrl: item.sourceUrl || item.url,
        thumbnail: item.thumbnail
      })).queue;
    },

    /**
     * Remove item from learning queue
     */
    async removeFromLearningQueue(id, subVideoId = null) {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const queue = await this.getLearningQueue();

        if (subVideoId) {
          // Remove a single video from a playlist item
          const playlistItem = queue.find(q => q.id === id || q.playlistId === id);
          if (playlistItem && Array.isArray(playlistItem.videos)) {
            playlistItem.videos = playlistItem.videos.filter(v => v.videoId !== subVideoId);
            playlistItem.totalCount = playlistItem.videos.length;
            playlistItem.completedCount = playlistItem.videos.filter(v => v.completed).length;
          }
        } else {
          // Remove entire queue card
          const targetIndex = queue.findIndex(q => q.id === id || q.playlistId === id || q.videoId === id);
          if (targetIndex >= 0) {
            queue.splice(targetIndex, 1);
          }
        }

        await chrome.storage.local.set({ [key]: queue });
        return queue;
      } catch (err) {
        console.error('[WatchFlow] Error removing from queue:', err);
        throw err;
      }
    },

    /**
     * Toggle completion status
     * Supports both individual videos and sub-videos in playlists
     */
    async toggleQueueItem(id, subVideoId = null) {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const queue = await this.getLearningQueue();
        const item = queue.find(q => q.id === id || q.videoId === id || q.playlistId === id);

        if (!item) return queue;

        if (item.type === 'playlist') {
          if (subVideoId) {
            const sub = item.videos.find(v => v.videoId === subVideoId);
            if (sub) {
              sub.completed = !sub.completed;
              sub.completedAt = sub.completed ? Date.now() : null;
            }
          } else {
            // Toggle all in playlist
            const allCompleted = item.completedCount === item.totalCount;
            const targetState = !allCompleted;
            item.videos.forEach(v => {
              v.completed = targetState;
              v.completedAt = targetState ? Date.now() : null;
            });
          }
          item.completedCount = item.videos.filter(v => v.completed).length;
          item.completed = item.completedCount === item.totalCount && item.totalCount > 0;
          const nextIncomplete = item.videos.findIndex(v => !v.completed);
          item.currentIndex = nextIncomplete >= 0 ? nextIncomplete : 0;
        } else {
          // Individual video
          item.completed = !item.completed;
          item.completedAt = item.completed ? Date.now() : null;
        }

        await chrome.storage.local.set({ [key]: queue });
        return queue;
      } catch (err) {
        console.error('[WatchFlow] Error toggling queue item:', err);
        throw err;
      }
    },

    /**
     * Auto-mark a video as completed when 90% watched
     */
    async autoCompleteVideo(videoId) {
      if (!videoId) return null;
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const queue = await this.getLearningQueue();
        let changed = false;
        let matchedTitle = '';

        for (const item of queue) {
          if (item.type === 'video' && item.videoId === videoId && !item.completed) {
            item.completed = true;
            item.completedAt = Date.now();
            matchedTitle = item.title;
            changed = true;
          } else if (item.type === 'playlist' && Array.isArray(item.videos)) {
            const sub = item.videos.find(v => v.videoId === videoId && !v.completed);
            if (sub) {
              sub.completed = true;
              sub.completedAt = Date.now();
              item.completedCount = item.videos.filter(v => v.completed).length;
              item.completed = item.completedCount === item.totalCount && item.totalCount > 0;
              const nextIncomplete = item.videos.findIndex(v => !v.completed);
              item.currentIndex = nextIncomplete >= 0 ? nextIncomplete : 0;
              matchedTitle = sub.title;
              changed = true;
            }
          }
        }

        if (changed) {
          await chrome.storage.local.set({ [key]: queue });
          return { success: true, title: matchedTitle, queue };
        }
        return null;
      } catch (err) {
        console.error('[WatchFlow] Error auto-completing video:', err);
        return null;
      }
    },

    /**
     * Find next item to learn (for "Continue Learning" button)
     * Priority:
     * 1. Currently in-progress individual video
     * 2. Currently in-progress lesson in a queued playlist
     * 3. Next incomplete lesson in the active/in-progress playlist
     * 4. Next incomplete individual queued video
     * 5. First incomplete queue item
     */
    async getContinueLearningItem() {
      const queue = await this.getLearningQueue();
      if (!queue || queue.length === 0) return null;

      // Priority 1: Currently in-progress individual video
      for (const item of queue) {
        if (item.type === 'video' && !item.completed && ((item.lastPositionSeconds > 0) || (item.progressPct > 0))) {
          return {
            id: item.id,
            videoId: item.videoId,
            title: item.title,
            channel: item.channelTitle || item.channel || 'YouTube',
            url: item.sourceUrl || `https://www.youtube.com/watch?v=${item.videoId}`,
            thumbnail: item.thumbnail || (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` : ''),
            duration: item.duration || '',
            type: 'video',
            progress: item.progress || `${item.progressPct || 0}%`,
            progressPct: item.progressPct || 0
          };
        }
      }

      // Priority 2: Currently in-progress lesson in a queued playlist
      for (const item of queue) {
        if (item.type === 'playlist' && Array.isArray(item.videos)) {
          const inProgIdx = item.videos.findIndex(v => !v.completed && ((v.lastPositionSeconds > 0) || (v.progressPct > 0)));
          if (inProgIdx >= 0) {
            const sub = item.videos[inProgIdx];
            const totalLessons = item.totalCount || item.videos.length;
            const pct = totalLessons > 0 ? Math.round((item.completedCount / totalLessons) * 100) : 0;
            return {
              id: item.id,
              playlistId: item.playlistId,
              videoId: sub.videoId,
              title: `${item.title} — ${sub.title}`,
              playlistTitle: item.title,
              lessonTitle: sub.title,
              lessonNumber: inProgIdx + 1,
              totalLessons: totalLessons,
              completedCount: item.completedCount,
              channel: item.channelTitle || 'YouTube',
              url: `https://www.youtube.com/watch?v=${sub.videoId}&list=${item.playlistId}`,
              thumbnail: sub.thumbnail || item.thumbnail || (sub.videoId ? `https://i.ytimg.com/vi/${sub.videoId}/hqdefault.jpg` : ''),
              duration: sub.duration || '',
              type: 'playlist',
              progress: `${pct}%`,
              progressPct: pct
            };
          }
        }
      }

      // Priority 3: Next incomplete lesson in the active/in-progress playlist
      for (const item of queue) {
        if (item.type === 'playlist' && Array.isArray(item.videos) && item.completedCount > 0 && item.completedCount < (item.totalCount || item.videos.length)) {
          const nextIdx = item.videos.findIndex(v => !v.completed);
          if (nextIdx >= 0) {
            const sub = item.videos[nextIdx];
            const totalLessons = item.totalCount || item.videos.length;
            const pct = totalLessons > 0 ? Math.round((item.completedCount / totalLessons) * 100) : 0;
            return {
              id: item.id,
              playlistId: item.playlistId,
              videoId: sub.videoId,
              title: `${item.title} — ${sub.title}`,
              playlistTitle: item.title,
              lessonTitle: sub.title,
              lessonNumber: nextIdx + 1,
              totalLessons: totalLessons,
              completedCount: item.completedCount,
              channel: item.channelTitle || 'YouTube',
              url: `https://www.youtube.com/watch?v=${sub.videoId}&list=${item.playlistId}`,
              thumbnail: sub.thumbnail || item.thumbnail || (sub.videoId ? `https://i.ytimg.com/vi/${sub.videoId}/hqdefault.jpg` : ''),
              duration: sub.duration || '',
              type: 'playlist',
              progress: `${pct}%`,
              progressPct: pct
            };
          }
        }
      }

      // Priority 4: Next incomplete individual queued video
      for (const item of queue) {
        if (item.type === 'video' && !item.completed) {
          return {
            id: item.id,
            videoId: item.videoId,
            title: item.title,
            channel: item.channelTitle || item.channel || 'YouTube',
            url: item.sourceUrl || `https://www.youtube.com/watch?v=${item.videoId}`,
            thumbnail: item.thumbnail || (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` : ''),
            duration: item.duration || '',
            type: 'video',
            progress: item.progress || '0%',
            progressPct: 0
          };
        }
      }

      // Priority 5: First incomplete queue item (playlist or video)
      for (const item of queue) {
        if (item.type === 'video' && !item.completed) {
          return {
            id: item.id,
            videoId: item.videoId,
            title: item.title,
            channel: item.channelTitle || item.channel || 'YouTube',
            url: item.sourceUrl || `https://www.youtube.com/watch?v=${item.videoId}`,
            thumbnail: item.thumbnail || (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` : ''),
            duration: item.duration || '',
            type: 'video',
            progress: '0%',
            progressPct: 0
          };
        }
        if (item.type === 'playlist' && Array.isArray(item.videos) && item.completedCount < (item.totalCount || item.videos.length)) {
          const nextIdx = item.videos.findIndex(v => !v.completed);
          const idx = nextIdx >= 0 ? nextIdx : 0;
          const sub = item.videos[idx] || item.videos[0];
          if (sub) {
            const totalLessons = item.totalCount || item.videos.length;
            const pct = totalLessons > 0 ? Math.round((item.completedCount / totalLessons) * 100) : 0;
            return {
              id: item.id,
              playlistId: item.playlistId,
              videoId: sub.videoId,
              title: `${item.title} — ${sub.title}`,
              playlistTitle: item.title,
              lessonTitle: sub.title,
              lessonNumber: idx + 1,
              totalLessons: totalLessons,
              completedCount: item.completedCount,
              channel: item.channelTitle || 'YouTube',
              url: `https://www.youtube.com/watch?v=${sub.videoId}&list=${item.playlistId}`,
              thumbnail: sub.thumbnail || item.thumbnail || (sub.videoId ? `https://i.ytimg.com/vi/${sub.videoId}/hqdefault.jpg` : ''),
              duration: sub.duration || '',
              type: 'playlist',
              progress: `${pct}%`,
              progressPct: pct
            };
          }
        }
      }

      return null;
    },

    /**
     * Calculate comprehensive Learning Queue intelligence metrics
     */
    async getQueueIntelligence() {
      const queue = await this.getLearningQueue();
      let totalVideos = 0;
      let completedVideos = 0;
      let totalDurationSecs = 0;
      let completedDurationSecs = 0;
      let playlistsCount = 0;
      let completedPlaylistsCount = 0;

      for (const item of queue) {
        if (item.type === 'playlist') {
          playlistsCount++;
          if (item.completedCount === item.totalCount && item.totalCount > 0) {
            completedPlaylistsCount++;
          }
          (item.videos || []).forEach(v => {
            totalVideos++;
            const d = v.durationSeconds || parseDurationToSeconds(v.duration) || 600; // default 10m if unknown
            totalDurationSecs += d;
            if (v.completed) {
              completedVideos++;
              completedDurationSecs += d;
            }
          });
        } else {
          totalVideos++;
          const d = item.durationSeconds || parseDurationToSeconds(item.duration) || 600;
          totalDurationSecs += d;
          if (item.completed) {
            completedVideos++;
            completedDurationSecs += d;
          }
        }
      }

      const remainingVideos = Math.max(0, totalVideos - completedVideos);
      const remainingDurationSecs = Math.max(0, totalDurationSecs - completedDurationSecs);
      const completionPct = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;
      const nextItem = await this.getContinueLearningItem();

      return {
        totalItems: queue.length,
        totalVideos,
        completedVideos,
        remainingVideos,
        playlistsCount,
        completedPlaylistsCount,
        totalDurationSecs,
        completedDurationSecs,
        remainingDurationSecs,
        completionPct,
        nextItem
      };
    },

    // =========================================================================
    // 3. WATCH-TIME TRACKING & SESSIONS
    // =========================================================================

    /**
     * Get Today's Stats
     */
    async getDailyStats() {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.DAILY_STATS) || 'yt_focus_daily_stats';
        const todayStr = getTodayDateString();
        const result = await chrome.storage.local.get(key);
        const allStats = result[key] || {};
        if (!allStats[todayStr]) {
          allStats[todayStr] = {
            date: todayStr,
            watchTimeSeconds: 0,
            focusTimeSeconds: 0,
            learningTimeSeconds: 0,
            shortsTimeSeconds: 0,
            videosWatched: 0,
            sessionsCount: 0
          };
        }
        return { today: allStats[todayStr], all: allStats };
      } catch (err) {
        console.error('[WatchFlow] Error getting daily stats:', err);
        return {
          today: { date: getTodayDateString(), watchTimeSeconds: 0, videosWatched: 0 },
          all: {}
        };
      }
    },

    /**
     * Record incremental playback watch time
     */
    async recordWatchTime(deltaSeconds, isShort = false, isLearning = false, inFocus = false) {
      if (typeof deltaSeconds !== 'number' || deltaSeconds <= 0) return;
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.DAILY_STATS) || 'yt_focus_daily_stats';
        const todayStr = getTodayDateString();
        const result = await chrome.storage.local.get(key);
        const allStats = result[key] || {};

        if (!allStats[todayStr]) {
          allStats[todayStr] = {
            date: todayStr,
            watchTimeSeconds: 0,
            focusTimeSeconds: 0,
            learningTimeSeconds: 0,
            shortsTimeSeconds: 0,
            videosWatched: 0,
            sessionsCount: 0
          };
        }

        allStats[todayStr].watchTimeSeconds = (allStats[todayStr].watchTimeSeconds || 0) + deltaSeconds;
        if (inFocus) {
          allStats[todayStr].focusTimeSeconds = (allStats[todayStr].focusTimeSeconds || 0) + deltaSeconds;
        }
        if (isShort) {
          allStats[todayStr].shortsTimeSeconds = (allStats[todayStr].shortsTimeSeconds || 0) + deltaSeconds;
        }
        if (isLearning) {
          allStats[todayStr].learningTimeSeconds = (allStats[todayStr].learningTimeSeconds || 0) + deltaSeconds;
        }

        await chrome.storage.local.set({ [key]: allStats });
      } catch (err) {
        console.error('[WatchFlow] Error recording watch time:', err);
      }
    },

    /**
     * Record completed watch session
     */
    async recordWatchSession(session) {
      if (!session || !session.durationSeconds || session.durationSeconds < 5) return;
      try {
        const sessKey = (STORAGE_KEYS && STORAGE_KEYS.WATCH_SESSIONS) || 'yt_focus_watch_sessions';
        const result = await chrome.storage.local.get(sessKey);
        const sessions = Array.isArray(result[sessKey]) ? result[sessKey] : [];

        const newSession = {
          id: 'sess_' + Date.now(),
          date: getTodayDateString(),
          startTime: session.startTime || (Date.now() - session.durationSeconds * 1000),
          endTime: Date.now(),
          durationSeconds: Math.round(session.durationSeconds),
          videoId: session.videoId || '',
          videoTitle: session.videoTitle || 'YouTube Video',
          channelTitle: session.channelTitle || '',
          playlistId: session.playlistId || null,
          inFocusMode: !!session.inFocusMode,
          isQueueItem: !!session.isQueueItem
        };

        // Prepend and keep recent 500 sessions
        sessions.unshift(newSession);
        if (sessions.length > 500) sessions.length = 500;

        await chrome.storage.local.set({ [sessKey]: sessions });

        // Update daily stats sessionsCount and videosWatched
        const statsKey = (STORAGE_KEYS && STORAGE_KEYS.DAILY_STATS) || 'yt_focus_daily_stats';
        const statsRes = await chrome.storage.local.get(statsKey);
        const allStats = statsRes[statsKey] || {};
        const todayStr = getTodayDateString();

        if (allStats[todayStr]) {
          allStats[todayStr].sessionsCount = (allStats[todayStr].sessionsCount || 0) + 1;
          allStats[todayStr].videosWatched = (allStats[todayStr].videosWatched || 0) + 1;
          await chrome.storage.local.set({ [statsKey]: allStats });
        }
      } catch (err) {
        console.error('[WatchFlow] Error recording session:', err);
      }
    },

    /**
     * Get Watch Analytics for Dashboard (today, 7d, 30d)
     */
    async getWatchAnalytics(timeRange = '7d') {
      try {
        const statsKey = (STORAGE_KEYS && STORAGE_KEYS.DAILY_STATS) || 'yt_focus_daily_stats';
        const sessKey = (STORAGE_KEYS && STORAGE_KEYS.WATCH_SESSIONS) || 'yt_focus_watch_sessions';
        const [statsRes, sessRes] = await Promise.all([
          chrome.storage.local.get(statsKey),
          chrome.storage.local.get(sessKey)
        ]);

        const allStats = statsRes[statsKey] || {};
        const allSessions = Array.isArray(sessRes[sessKey]) ? sessRes[sessKey] : [];

        // Determine date window
        const now = new Date();
        let daysToInclude = 7;
        if (timeRange === 'today') daysToInclude = 1;
        else if (timeRange === 'yesterday') daysToInclude = 2;
        else if (timeRange === '30d') daysToInclude = 30;

        const dateKeys = [];
        for (let i = daysToInclude - 1; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          dateKeys.push(getTodayDateString(d));
        }

        let totalWatchSecs = 0;
        let totalFocusSecs = 0;
        let totalLearningSecs = 0;
        let videosWatched = 0;
        const dailyBreakdown = [];

        dateKeys.forEach(dateStr => {
          const stat = allStats[dateStr] || {
            watchTimeSeconds: 0,
            focusTimeSeconds: 0,
            learningTimeSeconds: 0,
            videosWatched: 0
          };

          totalWatchSecs += (stat.watchTimeSeconds || 0);
          totalFocusSecs += (stat.focusTimeSeconds || 0);
          totalLearningSecs += (stat.learningTimeSeconds || 0);
          videosWatched += (stat.videosWatched || 0);

          const parts = dateStr.split('-');
          const label = `${parts[1]}/${parts[2]}`;

          dailyBreakdown.push({
            date: dateStr,
            label,
            totalMins: Math.round((stat.watchTimeSeconds || 0) / 60),
            focusMins: Math.round((stat.focusTimeSeconds || 0) / 60),
            learningMins: Math.round((stat.learningTimeSeconds || 0) / 60)
          });
        });

        // Filter sessions within date range
        const matchingSessions = allSessions.filter(s => dateKeys.includes(s.date));
        const sessionCount = matchingSessions.length;
        const avgSessionSecs = sessionCount > 0 ? Math.round(totalWatchSecs / sessionCount) : 0;
        const longestSessionSecs = matchingSessions.reduce((max, s) => Math.max(max, s.durationSeconds || 0), 0);

        const focusPct = totalWatchSecs > 0 ? Math.min(100, Math.round((totalFocusSecs / totalWatchSecs) * 100)) : 0;
        const learningPct = totalWatchSecs > 0 ? Math.min(100, Math.round((totalLearningSecs / totalWatchSecs) * 100)) : 0;

        return {
          timeRange,
          totalWatchTimeSeconds: totalWatchSecs,
          focusedTimeSeconds: totalFocusSecs,
          learningTimeSeconds: totalLearningSecs,
          videosWatchedCount: videosWatched,
          sessionsCount: sessionCount,
          averageSessionSeconds: avgSessionSecs,
          longestSessionSeconds: longestSessionSecs,
          focusPercentage: focusPct,
          learningPercentage: learningPct,
          dailyBreakdown,
          recentSessions: matchingSessions.slice(0, 10)
        };
      } catch (err) {
        console.error('[WatchFlow] Error compiling analytics:', err);
        return {
          totalWatchTimeSeconds: 0,
          focusedTimeSeconds: 0,
          learningTimeSeconds: 0,
          videosWatchedCount: 0,
          sessionsCount: 0,
          focusPercentage: 0,
          learningPercentage: 0,
          dailyBreakdown: [],
          recentSessions: []
        };
      }
    },

    // =========================================================================
    // 4. COOLDOWN & SCHEDULES
    // =========================================================================

    /**
     * Get active cooldown state
     */
    async getCooldownState() {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.COOLDOWN_STATE) || 'yt_focus_cooldown_state';
        const res = await chrome.storage.local.get(key);
        const state = res[key];
        if (!state || !state.active) return { active: false, remainingSeconds: 0 };

        const now = Date.now();
        if (now >= state.expiresAt) {
          await chrome.storage.local.remove(key);
          return { active: false, remainingSeconds: 0 };
        }

        return {
          active: true,
          reason: state.reason || 'limit',
          expiresAt: state.expiresAt,
          remainingSeconds: Math.max(0, Math.round((state.expiresAt - now) / 1000))
        };
      } catch (err) {
        return { active: false, remainingSeconds: 0 };
      }
    },

    /**
     * Set cooldown state
     */
    async setCooldownState(active, durationMinutes = 10, reason = 'limit') {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.COOLDOWN_STATE) || 'yt_focus_cooldown_state';
        if (!active) {
          await chrome.storage.local.remove(key);
          return { active: false, remainingSeconds: 0 };
        }
        const expiresAt = Date.now() + durationMinutes * 60 * 1000;
        const state = { active: true, reason, expiresAt };
        await chrome.storage.local.set({ [key]: state });
        return { active: true, reason, expiresAt, remainingSeconds: durationMinutes * 60 };
      } catch (err) {
        console.error('[WatchFlow] Error setting cooldown:', err);
      }
    },

    /**
     * Get Schedules
     */
    async getSchedules() {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.SCHEDULES) || 'yt_focus_schedules';
        const res = await chrome.storage.local.get(key);
        return Array.isArray(res[key]) ? res[key] : [
          {
            id: 'sch_study',
            name: 'Study Hours',
            startTime: '09:00',
            endTime: '13:00',
            days: [1, 2, 3, 4, 5],
            mode: 'focus', // 'focus' | 'block'
            enabled: false
          },
          {
            id: 'sch_night',
            name: 'Night Rest',
            startTime: '22:00',
            endTime: '07:00',
            days: [0, 1, 2, 3, 4, 5, 6],
            mode: 'block',
            enabled: false
          }
        ];
      } catch (err) {
        return [];
      }
    },

    /**
     * Save Schedules
     */
    async saveSchedules(schedules) {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.SCHEDULES) || 'yt_focus_schedules';
        await chrome.storage.local.set({ [key]: schedules });
        return schedules;
      } catch (err) {
        console.error('[WatchFlow] Error saving schedules:', err);
        throw err;
      }
    },

    /**
     * Check if any active schedule applies right now (local time)
     */
    async isScheduleActiveNow() {
      const schedules = await this.getSchedules();
      if (!Array.isArray(schedules) || schedules.length === 0) return null;

      const now = new Date();
      const currentDay = now.getDay(); // 0 is Sunday, 6 is Saturday
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      for (const sch of schedules) {
        if (!sch.enabled) continue;
        if (Array.isArray(sch.days) && sch.days.length > 0 && !sch.days.includes(currentDay)) continue;

        const [startH, startM] = (sch.startTime || '00:00').split(':').map(n => parseInt(n, 10));
        const [endH, endM] = (sch.endTime || '23:59').split(':').map(n => parseInt(n, 10));
        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;

        let inWindow = false;
        if (startTotal <= endTotal) {
          // Normal daytime window e.g. 09:00 - 17:00
          inWindow = currentMinutes >= startTotal && currentMinutes < endTotal;
        } else {
          // Overnight window e.g. 22:00 - 07:00
          inWindow = currentMinutes >= startTotal || currentMinutes < endTotal;
        }

        if (inWindow) {
          return sch;
        }
      }

      return null;
    },

    // =========================================================================
    // 5. PRIVACY DATA CONTROLS
    // =========================================================================

    /**
     * Clear watch sessions and daily stats
     */
    async clearWatchHistory() {
      try {
        const sessKey = (STORAGE_KEYS && STORAGE_KEYS.WATCH_SESSIONS) || 'yt_focus_watch_sessions';
        const statsKey = (STORAGE_KEYS && STORAGE_KEYS.DAILY_STATS) || 'yt_focus_daily_stats';
        await chrome.storage.local.remove([sessKey, statsKey]);
        return true;
      } catch (err) {
        console.error('[WatchFlow] Error clearing history:', err);
        return false;
      }
    },

    /**
     * Clear learning queue
     */
    async clearLearningQueue() {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        await chrome.storage.local.remove(key);
        return true;
      } catch (err) {
        console.error('[WatchFlow] Error clearing queue:', err);
        return false;
      }
    },

    /**
     * Reset all data completely
     */
    async resetAllData() {
      try {
        await chrome.storage.local.clear();
        await this.resetSettings();
        return true;
      } catch (err) {
        console.error('[WatchFlow] Error resetting all data:', err);
        return false;
      }
    },

    /**
     * Helper to extract video ID from YouTube URL
     */
    extractVideoId(url) {
      if (!url) return null;
      try {
        const parsed = new URL(url);
        if (parsed.searchParams.has('v')) return parsed.searchParams.get('v');
        if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.replace('/shorts/', '');
        if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.replace('/embed/', '');
        return null;
      } catch (e) {
        return null;
      }
    },

    /**
     * Listen to settings changes across contexts
     */
    onSettingsChanged(callback) {
      const listener = (changes, areaName) => {
        if (areaName === 'local') {
          const key = (STORAGE_KEYS && STORAGE_KEYS.SETTINGS) || 'yt_focus_settings';
          if (changes[key]) {
            callback(changes[key].newValue, changes[key].oldValue);
          }
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  };

  root.YTF_STORAGE = storageService;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = storageService;
  }
})(typeof self !== 'undefined' ? self : this);
