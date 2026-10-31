# Mochi Hop 🍡

A one-tap arcade game for Android. Tap to make **Mochi** hop through a bamboo grove
over a raked-sand zen garden. Each bamboo gap you pass scores a point, and one hit
squishes Mochi.

## The character

Mochi is a round, squishy rice-cake with a leaf sprout on its head, big shiny eyes,
rosy cheeks and a little cat mouth. It squashes and stretches when it hops, blinks
while idle, opens its mouth mid-hop and goes ✕✕ when it gets squished.

## What's in the game

- **One-tap controls**: tap anywhere to hop.
- **Sakura petals** float in the gaps. Catch them to unlock friends:
  | Friend | Petals | Accessory |
  |---|---|---|
  | Mochi | free | leaf sprout |
  | Sakura | 25 | cherry blossom |
  | Matcha | 60 | leaf sprout |
  | Ube | 120 | bow |
  | Golden | 250 | crown |
- **Day to sunset to night to dawn**: the sky changes as your score climbs.
- **Medals**: Bronze 10, Silver 20, Gold 40, Jade 80.
- **Difficulty ramps up**: gaps get narrower and the scroll speed increases.
- Best score, petals and unlocked friends are saved on the device.
- Synthesized sound effects with a mute toggle, plus vibration when Mochi is squished.
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

1. Create an upload keystore and add a `signingConfigs` block for `release` in `app/build.gradle.kts`.
2. Run `./gradlew bundleRelease` to produce an `.aab`.
3. Upload it in the Google Play Console. Bump `versionCode` for every release.
