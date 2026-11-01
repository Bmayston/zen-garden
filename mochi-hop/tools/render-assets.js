// Renders all brand artwork from the game's own drawing code, so it always matches the game.
//   node mochi-hop/tools/render-assets.js
// Writes:
//   store/: play-icon-512.png, feature-graphic-1024x500.png, promo-1200x630.png (social posts)
//   res/mipmap-*/: ic_launcher_foreground/background/monochrome.png (Android adaptive icon)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'app/src/main/assets/game');
const RES = path.join(ROOT, 'app/src/main/res');
const STORE = path.join(ROOT, 'store');
const DENSITIES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto('file://' + path.join(GAME, 'index.html'));
  await page.waitForFunction(() => window.__mochi && window.mochiAssetsReady);
  await page.evaluate(() => window.mochiAssetsReady());
  const out = await page.evaluate((dens) => {
    const m = window.__mochi;
    const png = (cv) => cv.toDataURL('image/png').split(',')[1];
    const files = {
      'STORE/promo-1200x630.png': png(m.makePromoCanvas()),
      'STORE/play-icon-512.png': png(m.makeIconCanvas(512, 'play')),
      'STORE/feature-graphic-1024x500.png': png(m.makeFeatureCanvas()),
    };
    for (const [d, px] of Object.entries(dens)) {
      files[`RES/mipmap-${d}/ic_launcher_foreground.png`] = png(m.makeIconCanvas(px, 'fg'));
      files[`RES/mipmap-${d}/ic_launcher_background.png`] = png(m.makeIconCanvas(px, 'bg'));
      files[`RES/mipmap-${d}/ic_launcher_monochrome.png`] = png(m.makeIconCanvas(px, 'mono'));
    }
    return files;
  }, DENSITIES);
  for (const [key, b64] of Object.entries(out)) {
    const file = key.replace('GAME', GAME).replace('STORE', STORE).replace('RES', RES);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  await browser.close();
})();
