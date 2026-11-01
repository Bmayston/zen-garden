# Mochi Hop 🍡

A one-tap arcade game for Android. Tap to make **Mochi** hop between skewers of
**hanami dango** (the pink, white and green rice dumplings eaten under the cherry
blossoms) in a zen garden. Each gap scores a point. Touch a skewer and Mochi,
being sticky, splats onto it, slides down and flops flat on the sand.

## Brand

The game opens on a **logo splash** (tap to skip) that hands over to a clean home screen where Mochi
is the hero on its cushion, with illustrated Missions and Friends cards. The splash, share card, link
preview and store art all use the **Mochi Hop logo** (`store/brand/`),
the **Fredoka** typeface and the logo's plum, cream and pink palette. See [store/README.md](store/README.md)
for the brand kit and every Google Play asset.

## The character

Mochi is a round, squishy rice cake drawn to match the logo: a plum outline, big glossy
eyes, an open smile with a pink tongue and a cheeky **wink** when it's happy. Its other
signature is the **sprout** on its head: two broad leaves that spin like a helicopter on
every hop, droop while it falls and point up when it scores. Mochi squashes and stretches, blinks, glances up and down, opens its
mouth mid-hop, and squeezes its eyes shut (> <) when it splats. Its hop has its own
"boing" sound.

## What's in the game

- **One tap to play, one tap to retry.** After a crash, tapping anywhere starts the next
  run about 0.45 seconds later. Returning players skip the "Get Ready" screen.
- **Hanami dango obstacles** with sharp skewer tips pointing into the gap.
- **Sakura petals** float between skewers. Spend them on **13 friends** in the collection
  book (FRIENDS on the title screen). Each keeps the sprout and has its own look, hop pitch
  and splat colour. Three are seasonal (Kabocha in Oct–Nov, Yuki in Dec–Feb, Hanami in
  Mar–May) and can only be unlocked in season. Unlocking plays a "New friend!" reveal.
- **Late-run variety:** golden dango gaps worth 3 points (from 12), bobbing skewers (from 25),
  and at night paper lanterns plus gentle telegraphed wind gusts (from 28). In the daily
  challenge these are seeded too, so everyone gets the same ones.
- **Celebrations:** NEW BEST / DAILY BEST / "You beat 26!" bursts mid-run, a medal award
  animation and the unlock reveal.
- **First-time tips** for petals, close calls, golden gaps and wind, each shown once.
- **Missions:** three rotating goals plus **weekly missions** (three bigger goals that reset
  each Monday, with a +60 bonus for finishing all three).
- **Settings** (gear icon): music and sound-effect volume, vibration, reduced motion (no shake
  or flashes) and a left-handed layout.
- **Difficulty in clear steps:** very gentle for the first 3 gaps, then harder at 3, 10,
  25 and 50 points.
- **Sound:** a signature hop "boing", a score chime that climbs the scale with each gap,
  a fanfare every 10 points, and a squishy splat. Background music is generated live:
  koto-style plucks on a Japanese pentatonic scale.
- **Haptics:** a light tick on each hop, a click on scoring and a heavy thump on a splat.
  It can be switched off.
- **The sky shifts** from day to sunset to night to dawn as your score climbs.
  Medals: Bronze 10, Silver 20, Gold 40, Jade 80.
- **Saves** go to Android's own app storage (SharedPreferences), not just the WebView.
- **Notch-aware:** the score and buttons move below camera cutouts.
- No image or audio files: everything is drawn and synthesized in code.

## Web version, link previews and install

The same game runs in any browser and is published to GitHub Pages at
`https://bmayston.github.io/zen-garden/play/` by `.github/workflows/mochi-hop-web.yml`
(one-time setup: Settings → Pages → Source: GitHub Actions, then merge to `main`).

- `index.html` has Open Graph tags, so links show a Mochi preview card (`og.png`).
- `manifest.webmanifest`, icons and `sw.js` make it installable ("Add to home screen") and
  playable offline. Bump `VERSION` in `sw.js` when game files change.
- Set `PLAY_STORE_URL` in `game.js` once the app is live to show a Google Play button on the web.
- `node mochi-hop/tools/render-assets.js` redraws `og.png`, the web and Android icons and the Play
  feature graphic from the game's art; `tools/render-screenshots.js` makes the store screenshots.

## Tests

`node mochi-hop/tests/smoke.js` plays the real game in headless Chromium: scoring, one-tap
retry, menu, daily determinism, saved missions, pause/resume/end run, share card and link,
challenge links, settings and "no JavaScript errors". CI runs it before every Android build
and before publishing the web version.

## Project layout

```
mochi-hop/
├── app/src/main/assets/game/   ← the game (HTML5 canvas + JavaScript)
│   ├── index.html
│   └── game.js
├── app/src/main/java/com/mochihop/game/MainActivity.java  ← full-screen WebView host
└── app/src/main/res/           ← app icon (Mochi), theme, strings
```

## Play it right now (no phone needed)

Open `app/src/main/assets/game/index.html` in any browser. Click or press Space to hop,
and use the arrow keys on the title screen to switch friends.

## Build the Android app

**From GitHub:** every push that touches `mochi-hop/` runs the *Mochi Hop – Android build*
workflow. Download the `mochi-hop-debug-apk` artifact from the run and install it on
your phone. You may need to allow installing from unknown sources.

**Locally:** open the `mochi-hop` folder in Android Studio and press Run, or:

```bash
cd mochi-hop
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Publishing to Google Play

See [RELEASING.md](RELEASING.md) for signing and Play Console steps. In short:

1. Create an upload keystore and add a `signingConfigs` block for `release` in `app/build.gradle.kts`.
2. Run `./gradlew bundleRelease` to produce an `.aab`.
3. Upload it in the Google Play Console. Bump `versionCode` for every release.
