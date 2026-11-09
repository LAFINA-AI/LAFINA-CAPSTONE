# Phase 09 — study preference and online reminder call follow-up

**Branch / commit:** `Lem-branch`, `f8f8101edd8439e9db998811e955e40144de6450` plus uncommitted changes  
**Date:** 2026-11-09 UTC  
**Device:** Infinix X6880 (HOT 50 Pro+), Android 15, ADB `13195704C2004480`  
**Status:** AWAITING DEVICE VALIDATION  
**Authorization:** Owner requested both fixes, local provider testing, and installation on the connected phone; microphone and transcript streaming and the temporary protected callback tunnel were separately authorized.

## 1. Scope completed

- First-person study-time preferences are saved as phone memory instead of creating a time block. Explicit scheduling requests retain their scheduling behavior. Existing incorrectly created blocks are not removed automatically.
- Answering a simulated reminder call in Online Mode can start an ElevenLabs conversation after disclosure and microphone permission. The reminder is announced and supplied as context. Manual end, acknowledge and snooze controls remain; explicit spoken acknowledgments and snooze requests use the existing actions. Connection failures can fall back to offline voice when appropriate.
- The local QA server adds bounded, request-isolated phone memory context to text chat, including streamed chat. It does not expose memory extraction. Reminder conversations receive the reminder, not saved chat memories.
- The reference backend memory branch remains untouched and is not merged or deployed. The local voice snapshot and isolated database are used only for testing.

## 2. Change summary

| Area | Change | Evidence |
|---|---|---|
| `src/ai/studyPreference.ts`, `chatOrchestrator.ts` | Classify and save study preferences locally. | Chat memory reliability tests in preflight. |
| `IncomingCallScreen`, `OnlineReminderConversation`, call dispatcher | Consent, session lifecycle, reminder context, action controls and guarded offline fallback. | Online reminder and dispatcher suites in preflight. |
| Voice conversation controller and hook | Coordinate microphone release, context delivery and transcript echo suppression. | Voice controller suite in preflight. |
| `scripts/local_chat_memory_adapter.py` and local server runner | Add temporary request-scoped memory support to the local voice snapshot. | `scripts/tests/test_local_chat_memory_adapter.py`; real provider checks below. |
| `docs/qa-provider-testing.md` | Local setup, limits and phone testing instructions. | Reviewed with this report. |

## 3. Tests and actual outcomes

| Check | Command / procedure | Result and evidence |
|---|---|---|
| Full preflight | `npm run preflight` | PASS: 78 suites, 1,172 tests passed, 1 skipped; lint, typecheck and architecture checks passed. `.local/online-reminder-preflight-final.log` |
| Native Android | `gradlew :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon --console=plain -PreactNativeArchitectures=x86_64` | PASS. `.local/online-reminder-native.log` |
| Local adapter | Python pytest `scripts/tests/test_local_chat_memory_adapter.py` | PASS, 4 tests, including isolation and bounds. |
| Real local chat | Synthetic preference via `/v1/ai/chat` and `/v1/ai/chat/stream` | PASS: both HTTP 200 and both replies referenced 10 and 2; completed stream followed by successful sign-in. `.local/voice-backend-qa-20261109/memory-real-check.json` |
| Local voice readiness | Authenticated capability and gateway checks | PASS: voice enabled, local login 200; callback rejects missing credentials and does not expose account or docs routes. `.local/voice-backend-qa-20261109/local-contract.json` |
| ARM64 APK | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-provider-test-apk.ps1 -Architecture arm64-v8a` | PASS; APK audit found no configured provider keys. SHA-256 `9bc1530a8a8a24de6389a7d0966a206a8def702b739d6aec648e15b3355f8aab`. `.local/provider-testing/artifact-arm64-v8a.json` |
| Install and USB routing | `adb -s 13195704C2004480 install -r .local/provider-testing/LAFINA-providers-arm64-v8a.apk`; `adb -s 13195704C2004480 reverse tcp:8000 tcp:8000` | PASS; package `com.lafina.capstone.providers`, version `0.6.0-data-qa`; existing data retained. |
| Real phone preference and answered reminder conversation | Manual checks below | Owner confirmed on 2026-11-10 that the preference was saved and recalled, and that the reminder and interactive conversation worked. Time-block absence was not separately confirmed. |

## 4. Performance and device matrix

No new latency, alarm drift, p50/p95, memory-use or offline-speech benchmark was run. No claim of instant responses or device audio quality is made from automated tests.

## 5. Reliability, privacy and limits

The phone and PC need USB debugging and the ADB reverse mapping; the PC and providers need internet. The localhost.run tunnel exposes only the protected voice callback. The local QA daily voice allowance is 12 versus the production default of 6; other session limits remain. A rotated tunnel may require restarting a voice session. This is a local test configuration, not a production deployment.

An intentionally early-disconnected diagnostic stream left the isolated SQLite database locked. Restarting the local server cleared it; a fully consumed stream and subsequent login succeeded. An interrupted stream may therefore require a local server restart; this remains a test-backend limitation. A previously observed occasional lack of response to typed turns while muted in voice mode was not addressed by this change.

## 6. Human phone verification

1. Leave the phone unlocked and USB-connected, the PC local server and callback tunnel running, and sign in to the test account. Enable Online Mode and memory.
2. In chat type `i like studying between 10pm to 2am`. Expect a saved-memory notice, find the preference in Profile memory, and verify no new time block is created. Ask what study time is preferred; expect 10pm–2am. Review and remove the old malformed block manually if desired.
3. Create a reminder a few minutes ahead with Online Mode enabled. When the simulated call appears, tap Answer. Review the disclosure, choose Continue online and allow microphone access if prompted. Expect the reminder announcement, then an interactive online conversation that understands the reminder. Check audible pauses and interruption behavior.
4. Say an explicit acknowledgement or `snooze for 10 minutes`, or use the visible controls. Verify the reminder action is applied and the underlying task is not marked complete. Check leaving the call stops capture. These particular interaction and lifecycle checks have not yet been confirmed on this build.

## 7. Documentation

See `docs/qa-provider-testing.md`; previous phase reports are historical. Preflight architecture check passed (253 modules, no import cycles or forbidden dependencies). The memory-branch checkout was not modified.

## 8. Open checks and risks

The owner confirmed preference saving and recall and the reminder announcement and conversation on the phone. Confirmation of time-block absence, spoken snooze, task state after acknowledgement, and microphone shutdown remains outstanding. The interrupted-stream SQLite lock and previously observed muted typed-turn issue remain open local-testing limitations. Do not start a new phase without explicit approval.

## 9. Review decision

- [x] Automated checks above passed.
- [ ] Manual phone checks completed and human-confirmed.
- [x] No memory branch merge or deployment.
- [x] Report records actual evidence and limitations.

STATUS: AWAITING DEVICE VALIDATION  
STOPPED — awaiting explicit human approval
