> Later APK update: local-backend Wi-Fi support replaces the installed APK files below. See [Wi-Fi follow-up](local-backend-wifi-report.md) for current setup; earlier hashes remain historical receipts.

# Phase 15 — Call Lafina 2.0 audit remediation and phone update

**Branch / base HEAD:** `feat/call-lafina-v2` / `fe489a6487884fa6667f1cc6e2e0bddbd24e386d`, with uncommitted remediation changes. No commit, merge or push was performed.  
**Report UTC:** 2026-11-10T14:56:01.880414+00:00  
**Actual device:** Infinix X6880, Android 15 / API 35, ARM64. Installation and launch smoke only; no microphone/provider session or hardware audio acceptance was run.  
**Status:** AWAITING DEVICE VALIDATION AND BACKEND OWNER. Checkout fixes, host regression and Android builds verified; full feature/release acceptance is not declared.  
**Authority:** The owner's explicit instruction to fix all remaining findings in this checkout, followed by “fix the test and Android build failures … update the apk … my phone is plugged in,” and selection of “Both copies.” The attached audit prompt's audit-only instructions describe the earlier audit; the direct remediation/install requests authorize this subsequent work. Backend/legacy checkouts remain read-only. No next phase was started.

## 1. Scope completed

All 17 historical findings have a current resolution entry in `docs/reports/call-lafina-remediation/FINDING-RESOLUTION.csv`. Fifteen have local repairs verified by host automation. CL2-012 has local preference/wait fixes plus outstanding remote speech enforcement/quality gates; CL2-015 requires backend tool forwarding and provider activation. These are not hidden as completed production features.

- **CL2-001/002:** Provider-only Confirm cannot claim a save. The UI uses authoritative SQLite/outbox/operation receipts. Spoken/typed creation edits replace that same reviewed operation and retire its old token; Cancel targets it. Duration and recurring reminder fields are preserved. Ambiguous “Cancel that” asks which card. No arbitrary write or cancellation.
- **CL2-003/004:** Memory cards carry the actual action ID. Legacy and final-speech memory requests prepare explicit review without a pre-confirm write; Save/Undo/Cancel are connected and duplicate/disabled/expired states are checked.
- **CL2-005:** Call settings and session creation use one authoritative voice choice. Settings saves are atomic and report failures. Preview stops when connecting/live, is disabled during the call, follows Online Mode, and disposes only its owned provider. Selected voice applies to the next call; real audibility/language quality remain phone/provider gates.
- **CL2-006/017:** Minimized calls retain the mounted controller in an in-app surface. Back minimizes an active call; intentional Chat entry controls the start-with-call preference. The screen avoids the keyboard, scrolls identity/review content, wraps controls and has meaningful connection labels. Full and mini timers share the connected timestamp; both waveforms honor reduced motion and zero measured RMS.
- **CL2-007/008/009:** Flat grouped schema matches registry/validator/executor. Date/time/end time are not invented for grouped reminders/events. Per-item entity, outbox and durable operation receipt share a transaction. Stale batch clones replay receipts; failed-item retries cannot duplicate saved items. Grouped fields are editable and saved links open exact records. Native alarm registration is checked separately from the row save, including current generation; pending/unavailable delivery is reported honestly.
- **CL2-010/011:** Actual local agenda/note result cards, earlier Chat access and saved-item navigation are wired. Destinations re-read exact owned, undeleted records; consumed requests do not reopen editors on later tab entry. Conflict read errors do not mean conflict-free; adjacent-day overnight overlaps are checked and authoritative voice reviews carry grounded warnings/alternatives. Grouped schedule warnings are rechecked before save.
- **CL2-012/013/014:** Language/style preferences are sent to provider context. Wait stops output and rejects late playback until another user turn. Runtime validation rejects unknown fields/types, impossible dates, fractional/nonfinite revisions/limits, invalid grouped fields and owner/session spoofing. Oversized tool results return an explicit partial-result message instead of malformed truncated JSON. Unique action-session identities retire on End/account/unmount; stale asynchronous reviews are canceled. Signed-in owner and separate personal-data consent are required in production and direct QA modes, and consent revocation stops the call.
- **CL2-015/016:** A generated 12-tool contract and exact backend-owner integration/CI/provisioning handoff are prepared locally. Historical audit evidence is preserved. The live ledger/state no longer equates mocked/source tests with acceptance. Reconciliation retains every original **78 F / 151 P / 70 T** row; no original task-pack requirement was removed.

## 2. Changes and verification evidence

| Module | Change | Meaningful verification |
|---|---|---|
| `commandReview.ts`, `actionService.ts` | Authoritative edits/cancel, explicit memory, current sessions and truthful results | Real host SQL tests, actual panel -> card -> confirmation; stale/cancel/owner assertions |
| `multiActionService.ts`, validator, security | Transaction receipts, strict fields, safe retries, consent/owner guards | Replay clone, receipt-failure rollback including outbox, missing time, malformed payloads, revoked session |
| Local read results/navigation/Notes/Calendar | Grounded cards and exact owner-bound destinations | Provider-event -> real local result -> panel -> navigation callback; deleted/other-owner refusal |
| Settings/controller/hook/waveform | Shared voice, preview ownership, preference context, wait and late-event handling | Transport assertions, active-preview preemption, zero RMS/reduced motion and real settings-store assertions |
| App/call surface | Persistent minimize, keyboard, safe exit and shared timer | Component/entry tests; physical layout/audio acceptance still NOT_RUN |
| CMake/Gradle/build script | Windows-safe staging/object hashing; reproducible JDK 17 builds | Actual ARM64 native compile and two successful APK assemblies, installed hash/launch checks |

Existing tests were updated where the old expectation certified a defect (fake registry save, memory auto-save, disconnected shadow edit, fabricated amplitude or misleading Online badge). The Phase 15 confirmation test now asserts an actual SQL row and repeat receipt, rather than treating a transient registry receipt as persistence. New regression tests exercise real synthetic-owner host SQLite. No acceptance was weakened to call a phone/provider check passed.

## 3. Executed gates

Evidence directory: `docs/reports/evidence/call-lafina-remediation/`.

| Gate / exact command | Actual result | Receipt |
|---|---|---|
| `npm run preflight` | **Exit 0; 98 suites, 1,429 tests passed, one skipped.** TypeScript, lint and architecture pass | `preflight-release.log` |
| `npm run typecheck`, `npm run lint` after final edits | Exit 0 | `final-static.log` |
| Prettier check over changed/new TS/TSX | Exit 0 | `format-verified.log` |
| `npx jest callLafinaPhase12 voiceConversationUi voiceConversationController --runInBand --detectOpenHandles` | **Exit 0; 3 suites / 91 tests. No open handles reported** | `handle-check.log` |
| Android JDK 17 / `:app:assembleDataQa :app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=arm64-v8a --offline --no-daemon --console=plain --max-workers=2` | BUILD SUCCESSFUL; native C++ compiled. JVM gate passed using valid cached results: **7 suites / 54 tests, 0 failures/errors** | `android-native-success.log`, `android-main-success.log`, `native-test-summary.json` |
| `scripts/build-call-lafina-update.ps1 -Variant both`, followed by `-Variant main` to align final bundles | Both APKs successful; latest bundle identical in both; configured provider keys absent; ARM64-only native libraries; no Kokoro archive entries | `apk-build-final.log`, `apk-main-final.log`, `android-provider-success.log`, artifact JSONs |
| `python CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/scripts/validate_pack.py` | Exit 0; 16 phases / 151 items / 78 features / 70 scenarios. Structural only | `pack-final.log` |
| `node backend_integration/call_lafina_v2/generate-contract.cjs --check` | Exit 0; 12 unique tools, flat grouped schema matches | `tool-contract-check.log` |
| `adb install -r` for both packages | **Success for both**; no uninstall/data-clear command | `install-main.log`, `install-providers.log` |
| `adb shell am start -W -n …MainActivity`, process and installed APK hash checks | **Both Status ok, processes running; installed hashes match; no fatal startup pattern found in own-process error scan** | `launch-*.log`, `device-install-smoke.json` |

The full Jest run emitted a one-second open-handles warning and then exited naturally with code 0; no force-exit was used for final preflight. Focused lifecycle/preview/controller handle diagnostics exited cleanly. The skipped test is the existing opt-in planner measurement (`AGY_MEASURE`), not a removed functional test. Injected-failure tests and some existing React test fixtures emit diagnostic logs; these are retained in the receipts.

### Android build failure fixes

The first assembly hit Windows Ninja's 260-character filename limit. Moving native staging inside this checkout's `.cxx` and setting the Windows CMake object-path budget to 250 permits deterministic hashing: **72 generated C++ object paths, maximum 248 characters, none over 260**. An initial smaller budget could not fit the generated target prefix and was corrected before successful assembly. Reconfiguration also exposed Android Prefab misreading JDK 25 native-access warning output. The build script selects the installed **Microsoft JDK 17** for its own process; no global JDK setting or dependency version was changed. Earlier failed diagnostic logs are retained and superseded by the successful receipts.

## 4. Installed artifacts and device matrix

Both are versionCode **6**, versionName **0.6.0-data-qa**, ARM64. Both use the hosted backend with no direct provider keys. Each package keeps its own existing data and settings; a prior local backend selection may still need correction in Profile. The main app was left open. Installation and OS activity/process checks do not certify visual layout, microphone capture, acoustic routing or provider answers.

| Variant | Package | APK SHA256 |
|---|---|---|
| Main | `com.lafina.capstone` | `f07a8dd0f846872e4f42c2c42083aa5616115841f6609f218c81de81e4c6c21b` |
| Provider-test | `com.lafina.capstone.providers` | `7e7f8260647d8e1a69841e08430b694fe6decc6e8269a9888e2db8102ce2c14f` |

APK paths:

- `.local/call-lafina-update/call-lafina-v2-main-arm64.apk`
- `.local/call-lafina-update/call-lafina-v2-providers-arm64.apk`

Shared bundled JavaScript SHA256: `e0580ca7fd9173e608da10c95a0361da6295216ccf4b919e402d0c73c4044293`. Full receipts include file size, date and ABI. Source fingerprints are in `source-manifest.json` because changes remain uncommitted. No physical call, paid usage, provider provisioning, backend deployment, private-data inspection or student-record test mutation was performed. Raw own-process startup error captures stay in ignored `.local/`; published receipts contain only status and hashes.

Performance baseline/new p50/p95/sample counts, STT/TTS inference speed, alarm drift, CPU/PSS/FPS/battery and provider cost: **NOT_RUN**. No benchmark JSON with invented measurements was created.

## 5. Remaining backend-owner gates

CL2-015 and the remote part of CL2-012 cannot be finished by changing this mobile checkout. See `backend_integration/call_lafina_v2/OWNER-HANDOFF.md` and generated `tool-contract.json`.

1. Add/provision matching client tool definitions, `client_tool_call` events and bounded response waiting on the existing ElevenAgents agent.
2. Implement allowlisted DeepSeek tool forwarding, structured streamed function deltas/finish reasons, matching tool-result history and bounded continuations while preserving auth/grant/owner/quota/RAG/usage/idempotency checks. The audited backend source only forwards text deltas and drops tool history.
3. Enforce hidden-reasoning/markup/spoken-output rules before remote synthesis and verify requested language/style behavior. The mobile transcript filter cannot retract remote audio already generated.
4. Run backend CI and authorized authenticated live tool/result, voice override, failure/quota and privacy tests, then record deployed revision/configuration. A 401 route probe, host fake transport or saved setting is not this evidence.

No backend/legacy source was changed, no secrets copied and no provider API keys embedded. The original `.gitignore` edit was preserved. Background microphone service (F-055/T061) and image input (F-057/T062) remain deferred rather than silently enabled.

## 6. Complete manual phone checklist

Use `qa/CALL-LAFINA-V2-REMEDIATION-MANUAL.md`: **46 detailed checks plus all 70 original acceptance rows**. Fill `qa/CALL-LAFINA-V2-MANUAL-RESULTS.csv` separately for both installed copies. All substantive phone/provider acceptance remains NOT_RUN; T070 has installation/launch smoke only.

Concrete short runbook:

1. Open the installed main app, sign in with a synthetic student account, check Profile uses the hosted backend, and open Call Lafina. Verify disclosure/permissions before capture, guest/Online Mode/airplane-mode gates and usable offline PTT/manual UI.
2. Choose voice B for a new call; test microphone/output waveforms, Mute/Unmute, Stop, End, spoken barge-in, speaker echo and wired/Bluetooth hot-plug. Check the actual OS mic indicator and no late audio restart.
3. Prepare a 3 PM task/reminder, change to 4 PM, Cancel and repeat/double Confirm. Expect no pre-confirm writes and exactly one item at the reviewed time. Verify actual alarm registration/ring separately; denied alarm permission must yield a pending warning.
4. Test agenda/date range/overnight conflict, note dictation/title/body editing/search/exact Open Note, saved-item links, memory off/Save/Undo/Forget/account switch, grouped field edits/partial failure/retry and ambiguous Cancel.
5. Minimize/restore and browse earlier Chat/Calendar/Notes. Exercise Back/start-with-call, Home/lock, real incoming cellular call, simulated reminder preemption, network loss, sign-out and permission revocation. Expect release and explicit restart, with no old-owner callback/write.
6. Check the shortest screen, landscape, keyboard, large captions/text, TalkBack, reduced motion, haptics/tool cue; test English/Filipino/Taglish/Cebuano with native-speaker samples. Recheck existing Calendar/Notes/Chat/alarms and all seven sync types. Record actual performance/usage only after measurement.

## 7. Review decision

- [x] Required host/static/native build gates pass; both requested APKs installed and OS launch/process/hash smoke verified.
- [x] Every finding and original F/P/T row retained with current evidence and explicit external limitations.
- [x] No forbidden scope, backend/legacy write, uninstall, app data clear, merge, push or fabricated phone/provider evidence.
- [ ] Backend-owner activation and authenticated provider acceptance.
- [ ] Full phone/manual acceptance and performance measurements completed and human-confirmed.

STATUS: AWAITING DEVICE VALIDATION AND BACKEND OWNER.
