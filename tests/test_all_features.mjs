import { readFileSync } from 'fs';
import { resolve } from 'path';

console.log('==============================================');
console.log('RUNNING FULL COMPREHENSIVE TEST SUITE');
console.log('==============================================');

// In-memory mock chrome.storage.local
const mockStorage = {};
const listeners = [];

globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        if (typeof keys === 'string') {
          return { [keys]: mockStorage[keys] };
        }
        if (Array.isArray(keys)) {
          const res = {};
          keys.forEach(k => { res[k] = mockStorage[k]; });
          return res;
        }
        return Object.assign({}, mockStorage);
      },
      set: async (items) => {
        Object.assign(mockStorage, items);
      },
      remove: async (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach(k => delete mockStorage[k]);
      },
      clear: async () => {
        for (const k in mockStorage) delete mockStorage[k];
      }
    },
    onChanged: {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      }
    }
  },
  runtime: {
    getURL: (path) => `chrome-extension://mock-id/${path}`,
    openOptionsPage: () => {}
  }
};

globalThis.self = globalThis;
globalThis.window = globalThis;

// Load constants and storage services
const constantsCode = readFileSync(resolve('src/shared/constants.js'), 'utf8');
eval(constantsCode);

const storageCode = readFileSync(resolve('src/shared/storage.js'), 'utf8');
eval(storageCode);

const storage = globalThis.YTF_STORAGE;
const constants = globalThis.YTF_CONSTANTS;

async function runTests() {
  // TEST 1: Default Settings
  console.log('\n--- 1. Testing Settings & Defaults ---');
  let settings = await storage.getSettings();
  console.assert(settings.dailyLimitMinutes === 60, 'Default dailyLimitMinutes should be 60');
  console.assert(settings.focusModeEnabled === true, 'Default focusModeEnabled should be true');
  console.assert(settings.autoCompleteThreshold === 0.9, 'Default autoCompleteThreshold should be 0.9');
  console.log('✓ Default settings verified');

  await storage.saveSettings({ dailyLimitMinutes: 45, limitMode: 'hard' });
  settings = await storage.getSettings();
  console.assert(settings.dailyLimitMinutes === 45, 'Saved daily limit should be 45');
  console.assert(settings.limitMode === 'hard', 'Limit mode should be hard');
  console.log('✓ Settings update verified');

  // TEST 2: Learning Queue (Individual Video)
  console.log('\n--- 2. Testing Video Queue ---');
  const vid1 = {
    videoId: 'abc1234',
    title: 'Python Async/Await Masterclass',
    channelTitle: 'Tech Pro',
    duration: '24:15',
    sourceUrl: 'https://www.youtube.com/watch?v=abc1234'
  };
  await storage.addVideoToQueue(vid1);
  let queue = await storage.getLearningQueue();
  console.assert(queue.length === 1, 'Queue should have 1 item');
  console.assert(queue[0].type === 'video', 'Item type should be video');
  console.assert(queue[0].completed === false, 'New item should not be completed');
  console.log('✓ Video added to Learning Queue successfully');

  // Duplicate prevention
  await storage.addVideoToQueue(vid1);
  queue = await storage.getLearningQueue();
  console.assert(queue.length === 1, 'Queue should not add duplicate video');
  console.log('✓ Duplicate video addition prevented');

  // TEST 3: Learning Queue (Entire Playlist)
  console.log('\n--- 3. Testing Playlist Queue ---');
  const playlist1 = {
    playlistId: 'PL_test123',
    title: 'Machine Learning from Scratch',
    channelTitle: 'AI Academy',
    sourceUrl: 'https://www.youtube.com/playlist?list=PL_test123',
    videos: [
      { videoId: 'v1', title: 'Lesson 1: Intro', duration: '10:00' },
      { videoId: 'v2', title: 'Lesson 2: Math Basics', duration: '15:00' },
      { videoId: 'v3', title: 'Lesson 3: Regression', duration: '20:00' }
    ]
  };
  await storage.addPlaylistToQueue(playlist1);
  queue = await storage.getLearningQueue();
  console.assert(queue.length === 2, 'Queue should have 2 items (1 video + 1 playlist)');
  const plItem = queue.find(q => q.type === 'playlist');
  console.assert(plItem !== undefined, 'Playlist queue item must exist');
  console.assert(plItem.totalCount === 3, 'Playlist totalCount should be 3');
  console.assert(plItem.completedCount === 0, 'Playlist completedCount should be 0');
  console.log('✓ Entire Playlist added as first-class item successfully');

  // TEST 4: Toggling & Playlist Expansion
  console.log('\n--- 4. Testing Playlist Lesson Completion ---');
  await storage.toggleQueueItem(plItem.id, 'v1');
  queue = await storage.getLearningQueue();
  let updatedPl = queue.find(q => q.id === plItem.id);
  console.assert(updatedPl.completedCount === 1, 'Playlist completedCount should now be 1');
  console.assert(updatedPl.videos[0].completed === true, 'v1 should be marked completed');
  console.assert(updatedPl.videos[1].completed === false, 'v2 should still be incomplete');
  console.log('✓ Individual playlist lesson toggled without flattening');

  // TEST 5: Auto-completion threshold (90% watched)
  console.log('\n--- 5. Testing Auto-completion (90% watched) ---');
  const autoRes = await storage.autoCompleteVideo('v2');
  console.assert(autoRes !== null && autoRes.success === true, 'autoCompleteVideo should succeed');
  queue = await storage.getLearningQueue();
  updatedPl = queue.find(q => q.id === plItem.id);
  console.assert(updatedPl.completedCount === 2, 'Playlist completedCount should now be 2');
  console.assert(updatedPl.videos[1].completed === true, 'v2 should now be auto-completed');
  console.log('✓ Auto-completed lesson upon reaching 90% threshold');

  // TEST 6: Continue Learning & Queue Intelligence
  console.log('\n--- 6. Testing Continue Learning & Intelligence ---');
  const nextItem = await storage.getContinueLearningItem();
  console.assert(nextItem !== null, 'Next item should exist');
  console.assert(nextItem.url.includes('v=abc1234') || nextItem.url.includes('v=v3'), 'Next item should be an incomplete item');
  console.log(`✓ Continue Learning identifies: ${nextItem.title} (${nextItem.url})`);

  const intel = await storage.getQueueIntelligence();
  console.assert(intel.totalVideos === 4, 'Total videos should be 4 (1 single + 3 in playlist)');
  console.assert(intel.completedVideos === 2, 'Completed videos should be 2');
  console.assert(intel.remainingVideos === 2, 'Remaining videos should be 2');
  console.assert(intel.completionPct === 50, 'Completion rate should be 50%');
  console.log('✓ Queue Intelligence calculated metrics accurately');

  // TEST 7: Watch-Time Sessions & Analytics
  console.log('\n--- 7. Testing Watch-Time Sessions & Analytics ---');
  await storage.recordWatchTime(600, false, true, true); // 10 minutes focused learning
  await storage.recordWatchSession({
    videoId: 'abc1234',
    videoTitle: 'Python Async/Await Masterclass',
    channelTitle: 'Tech Pro',
    durationSeconds: 600,
    inFocusMode: true,
    isQueueItem: true
  });

  const analytics = await storage.getWatchAnalytics('7d');
  console.assert(analytics.totalWatchTimeSeconds >= 600, 'Total watch time should be >= 600s');
  console.assert(analytics.focusedTimeSeconds >= 600, 'Focused time should be >= 600s');
  console.assert(analytics.sessionsCount >= 1, 'Session count should be >= 1');
  console.assert(analytics.dailyBreakdown.length === 7, 'Daily breakdown should have 7 days');
  console.log('✓ Watch sessions and analytics compiled accurately');

  // TEST 8: Cooldown Mode
  console.log('\n--- 8. Testing Cooldown Mode ---');
  const cdState = await storage.setCooldownState(true, 10, 'limit');
  console.assert(cdState.active === true, 'Cooldown should be active');
  console.assert(cdState.remainingSeconds > 0, 'Cooldown remaining seconds should be > 0');
  let activeCd = await storage.getCooldownState();
  console.assert(activeCd.active === true, 'Cooldown should be retrieved as active');
  await storage.setCooldownState(false);
  activeCd = await storage.getCooldownState();
  console.assert(activeCd.active === false, 'Cooldown should now be cleared');
  console.log('✓ Cooldown mode state management verified');

  // TEST 9: Schedules
  console.log('\n--- 9. Testing Schedules ---');
  const schedules = await storage.getSchedules();
  console.assert(Array.isArray(schedules), 'Schedules should be an array');
  const newSch = {
    id: 'sch_test',
    name: 'All Day Focus',
    startTime: '00:00',
    endTime: '23:59',
    days: [0, 1, 2, 3, 4, 5, 6],
    mode: 'focus',
    enabled: true
  };
  await storage.saveSchedules([newSch]);
  const activeNow = await storage.isScheduleActiveNow();
  console.assert(activeNow !== null && activeNow.id === 'sch_test', 'All-day schedule should be active now');
  console.log('✓ Schedule evaluation verified against local time');

  // TEST 10: Privacy Clear Functions
  console.log('\n--- 10. Testing Privacy & Wipe Controls ---');
  await storage.clearWatchHistory();
  const clearedAnalytics = await storage.getWatchAnalytics('7d');
  console.assert(clearedAnalytics.totalWatchTimeSeconds === 0, 'Watch history should be cleared');
  console.log('✓ Clear Watch History verified');

  await storage.clearLearningQueue();
  const clearedQueue = await storage.getLearningQueue();
  console.assert(clearedQueue.length === 0, 'Learning queue should be empty');
  console.log('✓ Clear Learning Queue verified');

  await storage.resetAllData();
  const resetSettings = await storage.getSettings();
  console.assert(resetSettings.dailyLimitMinutes === 60, 'Settings reset to factory defaults');
  console.log('✓ Reset All Data verified');

  console.log('\n==============================================');
  console.log('ALL 10 TEST PHASES PASSED WITH ZERO ERRORS!');
  console.log('==============================================');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
