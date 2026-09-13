const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const consoleMsgs = [];
  page.on('console', msg => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => errors.push(err.message));

  const fs = require('fs');
  const mockThree = fs.readFileSync(path.resolve(__dirname, 'mock-three.js'), 'utf8');
  await page.route('**/three.min.js', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: mockThree });
  });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1500);

  console.log('EARLY_ERRORS:', JSON.stringify(errors, null, 2));
  console.log('EARLY_CONSOLE:', JSON.stringify(consoleMsgs, null, 2));

  // click start button
  const startBtn = await page.$('#start-btn');
  if (startBtn) await startBtn.click({ force: true, timeout: 5000 }).catch(e => console.log('CLICK_FAIL:', e.message));
  await page.waitForTimeout(500);

  // simulate movement
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.resolve(__dirname,'screenshot_walk.png') });

  // click somewhere on canvas to exercise onPick / raycaster path
  await page.mouse.click(640, 400).catch(e => console.log('CANVAS_CLICK_FAIL:', e.message));
  await page.waitForTimeout(300);

  const conicCount = await page.evaluate(() => {
    return document.querySelectorAll('#list-body .item').length;
  });
  const scoreText = await page.evaluate(() => document.getElementById('score-val').textContent);
  const startOverlayHidden = await page.evaluate(() => document.getElementById('start-overlay').style.display === 'none');
  const locLabel = await page.evaluate(() => document.getElementById('loc-label').textContent);

  console.log('CONIC_COUNT:', conicCount);
  console.log('SCORE:', scoreText);
  console.log('START_OVERLAY_HIDDEN:', startOverlayHidden);
  console.log('LOC_LABEL:', locLabel);
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
  console.log('CONSOLE (last 40):', JSON.stringify(consoleMsgs.slice(-40), null, 2));

  await browser.close();
})();
