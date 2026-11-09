# PHASE 09 follow-up — Real provider testing defaults

**Date:** 2026-11-09 Asia/Manila. Raw verification timestamps are UTC; emulator timezone is GMT.  
**Branch / base:** `Lem-branch`, `f8f8101edd8439e9db998811e955e40144de6450`, existing dirty work preserved.  
**Device:** `emulator-5554`, `Medium_Phone`, `sdk_gphone16k_x86_64`, SDK 37. Follow-up: Infinix HOT 50 Pro+ / X6880, SDK 35, ARM64; installation, local auth, Online default and real chat checked.  
**Status:** **AWAITING DEVICE VALIDATION**.  
**Authorization:** Owner requested ElevenLabs and DeepSeek as temporary local/APK defaults for testing, with future reversion. USB-to-PC testing was the stated assumption after the optional hosting question. No backend merge/deployment or next phase was authorized or performed.

## 1. Scope completed

Created a separate normal-app testing profile, `com.lafina.capstone.providers`, enabled with `-PlafinaProviderTesting=true` on `dataQa`. It defaults to the PC server at `http://127.0.0.1:8000`, signed-in Online Mode when no mode preference exists, and fast ElevenLabs speech. An explicit Offline preference persists, guests stay offline, and capture still requires an explicit Answer/push-to-talk/Start action. Normal/release builds leave the flag off. No synthetic conversation provider is included in these APKs.

The PC runs real DeepSeek streaming (`deepseek-flash`) and ElevenLabs TTS (`eleven_v4_turbo`, default Camille). Provider keys stay in the private PC configuration. A separate SQLite database and persistent local signing-key pair keep test accounts isolated from production. The existing local backend checkout is read without source changes: `codex/chat-memory` at `45f65a7713398d4430de41b475a592e620e415dd`. Running it locally does not merge or deploy memory. The minimal runner does not configure Handbook RAG.

## 2. Change summary

| Files | Change |
| --- | --- |
| `android/app/build.gradle`, `CapstoneBuildPackage.kt` | Opt-in test flag, separate package, localhost default and native flag exposure; release flag remains false |
| `src/cloud/providerTestDefaults.ts`, `ChatScreen.tsx` | Signed-in test account defaults online only when no preference exists; ownership, guest and saved Offline checks |
| `src/cloud/speechService.ts` | Test profile defaults to low-latency speech; explicit standard requests still honored |
| `__tests__/cloud/providerTestDefaults.test.ts`, `__tests__/ai/phase09OnlineVoices.test.tsx` | Coverage for build flags, ownership, saved preferences, storage/auth failure and real request-body latency selection |
| `scripts/run-provider-test-server.py`, `start-provider-test-server.ps1` | Loopback-only real-provider server; private keys, isolated local database/signing keys, normal auth |
| `scripts/build-provider-test-apk.ps1`, `audit-provider-test-apk.py`, `package.json` | Phone/emulator builds, bundle identity verification, configured-key APK audit, npm entry points |
| `docs/qa-provider-testing.md`, this report/evidence | Start, install, manual checks and reversion instructions |

Other existing memory/login changes were retained, not reauthored as part of this task.

## 3. Tests and observed results

| Check | Command / action | Result |
| --- | --- | --- |
| Mobile gate | `npm run preflight` | **PASS**, exit 0: TypeScript, ESLint, **76 suites / 1,151 passed / 1 optional skipped** |
| Architecture | Included `npm run check:architecture` | **PASS:** 251 modules, 0 cycles, 0 forbidden imports; 79 offline leaves reach no network module |
| Android native | JDK 17, from `android`: `./gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon --console=plain -PreactNativeArchitectures=x86_64` | **PASS**, 7 suites / 51 tests, 0 failures/errors |
| Phone APK | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-provider-test-apk.ps1 -Architecture arm64-v8a` | **PASS**, bundle verified; ARM64/package verified with `aapt dump badging`; configured provider keys absent from all APK entries |
| Emulator APK | Same script, `-Architecture x86_64 -Install` | **PASS**, verified bundle/key audit, `adb install -r`, package separate from original apps |
| Local auth | Synthetic account login through real app form | **PASS**, no cloud account sign-out or auth bypass |
| Default Online Mode | Open Chat after first local sign-in without toggling Online | **PASS**, Online AI visible |
| Real chat | Ask a synthetic academic question from APK | **PASS**, completed answer displayed; screenshot below |
| Real voice | Profile → Online Voice → Preview | **PASS**, explicit “ElevenLabs preview finished” notice after native playback |
| Offline persistence | Choose Offline, stop/restart only test app, reopen Chat | **PASS**, same account/history remains Offline; then returned Online for owner testing |
| Audio cleanup | Android `dumpsys audio` after preview | **PASS**, empty active recording section and audio-focus stack |
| Local HTTP boundaries | Unauthenticated TTS capabilities | **401**; authenticated real chat/TTS calls returned **200** |
| Script syntax | `python -m py_compile scripts/run-provider-test-server.py scripts/audit-provider-test-apk.py` | PASS |
| Whitespace | `git diff --check` | PASS; existing CRLF notices only |

Logs and structured outcomes: [verification.json](evidence/phase-09-provider-defaults-20261109/verification.json), [preflight](evidence/phase-09-provider-defaults-20261109/preflight.log), [native tests](evidence/phase-09-provider-defaults-20261109/native-tests.log), [ARM assembly](evidence/phase-09-provider-defaults-20261109/assemble-arm64-v8a.log), [emulator assembly](evidence/phase-09-provider-defaults-20261109/assemble-x86_64.log).

Screenshots: [Online default](evidence/phase-09-provider-defaults-20261109/online-default.png), [real chat answer](evidence/phase-09-provider-defaults-20261109/chat-real-reply.png), [real ElevenLabs preview](evidence/phase-09-provider-defaults-20261109/real-voice-preview.png), [Offline retained after restart](evidence/phase-09-provider-defaults-20261109/offline-retained.png).

## 4. Artifacts and actual measurements

- ARM64 APK: `.local/provider-testing/LAFINA-providers-arm64-v8a.apk`.
- ARM64 SHA-256: `47bc109eae8491080844d377755719b69f6199a6d9422070b72f41be2b8c154c`.
- x86_64 APK: `.local/provider-testing/LAFINA-providers-x86_64.apk`.
- x86_64 SHA-256: `45014b6d536a22a8f63d8d2cf17badf142e8dcce226235105473c1dafbe333c0`.
- Both packaged JS bundles match freshly generated source. Receipts: [ARM64](evidence/phase-09-provider-defaults-20261109/artifact-arm64-v8a.json), [x86_64](evidence/phase-09-provider-defaults-20261109/artifact-x86_64.json).

One short local DeepSeek stream produced its first answer text in **521 ms**, completed in **726 ms**, and returned a DeepSeek done event with no error event. An earlier different short prompt returned first stream data in 1,050 ms. One short ElevenLabs request returned **24,911 bytes** of MP3 in **1,782 ms**, with provider `elevenlabs` and model `eleven_v4_turbo`. These are individual warm local API examples, not p50/p95, cold-start, complete voice-turn or acoustic benchmarks. Local routing and fast speech do not make remote inference instant. Raw measurements: [stream](evidence/phase-09-provider-defaults-20261109/stream-verified.json), [provider checks](evidence/phase-09-provider-defaults-20261109/real-provider-check.json).

## 5. Reliability, privacy and deviations

No provider keys, local auth credentials, signing keys, database or microphone recordings are copied into reports/APKs. Build audits scan every ZIP entry for both configured provider secrets. The backend checkout remained clean, and no production state or hosting configuration was changed. API keys and generated local test credentials remain only under existing ignored private paths. No production account was automated or signed out.

The first assembly helper emitted a UTF-8 BOM that Groovy rejected. The helper now writes UTF-8 without a BOM; both final builds passed. An Android Back key during form input exited the test app; it was reopened and the login completed using fresh field observations. No product failure is inferred from that operator action.

Both APKs are test builds signed with the existing development key. The test server and USB mapping are intentionally left active for owner testing, with no active microphone/playback session. This is not a standalone offline copy of either provider: the PC and internet must remain available.

## 6. Human phone verification

Follow [the setup and revert guide](../qa-provider-testing.md):

1. Install the ARM64 provider APK on a physical Android phone. Keep the PC server running, connect by USB and run `adb -s DEVICE_SERIAL reverse tcp:8000 tcp:8000`.
2. Register/sign in to a synthetic **local-server** account. Expect Chat to default Online. Ask a short academic question and check the streamed answer.
3. Open Profile → Online Voice → Preview. Expect an ElevenLabs completion notice and audible selected-voice playback. Check speaker/headset routing and echo.
4. Choose Offline, reopen the app and verify the choice persists. Test a reminder: Answer, Snooze, Acknowledge; the matching task should remain incomplete. Check microphone release after End/backgrounding.

The phone installation/sign-in/chat follow-up below is complete. Actual phone audibility, echo, Bluetooth, alarm/lock/reboot behavior with this build remain **NOT RUN**. Existing earlier call checks are documented separately; they are not substituted for phone validation of this build.

## 7. Docs and architecture

Added the testing guide, report and evidence. No architecture or provider protocol was replaced. AST architecture checks passed. No Graphify extraction was needed for the narrow build/default change.

## 8. Remaining limits and reversion

Real ElevenAgents pause-aware hands-free conversation remains separate. The local key still returns **401 `missing_permissions`** for ElevenAgents and has no local agent ID/shared secret configured. This profile provides real streamed chat and fast TTS; it does not certify semantic pause/interrupt detection. See [activation](../../backend_integration/README.md).

To revert, build normally without `-PlafinaProviderTesting=true` or use the normal app package; the native flag defaults false and no source rollback is needed. Stop the PC test server and remove only its ADB reverse mapping when finished. Existing explicit Offline preferences are respected.

## 9. Connected phone installation follow-up

The owner connected their Infinix HOT 50 Pro+ and authorized installation/setup. Windows initially saw only MTP; the owner enabled USB debugging and accepted the phone authorization. The authorized ARM64 phone (model X6880, Android SDK 35) received the verified ARM64 APK with `adb install -r`, which returned Success. Its separate provider package was not previously installed. `adb -s <phone> reverse tcp:8000 tcp:8000` established the phone-to-PC mapping. No existing app was uninstalled or cleared.

Opened the app, signed into the generated synthetic local account using the normal form, dismissed Google Password Manager with Not now, and allowed this app's reminder notifications. Chat showed Online AI automatically. A synthetic study-tip question returned a completed real answer on the physical phone. No personal account credentials or microphone audio were used. The phone was left in Chat, Online, with the server and USB mapping running. The ADB connection watcher used during setup was stopped.

Evidence: [phone-installation.json](evidence/phase-09-provider-defaults-20261109/phone-installation.json), [phone Online default](evidence/phase-09-provider-defaults-20261109/phone-online-ready.png), [phone real reply](evidence/phase-09-provider-defaults-20261109/phone-chat-reply.png). This is an installation/auth/chat check, not a completed audio/alarm or semantic-pause validation. No source changed, so already-passing automated gates were not rerun for installation.

## 10. Review decision

- [x] Full automated mobile/native gates passed.
- [x] Real providers verified through local HTTP and actual emulator app.
- [x] ARM64 and x86_64 APKs built, bundle-verified and provider-key audited.
- [x] Existing accounts and backend branch/deployment state preserved.
- [ ] Physical-phone checks completed and human-confirmed.
- [ ] Real ElevenAgents pause detection validated.

**STATUS: AWAITING DEVICE VALIDATION**  
**STOPPED — awaiting explicit human approval**
