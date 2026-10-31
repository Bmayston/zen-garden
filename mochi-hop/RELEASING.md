# Releasing Mochi Hop on Google Play

## 1. Create your upload key (one time, on your own computer)

You need Java installed (Android Studio includes it).

```bash
keytool -genkeypair -v -keystore mochi-upload.jks -alias mochi-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Pick a strong password and **back up `mochi-upload.jks` and the password somewhere safe**.
If you lose them you'll need Google support to reset your upload key. Never commit
the file to the repository.

## 2. Add the secrets to GitHub

Repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `MOCHI_KEYSTORE_BASE64` | output of `base64 -w0 mochi-upload.jks` (macOS: `base64 -i mochi-upload.jks`) |
| `MOCHI_KEYSTORE_PASSWORD` | the keystore password |
| `MOCHI_KEY_ALIAS` | `mochi-upload` |
| `MOCHI_KEY_PASSWORD` | the key password (often the same as the keystore password) |

The next push builds a signed `mochi-hop-release-aab` artifact. The version code is the
workflow run number, so it always goes up.

## 3. Google Play Console

1. Create the app in the Play Console and turn on **Play App Signing** (the default).
2. Upload the `.aab` to a **Closed testing** track and add your testers.
   New personal developer accounts must run a closed test with at least 12 testers
   for 14 days before they can publish to production, so start this early.
3. Fill in the store listing, content rating, data safety form (the game collects no
   data and has no ads or accounts yet) and a privacy policy URL.
