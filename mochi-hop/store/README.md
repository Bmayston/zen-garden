# Mochi Hop: store and brand kit

Everything Google Play asks for, plus the brand files. Regenerate the art with:

```bash
node mochi-hop/tools/render-assets.js       # icons, feature graphic, promo image
node mochi-hop/tools/render-screenshots.js  # phone screenshots (plays the real game)
python3 mochi-hop/tools/cut-logo.py store/brand/logo-original.png store/brand/logo-transparent.png  # needs numpy, scipy, pillow
```

| Play Console field | File | Spec |
|---|---|---|
| App icon | `play-icon-512.png` | 512 × 512 PNG, full square (Play applies the mask) |
| Feature graphic | `feature-graphic-1024x500.png` | 1024 × 500, logo centred, nothing key near the edges |
| Phone screenshots | `screenshots/*.jpg` | six 1080 × 1920 images, upload in numbered order |
| Store text | `listing.md` | title, short and full description |
| Social / promo image | `promo-1200x630.png` | for posts and announcements |

## Brand

- **Logo:** `brand/logo-original.png` (source) and `brand/logo-transparent.png` (sky removed, dirt island
  faded so it sits on grass). The game embeds a WebP of the transparent version in `game/logo.js`.
- **Typeface:** Fredoka (SIL Open Font License, see `game/fonts/OFL.txt`). Use weight 700 with a plum
  outline for headings and 600 for body text.
- **Colours**

| Name | Hex | Use |
|---|---|---|
| Plum | `#2e0b20` | outlines, text strokes |
| Cream | `#feedde` | Mochi, headline fill |
| Mochi pink | `#fd64a6` | primary buttons, "HOP" |
| Blossom pink | `#fdb1bd` | cheeks, soft accents |
| Leaf green | `#5fad0f` | the sprout |
| Sky | `#8fd3ff` | backgrounds |

- **Mochi:** round cream body, plum outline, two-leaf sprout, big glossy eyes, open smile with a pink
  tongue. The signature expression is the **wink** (left eye open, right eye "<"). No paws in the game.
- **App icon:** Mochi's winking face only, no text, on a pink sunburst. The text-free design keeps it
  readable at 48 px; the Android version also has a themed (monochrome) layer.
