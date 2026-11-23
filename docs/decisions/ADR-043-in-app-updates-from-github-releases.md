# ADR-043 — In-app updates from GitHub releases

**Status:** accepted
**Date:** 2026-11-23
**Phase:** AUTOUPDATE-01
**Review owner:** human developer

## Context / problem

QA testers reinstalled LAFINA by hand for every release: download the APK from
GitHub, then install over the old one. The JS side of an updater was already in
`src/updates/` (ported from LAFINA in Phase 0), but it was never usable:

- **No native module:** `LafinaUpdater` was not registered, so the Profile
  button said "not available in this build".
- **Three version numbers:** `package.json` said 1.3.4, `build.gradle` said
  0.6.0 (build 6), and the latest release was v1.0.1. The check would have
  treated v1.0.1 as older.
- **Unstable signing:** release APKs were signed with the debug key of
  whichever computer built them. Android refuses an update signed with a
  different key.
- **Nothing to check:** releases carried no signed manifest.
- **No public key with a private half:** the public key in `releaseKey.ts` has
  no known private key.

## Decision

Port the native updater from `LAFINA` (`com.lafina`): `OtaBundles`,
`LafinaUpdaterModule`, `LafinaApkInstallReceiver` and `LafinaRestartActivity`.
Adapt it to `com.lafina.capstone`, and change it as follows:

- **Release builds only:** `BUILD_TYPE == "release"`. Debug, `dataQa` and
  `performance` builds have other app IDs and can't take the release APK.
- **Resumable APK downloads:** an HTTP Range resume, with a `.part` file keyed
  by version and SHA-256. The ready APK carries its SHA-256 in a sidecar file,
  so a rebuilt release with the same build number is not mistaken for a ready one.
- **Checks before installing:** the package name, `versionCode` and signing
  certificate are checked before the installer runs (`E_SIGNER`). The manifest
  carries the APK's CPU types and signer, so a mismatch is caught *before*
  downloading about 140 MB.
- **Fewer false rollbacks:** a small update is rolled back after two
  unconfirmed starts, not one, so closing the app during the splash doesn't
  discard a good update. Each root (the app and Quick Chat) confirms on mount.
- **Notifications:** the install confirmation becomes a notification if the
  app is in the background. After the app is replaced,
  `LafinaUpdateCompletedReceiver` posts "LAFINA x is installed — tap to open"
  for installs started inside the app only.
- **Release notes inside the signed manifest:** title and notes (up to 12,000
  characters). The GitHub API, which allows 60 requests an hour per IP, is now
  only a fallback.

Product behaviour, in `AppUpdatePrompt` and `UpdateSheet`:

- **When it checks:** on start, and on return to the app at most hourly.
- **Downloads:** on unmetered Wi-Fi the download starts by itself. On mobile
  data the sheet asks first and shows the size.
- **One sheet:** it shows the notes as Markdown, plus progress, the install
  permission step, restart or install, and "What's new" once after an update.
  It is never shown over a call, Call LAFINA, the walkthrough or the reminder
  permission modal.
- ***Later*:** snoozes that version for 24 hours. Profile opens the same sheet.

Release side:

- **One version:** `package.json` drives the tag, the app's version and
  Gradle's `versionName`. `versionCode` goes up only for native changes.
- **Release signing:** from `~/.lafina/lafina-capstone-signing.properties`
  (or `LAFINA_RELEASE_SIGNING`). Without it, a build falls back to the debug
  key and is named `-preview`.
- **`npm run release:keygen`:** creates the PKCS#12 APK key and the P-256
  manifest key outside the repo.
- **`npm run release`:**
  - checks the version and tag
  - finds native changes since the last release's tag (`android/`, and npm
    packages that ship Android code)
  - requires the APK to be signed by `RELEASE_APK_SIGNER_SHA256`
  - signs the manifest
  - publishes the release with `--publish`
- **`.github/workflows/release.yml`:** runs preflight, then the release, on a `v*` tag.

Permission: `REQUEST_INSTALL_PACKAGES` (already on the architecture allowlist).
`UPDATE_PACKAGES_WITHOUT_USER_ACTION` is **not** added, so Android confirms
every APK update.

## Alternatives considered

- **Obtainium (QA installs a GitHub-watching app):** no code, but every tester
  needs another app, there are no in-app notes, and signing is still broken.
  Fine as a stop-gap.
- **Firebase App Distribution:** testers need Google sign-in, a separate tester
  app and a Firebase project. That is too much for a public GitHub repository.
- **Google Play internal testing:** the right long-term channel for a Play
  launch. It needs a developer account and review. Play doesn't allow
  self-updating apps, so a Play build must turn this off (`updatesEnabled` is
  per build type).
- **Expo Updates or CodePush:** CodePush has been retired. Expo Updates needs
  the Expo modules runtime in a bare React Native 0.86 app. The ported updater
  is smaller and already reviewed.
- **Silent APK updates (`UPDATE_PACKAGES_WITHOUT_USER_ACTION`):** possible on
  Android 12+ after LAFINA has installed itself once, but not guaranteed on
  every phone. It is deferred until the owner approves the permission.

## Impact

- **Security:** two signatures protect each update. The manifest signature
  covers versions, checksums, signer and notes. The APK signature is checked by
  Android and by LAFINA beforehand. Downloads are pinned to `github.com` over
  HTTPS, zips are unpacked safely, and sizes are capped.
- **Data:** about 10 KB per check. Small updates are a few MB. APK updates are
  about 140 MB, and only download automatically on Wi-Fi.
- **Storage:** a staged bundle and the previous one are kept. A downloaded APK
  is deleted once it is installed or superseded.
- **Reminders:** an APK update restarts the app. Alarms survive package
  replacement, and the existing `MY_PACKAGE_REPLACED` receivers reschedule them.
  A small update only restarts the JavaScript.
- **Scope:** student app only. No backend change.

## Measurements/verification

- **Automated:** Jest (`__tests__/updates/*`, `__tests__/ui/appUpdatePrompt.test.tsx`)
  and the release script tests (`node --test scripts/tests/release-update.test.mjs`).
  Gradle release build and emulator smoke results are in the AUTOUPDATE-01 report.
- **NOT YET MEASURED:** a real update from a published release, on a phone,
  end to end. That needs the release keys and a first published release.

## Rollback

- **A bad small update:** it rolls back by itself after two failed starts. To
  stop it reaching anyone else, publish a higher version.
- **Turn the feature off:**
  - Remove `<AppUpdatePrompt>` from `App.tsx` (it falls back to the Profile row).
  - Or delete the manifest asset from the latest release; the app then reports
    up to date.
  - Native code and local data are unaffected. Scheduled reminders live in
    SQLite and `AlarmManager`, not in update state.

## Human approval

The owner asked on 2026-11-23: "approve auto-update, make sure this integrates
nicely. also check for edge cases and bugs along the way of this feature. proceed".
That covers in-app updates from GitHub releases and the `REQUEST_INSTALL_PACKAGES`
permission. Generating the release keys was left to the owner.
