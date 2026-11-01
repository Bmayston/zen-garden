# Mochi Hop 🍡

A one-tap arcade game for Android. Tap to make **Mochi** hop between skewers of
**hanami dango** (the pink, white and green rice dumplings eaten under the cherry
blossoms) in a zen garden. Each gap scores a point. Touch a skewer and Mochi,
being sticky, splats onto it, slides down and flops flat on the sand.

## The character

Mochi is a round, squishy rice cake. Its signature is the **sprout** on its head: two
big leaves that spin like a helicopter on every hop, droop while it falls and point up
when it scores. Mochi squashes and stretches, blinks, glances up and down, opens its
mouth mid-hop, and squeezes its eyes shut (> <) when it splats. Its hop has its own
"boing" sound.

## What's in the game

- **One tap to play, one tap to retry.** After a crash, tapping anywhere starts the next
  run about 0.45 seconds later. Returning players skip the "Get Ready" screen.
- **Hanami dango obstacles** with sharp skewer tips pointing into the gap.
- **Sakura petals** float between skewers. Catch them to unlock friends, who all keep
  the sprout:
  | Friend | Petals | Accessory |
  |---|---|---|
  | Mochi | free | (just the sprout) |
  | Sakura | 25 | cherry blossom |
  | Matcha | 60 | tea whisk |
  | Ube | 120 | bow |
  | Golden | 250 | crown |
- **Close calls:** scrape past a skewer tip and you get a "Close! +1" sparkle, a petal
  and a little haptic tick.
- **Daily challenge:** the same seeded skewer layout for everyone each day, with today's
  best score and a day streak.
- **Missions:** three goals at a time (such as "3 close calls in one run" or "Score 10
  without a petal") that pay out petals and are replaced once completed.
- **Challenge sharing:** CHALLENGE on the game-over screen sends a "BEAT MY 26" card plus
  a short emoji summary and a link. The link opens the free web version
  (`https://bmayston.github.io/zen-garden/play/?c=<date>&s=<score>`) straight into the same
  daily course with your score as the target, so friends can play without installing.
  The web version is published by `.github/workflows/mochi-hop-web.yml` (enable GitHub Pages
  with source "GitHub Actions" once).
- **Pause:** a pause button (top right) during a run shows your score, petals, close calls
  and live mission progress, with RESUME (3-2-1 countdown) or END RUN back to the menu.
  Ending a run keeps petals and progress but doesn't count as a splat. The game also pauses
  itself when you leave the app; Android Back resumes from the pause screen.
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
