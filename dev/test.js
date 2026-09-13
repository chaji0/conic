// 헤드리스 크래시 테스트: 빌드된 index.html 을 실제 three.js(번들 포함)로 띄워
// 로딩 → 시작 → 걷기/돌기/달리기 → 지도 접기까지 돌려 보고 페이지 오류가 없는지 확인한다.
//   cd dev && node test.js          정상 출력: ERRORS: []  (그리고 MOVED > 0)
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], consoleMsgs = [];
  page.on('console', msg => { if (msg.type() !== 'log') consoleMsgs.push(`[${msg.type()}] ${msg.text()}`); });
  page.on('pageerror', err => errors.push(err.message));
  // 동시접속(Firebase)은 네트워크가 필요하므로 테스트에서는 막는다 → "혼자 플레이" 경로로 떨어져야 한다
  await page.route('**/*firebase*', route => route.abort());

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForSelector('#start:not([hidden])', { timeout: 60000 });
  const loadMsg = await page.$eval('#load-msg', el => el.textContent);
  console.log('LOAD_MSG:', loadMsg);
  console.log('EARLY_ERRORS:', JSON.stringify(errors));

  await page.fill('#player-name', '테스트');
  await page.click('#start');
  await page.waitForTimeout(500);
  const p0 = await page.evaluate(() => [__berry.player.pos.x, __berry.player.pos.z]);

  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowUp');   // 소프트웨어 렌더링이라 느림
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300); await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('ArrowUp'); await page.waitForTimeout(600);
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('KeyM'); await page.waitForTimeout(200); await page.keyboard.press('KeyM');
  await page.mouse.click(640, 400);
  await page.waitForTimeout(400);

  const p1 = await page.evaluate(() => [__berry.player.pos.x, __berry.player.pos.z]);
  const moved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const hudShown = await page.evaluate(() => !document.getElementById('hud').hidden);
  const startHidden = await page.evaluate(() => document.getElementById('loading').hidden);
  const where = await page.$eval('#where', el => el.textContent);
  const mp = await page.$eval('#mp-status-text', el => el.textContent);
  await page.screenshot({ path: path.resolve(__dirname, 'screenshot_walk.png') });

  console.log('START_OVERLAY_HIDDEN:', startHidden);
  console.log('HUD_SHOWN:', hudShown);
  console.log('MOVED:', moved.toFixed(1), 'm');
  console.log('WHERE:', where);
  console.log('MP_STATUS:', mp);
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
  console.log('CONSOLE (warn/error):', JSON.stringify(consoleMsgs.slice(-20), null, 2));
  await browser.close();
  if (errors.length || !startHidden || moved < 1) process.exit(1);
})();
