/**
 * Automated Real Chrome Validation for WatchFlow Today:
 * Learning Queue Title Overflow, Layout Footprint & Truncation (Tests A, B, C, D)
 */

import { spawn } from 'child_process';
import assert from 'assert';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const extPath = process.cwd();
const userDataDir = '/tmp/watchflow-overflow-test-' + Date.now();
const debugPort = 9227;

console.log('======================================================================');
console.log('WATCHFLOW TODAY: LEARNING QUEUE TITLE OVERFLOW REAL-CHROME VALIDATION');
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
      } catch(e) {}
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

    // Step 0: Load extension
    console.log('\n--- Step 0: Loading Unpacked Extension ---');
    const loadResult = await sendBrowser('Extensions.loadUnpacked', { path: extPath });
    const extId = loadResult.id;
    console.log('✓ Extension loaded with ID:', extId);

    // Setup initial storage state via dashboard tab
    const dashUrl = `chrome-extension://${extId}/src/dashboard/dashboard.html`;
    const dashTargetInfo = await sendBrowser('Target.createTarget', { url: dashUrl });
    const dashClient = await connectToTarget(dashTargetInfo.targetId);
    await dashClient.send('Page.enable');
    await dashClient.send('Runtime.enable');
    await sleep(1500);

    // Seed storage with short and medium titles initially
    await dashClient.evaluate(`
      window.YTF_STORAGE.clearLearningQueue().then(() => {
        return window.YTF_STORAGE.addVideoToQueue({
          videoId: 'pythontut01',
          title: 'Python Basics',
          channel: 'CS Dept',
          url: 'https://www.youtube.com/watch?v=pythontut01',
          thumbnail: 'https://i.ytimg.com/vi/pythontut01/hqdefault.jpg',
          duration: '10:00',
          lastPositionSeconds: 120,
          progressPct: 20
        });
      }).then(() => {
        return window.YTF_STORAGE.addVideoToQueue({
          videoId: 'pythontut02',
          title: 'Introduction to Data Structures and Algorithms',
          channel: 'CS Dept',
          url: 'https://www.youtube.com/watch?v=pythontut02',
          thumbnail: 'https://i.ytimg.com/vi/pythontut02/hqdefault.jpg',
          duration: '25:00'
        });
      }).then(() => {
        return window.YTF_STORAGE.saveSettings({
          extensionEnabled: true,
          focusModeEnabled: true,
          dailyLimitMinutes: 60
        });
      })
    `);

    // Launch YouTube Home Tab
    console.log('\n--- Opening YouTube Home in Chrome Tab ---');
    const ytTargetInfo = await sendBrowser('Target.createTarget', { url: 'https://www.youtube.com/' });
    const ytClient = await connectToTarget(ytTargetInfo.targetId);
    await ytClient.send('Page.enable');
    await ytClient.send('Runtime.enable');
    await waitForElement(ytClient, '#yt-focus-home-hub', 15000);
    await sleep(1000);

    // Baseline measurement: Card dimensions with short/medium titles
    console.log('\n--- Test A & B: Baseline with Short and Medium Titles ---');
    const baselineCardMetrics = await ytClient.evaluate(`(() => {
      const hub = document.getElementById('yt-focus-home-hub');
      const queueCard = hub.querySelector('.yt-focus-summary-card');
      const nextItems = Array.from(hub.querySelectorAll('.yt-focus-next-item'));
      const queueBtn = hub.querySelector('#yt-focus-hub-btn-queue');
      const rect = queueCard.getBoundingClientRect();
      const btnRect = queueBtn.getBoundingClientRect();

      return {
        cardWidth: Math.round(rect.width),
        cardHeight: Math.round(rect.height),
        btnWidth: Math.round(btnRect.width),
        cardScrollWidth: queueCard.scrollWidth,
        cardClientWidth: queueCard.clientWidth,
        hubScrollWidth: hub.scrollWidth,
        hubClientWidth: hub.clientWidth,
        itemCount: nextItems.length,
        items: nextItems.map(item => ({
          numText: item.querySelector('.yt-focus-next-num').textContent.trim(),
          numWidth: Math.round(item.querySelector('.yt-focus-next-num').getBoundingClientRect().width),
          titleText: item.querySelector('.yt-focus-next-title').textContent.trim(),
          titleAttr: item.querySelector('.yt-focus-next-title').getAttribute('title'),
          itemHeight: Math.round(item.getBoundingClientRect().height)
        }))
      };
    })()`);

    console.log('Baseline Card Metrics:', baselineCardMetrics);
    assert(baselineCardMetrics.cardWidth > 200 && baselineCardMetrics.cardWidth < 500, `Card width should be well-contained, got ${baselineCardMetrics.cardWidth}`);
    assert.strictEqual(baselineCardMetrics.cardScrollWidth, baselineCardMetrics.cardClientWidth, 'No horizontal overflow on baseline card');
    assert.strictEqual(baselineCardMetrics.items[0].numText, '01', 'First number is 01');
    assert.strictEqual(baselineCardMetrics.items[0].numWidth, 20, 'Number column width is 20px');
    assert.strictEqual(baselineCardMetrics.items[0].titleAttr, 'Introduction to Data Structures and Algorithms', 'Title attribute matches full title');
    assert.strictEqual(baselineCardMetrics.items[1].titleAttr, 'Python Basics', 'Title attribute matches full title');
    assert(baselineCardMetrics.items[0].itemHeight <= 28, 'Item row is strictly single-line');
    console.log('✓ Tests A & B Passed: Clean layout for short and medium titles');

    // ============================================================
    // Test C & D: Multiple Extremely Long YouTube Titles
    // ============================================================
    console.log('\n--- Tests C & D: Multiple Extremely Long Titles ---');
    const longTitle1 = 'Combinatorics Complete Course | Discrete Mathematics | Basic Counting Principles | Permutation & Combination | Generating Function | Recurrence Relation | Lecture 1 | Introduction to Comprehensive Theory';
    const longTitle2 = 'Combinatorics Complete Course | Discrete Mathematics | The Sum Rule & Product Rule with Comprehensive Solved Examples | Lecture 2 | Deep Dive Problem Solving';
    const longTitle3 = 'Combinatorics Complete Course | Discrete Mathematics | Generalized Permutations and Combinations with Repetitions | Lecture 3A | Advanced Analysis and Proofs';

    await dashClient.evaluate(`
      window.YTF_STORAGE.clearLearningQueue().then(() => {
        return window.YTF_STORAGE.addVideoToQueue({
          videoId: 'comb0000001',
          title: ${JSON.stringify(longTitle1)},
          channel: 'Math Academy',
          url: 'https://www.youtube.com/watch?v=comb0000001',
          thumbnail: 'https://i.ytimg.com/vi/comb0000001/hqdefault.jpg',
          duration: '45:00',
          lastPositionSeconds: 600,
          progressPct: 22
        });
      }).then(() => {
        return window.YTF_STORAGE.addVideoToQueue({
          videoId: 'comb0000002',
          title: ${JSON.stringify(longTitle2)},
          channel: 'Math Academy',
          url: 'https://www.youtube.com/watch?v=comb0000002',
          thumbnail: 'https://i.ytimg.com/vi/comb0000002/hqdefault.jpg',
          duration: '52:10'
        });
      }).then(() => {
        return window.YTF_STORAGE.addVideoToQueue({
          videoId: 'comb0000003',
          title: ${JSON.stringify(longTitle3)},
          channel: 'Math Academy',
          url: 'https://www.youtube.com/watch?v=comb0000003',
          thumbnail: 'https://i.ytimg.com/vi/comb0000003/hqdefault.jpg',
          duration: '58:40'
        });
      })
    `);

    // Reload YouTube Home to trigger render with long titles
    await ytClient.send('Page.reload');
    await sleep(2000);
    await waitForElement(ytClient, '#yt-focus-home-hub', 15000);
    await sleep(1000);

    const longCardMetrics = await ytClient.evaluate(`(() => {
      const hub = document.getElementById('yt-focus-home-hub');
      const queueCard = hub.querySelector('.yt-focus-summary-card');
      const nextItems = Array.from(hub.querySelectorAll('.yt-focus-next-item'));
      const queueBtn = hub.querySelector('#yt-focus-hub-btn-queue');
      const rect = queueCard.getBoundingClientRect();
      const btnRect = queueBtn.getBoundingClientRect();

      return {
        cardWidth: Math.round(rect.width),
        cardHeight: Math.round(rect.height),
        btnWidth: Math.round(btnRect.width),
        cardScrollWidth: queueCard.scrollWidth,
        cardClientWidth: queueCard.clientWidth,
        hubScrollWidth: hub.scrollWidth,
        hubClientWidth: hub.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        itemCount: nextItems.length,
        items: nextItems.map(item => {
          const titleEl = item.querySelector('.yt-focus-next-title');
          const numEl = item.querySelector('.yt-focus-next-num');
          const computed = window.getComputedStyle(titleEl);
          return {
            numText: numEl.textContent.trim(),
            numWidth: Math.round(numEl.getBoundingClientRect().width),
            titleAttr: titleEl.getAttribute('title'),
            itemHeight: Math.round(item.getBoundingClientRect().height),
            whiteSpace: computed.whiteSpace,
            overflow: computed.overflow,
            textOverflow: computed.textOverflow,
            titleScrollWidth: titleEl.scrollWidth,
            titleClientWidth: titleEl.clientWidth,
            isEllipsized: titleEl.scrollWidth > titleEl.clientWidth
          };
        })
      };
    })()`);

    console.log('Long Titles Card Metrics:', longCardMetrics);

    // 1. Fixed Visual Footprint check
    console.log('\n--- Verifying Card Width Stability ---');
    console.log(`Baseline Card Width: ${baselineCardMetrics.cardWidth}px, Long Title Card Width: ${longCardMetrics.cardWidth}px`);
    assert(Math.abs(longCardMetrics.cardWidth - baselineCardMetrics.cardWidth) <= 5,
      `Card width MUST NOT expand due to long titles! (Baseline: ${baselineCardMetrics.cardWidth}, Long: ${longCardMetrics.cardWidth})`);
    console.log('✓ Card width remained perfectly stable!');

    // 2. Zero Horizontal Overflow
    console.log('\n--- Verifying No Horizontal Overflow ---');
    assert.strictEqual(longCardMetrics.cardScrollWidth, longCardMetrics.cardClientWidth, 'Queue card scrollWidth must equal clientWidth');
    assert.strictEqual(longCardMetrics.hubScrollWidth, longCardMetrics.hubClientWidth, 'Hub scrollWidth must equal clientWidth');
    assert(longCardMetrics.bodyScrollWidth <= longCardMetrics.bodyClientWidth + 1, 'No page horizontal overflow');
    console.log('✓ Zero horizontal overflow on card, hub, or page!');

    // 3. Exactly 3 items previewed
    console.log('\n--- Verifying Limit Next-Up Preview ---');
    assert.strictEqual(longCardMetrics.itemCount, 3, 'Must render exactly 3 upcoming lessons');
    console.log('✓ Exactly 3 upcoming lessons rendered');

    // 4. Single-line, Ellipsis, and No Wrapping
    console.log('\n--- Verifying Single-Line Truncation & Ellipsis ---');
    for (let i = 0; i < longCardMetrics.items.length; i++) {
      const it = longCardMetrics.items[i];
      console.log(`Item ${i+1}: num="${it.numText}", numWidth=${it.numWidth}px, height=${it.itemHeight}px, ellipsized=${it.isEllipsized}`);
      assert.strictEqual(it.numText, `0${i+1}`, `Number should be 0${i+1}`);
      assert.strictEqual(it.numWidth, 20, 'Number column width must be fixed at 20px');
      assert(it.itemHeight <= 28, `Item row ${i+1} must be single-line (height <= 28px, got ${it.itemHeight}px)`);
      assert.strictEqual(it.whiteSpace, 'nowrap', 'white-space must be nowrap');
      assert.strictEqual(it.overflow, 'hidden', 'overflow must be hidden');
      assert.strictEqual(it.textOverflow, 'ellipsis', 'text-overflow must be ellipsis');
      assert.strictEqual(it.isEllipsized, true, `Long title ${i+1} must be ellipsized (scrollWidth > clientWidth)`);
    }
    console.log('✓ All 3 items are strictly single-line and ellipsized!');

    // 5. Hover/Native Tooltip Title Attribute
    console.log('\n--- Verifying Native HTML Title Attribute ---');
    assert(longCardMetrics.items.some(it => it.titleAttr === longTitle1), 'Title 1 title attribute matches full string');
    assert(longCardMetrics.items.some(it => it.titleAttr === longTitle2), 'Title 2 title attribute matches full string');
    assert(longCardMetrics.items.some(it => it.titleAttr === longTitle3), 'Title 3 title attribute matches full string');
    console.log('✓ Full video titles are preserved in native title attribute for browser hover tooltip!');

    // 6. Button Width
    console.log('\n--- Verifying Action Button Width ---');
    console.log(`Button width: ${longCardMetrics.btnWidth}px inside card width: ${longCardMetrics.cardWidth}px`);
    assert(longCardMetrics.btnWidth <= longCardMetrics.cardWidth, 'Button width is contained within card');
    assert(longCardMetrics.btnWidth < 500, 'Button is NOT a giant screen-wide pill');
    console.log('✓ Action button width is controlled and proportional');

    // ============================================================
    // Test E: Responsive Behavior at 600px width
    // ============================================================
    console.log('\n--- Test E: Responsive Behavior at 600px Viewport ---');
    await ytClient.send('Emulation.setDeviceMetricsOverride', {
      width: 600,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(800);

    const responsiveMetrics = await ytClient.evaluate(`(() => {
      const hub = document.getElementById('yt-focus-home-hub');
      const queueCard = hub.querySelector('.yt-focus-summary-card');
      const nextItems = Array.from(hub.querySelectorAll('.yt-focus-next-item'));
      const rect = queueCard.getBoundingClientRect();

      return {
        cardWidth: Math.round(rect.width),
        cardScrollWidth: queueCard.scrollWidth,
        cardClientWidth: queueCard.clientWidth,
        hubScrollWidth: hub.scrollWidth,
        hubClientWidth: hub.clientWidth,
        items: nextItems.map(item => ({
          height: Math.round(item.getBoundingClientRect().height),
          isEllipsized: item.querySelector('.yt-focus-next-title').scrollWidth > item.querySelector('.yt-focus-next-title').clientWidth
        }))
      };
    })()`);

    console.log('Responsive Metrics at 600px:', responsiveMetrics);
    assert(responsiveMetrics.cardWidth <= 600, `Card width adapts to viewport: ${responsiveMetrics.cardWidth}px`);
    assert.strictEqual(responsiveMetrics.cardScrollWidth, responsiveMetrics.cardClientWidth, 'No horizontal overflow on card at 600px');
    assert.strictEqual(responsiveMetrics.hubScrollWidth, responsiveMetrics.hubClientWidth, 'No horizontal overflow on hub at 600px');
    for (const it of responsiveMetrics.items) {
      assert(it.height <= 28, 'Items remain single-line at narrow width');
      assert.strictEqual(it.isEllipsized, true, 'Titles remain ellipsized at narrow width');
    }
    console.log('✓ Responsive behavior verified: gracefully adapts without horizontal scrolling or breaking');

    // Reset viewport
    await ytClient.send('Emulation.clearDeviceMetricsOverride');
    await sleep(500);

    // ============================================================
    // Test F: Functional actions (Continue Learning, View Queue)
    // ============================================================
    console.log('\n--- Test F: Functional Actions Retained ---');
    // Verify continue button navigates to comb0000001
    await ytClient.evaluate(`document.getElementById('yt-focus-hub-btn-continue').click()`);
    await sleep(2500);
    const watchUrl = await ytClient.evaluate(`window.location.href`);
    console.log('Navigated to URL on Continue Learning:', watchUrl);
    assert(watchUrl.includes('comb0000001'), 'Must navigate to the current continue learning video');
    console.log('✓ Continue Learning button successfully navigates to active lesson');

    // Return home
    await ytClient.evaluate(`window.history.back()`);
    await sleep(2000);
    await waitForElement(ytClient, '#yt-focus-home-hub', 15000);
    console.log('✓ Successfully returned to Home');

    console.log('\n======================================================================');
    console.log('ALL LEARNING QUEUE TITLE OVERFLOW ACCEPTANCE TESTS PASSED (100%)');
    console.log('======================================================================\n');

    await closeTarget(ytClient);
    await closeTarget(dashClient);
    await browserWs.close();
    chromeProc.kill('SIGTERM');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ VALIDATION TEST FAILED:', err);
    try {
      chromeProc.kill('SIGKILL');
    } catch(e) {}
    process.exit(1);
  }
}

run();
