// Google Play phone screenshots (1080 x 1920) with marketing captions, captured from the real game.
//   node mochi-hop/tools/render-screenshots.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/src/main/assets/game/index.html');
const OUT = path.join(ROOT, 'store/screenshots');
const VW = 360, VH = 640, V = (v) => v * VH / 640;

const SHOTS = [
  { file: '1-tap-to-hop', title: 'Tap to hop!', sub: 'One tap. Endless fun.' },
  { file: '2-dont-get-skewered', title: "Don't get skewered!", sub: 'Mochi is sticky…' },
  { file: '3-friends', title: 'Collect 13 friends', sub: 'Seasonal friends too' },
  { file: '4-challenge', title: 'Challenge friends', sub: 'Same course for everyone daily' },
  { file: '5-night', title: 'Golden gaps & night winds', sub: 'It gets wilder the further you go' },
  { file: '6-missions', title: 'Daily & weekly missions', sub: 'Earn petals, unlock friends' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 3 });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const boot = async (storage = {}) => {
    await page.goto(URL);
    await g((st) => { localStorage.clear(); for (const [k, v] of Object.entries(st)) localStorage.setItem('mochihop.' + k, JSON.stringify(v)); }, storage);
    await page.goto(URL);
    await page.waitForFunction(() => window.__mochi && window.mochiAssetsReady);
    await g(() => window.mochiAssetsReady());
    await page.mouse.click(VW / 2, V(320));
    for (let i = 0; i < 100 && (await g(() => window.__mochi.state)) !== 'title'; i++) await page.waitForTimeout(20);
    await page.waitForTimeout(500);
  };
  const tap = async (id) => { const r = await g((k) => window.__mochi.ui[k], id); await page.mouse.click((r.x + r.w / 2) * VH / 640, (r.y + r.h / 2) * VH / 640); };
  const base = { played: 5, tips: { petal: true, close: true, golden: true, wind: true }, best: 34, petals: 182 };
  const startPlay = async () => { await tap('play'); await page.waitForTimeout(80); };
  const fly = async (until, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = await g(() => { const m = window.__mochi, b = m.mochi; const n = m.pipes().find((q) => q.x + m.COL_W > b.x - 12);
        const t = n ? n.gapY + 18 : 300; return { st: m.state, sc: m.score, hop: b.y > t && b.vy > -40, n: n && n.x }; });
      if (s.st !== 'play') return s;
      if (await until(s)) return s;
      if (s.hop) await page.mouse.click(VW / 2, V(560));
      await page.waitForTimeout(8);
    }
  };
  const shots = {};

  // 1. gameplay, mid-run with a petal in view
  await boot(base);
  await startPlay();
  await fly(async (s) => s.sc >= 7 && (await g(() => window.__mochi.pipes().some((q) => q.petal && !q.petal.taken && q.x > 150 && q.x < 300))));
  shots[0] = await page.screenshot();

  // 2. the sticky splat against a dango
  await fly(async (s) => s.n !== undefined && s.n < 160 && s.n > 120);
  await g(() => { const m = window.__mochi, b = m.mochi, q = m.pipes().find((p) => p.x + m.COL_W > b.x); b.y = q.gapY - q.gap / 2 - 40; b.vy = 0; });
  for (let i = 0; i < 100 && (await g(() => window.__mochi.state)) === 'play'; i++) await page.waitForTimeout(10);
  await page.waitForTimeout(140);
  shots[1] = await page.screenshot();

  // 3. friends book
  await boot(Object.assign({}, base, { unlocked: ['classic', 'sakura', 'yuzu', 'matcha', 'kinako', 'sesame', 'ube', 'strawberry', 'pumpkin'] }));
  await tap('book');
  await page.waitForTimeout(300);
  shots[2] = await page.screenshot();

  // 4. a winning challenge result
  await boot(base);
  await page.goto(URL + '?c=2026-11-01&s=18');
  await page.waitForFunction(() => window.__mochi && window.mochiAssetsReady); await g(() => window.mochiAssetsReady());
  await page.mouse.click(VW / 2, V(320));
  for (let i = 0; i < 100 && (await g(() => window.__mochi.state)) !== 'title'; i++) await page.waitForTimeout(20);
  await page.waitForTimeout(300);
  await tap('daily'); await page.waitForTimeout(60); await page.mouse.click(VW / 2, V(560));
  await fly(async (s) => s.sc >= 22);
  await g(() => { window.__mochi.mochi.y = 640; });
  for (let i = 0; i < 300 && (await g(() => window.__mochi.state)) !== 'over'; i++) await page.waitForTimeout(10);
  await page.waitForTimeout(1300);
  shots[3] = await page.screenshot();

  // 5. night run with lanterns, golden gap and wind
  await boot(base);
  await startPlay();
  await g(() => { window.__mochi.score = 29; });
  await fly(async (s) => s.sc >= 31 && (await g(() => window.__mochi.pipes().some((q) => q.x > 120 && q.x < 330 && (q.golden || q.bobAmp)))), 40000);
  shots[4] = await page.screenshot();

  // 6. missions board
  await boot(Object.assign({}, base, { missions: [{ id: 'score_run:15', progress: 11, done: false }, { id: 'near_run:2', progress: 1, done: false }, { id: 'petals_total:30', progress: 18, done: false, isNew: true }] }));
  await tap('missions');
  await page.waitForTimeout(300);
  shots[5] = await page.screenshot();

  // compose marketing frames
  const comp = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await comp.goto(URL);
  await comp.waitForFunction(() => window.mochiAssetsReady); await comp.evaluate(() => window.mochiAssetsReady());
  for (let i = 0; i < SHOTS.length; i++) {
    const data = 'data:image/png;base64,' + shots[i].toString('base64');
    const jpg = await comp.evaluate(async ({ data, title, sub }) => {
      const img = new Image(); img.src = data; await img.decode();
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
      const x = c.getContext('2d');
      const bg = x.createLinearGradient(0, 0, 0, 1920);
      bg.addColorStop(0, '#ffd3e2'); bg.addColorStop(0.5, '#ff9cc4'); bg.addColorStop(1, '#f2669f');
      x.fillStyle = bg; x.fillRect(0, 0, 1080, 1920);
      x.fillStyle = 'rgba(255,255,255,0.5)';
      for (let k = 0; k < 18; k++) { x.save(); x.translate((k * 197) % 1080, (k * 331) % 1920); x.rotate(k); x.beginPath(); x.ellipse(0, 0, 9, 16, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
      const txt = (s, y, size, fill) => {
        x.font = `700 ${size}px Fredoka`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
        x.lineWidth = size * 0.2; x.strokeStyle = '#2e0b20'; x.strokeText(s, 540, y); x.fillStyle = fill; x.fillText(s, 540, y);
      };
      txt(title, 150, title.length > 20 ? 78 : 96, '#feedde');
      txt(sub, 255, 48, '#fff');
      // phone-style frame
      const fw = 820, fh = fw * 16 / 9, fx = (1080 - fw) / 2, fy = 330;
      const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
      x.fillStyle = 'rgba(46,11,32,0.35)'; rr(fx - 4, fy + 16, fw + 8, fh + 8, 58); x.fill();
      x.fillStyle = '#2e0b20'; rr(fx - 14, fy - 14, fw + 28, fh + 28, 62); x.fill();
      x.save(); rr(fx, fy, fw, fh, 48); x.clip(); x.drawImage(img, fx, fy, fw, fh); x.restore();
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, { data, title: SHOTS[i].title, sub: SHOTS[i].sub });
    fs.writeFileSync(path.join(OUT, SHOTS[i].file + '.jpg'), Buffer.from(jpg, 'base64'));
    console.log('wrote', SHOTS[i].file + '.jpg');
  }
  await browser.close();
})();
