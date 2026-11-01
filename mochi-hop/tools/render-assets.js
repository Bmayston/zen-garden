// Renders the link-preview image and web app icons from the game's own drawing code.
//   node mochi-hop/tools/render-assets.js
// Writes og.png, icon-192.png, icon-512.png and icon-maskable-512.png into the game folder.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const GAME = path.resolve(__dirname, '../app/src/main/assets/game');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto('file://' + path.join(GAME, 'index.html'));
  await page.waitForFunction(() => window.__mochi);
  const out = await page.evaluate(() => {
    const m = window.__mochi;
    const png = (cv) => cv.toDataURL('image/png').split(',')[1];
    return {
      'og.png': png(m.makePromoCanvas()),
      'icon-192.png': png(m.makeIconCanvas(192, false)),
      'icon-512.png': png(m.makeIconCanvas(512, false)),
      'icon-maskable-512.png': png(m.makeIconCanvas(512, true)),
    };
  });
  for (const [name, b64] of Object.entries(out)) {
    fs.writeFileSync(path.join(GAME, name), Buffer.from(b64, 'base64'));
    console.log('wrote', name);
  }
  await browser.close();
})();
