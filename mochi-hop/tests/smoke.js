// Mochi Hop smoke tests: plays the real game in headless Chromium.
//   node mochi-hop/tests/smoke.js
// Exits non-zero if any check fails. Runs in CI on every push.
const path = require('path');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '../app/src/main/assets/game/index.html');
const VW = 393, VH = 852, S = VH / 640;          // phone-sized viewport; game is 640 units tall
const V = (v) => v * S;                           // game units -> CSS pixels

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const g = (fn) => page.evaluate(fn);
  const state = () => g(() => window.__mochi.state);
  const fresh = async (url = URL) => {
    await page.goto(url);
    await g(() => localStorage.clear());
    await page.goto(url);
    await page.waitForFunction(() => window.__mochi);
    await page.waitForTimeout(200);
  };
  const waitFor = async (want, ms = 3000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if ((await state()) === want) return true; await page.waitForTimeout(20); }
    return false;
  };
  // Simple autopilot: hop whenever Mochi drops below the next gap's centre.
  const autopilot = async (ms, until = () => false) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = await g(() => { const m = window.__mochi, b = m.mochi;
        const next = m.pipes().find((q) => q.x + m.COL_W > b.x - 12);
        const t = next ? next.gapY + 18 : 300;
        return { st: m.state, sc: m.score, hop: b.y > t && b.vy > -40 }; });
      if (s.st !== 'play' || until(s)) return s;
      if (s.hop) await page.mouse.click(VW / 2, V(500));
      await page.waitForTimeout(10);
    }
    return { st: await state(), sc: await g(() => window.__mochi.score) };
  };
  const crash = async () => { await g(() => { window.__mochi.mochi.y = 640; }); return waitFor('over'); };
  const startClassic = async () => {
    await page.mouse.click(VW / 2, V(420));
    if ((await state()) === 'ready') await page.mouse.click(VW / 2, V(500));
  };

  // 1. Loads cleanly
  await fresh();
  check('loads to the title screen', (await state()) === 'title');
  await g(() => window.mochiAssetsReady());
  check('brand font (Fredoka) and logo load', await g(() => document.fonts.check('700 20px Fredoka') && !!window.MOCHI_LOGO));
  check('share card exports with the logo on it (canvas not tainted)', await g(() => { try { return window.__mochi.makeShareCanvas().toDataURL().length > 10000; } catch (e) { return false; } }));

  // 2. A real run scores
  await startClassic();
  const run = await autopilot(20000, (s) => s.sc >= 8);
  check('autopilot scores 8+ in a classic run', run.sc >= 8, `score ${run.sc}`);

  // 3. Crash then one-tap retry
  const t0 = Date.now();
  check('crash reaches the game-over screen', await crash());
  check('retry is available within 1s of the crash', Date.now() - t0 < 1500, `${Date.now() - t0}ms`);
  await page.mouse.click(VW / 2, V(100));
  check('one tap retries straight into play', (await state()) === 'play');
  await crash();

  // 4. Menu resets the crash pose
  await page.mouse.click(VW / 2 + V(68), V(548 - 34));
  await page.waitForTimeout(200);
  const pose = await g(() => [window.__mochi.state, window.__mochi.mochi.sx, !!window.__mochi.mochi.splat]);
  check('MENU returns to title with a round Mochi', pose[0] === 'title' && pose[1] === 1 && !pose[2], JSON.stringify(pose));

  // 5. Daily course is identical on every attempt
  const dailyLayout = async () => {
    const keep = setInterval(() => g(() => { const b = window.__mochi.mochi; b.y = 280; b.vy = 0; }).catch(() => {}), 15);
    await page.waitForTimeout(2200);
    clearInterval(keep);
    return g(() => window.__mochi.pipes().map((q) => [Math.round(q.baseY), q.golden, !!q.petal]));
  };
  await page.mouse.click(VW / 2, V(476));
  await page.mouse.click(VW / 2, V(500));
  const a = await dailyLayout();
  await crash(); await page.waitForTimeout(500);
  await page.mouse.click(VW / 2, V(100));
  const b = await dailyLayout();
  check('daily challenge gives identical skewers on retry', a.length > 0 && JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a));
  await crash();

  // 6. Missions and weekly progress survive a reload
  const before = await g(() => JSON.stringify([window.__mochi.save.missions, window.__mochi.save.weekly]));
  await page.reload(); await page.waitForFunction(() => window.__mochi);
  const after = await g(() => JSON.stringify([window.__mochi.save.missions, window.__mochi.save.weekly]));
  check('missions and weekly progress persist across reloads', before === after);

  // 7. Pause, resume with countdown, end run
  await startClassic();
  await autopilot(3000, (s) => s.sc >= 1);
  const W = await g(() => window.__mochi.W);
  await page.mouse.click(V(W - 34), V(36));
  const y1 = await g(() => window.__mochi.mochi.y);
  await page.waitForTimeout(400);
  const y2 = await g(() => window.__mochi.mochi.y);
  check('pause button freezes the run', (await g(() => window.__mochi.paused)) && y1 === y2);
  let resumed = false;
  for (let vy = 300; vy < 600 && !resumed; vy += 8) { await page.mouse.click(VW / 2, V(vy)); resumed = !(await g(() => window.__mochi.paused)); }
  check('RESUME starts a 3-2-1 countdown', resumed && (await g(() => window.__mochi.countdown)) > 0);
  await page.waitForTimeout(1700);
  await g(() => { window.__mochi.mochi.y = 280; window.__mochi.mochi.vy = 0; });
  await page.keyboard.press('Escape');
  let quit = false;
  for (let vy = 620; vy > 300 && !quit; vy -= 6) { await page.mouse.click(VW / 2, V(vy)); quit = (await state()) === 'title'; }
  check('END RUN returns to the menu', quit);

  // 8. Share card and text
  const share = await g(() => { const c = window.__mochi.makeShareCanvas(); return [c.width, c.height, window.__mochi.shareText()]; });
  check('share card renders at 1080x1350', share[0] === 1080 && share[1] === 1350);
  check('share text includes a challenge link', /https:\/\/\S+\?(c=\d{4}-\d{2}-\d{2}&)?s=\d+/.test(share[2]), share[2].split('\n').pop());

  // 9. Challenge links set a target on the same daily course
  await fresh(URL + '?c=2026-11-01&s=26');
  await page.mouse.click(VW / 2, V(476));
  await page.mouse.click(VW / 2, V(500));
  const ch = await g(() => [window.__mochi.mode, window.__mochi.target]);
  check('challenge link starts a daily run with target 26', ch[0] === 'daily' && ch[1] === 26, JSON.stringify(ch));
  await crash();

  // 10. Settings persist
  await fresh();
  await page.mouse.click(V((await g(() => window.__mochi.W)) - 84), V(36));
  await page.waitForTimeout(100);
  const music0 = await g(() => window.__mochi.save.settings.music);
  // Music is the first row: panel top (120) + header (72) + half a row (25)
  await page.mouse.click(VW / 2, V(120 + 72 + 25));
  await page.waitForTimeout(100);
  await page.reload(); await page.waitForFunction(() => window.__mochi);
  check('settings change is saved', (await g(() => window.__mochi.save.settings.music)) !== music0);

  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
