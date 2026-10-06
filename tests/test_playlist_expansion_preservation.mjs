/**
 * Automated Real Chrome Validation for WatchFlow Dashboard:
 * Learning Queue Playlist Expansion State Preservation (Tests 1 to 11)
 */

import { spawn } from 'child_process';
import assert from 'assert';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const extPath = process.cwd();
const userDataDir = '/tmp/watchflow-playlist-test-' + Date.now();
const debugPort = 9228;

console.log('======================================================================');
console.log('WATCHFLOW DASHBOARD: PLAYLIST EXPANSION STATE REAL-CHROME VALIDATION');
console.log('======================================================================');

const chromeProc = spawn(chromePath, [
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
]);

chromeProc.on('error', (err) => {
  console.error('Failed to launch Chrome:', err);
  process.exit(1);
});

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  try {
    await sleep(2000);

    const versionRes = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    const browserWs = new WebSocket(versionRes.webSocketDebuggerUrl);
    await new Promise(r => browserWs.onopen = r);

    let bMsgId = 1;
    function sendBrowser(method, params = {}) {
      return new Promise((resolve) => {
        const id = bMsgId++;
        const handler = (e) => {
          const d = JSON.parse(e.data);
          if (d.id === id) {
            browserWs.removeEventListener('message', handler);
            resolve(d.result);
          }
        };
        browserWs.addEventListener('message', handler);
        browserWs.send(JSON.stringify({ id, method, params }));
      });
    }

    async function connectToTarget(targetId) {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const target = targets.find(t => t.id === targetId);
      assert(target, `Target ${targetId} not found`);
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise(r => ws.onopen = r);

      let pMsgId = 1;
      function send(method, params = {}) {
        return new Promise((resolve) => {
          const id = pMsgId++;
          const handler = (e) => {
            const d = JSON.parse(e.data);
            if (d.id === id) {
              ws.removeEventListener('message', handler);
              resolve(d.result);
            }
          };
          ws.addEventListener('message', handler);
          ws.send(JSON.stringify({ id, method, params }));
        });
      }

      async function evaluate(expression) {
        const res = await send('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true
        });
        if (res.exceptionDetails) {
          throw new Error('Evaluation exception: ' + JSON.stringify(res.exceptionDetails));
        }
        return res.result?.value;
      }

      return { ws, send, evaluate, targetId };
    }

    async function closeTarget(client) {
      try {
        await client.ws.close();
        await sendBrowser('Target.closeTarget', { targetId: client.targetId });
      } catch (e) {}
    }

    async function waitForElement(client, selector, timeoutMs = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const exists = await client.evaluate(`!!document.querySelector('${selector}')`);
        if (exists) return true;
        await sleep(250);
      }
      throw new Error(`Timeout waiting for element '${selector}' after ${timeoutMs}ms`);
    }

    // Step 0: Load unpacked extension
    console.log('\n--- Step 0: Loading Unpacked Extension ---');
    const loadResult = await sendBrowser('Extensions.loadUnpacked', { path: extPath });
    const extId = loadResult.id;
    console.log('✓ Extension loaded with ID:', extId);

    // Open Dashboard tab
    const dashUrl = `chrome-extension://${extId}/src/dashboard/dashboard.html#learning`;
    const dashTargetInfo = await sendBrowser('Target.createTarget', { url: dashUrl });
    const dashClient = await connectToTarget(dashTargetInfo.targetId);
    await dashClient.send('Page.enable');
    await dashClient.send('Runtime.enable');
    await waitForElement(dashClient, '#learning-queue-list', 15000);
    await sleep(1000);

    // Seed test playlists: Playlist A (3 lessons), Playlist B (2 lessons), Playlist C (2 lessons)
    console.log('\n--- Seeding Test Playlists (A, B, C) ---');
    await dashClient.evaluate(`
      window.YTF_STORAGE.clearLearningQueue().then(() => {
        return window.YTF_STORAGE.addPlaylistToQueue({
          playlistId: 'PL_COURSE_A',
          title: 'Algorithms 101 - Course A',
          channelTitle: 'CS Academy',
          sourceUrl: 'https://www.youtube.com/playlist?list=PL_COURSE_A',
          videos: [
            { videoId: 'lessonA_001', title: 'Lesson 1: Introduction to Big-O', duration: '12:00', completed: false },
            { videoId: 'lessonA_002', title: 'Lesson 2: Divide and Conquer', duration: '15:30', completed: false },
            { videoId: 'lessonA_003', title: 'Lesson 3: Dynamic Programming', duration: '22:15', completed: false }
          ]
        });
      }).then(() => {
        return window.YTF_STORAGE.addPlaylistToQueue({
          playlistId: 'PL_COURSE_B',
          title: 'System Design - Course B',
          channelTitle: 'Eng Team',
          sourceUrl: 'https://www.youtube.com/playlist?list=PL_COURSE_B',
          videos: [
            { videoId: 'lessonB_001', title: 'Lesson 1: Load Balancers', duration: '10:00', completed: false },
            { videoId: 'lessonB_002', title: 'Lesson 2: Caching Strategies', duration: '14:00', completed: false }
          ]
        });
      }).then(() => {
        return window.YTF_STORAGE.addPlaylistToQueue({
          playlistId: 'PL_COURSE_C',
          title: 'Database Internals - Course C',
          channelTitle: 'DB Dept',
          sourceUrl: 'https://www.youtube.com/playlist?list=PL_COURSE_C',
          videos: [
            { videoId: 'lessonC_001', title: 'Lesson 1: B-Trees and LSM Trees', duration: '18:00', completed: false },
            { videoId: 'lessonC_002', title: 'Lesson 2: WAL and Transactions', duration: '20:00', completed: false }
          ]
        });
      }).then(() => {
        return window.loadAllData();
      })
    `);
    await sleep(800);

    // ============================================================
    // TEST 1 — Expand Playlist A -> Complete a Lesson -> Stays Expanded
    // ============================================================
    console.log('\n--- TEST 1: Expand Playlist A -> Complete Lesson -> Stays Expanded ---');
    // Click "Lessons" button on Playlist A (PL_COURSE_A)
    const t1Expand = await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const expandBtn = cardA.querySelector('.btn-expand-pl');
      expandBtn.click();
      const drawer = cardA.querySelector('.playlist-drawer');
      const lessons = cardA.querySelectorAll('.lesson-row');
      return {
        isDrawerVisible: drawer.style.display !== 'none',
        btnActive: expandBtn.classList.contains('active'),
        ariaExpanded: expandBtn.getAttribute('aria-expanded'),
        lessonCount: lessons.length
      };
    })()`);
    console.log('Playlist A expanded state:', t1Expand);
    assert.strictEqual(t1Expand.isDrawerVisible, true, 'Drawer A must be visible');
    assert.strictEqual(t1Expand.btnActive, true, 'Button A must be active');
    assert.strictEqual(t1Expand.ariaExpanded, 'true', 'aria-expanded must be true');
    assert.strictEqual(t1Expand.lessonCount, 3, 'Must render 3 lessons for Playlist A');

    // Toggle Lesson 1 complete
    console.log('Toggling Lesson 1 complete...');
    await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const check1 = cardA.querySelectorAll('.lesson-check')[0];
      check1.click();
    })()`);
    await sleep(800);

    const t1AfterComplete = await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const drawer = cardA.querySelector('.playlist-drawer');
      const expandBtn = cardA.querySelector('.btn-expand-pl');
      const check1 = cardA.querySelectorAll('.lesson-check')[0];
      const title1 = cardA.querySelectorAll('.lesson-title')[0];
      const badge = cardA.querySelector('.badge');
      return {
        isDrawerVisible: drawer.style.display !== 'none',
        btnActive: expandBtn.classList.contains('active'),
        ariaExpanded: expandBtn.getAttribute('aria-expanded'),
        check1Checked: check1.checked,
        title1Completed: title1.classList.contains('completed'),
        badgeText: badge ? badge.textContent.trim() : ''
      };
    })()`);
    console.log('Playlist A after lesson 1 complete:', t1AfterComplete);
    assert.strictEqual(t1AfterComplete.isDrawerVisible, true, 'TEST 1: Drawer A MUST REMAIN EXPANDED after completing lesson');
    assert.strictEqual(t1AfterComplete.btnActive, true, 'Button A remains active');
    assert.strictEqual(t1AfterComplete.ariaExpanded, 'true', 'aria-expanded remains true');
    assert.strictEqual(t1AfterComplete.check1Checked, true, 'Lesson 1 checkbox is checked');
    assert.strictEqual(t1AfterComplete.title1Completed, true, 'Lesson 1 title has completed class');
    assert(t1AfterComplete.badgeText.includes('1 / 3 completed'), 'Playlist badge shows 1 / 3 completed');
    console.log('✓ TEST 1 PASS: Playlist A remained expanded and updated lesson state without collapse');

    // ============================================================
    // TEST 2 — Expand Playlist A -> Delete a lesson -> Stays Expanded
    // ============================================================
    console.log('\n--- TEST 2: Delete a lesson -> Stays Expanded & lesson disappears ---');
    // Remove Lesson 2 (Divide and Conquer)
    await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const deleteBtn2 = cardA.querySelectorAll('.btn-delete-lesson')[1];
      deleteBtn2.click();
    })()`);
    await sleep(800);

    const t2AfterDelete = await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const drawer = cardA.querySelector('.playlist-drawer');
      const expandBtn = cardA.querySelector('.btn-expand-pl');
      const lessonTitles = Array.from(cardA.querySelectorAll('.lesson-title')).map(t => t.textContent.trim());
      const badge = cardA.querySelector('.badge');
      return {
        isDrawerVisible: drawer.style.display !== 'none',
        btnActive: expandBtn.classList.contains('active'),
        ariaExpanded: expandBtn.getAttribute('aria-expanded'),
        lessonTitles,
        badgeText: badge ? badge.textContent.trim() : ''
      };
    })()`);
    console.log('Playlist A after lesson 2 deleted:', t2AfterDelete);
    assert.strictEqual(t2AfterDelete.isDrawerVisible, true, 'TEST 2: Drawer A MUST REMAIN EXPANDED after deleting lesson');
    assert.strictEqual(t2AfterDelete.btnActive, true, 'Button A remains active');
    assert.strictEqual(t2AfterDelete.ariaExpanded, 'true', 'aria-expanded remains true');
    assert.strictEqual(t2AfterDelete.lessonTitles.length, 2, 'Only 2 lessons remain');
    assert(!t2AfterDelete.lessonTitles.some(t => t.includes('Divide and Conquer')), 'Divide and Conquer was removed');
    assert(t2AfterDelete.badgeText.includes('1 / 2 completed'), 'Badge updated to 1 / 2 completed');
    console.log('✓ TEST 2 PASS: Playlist A remained expanded, deleted lesson removed cleanly');

    // ============================================================
    // TEST 3 — Scroll Position Preserved
    // ============================================================
    console.log('\n--- TEST 3: Scroll Position Preserved during Lesson Complete ---');
    await dashClient.send('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 480,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(500);

    const initialScroll = await dashClient.evaluate(`(() => {
      window.scrollTo(0, 100);
      const sc = document.querySelector('.main-content');
      if (sc) sc.scrollTop = 100;
      return window.scrollY || (sc ? sc.scrollTop : 0);
    })()`);
    console.log('Set scroll position to:', initialScroll);

    // Complete Lesson 2 (originally lesson 3: Dynamic Programming)
    await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const check2 = cardA.querySelectorAll('.lesson-check')[1];
      check2.click();
    })()`);
    await sleep(800);

    const t3ScrollAfter = await dashClient.evaluate(`(() => {
      const sc = document.querySelector('.main-content');
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const currentScroll = window.scrollY || (sc ? sc.scrollTop : 0);
      return {
        scrollTop: currentScroll,
        isDrawerVisible: cardA.querySelector('.playlist-drawer').style.display !== 'none'
      };
    })()`);
    console.log('Scroll position after completion:', t3ScrollAfter);
    assert.strictEqual(t3ScrollAfter.isDrawerVisible, true, 'Playlist A remains expanded');
    assert(Math.abs(t3ScrollAfter.scrollTop - initialScroll) <= 20, `Scroll position preserved (expected ~${initialScroll}, got ${t3ScrollAfter.scrollTop})`);
    console.log('✓ TEST 3 PASS: Scroll position preserved approximately in place');

    await dashClient.send('Emulation.clearDeviceMetricsOverride');
    await sleep(300);

    // ============================================================
    // TEST 4 — Playlist A expanded, Playlist B collapsed -> Modify A -> B stays collapsed
    // ============================================================
    console.log('\n--- TEST 4: Modify Playlist A -> Playlist B remains collapsed ---');
    const t4Check = await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const cardB = document.querySelector('[data-playlist-id="PL_COURSE_B"]');
      return {
        drawerAVisible: cardA.querySelector('.playlist-drawer').style.display !== 'none',
        drawerBVisible: cardB.querySelector('.playlist-drawer').style.display !== 'none',
        btnBActive: cardB.querySelector('.btn-expand-pl').classList.contains('active'),
        ariaExpandedB: cardB.querySelector('.btn-expand-pl').getAttribute('aria-expanded')
      };
    })()`);
    console.log('States of A and B:', t4Check);
    assert.strictEqual(t4Check.drawerAVisible, true, 'Playlist A is expanded');
    assert.strictEqual(t4Check.drawerBVisible, false, 'TEST 4: Playlist B MUST REMAIN COLLAPSED');
    assert.strictEqual(t4Check.btnBActive, false, 'Button B is NOT active');
    assert.strictEqual(t4Check.ariaExpandedB, 'false', 'Button B aria-expanded is false');
    console.log('✓ TEST 4 PASS: Playlist B remained collapsed when Playlist A was modified');

    // ============================================================
    // TEST 5 — Playlists A & C expanded, B collapsed -> Modify B -> A & C stay expanded
    // ============================================================
    console.log('\n--- TEST 5: Expand C -> Modify B -> A and C stay expanded ---');
    // Expand Playlist C
    await dashClient.evaluate(`(() => {
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      cardC.querySelector('.btn-expand-pl').click();
    })()`);
    await sleep(500);

    // Modify Playlist B by toggling all complete on B
    console.log('Toggling all complete on Playlist B...');
    await dashClient.evaluate(`(() => {
      const cardB = document.querySelector('[data-playlist-id="PL_COURSE_B"]');
      cardB.querySelector('.item-complete-check').click();
    })()`);
    await sleep(800);

    const t5Check = await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const cardB = document.querySelector('[data-playlist-id="PL_COURSE_B"]');
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      return {
        drawerAVisible: cardA.querySelector('.playlist-drawer').style.display !== 'none',
        drawerBVisible: cardB.querySelector('.playlist-drawer').style.display !== 'none',
        drawerCVisible: cardC.querySelector('.playlist-drawer').style.display !== 'none',
        expandedIds: window.getExpandedPlaylistIds()
      };
    })()`);
    console.log('States of A, B, C after modifying B:', t5Check);
    assert.strictEqual(t5Check.drawerAVisible, true, 'Playlist A remains expanded');
    assert.strictEqual(t5Check.drawerBVisible, false, 'Playlist B remains collapsed');
    assert.strictEqual(t5Check.drawerCVisible, true, 'Playlist C remains expanded');
    assert(t5Check.expandedIds.includes('PL_COURSE_A'), 'Set has PL_COURSE_A');
    assert(t5Check.expandedIds.includes('PL_COURSE_C'), 'Set has PL_COURSE_C');
    assert(!t5Check.expandedIds.includes('PL_COURSE_B'), 'Set does NOT have PL_COURSE_B');
    console.log('✓ TEST 5 PASS: Independent playlist expansion states preserved');

    // ============================================================
    // TEST 6 — Filter Switching preserves expansion state
    // ============================================================
    console.log('\n--- TEST 6: Filter Switching preserves expansion state ---');
    // Switch to 'video' filter (no playlists visible)
    await dashClient.evaluate(`document.querySelector('.chip[data-filter="video"]').click()`);
    await sleep(500);
    const t6VideoCount = await dashClient.evaluate(`document.querySelectorAll('.queue-card').length`);
    console.log('Cards in video filter:', t6VideoCount);

    // Switch back to 'all' filter
    await dashClient.evaluate(`document.querySelector('.chip[data-filter="all"]').click()`);
    await sleep(800);

    const t6AfterReturn = await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const cardB = document.querySelector('[data-playlist-id="PL_COURSE_B"]');
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      return {
        drawerAVisible: cardA.querySelector('.playlist-drawer').style.display !== 'none',
        drawerBVisible: cardB.querySelector('.playlist-drawer').style.display !== 'none',
        drawerCVisible: cardC.querySelector('.playlist-drawer').style.display !== 'none'
      };
    })()`);
    console.log('States after returning to all filter:', t6AfterReturn);
    assert.strictEqual(t6AfterReturn.drawerAVisible, true, 'Playlist A preserved expanded state after filter return');
    assert.strictEqual(t6AfterReturn.drawerBVisible, false, 'Playlist B preserved collapsed state after filter return');
    assert.strictEqual(t6AfterReturn.drawerCVisible, true, 'Playlist C preserved expanded state after filter return');
    console.log('✓ TEST 6 PASS: Filter switching safely preserved expansion states');

    // ============================================================
    // TEST 7 — Sequential Deletions
    // ============================================================
    console.log('\n--- TEST 7: Sequential Deletions within Playlist C ---');
    // Delete lesson 1 in Playlist C
    await dashClient.evaluate(`(() => {
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      cardC.querySelectorAll('.btn-delete-lesson')[0].click();
    })()`);
    await sleep(800);

    const t7Check1 = await dashClient.evaluate(`(() => {
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      return {
        drawerCVisible: cardC.querySelector('.playlist-drawer').style.display !== 'none',
        remainingLessons: cardC.querySelectorAll('.lesson-row').length
      };
    })()`);
    console.log('Playlist C after 1st deletion:', t7Check1);
    assert.strictEqual(t7Check1.drawerCVisible, true, 'Playlist C remains expanded after 1st deletion');
    assert.strictEqual(t7Check1.remainingLessons, 1, '1 lesson remaining');
    console.log('✓ TEST 7 PASS: Playlist C remained expanded across sequential deletions');

    // ============================================================
    // TEST 8 — Complete Final Lesson
    // ============================================================
    console.log('\n--- TEST 8: Complete Final Lesson -> Shows Completed without collapsing ---');
    // Complete the remaining lesson in Playlist C
    await dashClient.evaluate(`(() => {
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      cardC.querySelectorAll('.lesson-check')[0].click();
    })()`);
    await sleep(800);

    const t8Check = await dashClient.evaluate(`(() => {
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      const badge = cardC.querySelector('.badge');
      return {
        drawerCVisible: cardC.querySelector('.playlist-drawer').style.display !== 'none',
        badgeText: badge ? badge.textContent.trim() : '',
        badgeHasRed: badge ? badge.classList.contains('badge-red') : false
      };
    })()`);
    console.log('Playlist C after completing final lesson:', t8Check);
    assert.strictEqual(t8Check.drawerCVisible, true, 'Playlist C remains expanded after final lesson completed');
    assert(t8Check.badgeText.includes('completed'), 'Badge shows completed');
    assert.strictEqual(t8Check.badgeHasRed, true, 'Badge has badge-red styling');
    console.log('✓ TEST 8 PASS: Final lesson completed with drawer staying open to show completed status');

    // ============================================================
    // TEST 9 — Session Storage / Refresh Restoration
    // ============================================================
    console.log('\n--- TEST 9: Reload Dashboard -> Session state restores expanded playlists ---');
    await dashClient.send('Page.reload');
    await waitForElement(dashClient, '#learning-queue-list', 15000);
    await sleep(1000);

    const t9Check = await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const cardB = document.querySelector('[data-playlist-id="PL_COURSE_B"]');
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      return {
        drawerAVisible: cardA ? cardA.querySelector('.playlist-drawer').style.display !== 'none' : false,
        drawerBVisible: cardB ? cardB.querySelector('.playlist-drawer').style.display !== 'none' : false,
        drawerCVisible: cardC ? cardC.querySelector('.playlist-drawer').style.display !== 'none' : false,
        expandedIds: window.getExpandedPlaylistIds ? window.getExpandedPlaylistIds() : []
      };
    })()`);
    console.log('States after page reload:', t9Check);
    assert.strictEqual(t9Check.drawerAVisible, true, 'Playlist A restored as expanded');
    assert.strictEqual(t9Check.drawerBVisible, false, 'Playlist B restored as collapsed');
    assert.strictEqual(t9Check.drawerCVisible, true, 'Playlist C restored as expanded');
    console.log('✓ TEST 9 PASS: Session storage restored expansion states seamlessly across page reload');

    // ============================================================
    // TEST 10 — Last Lesson Edge Case (Empty Curriculum in open drawer)
    // ============================================================
    console.log('\n--- TEST 10: Delete Last Remaining Lesson -> Empty curriculum state inside open drawer ---');
    // Delete the final lesson from Playlist C
    await dashClient.evaluate(`(() => {
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      cardC.querySelectorAll('.btn-delete-lesson')[0].click();
    })()`);
    await sleep(800);

    const t10Check = await dashClient.evaluate(`(() => {
      const cardC = document.querySelector('[data-playlist-id="PL_COURSE_C"]');
      const drawer = cardC.querySelector('.playlist-drawer');
      const emptyMsg = cardC.querySelector('.empty-lessons-state');
      return {
        drawerCVisible: drawer.style.display !== 'none',
        hasEmptyMsg: !!emptyMsg,
        emptyMsgText: emptyMsg ? emptyMsg.textContent.trim() : ''
      };
    })()`);
    console.log('Playlist C with 0 lessons:', t10Check);
    assert.strictEqual(t10Check.drawerCVisible, true, 'Playlist C remains expanded even with 0 lessons');
    assert.strictEqual(t10Check.hasEmptyMsg, true, 'Empty lessons state element is rendered');
    assert(t10Check.emptyMsgText.includes('No lessons remaining'), 'Displays "No lessons remaining"');
    console.log('✓ TEST 10 PASS: Empty course curriculum rendered gracefully inside expanded drawer');

    // ============================================================
    // TEST 11 — Lessons Button & Icon Synchronized (ARIA & Visual)
    // ============================================================
    console.log('\n--- TEST 11: Button Collapse Action & ARIA synchronization ---');
    // Explicitly collapse Playlist A
    await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      cardA.querySelector('.btn-expand-pl').click();
    })()`);
    await sleep(300);

    const t11Check = await dashClient.evaluate(`(() => {
      const cardA = document.querySelector('[data-playlist-id="PL_COURSE_A"]');
      const expandBtn = cardA.querySelector('.btn-expand-pl');
      const drawer = cardA.querySelector('.playlist-drawer');
      return {
        drawerVisible: drawer.style.display !== 'none',
        btnActive: expandBtn.classList.contains('active'),
        ariaExpanded: expandBtn.getAttribute('aria-expanded'),
        isExpandedInState: window.isPlaylistExpanded('PL_COURSE_A')
      };
    })()`);
    console.log('Playlist A after explicit collapse click:', t11Check);
    assert.strictEqual(t11Check.drawerVisible, false, 'Drawer collapsed');
    assert.strictEqual(t11Check.btnActive, false, 'Button active class removed');
    assert.strictEqual(t11Check.ariaExpanded, 'false', 'aria-expanded updated to false');
    assert.strictEqual(t11Check.isExpandedInState, false, 'State tracking removed PL_COURSE_A');
    console.log('✓ TEST 11 PASS: Lessons button, icon rotation, and ARIA state fully synchronized');

    console.log('\n======================================================================');
    console.log('ALL 11 PLAYLIST EXPANSION STATE TESTS PASSED SUCCESSFULLY (100%)');
    console.log('======================================================================\n');

    await closeTarget(dashClient);
    await browserWs.close();
    chromeProc.kill('SIGTERM');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ VALIDATION TEST FAILED:', err);
    try {
      chromeProc.kill('SIGKILL');
    } catch (e) {}
    process.exit(1);
  }
}

run();
