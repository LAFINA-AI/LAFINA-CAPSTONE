# Releasing LAFINA (in-app updates)

Installed copies of LAFINA update themselves from the latest GitHub release of
`LAFINA-AI/LAFINA-CAPSTONE`. Testers don't download APKs again: the app checks
when it opens, shows the release notes, and applies the update. See ADR-043 for
the design.

## One-time setup (owner)

1. **Create the release keys** on your own computer. Do this once, ever:

   ```sh
   # Windows: set JAVA_HOME to a JDK 17 first
   npm run release:keygen -- --rotate
   ```

   - `--rotate` is needed once: `src/updates/releaseKey.ts` holds a public key
     from the legacy app, and nobody has its private half. No installed copy
     trusts that key yet, because the updater was never built.
   - The script writes three private files to `~/.lafina/`:
     - `lafina-capstone-release.p12`, the APK signing keystore
     - `lafina-capstone-signing.properties`, its password
     - `lafina-capstone-update-key.pem`, the manifest signing key
   - It also writes the public parts into `src/updates/releaseKey.ts`. Commit
     that file.
   - **Back up all three private files in a password manager.** If you lose
     them, every installed copy needs one manual reinstall.

2. **Add three repository secrets** (GitHub › Settings › Secrets and variables › Actions):

   | Secret | Value |
   |---|---|
   | `LAFINA_RELEASE_KEYSTORE_BASE64` | `base64 -w0 ~/.lafina/lafina-capstone-release.p12` (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\.lafina\lafina-capstone-release.p12"))`) |
   | `LAFINA_RELEASE_KEYSTORE_PASSWORD` | `storePassword` from the `.properties` file |
   | `LAFINA_UPDATE_KEY_PEM` | the full text of `lafina-capstone-update-key.pem` |

3. **Testers reinstall once.** Older test builds were signed with a developer's
   debug key, so Android can't update them in place:
   - Uninstall the old LAFINA, then install the first release built with these keys.
   - Cloud accounts sync back after signing in. Guest data on the phone is lost.
   - From then on, every update arrives inside the app.

## Every release

1. Raise `"version"` in `package.json` (and the root of `package-lock.json`).
2. **If native code changed** since the last release, raise `versionCode` in
   `android/app/build.gradle`. Native code means:
   - Kotlin or C++
   - `AndroidManifest.xml`
   - Gradle dependencies
   - an npm package with an `android/` folder

   The release script detects this and refuses to publish if you forget.
3. Write the notes in `docs/releases/v<version>.md`. Students read these in the app:
   - The first `# ` line is the title, for example `# LAFINA v1.2.0 — Calmer Reminders`.
   - Write the rest for students, in short bullets.
4. Commit, then tag and push:

   ```sh
   git tag v1.2.0
   git push origin main v1.2.0
   ```

The **Release** workflow then:
1. Runs `npm run preflight`.
2. Builds the release APK, signed with the release key.
3. Checks the APK's signer and the version numbers.
4. Signs the update manifest.
5. Publishes the GitHub release with three files:

| File | Who uses it |
|---|---|
| `lafina-update-android.json` | Every installed copy checks this first (signed). |
| `lafina-android-bundle-<version>.zip` | Phones on the same `versionCode`: a few MB, then a quick restart. |
| `LAFINA-v<version>-arm64-v8a.apk` | Phones on an older `versionCode`: installed from inside the app (Android asks to confirm). New testers download it from the release page. |

You can also release from your own computer with the keys in `~/.lafina/`:
`npm run release` builds and checks, and `npm run release -- --publish`
also creates the release (needs `gh`).

## What testers see

- **On opening the app:** LAFINA checks quietly. On Wi-Fi it downloads the
  update by itself, then shows a sheet with the version, title and release notes.
- **Small update:** *Restart now* (or *Later*, which applies it the next time
  the app opens).
- **Bigger update:** *Install*.
  - The first time, Android asks to allow LAFINA to install apps.
  - Android then shows its confirmation and closes LAFINA while it installs.
  - A notification, "LAFINA x.y.z is installed", reopens it.
- **On mobile data:** nothing downloads without asking. The sheet shows the size first.
- ***Later*:** hides that version for a day. **Profile › About › Check for
  updates** opens the same sheet at any time.
- **After an update:** "What's new" shows the notes once.

## Safety checks built in

- **Signed manifest:** the manifest is signed with ECDSA P-256 and checked
  natively against the key built into the app. It must name
  `com.lafina.capstone` and a newer version.
- **Downloads are checked:** files only come from `github.com` over HTTPS, and
  each one's size and SHA-256 must match the manifest. A dropped APK download
  resumes where it stopped.
- **APK checks before installing:** LAFINA checks the package name, the version
  and the signing certificate. A differently signed install, or a phone with
  another processor type, is sent to the release page instead of failing
  inside Android's installer.
- **Bad small updates are undone:** a small update that never finishes starting
  (two tries) is rolled back and never offered again.
- **Only the release app updates itself:** debug, `dataQa` and `performance`
  builds use other app IDs and show "updates work only in the release app".
