# Releasing Mochi Hop on Google Play

The order matters, because the **14-day closed test is the slowest step**. Get the build into
testers' hands as early as possible and do the listing paperwork while the clock runs.

## 1. Google Play developer account (you, once)

1. Sign up at <https://play.google.com/console/signup> as a **Personal** account.
2. Pay the one-time registration fee and complete identity verification (government ID, and
   possibly a phone or address check). Verification can take a few days.
3. New personal accounts must run a **closed test with at least 12 testers, opted in for 14 days
   in a row**, before they can publish to everyone.

## 2. Upload key and GitHub secrets (you, once, about 10 minutes)

On your own computer (Java comes with Android Studio):

```bash
keytool -genkeypair -v -keystore mochi-upload.jks -alias mochi-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

**Back up `mochi-upload.jks` and its password somewhere safe.** Never commit it.

Then go to GitHub → repository **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `MOCHI_KEYSTORE_BASE64` | output of `base64 -w0 mochi-upload.jks` (macOS: `base64 -i mochi-upload.jks`) |
| `MOCHI_KEYSTORE_PASSWORD` | the keystore password |
| `MOCHI_KEY_ALIAS` | `mochi-upload` |
| `MOCHI_KEY_PASSWORD` | the key password (often the same) |

Every push then produces a signed **`mochi-hop-release-aab`** artifact (the `.aab` you upload to
Play). Its version code is the workflow run number, so it always goes up.

## 3. Create the app in Play Console

**Create app** → name *Mochi Hop*, language English (UK), **Game**, **Free**, accept the
declarations. Leave **Play App Signing** on (the default). Google keeps the real signing key and
you use the upload key.

## 4. Closed test (start this as soon as possible)

1. **Testers:** you need 12 or more people with a Google account on an Android phone. The easiest
   way to manage them is a **Google Group** (groups.google.com): make one such as
   `mochi-hop-testers`, set "Who can join" to *anyone with the link* or invite them by email.
   You can also paste a plain email list in Play Console.
2. **Testing → Closed testing → Create track** (or use the default *Alpha* track).
   - **Testers** tab: add the Google Group address, or create an email list.
   - **Create new release:** upload the signed `.aab` from the latest GitHub Actions run
     (`mochi-hop-release-aab` artifact; unzip it first). Add short release notes.
   - **Countries:** pick where testers live (for example the UK).
3. Send it for review (usually a few hours to a couple of days the first time).
4. Once approved, copy the **opt-in link** from the Testers tab and send it to your testers.
   Each tester must:
   1. open the opt-in link **while signed in to the same Google account as their phone's
      Play Store**,
   2. tap **Become a tester**,
   3. tap **download it on Google Play** and install, and
   4. **stay opted in for the full 14 days**, opening the game now and then.
5. Count to 14 from the day the 12th tester opted in. Ask for more than 12 (15 to 20) in case
   someone drops out, because people who leave before 14 days don't count.
6. Ask testers for feedback using the private feedback option on the Play listing, or a group
   chat. Push fixes as new releases on the same track. Updating the build doesn't reset the clock.

**Tip:** an **Internal testing** track (up to 100 people, no review wait) is handy for quick builds
to yourself, but it doesn't count towards the 14 days. Use the closed track for your 12+ testers.

## 5. Store listing and app content (while the test runs)

Everything is ready in `store/`:

| Play Console section | What to use |
|---|---|
| Main store listing → App icon | `store/play-icon-512.png` |
| Feature graphic | `store/feature-graphic-1024x500.png` |
| Phone screenshots | `store/screenshots/1…6.jpg` in order |
| Short and full description | `store/listing.md` |

Under **Policy → App content**:

- **Privacy policy:** a public URL is required. The game stores scores and settings only on the
  phone and sends nothing anywhere, so a short policy saying exactly that is enough. It can live
  on a free Google Sites or Notion page.
- **Ads:** No ads.
- **App access:** all functionality available without special access.
- **Content rating:** fill in the questionnaire (cartoon splats only, no chat or purchases). It
  should come out as PEGI 3 / Everyone.
- **Target audience:** choose the age groups honestly. If you include under-13s, Google's
  Families policy applies and needs extra checks, so **13+** is the simplest choice for a first
  release.
- **Data safety:** no data collected or shared.

## 6. Apply for production

After 14 days with 12+ opted-in testers, Play Console unlocks **Apply for production**. You
answer a short questionnaire about the test (how you recruited testers, what feedback you got,
what you changed). Google reviews it, then you can create a production release with the same
`.aab`.

## After launch

- The game's share button already links to
  `https://play.google.com/store/apps/details?id=com.mochihop.game`. During the closed test that
  link only works for opted-in testers, and for everyone once you're live.
- Every release needs a higher version code. CI handles this automatically.
