# PHASE 09 follow-up — Vercel backend and debug server switch / Report

Date: 2026-11-08. Branch: `Lem-branch` (mobile only; no backend change).

Request: the owner reported that the backend was fixed and now runs in Singapore. They asked to use the Vercel backend, and to add a debug setting that switches between Vercel and the local backend.

Status: **AWAITING DEVICE VALIDATION.** Emulator checks pass. No physical phone or release build was checked.

## 1. What changed

- **`src/cloud/backendSelection.ts` (new)**
  - Choices: `vercel` (`https://lafina-backend.vercel.app`) or `local` (`http://127.0.0.1:8000`).
  - Stores one device-wide `local_settings` row (owner `__device__`, key `debug.api_backend`). It is never synced.
  - `applySaved()` runs in `App.tsx` right after the database opens, before any request.
  - Works only when the native build flag is on.
- **Android**
  - `build.gradle`: new BuildConfig flag `ENABLE_BACKEND_SWITCH`. It is true in `debug` and `dataQa`, and false in `defaultConfig`, so `release` is false.
  - `CapstoneBuildModule` exposes it as `backendSwitchEnabled`.
- **Profile → Developer → Server (debug)** (`ServerSwitchItem.tsx`)
  - Shows the current server and offers the other one.
  - Signed-in account: it signs out at the old server first (`/v1/auth/logout`, then clears the session on the phone). Planner data stays on the phone. The login screen follows.
  - Guest: switched without signing out.
  - The row is hidden when the flag is off.
- **Tests:** `__tests__/cloud/backendSelection.test.tsx` (10 tests):
  - release build ignores a saved choice and hides the row;
  - switch, remember, restore on the next launch;
  - unknown saved values are ignored;
  - a custom server is reported as custom;
  - a guest switches without signing out;
  - a student is signed out at the old server before the switch;
  - a failed sign-out still switches;
  - Cancel changes nothing.
- **Docs:** `docs/07-RAG-AND-ONLINE.md` (new section), this report, and `docs/reports/evidence/phase-09-backend-switch-20261108/`.

No new dependency, permission, migration or backend change. `-PlafinaApiBaseUrl` still sets a test build's starting server; a Profile choice overrides it.

## 2. Vercel backend now

Measured from the developer PC (Python `urllib`, synthetic student; tokens held in memory only):

| Call | Result |
|---|---|
| Region | `sin1::sin1` (Singapore edge and function) |
| `POST /v1/auth/login` | 200, 328 ms |
| `GET /v1/auth/me` | 200, 220 ms, role `student` |
| `GET /v1/ai/tts/capabilities` | 200, 206 ms, `elevenlabs`, enabled, `audio/mpeg` |
| `POST /v1/ai/chat/stream` (3 short prompts) | 200; first SSE line 1081 / 1177 / 819 ms; complete 1294 / 1386 / 1048 ms |
| `POST /v1/ai/tts` (2 short sentences) | 200; 1016 / 1066 ms |
| `GET /v1/ai/voice/capabilities` | 404: the live voice conversation backend branch is not merged yet |
| `POST /v1/auth/logout` | 204 |

These are a few samples from one network, not targets. Phone timings were not measured precisely.

## 3. Tests and outcomes

| Check | Result |
|---|---|
| `npm run preflight` | **FAIL, 1 test.** 70 of 71 suites pass; 1,073 passed, 1 skipped, 1 failed. tsc, ESLint and the architecture check pass. The failure is `agyPort05Drafts › Prepare goes through review…`, a pre-existing flaky test (§5). |
| Focused Jest | PASS. 37 tests: `backendSelection`, `apiBaseUrl`, the Profile screen suites and `chatReplyFormat`. |
| Final tsc / ESLint on changed files / `check-architecture` | PASS. 243 modules, 0 cycles, 0 forbidden imports, 77 offline leaves reach no online module. |
| Android JVM (`:app:compileDebugKotlin :app:testDebugUnitTest`) | PASS. 7 suites, 51 tests, 0 failures. |
| Fresh JS bundle + x86_64 `dataQa` APK, no API override | PASS. Final SHA-256 `f50f7a52…a2af`, 154,885,193 bytes. BuildConfig has `ENABLE_BACKEND_SWITCH = true` and an empty override. The bundle contains the new dialog. |

## 4. Emulator checks

Setup: `emulator-5554`, `sdk_gphone16k_x86_64`, Android 17. The build was installed with `adb install -r`.

The app starts on Vercel. The synthetic `qa-backendswitch@lafina-test.dev` account was registered through the app on production; onboarding followed.

All PASS:
- online chat answered through Vercel and DeepSeek;
- read-aloud played the ElevenLabs MP3 through the app's audio player (audibility is not certified on an emulator);
- the switch dialog offers only the other server;
- choosing Local signed the account out and opened the login screen;
- sign-in and two sync batches succeeded on the local backend;
- Local survived an app restart and an `adb install -r`;
- switching back sent `POST /v1/auth/logout` to the local server (204) before moving to Vercel;
- the emulator ends signed in on Vercel as the synthetic account.

Details are in `emulator.json`, and five screenshots of the synthetic accounts are in the evidence folder.

## 5. Problems and notes

- **Flaky Jest test (pre-existing, not changed).** `__tests__/ui/agyPort05Drafts.test.tsx › Prepare goes through review…` failed in both full preflight runs today, and passed or failed alone at random. Run against HEAD's own sources in a separate folder, it failed 2 times out of 3. With this change, run alone, it passed 2 times out of 3. So it is not caused by this change.
  - What happens: the voice sheet opens already showing "Check the details, then confirm". A review proposal from an earlier test seems to finish after that test's cleanup.
  - It needs its own fix.
- **Old local sign-in.** The first install of this build started on Vercel. The earlier local-only synthetic session was not valid there, so the app showed the welcome screen. That is expected: sign-ins belong to one server.
- **Legacy app on the emulator.** During the first registration attempt I pressed Back to hide the keyboard. That closed this app's root screen and brought the legacy `com.lafina` app to the front. My next two taps landed there: Cancel on an empty "Create Time Block" dialog, then its Profile tab. Nothing was saved and nothing else was changed in that app.
- A production account was created on Vercel for testing: `qa-backendswitch@lafina-test.dev`, role student, with one short chat and two short TTS calls. The owner may delete it.

## 6. Not run

- A release APK (row hidden): covered by Jest only.
- A physical phone.
- A guest switch on a device (Jest only).
- Live voice conversation on Vercel: needs the `codex/voice-conversation` merge and activation steps in `backend_integration/README.md`.

## 7. Review decision

STATUS: AWAITING DEVICE VALIDATION. STOPPED — awaiting explicit human approval.
