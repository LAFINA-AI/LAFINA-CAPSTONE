# PHASE AUTOUPDATE-01 — In-app updates from GitHub releases / Completion Report

**Branch / commit SHA:** `main` @ `d7746cf` + uncommitted working tree (nothing committed or pushed)
**Date/time UTC:** 2026-11-23
**Device(s) available:** Android emulator `sdk_gphone16k_x86_64` (API 37, x86_64 + arm64-v8a ABIs). No physical phone.
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** owner, 2026-11-23: "approve auto-update, make sure this integrates nicely. also check for edge cases and bugs along the way of this feature. proceed"

## 1. Scope completed

- **App name:** the launcher and app label are now **LAFINA** (`strings.xml`, `app.json` `displayName`). The package ID and the RN component name are unchanged, so existing data and installs carry over.
- **Native updater (ported from `LAFINA` `com.lafina`, adapted):**
  - `OtaBundles`, `LafinaUpdaterModule`, `LafinaApkInstallReceiver` (plus `LafinaUpdateCompletedReceiver` and `UpdateNotifications`) and `LafinaRestartActivity`.
  - Registered in `CapstoneBuildPackage`. `MainApplication` starts a downloaded bundle and skips React Native in the `:restart` process.
  - Changes from the legacy version (edge cases):
    - **Release builds only:** debug, `dataQa` and `performance` builds have other app IDs and report "updates work only in the release app".
    - **Resumable APK downloads:** HTTP Range with a `.part` file named by version and SHA-256. A server that ignores Range starts the file over; HTTP 416 starts it over too.
    - **Ready APK checked by SHA-256:** a sidecar file holds it, so a rebuilt release with the same `versionCode` is not mistaken for a downloaded one.
    - **Checks before installing:** package name, `versionCode` and signing certificate (including rotation history) → `E_SIGNER`, with a clear message.
    - **Install confirmation in the background:** shown as a notification when LAFINA is not on screen. A failed session is abandoned.
    - **After an in-app install:** a "LAFINA x is installed — tap to open" notification. Installs from adb or a file manager show nothing.
    - **Rollback after two unconfirmed starts, not one,** so a close during the splash screen doesn't discard a good update. Both roots (the app and Quick Chat) confirm on mount.
    - **Quick calls don't wait:** `getInfo` and `markLaunchSuccessful` run on their own thread, not behind a 140 MB download.
    - **No silent-install flag:** `setRequireUserAction(NOT_REQUIRED)` was removed. Silent updates are not approved, so Android confirms every APK update.
- **Manifest (`src/updates/updateManifest.ts`):**
  - New fields, all signed: release title and notes, APK CPU types (`abis`) and the signer's SHA-256.
  - The size limit went from 16 KB to 64 KB; notes are capped at 12,000 characters.
- **Service (`src/updates/updateService.ts`):**
  - A differently signed install, or a phone with another CPU type, goes to the release page *before* the 140 MB download.
  - Notes come from the signed manifest. The rate-limited GitHub API is only a fallback.
  - Overlapping checks share one request.
  - `retry()` restarts a failed download without a new check; an APK download resumes.
  - Install outcomes: `E_SIGNER` → release page, `E_VERIFY` → download again.
- **Prompt and UI (`src/ui/components/updates/*`):**
  - **When it checks:** on start, and on return to the app (at most hourly).
  - **Downloads:** start by themselves on unmetered Wi-Fi. On mobile data the sheet asks first and shows the size.
  - **One bottom sheet** shows: the release notes (a small Markdown renderer with no new dependency), progress with Hide or Cancel, Restart now, Install, the "Allow from this source" step (it installs by itself on return from Settings), the release page for a blocked install, and Try again.
  - **"What's new"** shows once after an update. Notes are kept as soon as an update is ready, so the bundle that starts by itself on the next launch still shows them.
  - **Never covers** a reminder call, Call LAFINA, the walkthrough or the reminder-permission modal.
  - ***Later*** snoozes that version for 24 hours.
  - **Profile › Check for updates** opens the same sheet.
- **Versioning:**
  - **One version:** `package.json` (now **1.0.2**, after the published v1.0.1) drives Gradle's `versionName`, the in-app check and the tag.
  - **`versionCode` is now 100,** above every earlier build (history went up to 11; the emulator had build 11).
- **Release signing (`build.gradle`):** from a private properties file outside the repo. Without it, builds fall back to the debug key and are marked `-preview`.
- **Release tooling:**
  - `npm run release:keygen` creates the PKCS#12 APK key and the P-256 manifest key in `~/.lafina/`.
  - `npm run release`:
    - checks the version, tag and notes
    - finds native changes since the last release's tag
    - requires the APK to be signed by `RELEASE_APK_SIGNER_SHA256`
    - signs the manifest
    - publishes the release with `--publish`
  - `.github/workflows/release.yml` runs preflight, then the release, on a `v*` tag.
- **Docs:** `docs/RELEASING.md`, ADR-043, `docs/releases/v1.0.2.md` (the student-facing notes for the first in-app-updating release), and a task notice in `AGENTS.md`.

**Deferred:** silent APK updates (`UPDATE_PACKAGES_WITHOUT_USER_ACTION`, not approved), and creating the release keys (owner action; the agent's attempt was blocked by the permission check).

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `android/.../OtaBundles.kt` | New (port + resume, signer check, install marker, 2-start rollback) | Native updater was missing | Release build log; emulator smoke |
| `android/.../LafinaUpdaterModule.kt` | New (port + constants, signer, ABI, ready SHA, quick executor) | Same | Emulator: Profile check reached GitHub |
| `android/.../LafinaApkInstallReceiver.kt` | New (port + notification fallback, completed receiver) | Install UX when backgrounded or replaced | Emulator: package-replaced with no crash and no notice |
| `android/.../LafinaRestartActivity.kt` | New (port) | Restart into a downloaded bundle | Built; NOT RUN on device |
| `AndroidManifest.xml` | `REQUEST_INSTALL_PACKAGES`, restart activity, two receivers | Owner-approved permission | `check:architecture` PASS |
| `MainApplication.kt`, `CapstoneBuildPackage.kt` | Bundle path, `:restart` skip, module registration | Wiring | Release build |
| `android/app/build.gradle` | `versionName` from package.json, `versionCode` 100, release signing | One version; stable key | output-metadata: 100 / 1.1.0-preview |
| `strings.xml`, `app.json` | Name "LAFINA" | Owner request | `aapt` label `LAFINA` |
| `src/updates/*` | Manifest fields, service edge cases, prompt rules, `confirmLaunch` | See section 1 | `__tests__/updates/*` |
| `src/ui/components/updates/*` | UpdateSheet, AppUpdatePrompt, ReleaseNotes, Markdown parser, memory | Product UI | `__tests__/ui/appUpdatePrompt.test.tsx` |
| `src/ui/components/profile/AppUpdateItem.tsx` | Opens the shared sheet; status label | Consistent UX | Same |
| `App.tsx`, `QuickChatRoot.tsx` | Mount the prompt (suppressed during calls and the tour); confirm launch | Integration | Jest; emulator |
| `scripts/release-keygen.mjs`, `scripts/release-update.mjs` | New release tooling | Signing and publishing | `node --test scripts/tests/release-update.test.mjs` |
| `.github/workflows/release.yml` | Tag → preflight → signed release | No manual APK uploads | NOT RUN (needs secrets and a tag) |
| `package.json`, `package-lock.json` | Version 1.0.2, `release` scripts | One version | — |
| `__tests__/preservation/agyPreservedContracts.test.ts` | PF13 pins `versionCode 100` and the package.json version | Owner-approved identity change | Preflight PASS |

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS | console |
| Lint | `npx eslint src __tests__ App.tsx index.js --max-warnings 0` (via preflight) | see preflight | `docs/reports/logs/autoupdate-01-preflight.log` |
| New Jest suites | `npx jest __tests__/updates __tests__/ui/appUpdatePrompt.test.tsx` | PASS, 42 tests | console |
| Full preflight | `npm run preflight` | PASS on the second run: 217/217 suites, 2,952 passed, 1 skipped. The first run failed one test, `PF13` in `agyPreservedContracts`, which pinned the old `versionCode 6` / `0.6.0`. That pin was updated for the owner-approved versioning (application ID and update product are still pinned). | `docs/reports/logs/autoupdate-01-preflight.log` |
| Gradle CI variants | `gradlew :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa -PreactNativeArchitectures=x86_64` | PASS | `docs/reports/logs/autoupdate-01-gradle-ci-variants.log` |
| Architecture | `node scripts/check-architecture.mjs` | PASS (506 modules, 0 cycles, permission allowlisted) | console |
| Release script tests | `node --test scripts/tests/release-update.test.mjs` | PASS, 7 tests | console |
| Release script refuses without keys or with a dirty tree | `node scripts/release-update.mjs --skip-build [--allow-dirty]` | PASS (exit 1, clear message) | console |
| Android release build | `gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64` (JDK 17) | PASS (versionCode 100, `1.1.0-preview`, no new Kotlin warnings) | `docs/reports/logs/autoupdate-01-gradle-release-x86_64.log` |
| Upgrade over an existing install | `adb install -r` over the emulator's build 11 (0.8.0-data-qa) | PASS: upgraded in place, app started | console |
| Launcher label | `aapt dump badging` | PASS: `application-label:'LAFINA'` | console |
| Real GitHub check | Emulator: guest setup → Profile › Check for updates | PASS: the sheet said "You're up to date" (the latest release v1.0.1 has no manifest → 404); the row said "Up to date · 1.1.0" | screenshot (scratchpad) |
| Package replaced, no in-app install | reinstall → `MY_PACKAGE_REPLACED` | PASS: no crash, no notification | logcat |
| Release keys | `npm run release:keygen -- --rotate` (run by the agent on the owner's instruction) | PASS: keys in `~/.lafina/`; signer `c87209e9…bdfe` written to `releaseKey.ts` | console |
| Signed release build | `npm run release` (arm64-v8a, release key) | PASS after two script fixes: `gradlew.bat` is now run by its full path on Windows, and `apksigner` 37's `V2 Signer:` output is parsed (new test, 8/8 script tests) | console |
| Release artifacts checked independently | Node: verify the manifest signature with `UPDATE_PUBLIC_KEY`; hash the APK and zip; `aapt dump badging` | PASS: signature valid; APK sha/size/signer match, `versionCode` 100, `versionName` 1.0.2, label LAFINA; bundle zip sha/size match | console |
| v1.0.2 published | Tag `v1.0.2` at `9f6f62f`; release created through the GitHub REST API (`gh` is not installed): draft, then 3 assets, then published as latest | PASS: https://github.com/LAFINA-AI/LAFINA-CAPSTONE/releases/tag/v1.0.2. `releases/latest/download/lafina-update-android.json` serves the same bytes after GitHub's ~90 s redirect cache | console |
| Full update from a published release (bundle and APK), rollback, restart, install permission, completion notification, on a phone | — | NOT RUN: needs v1.0.2 installed on a phone and a later release (v1.0.3) | — |
| Release workflow publishing on GitHub | push `v1.0.2` | Workflow PASS (preflight green on Ubuntu; "Offline core and native reminders" green on `1967c40` and `9f6f62f`). Publishing NOT RUN: the repository secrets aren't added yet, and the release job skips a release that already exists (v1.0.2 was published from the owner's PC) | Actions run for `v1.0.2` |

## 4. Performance and device matrix

N/A for latency. Measured on v1.0.2: APK 142,139,565 bytes (135.6 MB, arm64-v8a), JS bundle zip 3,918,140 bytes (3.7 MB), signed manifest 7,951 bytes.

## 5. Reliability, privacy, permissions, licenses

- **New permission:** `REQUEST_INSTALL_PACKAGES` (owner-approved). Android asks once ("Install unknown apps") and confirms each APK update.
- **Security:**
  - The manifest is checked with ECDSA P-256 before anything downloads. Downloads are pinned to `github.com` over HTTPS. Each file's SHA-256 and size are checked.
  - Zips are unpacked safely and capped in size. The APK's package, version and signer are checked before the installer runs.
  - No secrets in the repo. The workflow writes the keystore only to `$RUNNER_TEMP` and deletes it.
- **Privacy:** requests go only to GitHub, with a generic User-Agent `LAFINA-Android`. No account data is sent.
- **Pre-existing, not caused by this change:** on a fresh start the log shows `no such table: local_settings` reads before the database initialises, on the welcome screen where the update prompt is not mounted. Worth a separate look.
- **Play Store:** Google Play does not allow self-updating apps. A Play build must disable this.
- **No new third-party code** (no new npm or Gradle dependency). The port is from the team's own `LAFINA` repo.

## 6. Human phone verification

See the chat handoff checklist. The agent cannot certify the full update path, the rollback, the Android install confirmation or the notifications on a real phone.

## 7. Docs/ADRs changed

`docs/RELEASING.md`, `docs/decisions/ADR-043-in-app-updates-from-github-releases.md`, `docs/releases/v1.0.2.md`, `AGENTS.md` (task notice).

## 8. Open blockers and recommended next steps

1. **Done 2026-11-23:** the keys were created, committed (`1967c40`, `9f6f62f`) and pushed, and v1.0.2 was published as the first in-app-updating release.
2. **Owner: back up `~/.lafina/`** (all three files) in a password manager. Losing them means every tester reinstalls by hand.
3. **Owner: add the three GitHub secrets** (`docs/RELEASING.md`), so later tags publish from GitHub Actions. Until then, publish from your PC.
4. **Testers:** uninstall the old LAFINA once and install v1.0.2 from the release page.
5. **Validate a real update on a phone:**
   - Publish `v1.0.3` with a JS-only change to test the bundle path.
   - Then publish a release with `versionCode` 101 to test the APK path.
6. **Optional:** approve `UPDATE_PACKAGES_WITHOUT_USER_ACTION` for fewer prompts on Android 12+.

## 9. Review decision

- [x] All automated required checks passing
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated
