# PHASE 09 — DeepSeek responses + ElevenLabs online speech / Follow-up report

**Branch / base:** mobile `Lem-branch` / `e9110683a956f6bc76b4aa1d2da7346f4ffdb45c` (local changes); backend `codex/elevenlabs-online-tts` / commit `34f9fba` (pushed).  
**Date/time UTC:** 2026-11-07T12:26:16.141735+00:00  
**Device(s) used:** NONE. Host build/tests and a synthetic provider HTTP check only.  
**Status:** AWAITING DEVICE VALIDATION — production deployment and public contract verified; signed-in phone checks pending.  
**Approval provenance:** Owner explicitly approved Phase 09 with DeepSeek responses and ElevenLabs TTS for online mode only; corrected the working target to this latest Lem checkout; separately authorized the scoped backend change and deployment; then reported the friend/Vercel owner had added the ElevenLabs key. These instructions do not certify prior or current phone QA.

## 1. Scope completed

The latest mobile checkout reuses the existing `react-native-tts`, native audio player, cloud client, online toggle, authenticated/entitled access and DeepSeek response pipeline. Existing Chat read-aloud now uses ElevenLabs in Online Mode. Profile test labels report the actual provider and dispose their session. No cloud STT, new model, database/schema change, account/sync change, backend host replacement, or new mobile dependency/permission was added.

The mobile client first probes the authenticated ElevenLabs capability route; it does not call an old Gemini synthesis endpoint when that capability is absent. It checks provider/MIME/base64 bounds, uses private temporary MP3 files, preserves native fallback, and retires network/playback callbacks on Stop, switch-off, background, account change and unmount. New read requests replace previous owners; cancellation cannot trigger fallback speech.

The separately authorized backend change replaces active Gemini TTS wiring with the tested ElevenLabs client, retains `/v1/ai/chat` and DeepSeek unchanged, preserves existing auth/entitlement and durable per-minute/day quota checks, and adds `/v1/ai/tts/capabilities`. No keys were committed. Branch: [backend migration](https://github.com/LAFINA-AI/LAFINA-backend/tree/codex/elevenlabs-online-tts). PR creation was attempted but the connected GitHub integration returned 403, so only the branch is published. Main is unchanged.

## 2. Change summary

| Module | Change / reason | Evidence |
|---|---|---|
| `src/cloud/speechService.ts` | ElevenLabs-only capability gate, explicit Online Mode, MP3 validation, cancellation and one-owner playback | 23 speech regression tests; full preflight |
| `src/scheduler/speechProvider.ts` | Actual ElevenLabs/native/cancelled result tags | TypeScript + full Jest |
| Chat screen/message item | Existing read-aloud delegates online voice; Stop waits for its provider and cleanup retires the session | Full Jest; device checks NOT RUN |
| Profile screen | Accurate provider label and disposal | TypeScript/full Jest |
| `backend_integration/` | Tested client, exact reviewed patch, smoke utility, deployment handoff; adapter AST equals backend implementation | 7 standalone client tests; 177 real backend tests |
| Separate backend | New provider, config, lifecycle, capability, updated endpoint tests and env placeholders | Backend commit `34f9fba` |
| Docs/AGENTS | ADR-028, setup guide, task-scoped backend permission record, execution/manual checklist; historical Phase 09 report retained | This report |

## 3. Tests and real outcomes

| Check / command | Actual result | Evidence |
|---|---|---|
| `npm run preflight` | PASS: TypeScript, zero-warning project ESLint, 59 suites; 865 passed / 1 existing skipped; architecture PASS | [mobile-preflight.log](evidence/phase-09-elevenlabs-20261107/mobile-preflight.log) |
| `npx jest __tests__/ai/phase05TtsAndCloudSpeech.test.ts --runInBand` | Initial focused run PASS: 22/22; final full preflight includes the added recovery case (23 speech tests). | [speech-regressions.log](evidence/phase-09-elevenlabs-20261107/speech-regressions.log) |
| `python -m pytest backend_integration -q` | PASS: 7 client tests | Local command output; verification JSON |
| Backend isolated `.venv/Scripts/python.exe -m pytest -q` | PASS: 177/177; 8 existing framework deprecation warnings | [backend-full-tests.log](evidence/phase-09-elevenlabs-20261107/backend-full-tests.log) |
| `python -m ruff check backend_integration` and changed backend client/tests | PASS | Local command output |
| `python -m backend_integration.smoke` | PASS: synthetic ElevenLabs request returned 41,838 audio bytes; playback NOT RUN | [live-provider.json](evidence/phase-09-elevenlabs-20261107/live-provider.json) |
| `git diff --check`, ignored `.env`, private-value match scan | PASS; no provider key matches in mobile source/handoff | [verification.json](evidence/phase-09-elevenlabs-20261107/verification.json) |
| Android Gradle checks | JVM compile/tests PASS; fresh JS/Hermes bundle PASS. ARM64 QA APK packaging PASS (3m06s), reusing the freshly verified bundle; initial Ninja/Metro/Gradle-output mapping failures are retained in local logs. | [android-jvm.log](evidence/phase-09-elevenlabs-20261107/android-jvm.log), [js-bundle.log](evidence/phase-09-elevenlabs-20261107/js-bundle.log) |
| Production contract / authentication boundary | PASS: capabilities GET and synthesis POST reject missing auth (401); OpenAPI advertises ElevenLabs + audio/mpeg. Signed-in positive flow NOT RUN. | [merged production verification](evidence/phase-09-elevenlabs-20261107/production-verification-merged-20261107.json) |
| Production deployment | PASS: owner merged main `f0fae4d`; Vercel success; source tree matches tested backend. Private provider key/enabled flag require signed-in verification. | merged production verification |
| Android phone playback, airplane mode, alarms, focus/mic/lifecycle, accessibility | NOT RUN | [manual checklist](../../qa/PHASE-09-ELEVENLABS-MANUAL.md) |

The initial full backend run used an incomplete global Python environment and failed document/PDF tests. Installing the backend's declared dependencies into an isolated `.venv`, adapting the old TTS fixture/error expectation, and rerunning produced the final 177-pass result. These are real runs; no device success is inferred from mocks.

## 4. Performance/device matrix

No release-like voice baseline, Android time-to-first-audio, median, p95, RAM, battery, or alarm drift was measured. The synthetic HTTP smoke is a connectivity check, not a speed/voice-quality benchmark. Raw synthetic audio stays in ignored `.local/elevenlabs-latest-smoke.mp3`. No private voice recordings or transcripts were collected.

## 5. Reliability, privacy, permissions and provenance

The API key is retained privately as requested in ignored configuration; provider keys are never sent to the mobile app or committed. Provider request/response bodies are not logged by the new adapter. ElevenLabs may retain submitted speech text under its policies; enterprise zero retention is not assumed. Only selected text is synthesized; no microphone audio is uploaded by this feature.

The existing account quotas remain server-enforced. The additional 20,000-character ceiling is per provider-client process and resets on restart; it is not a monthly spending guarantee. Configure a key/account quota in ElevenLabs too. A request deadline can stop local waiting but does not guarantee the provider cancels billing. No automatic paid retries are added.

Reference/port: reviewed current mobile interfaces and backend revision `967180269bed21a0a88eadc03414d144c2b5728b`; only speech provider/lifecycle/config/tests are changed in the backend. No unrelated backend functionality or legacy modules were imported into mobile. The existing native player/offline TTS remain dependencies, so physical audio-focus and microphone tests are still required.

## 6. Human verification and activation

The backend and mobile repositories remain separate. The owner reported the backend merge. Main is now `f0fae4d814cfa5d75590db951404164d35b60023`, its source tree matches tested commit `34f9fba`, and Vercel reports the production deployment complete. The public production contract exposes the capability route and ElevenLabs MP3 response metadata; missing-auth GET and POST requests correctly return 401. No replacement hosting project was created. The private key/enabled flag and successful authenticated speech flow still require an existing entitled test session on a device.

After deployment, install the fresh bundled QA APK or build/run the debug app with Metro. Open Chat, enable Online Mode, send one synthetic question and tap read aloud; expect written DeepSeek text followed by ElevenLabs audio. Switch offline/airplane mode and use local read-aloud/planner actions; expect independence from cloud. Stop during download/playback, switch account/background, and interrupt with microphone/audio focus; expect no stale or overlapping speech. Follow every step in [PHASE-09-ELEVENLABS-MANUAL.md](../../qa/PHASE-09-ELEVENLABS-MANUAL.md). All these device checks are NOT RUN.

## 7. Docs and architecture

- [Setup/deployment handoff](../../backend_integration/README.md)
- [ADR-028](../decisions/ADR-028-elevenlabs-online-speech.md)
- [Execution record](../../qa/PHASE-09-ELEVENLABS-EXECUTION.md)
- [Verification JSON](evidence/phase-09-elevenlabs-20261107/verification.json)
- Current checkout has no Graphify output. Existing AST architecture checker is the documented substitute: 226 modules, zero cycles, 75 offline leaves reaching no online/network module.

## 8. Open blockers / next steps

1. Use an existing entitled test account to verify the production enabled flag and spoken reply. Authenticated provider check remains NOT RUN; merge/deployment and public contract checks are complete.
2. Run and acknowledge the human phone matrix; Android host compilation/JVM, bundle and APK builds now pass.
3. Establish comparable release-like voice/performance baselines before claims.

No next phase was started. Unrelated pre-existing AGY/research files remain untouched. The earlier checkout's preliminary draft was not imported into the latest app.

## 9. Review decision

- [x] Mobile and backend host test suites pass.
- [x] Android JVM checks, current JS/Hermes bundle and ARM64 QA APK build complete.
- [x] Production backend activated; deployed contract and missing-auth boundary verified.
- [ ] Signed-in production voice capability and real-device flow verified.
- [ ] Human-required device checks completed and acknowledged.
- [x] Provider decision, privacy/limits, exact branch, evidence and manual steps documented.

STATUS: AWAITING DEVICE VALIDATION
STOPPED — awaiting explicit human approval

### Final host evidence update

The final mobile preflight is 865 passed / 1 skipped across 59 suites. The added regression confirms cloud speech recovers after a temporary capability outage. Android `:app:compileDebugKotlin :app:testDebugUnitTest` passed through a temporary short drive alias (1m30s). Actual JVM XML counts: {"tests": 43, "failures": 0, "errors": 0, "skipped": 0}. The physical-path `:app:createBundleDataQaJsAndAssets` build passed (2m31s), and its sourcemap contains the final recovery fix. Metro configuration was restored; no Metro source change is retained.

Vercel's public GitHub check reports the backend branch deployment complete: [deployment check](https://vercel.com/nblancs-projects/lafina-backend/AmaXowDD7wb2BRdSswEmkHKcUP1E). This does not verify production activation, configured key, or authenticated phone playback. The production capabilities probe returned 404. The friend who owns that project must review/promote or merge/redeploy the tested branch.

### Final APK outcome

`:app:assembleDataQa` passed in 3m06s using a temporary short drive path and a packaging-only init script that marks the duplicate bundling task skipped while retaining Gradle dependency tracking. The bundle had already been freshly built from the physical checkout and its sourcemap was checked for the final recovery fix. The app/Metro build sources were not changed for this workaround. The earlier failed attempts remain diagnostic history; none is labeled pass.

Artifact: `android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk`, 145746246 bytes; SHA256 `09dec97f29569d6e4f3f14370a0a82ae7a491cb58d7ef73761ad3eb3be111b34`. [APK metadata and key scan](evidence/phase-09-elevenlabs-20261107/apk.json), [APK build log](evidence/phase-09-elevenlabs-20261107/android-apk-build.log). Neither provider key nor an `.env` file was found in the APK scan. Installation and all phone checks remain NOT RUN. No old/x86 APK is represented as a fresh build.

Reproduction on this Windows path: create an unused short drive alias to this checkout, build `:app:createBundleDataQaJsAndAssets` from the physical checkout, then run the short-path `:app:assembleDataQa` with `.local/elevenlabs-reuse-bundle.init.gradle` after checking that the bundle matches current sources. JVM command: `:app:compileDebugKotlin :app:testDebugUnitTest`. The temporary drive alias is removed after verification; native caches are generated/local.

### Exact packaging-only init script used

The native short path and physical-path bundle share the same output directory. The following ignored init script was used **only after a fresh successful bundle and sourcemap verification**, to avoid rebuilding that bundle through the aliased path:

```groovy
gradle.projectsEvaluated {
    def app = rootProject.findProject(':app')
    if (app != null) {
        app.tasks.named('createBundleDataQaJsAndAssets').configure {
            onlyIf { false }
        }
    }
}
```

Actual packaging command from `L:/`: `android/gradlew.bat -p android :app:assembleDataQa --init-script L:/.local/elevenlabs-reuse-bundle.init.gradle -PreactNativeArchitectures=arm64-v8a --offline --max-workers=2 --no-daemon --console=plain`. The alias was checked unused before creation and removed afterward. This is a host-build workaround; no production app build configuration changed.

### Production merge verification — 2026-11-07

This checkpoint supersedes the earlier deployment-pending notes and 404 probe snapshots above. The owner confirmed the merge; main is `f0fae4d814cfa5d75590db951404164d35b60023`. The Vercel check is **success / Deployment has completed** ([production deployment](https://vercel.com/nblancs-projects/lafina-backend/XWQvgH3jQ9uW9GABv8W9AUqUS3Uf)). A local tree comparison confirms merged production source equals the backend implementation that passed all 177 tests.

Live `/openapi.json` now exposes `/v1/ai/tts/capabilities` and `/v1/ai/tts`; `AITtsResponse` advertises `provider=elevenlabs` and `mimeType=audio/mpeg`. An unauthenticated GET to capabilities and a synthetic unauthenticated POST to synthesis both return 401 with `Missing Authorization header.` No account was created, no authentication was bypassed, and no credentials were requested or logged for these probes.

[Versioned production evidence](evidence/phase-09-elevenlabs-20261107/production-verification-merged-20261107.json) is separate from the earlier pre-merge snapshots. No new mobile code or APK was needed: the existing fresh ARM64 QA APK remains current. The successful signed-in cloud-speech path, enabled/key configuration, Android audibility, airplane-mode local behavior and lifecycle/focus/microphone tests remain **NOT RUN**. Phase 09 is not declared passed.

STATUS: AWAITING DEVICE VALIDATION
STOPPED — awaiting explicit human approval
