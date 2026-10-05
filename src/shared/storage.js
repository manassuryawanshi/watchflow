/**
 * YouTube Focus - Universal Storage Service
 * Wraps chrome.storage.local with defaults, error handling, and clean helpers.
 */

(function (root) {
  'use strict';

  const { STORAGE_KEYS, DEFAULT_SETTINGS } = (root.YTF_CONSTANTS || {});

  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const storageService = {
    /**
     * Get settings merged with defaults
     */
    async getSettings() {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.SETTINGS) || 'yt_focus_settings';
        const defaults = (DEFAULT_SETTINGS) || {};
        const result = await chrome.storage.local.get(key);
        return Object.assign({}, defaults, result[key] || {});
      } catch (err) {
        console.error('[YouTube Focus] Error fetching settings:', err);
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
        console.error('[YouTube Focus] Error saving settings:', err);
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
        console.error('[YouTube Focus] Error resetting settings:', err);
        throw err;
      }
    },

    /**
     * Get learning queue items
     */
    async getLearningQueue() {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const result = await chrome.storage.local.get(key);
        return Array.isArray(result[key]) ? result[key] : [];
      } catch (err) {
        console.error('[YouTube Focus] Error getting learning queue:', err);
        return [];
      }
    },

    /**
     * Add item to learning queue
     */
    async addToLearningQueue(item) {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const queue = await this.getLearningQueue();
        // Check if item already exists by URL or video ID
        const existsIndex = queue.findIndex(q => q.id === item.id || (item.url && q.url === item.url));
        if (existsIndex >= 0) {
          queue[existsIndex] = Object.assign({}, queue[existsIndex], item);
        } else {
          queue.unshift({
            id: item.id || 'vid_' + Date.now(),
            title: item.title || 'Untitled Video',
            channel: item.channel || 'Unknown Channel',
            duration: item.duration || '',
            url: item.url || '',
            thumbnail: item.thumbnail || '',
            completed: false,
            addedAt: Date.now(),
            note: item.note || '',
            category: item.category || 'General'
          });
        }
        await chrome.storage.local.set({ [key]: queue });
        return queue;
      } catch (err) {
        console.error('[YouTube Focus] Error adding to learning queue:', err);
        throw err;
      }
    },

    /**
     * Remove item from learning queue
     */
    async removeFromLearningQueue(id) {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const queue = await this.getLearningQueue();
        const updated = queue.filter(q => q.id !== id);
        await chrome.storage.local.set({ [key]: updated });
        return updated;
      } catch (err) {
        console.error('[YouTube Focus] Error removing from queue:', err);
        throw err;
      }
    },

    /**
     * Toggle completion status
     */
    async toggleQueueItem(id) {
      try {
        const key = (STORAGE_KEYS && STORAGE_KEYS.LEARNING_QUEUE) || 'yt_focus_learning_queue';
        const queue = await this.getLearningQueue();
        const item = queue.find(q => q.id === id);
        if (item) {
          item.completed = !item.completed;
          if (item.completed) {
            item.completedAt = Date.now();
          } else {
            delete item.completedAt;
          }
          await chrome.storage.local.set({ [key]: queue });
        }
        return queue;
      } catch (err) {
        console.error('[YouTube Focus] Error toggling queue item:', err);
        throw err;
      }
    },

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
            learningTimeSeconds: 0,
            shortsTimeSeconds: 0,
            videosWatched: 0,
            sessionsCount: 0
          };
        }
        return { today: allStats[todayStr], all: allStats };
      } catch (err) {
        console.error('[YouTube Focus] Error getting daily stats:', err);
        return {
          today: { date: getTodayDateString(), watchTimeSeconds: 0, videosWatched: 0 },
          all: {}
        };
      }
    },

    /**
     * Record Watch Time (local increment)
     */
    async recordWatchTime(deltaSeconds, isShort = false, isLearning = false) {
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
            learningTimeSeconds: 0,
            shortsTimeSeconds: 0,
            videosWatched: 0,
            sessionsCount: 0
          };
        }
        allStats[todayStr].watchTimeSeconds = (allStats[todayStr].watchTimeSeconds || 0) + deltaSeconds;
        if (isShort) {
          allStats[todayStr].shortsTimeSeconds = (allStats[todayStr].shortsTimeSeconds || 0) + deltaSeconds;
        }
        if (isLearning) {
          allStats[todayStr].learningTimeSeconds = (allStats[todayStr].learningTimeSeconds || 0) + deltaSeconds;
        }
        await chrome.storage.local.set({ [key]: allStats });
      } catch (err) {
        console.error('[YouTube Focus] Error recording watch time:', err);
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
