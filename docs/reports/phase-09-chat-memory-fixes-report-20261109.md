# PHASE 09 follow-up — Chat history and memory reliability

**Branch / base commit:** `Lem-branch` / `f8f8101edd8439e9db998811e955e40144de6450`; changes remain in the working tree.  
**Date:** 2026-11-09, Asia/Manila; final artifact verified around 01:00 local time (2026-11-08 UTC).  
**Device(s) available:** NONE; `adb devices -l` returned an empty device list.  
**Status:** `AWAITING DEVICE VALIDATION`.  
**Approval provenance:** Owner: “Continue Claude's development and fix the four bugs and preflight failure. Run the checks and tell me what still needs device validation.” This is a scoped continuation; no next phase was started.

## 1. Scope completed

- **M-01 — Late extraction cannot restore cleared memories.** Each owner has a persisted `memory.revision` in existing `local_settings`. Clear (including an empty clear), manual edits, toggles, applied extraction, Undo and guest transfer change this value. Extraction compares the captured revision, sign-in epoch, and original owned assistant reply before committing. The orchestrator captures the revision before the online reply begins, so a reset during reply generation also invalidates later extraction. Deleting the reply/session invalidates a pending extraction even when memories are retained.
- **M-02 — Memory plus notice are atomic.** Applying extracted changes and saving the owned reply notice share one SQLite transaction. A missing reply, a false notice-write result or an exception saves neither change. Undo uses the persisted notice, restores memory and marks the notice undone in one transaction. Events fire after commit.
- **M-03 — Undo restores storage-limit evictions.** Change records compare the actual before/after rows, including evicted memories. Removal snapshots persist text, source, session association and original timestamps, plus the row ordering hint. Reloading a chat preserves the snapshot. Repeated Undo is idempotent. Older Undo refuses after intervening memory changes rather than restoring data the student has subsequently cleared.
- **M-04 — Explicit forget-all commands clear the complete local list.** Complete commands such as `Forget everything you remember about me.` and `Please forget all my saved memories!` clear all stored memories locally, even offline or with memory disabled. The assistant acknowledgement and notice are atomic with the clear; chats and other owners' memories remain. This does not rely on the extraction prompt's 40-memory limit. Quoted, negated, conditional and partial requests are not treated as authorization to clear all.
- **M-05 — Preflight lifecycle repaired.** General-purpose Jest suites isolate the background extraction side effect through the shared setup. Both memory service suites explicitly unmock the service and exercise its real implementation with synthetic cloud responses. Production extraction remains asynchronous; no test-environment branch was added to application behavior.

No backend source, endpoint contract, cloud deployment, account or secret was changed. Claude's schema 25 is retained; no additional schema migration is needed for the revision key.

## 2. Change summary

| File/module | Change | Evidence |
| --- | --- | --- |
| `src/storage/chatMemoryStore.ts` | Persistent revisions, transaction handles, complete removal/eviction snapshots, guarded Undo | Real SQLite storage/service regressions |
| `src/storage/chatStore.ts` | Owned assistant-notice reads; shared transaction support; durable snapshot parsing | Notice rollback, session isolation, reload/Undo tests |
| `src/cloud/chatMemoryService.ts` | Revision/session/reply admission, atomic update/Undo, local forget-all | Two unmocked service suites |
| `src/ai/chatMemoryCommands.ts` | Anchored explicit-command matcher | Positive and negative command cases |
| `src/ai/chatOrchestrator.ts` | Capture initial memory revision; transactional local privacy command | Online/offline, disabled-memory, 100-memory tests |
| `jest.setup.js` | Isolate incidental extraction in unrelated suites | Preflight now exits 0; voice streaming suite passes |
| `__tests__/cloud/chatMemoryReliability.test.ts` | 27 additional regression cases, in the default gate | Preflight and targeted regressions |
| Existing memory service/storage tests | Use real reply fixtures and allow complete removal snapshots | Existing assertions pass |

Pre-existing unrelated checkout changes, including LoginScreen work, were not developed or reverted in this task. Formatting was applied to the files edited in this continuation.

## 3. Tests and real outcomes

Evidence directory: [chat-memory-fixes-20261109](evidence/chat-memory-fixes-20261109/).

| Check | Exact command / procedure | Result | Evidence |
| --- | --- | --- | --- |
| Full gate | `npm run preflight` | **PASS, exit 0**. TypeScript strict, zero-warning ESLint, 75 Jest suites; **1,139 passed, 1 skipped**; architecture passes | [preflight.log](evidence/chat-memory-fixes-20261109/preflight.log) |
| Architecture inside gate | `npm run check:architecture` | PASS: 250 modules, 0 cycles, 0 forbidden dependencies, 79 offline leaves with no transitive network reachability | Same log |
| Original four reproduction cases | `npx jest --runInBand --testMatch '**/.local/chat-memory-review.test.ts' --runTestsByPath .local/chat-memory-review.test.ts` | PASS: all four formerly failing checks | [original-four.log](evidence/chat-memory-fixes-20261109/original-four.log) |
| New regressions and previous teardown source | `npx jest --runInBand --runTestsByPath __tests__/cloud/chatMemoryReliability.test.ts __tests__/ai/voiceModeStreaming.test.tsx` | PASS: 38 tests, 2 suites | [regressions.log](evidence/chat-memory-fixes-20261109/regressions.log) |
| Android JVM | From `android`: `./gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon -PreactNativeArchitectures=arm64-v8a` | **PASS**, 7 native suites / **51 tests**, zero failures/errors | [android-native.log](evidence/chat-memory-fixes-20261109/android-native.log); XML under `android/app/build/test-results/testDebugUnitTest/` |
| Prettier, all files edited here | `npx prettier --check src/cloud/chatMemoryService.ts src/storage/chatMemoryStore.ts src/storage/chatStore.ts src/ai/chatMemoryCommands.ts src/ai/chatOrchestrator.ts __tests__/cloud/chatMemoryService.test.ts __tests__/cloud/chatMemoryReliability.test.ts __tests__/storage/chatHistoryAndMemory.test.ts jest.setup.js` | PASS | [format.log](evidence/chat-memory-fixes-20261109/format.log) |
| Whitespace | `git diff --check` | PASS | No whitespace errors; Git emitted existing line-ending notices |
| Standalone ARM64 APK | JDK 17, temporary `L:` mapping: `./gradlew.bat :app:assembleDataQa --offline --no-daemon --max-workers=2 --console=plain -PreactNativeArchitectures=arm64-v8a --init-script L:/.local/elevenlabs-reuse-bundle.init.gradle` | **PASS**, exit 0; fresh bundled JS, 146,024,131 bytes | [apk-shortpath.log](evidence/chat-memory-fixes-20261109/apk-shortpath.log), [apk.json](evidence/chat-memory-fixes-20261109/apk.json) |
| Phone/emulator | `adb devices -l` | No device attached; functional device checks **NOT RUN** | Empty device list |
| Backend tests and signed-in deployed contract | Not run in this continuation; backend unchanged | **NOT RUN** | Prior audit found `codex/chat-memory` unmerged; no merge/deploy performed here |

The skipped Jest case is the existing optional planner measurement gated by `AGY_MEASURE=1`, not a functional memory test. Expected warnings from simulated failure cases remain in logs; the Jest teardown errors from the audit are absent.

### APK build evidence

The final standalone ARM64 build **passed** with the documented JDK 17 and a temporary unused `L:` mapping. Two earlier attempts failed: Java 25 caused native configuration failure, then JDK 17 at the full physical path reached the known Windows 260-character native build limit. Their logs are retained as `apk-java25-failed.log` and `apk-jdk17-longpath-failed.log` in the evidence directory. No application/build configuration was changed to work around these machine settings. The temporary mapping was removed afterward (`subst` lists no mappings).

The physical-path JDK 17 attempt generated the fresh JS/Hermes bundle before its native build failed. Short-path packaging used the existing reuse-bundle init script, and verification confirmed that the APK's `assets/index.android.bundle` is byte-identical to that fresh bundle and contains the new memory revision and local forget-all logic. There was no reuse of an older APK or older JS bundle.

- APK: [app-arm64-v8a-dataQa.apk](../../android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk)
- Package: `com.lafina.capstone`; private standalone `dataQa`, debug-signed; ABI `arm64-v8a`.
- Size: **146,024,131 bytes**.
- APK SHA-256: `0dcefcecbc55461be7b097e1ef55469b2d5a31f330475abb6504f4b24833d13d`.
- Bundled JS SHA-256: `6f64d122b77d7ea1a9dc80fa5214156a1c424c2a44397e932f8dd5471697cf0c`.
- Verification summary: [verification.json](evidence/chat-memory-fixes-20261109/verification.json).
- **Not installed or launched**; no connected device.

For another build, select the installed JDK 17, generate the fresh bundle from the physical checkout with `android/gradlew.bat -p android :app:createBundleDataQaJsAndAssets --offline --no-daemon`, then use the short-path packaging command above. The ignored `.local/build-chat-memory-apk.ps1` records the exact mapping, invocation and `finally` cleanup used here. It refuses an occupied `L:` drive. The initial Gradle sandbox cache-lock refusal was resolved by running the authorized checks with access to the existing Gradle cache.

## 4. Performance and device matrix

No phone/emulator is connected. Physical device identifier, Android/API version, RAM, upgrade behavior, peak memory, UI timings and live network latency: **NOT RUN**. No benchmark JSON or speech/alarm benchmark result is claimed. Performance benchmarking is outside this defect-fix scope; see the verification JSON for check outcomes, not performance measurements.

## 5. Reliability and privacy

- Owner-scoped revision state remains device-local and outside sync/outbox entities. Existing seven-entity transactional sync semantics are unchanged.
- A stale or legacy notice without a current revision cannot restore removed memories. The user can review the actual list in Profile.
- Concurrent responses are conservative: an intervening memory change discards an older result rather than overwriting newer student choices.
- The deterministic clear-all path recognizes complete supported English commands; it does not infer destructive intent from arbitrary paraphrases. Profile → Memory → Forget everything remains available for any language.
- Chat history, including memory notices already written there, is retained by a memory-only clear; Clear All Data clears both. This preserves the existing separation between chat deletion and memory deletion.
- No new permission, native dependency, model binary or cloud key was introduced. Local TTS remains `react-native-tts`. No Android alarm/call/STT/TTS device success is inferred from mocks or JVM tests.
- The new validation build includes the checkout's pre-existing uncommitted work. No commit, push, merge, deployment, install, uninstall or device-data clear was performed.

## 6. Human phone verification — still NOT RUN

Use the fresh ARM64 QA build identified in the artifact section (packaging passed). Open LAFINA; retain existing data when testing an upgrade. Do not use the older x86_64 APK as evidence for this change.

1. **Persistence and chat isolation:** create two chats, rename/search/reopen them, delete one, restart. Expect only the chosen chat to be deleted; other chats and drafts remain. If upgrading a populated earlier build, confirm old chats remain readable after schema 25 migration.
2. **Online notice and Undo:** sign in against a backend with the memory branch deployed, enable Online Mode, and state a harmless lasting preference. Expect a notice under the completed reply and a matching Profile memory. Reopen Chat and tap Undo; expect both the stored list and the notice to update. Repeat at the 100-memory cap with a prepared QA fixture to inspect the eviction notice/Undo on a phone. Cap behavior is automated but not device-validated.
3. **Clear while work is pending:** after a reply starts a slow extraction, immediately use Profile → Memory → Forget everything. Wait for the request to finish, then restart. Expect no old memory to reappear. Repeat with Clear All Data and with deleting the originating chat. A text-only chat deletion keeps existing memories but must discard extraction for its deleted reply.
4. **Complete local clear:** manually add a few harmless memories, turn memory off and go offline. Type `Forget everything you remember about me.` Expect the entire Profile memory list to clear immediately, chats to remain and no Online Mode requirement. Repeat with more than 40 memories using a QA fixture. After a later clear/edit, an older Undo must not restore stale memories.
5. **Owner/fallback:** switch accounts while a reply/extraction is pending; inspect each account's history and memory. Expect no cross-account notice or memory. Confirm offline/manual text entry and chat still work when the cloud route is unavailable. Check Android keyboard/sheet sizing, scrolling and tappable Undo in the actual app.

To collect evidence, use screenshots of synthetic facts and a short result note identifying device model/API and APK hash. Do not include passwords, tokens or private memory contents. No device checklist item above is marked passed.

## 7. Docs and architecture

This follow-up and its evidence supplement [the initial audit](chat-history-memory-review-20261109.md). No new ADR is needed for the existing device-local memory design. The repo's AST architecture checker provides the import-cycle/offline checks; no Graphify extraction was run.

## 8. Open dependencies and next steps

- Human Android validation is pending; there is no connected device.
- Claude's backend `codex/chat-memory` implementation must be reviewed/merged/deployed through the existing project before real signed-in automatic memory can be certified. This task does not claim that deployment happened.
- The scoped mobile fixes and Claude's feature remain uncommitted for review. No next phase was started.

## 9. Review decision

- [x] Required preflight and Android JVM checks pass.
- [x] Fresh standalone ARM64 APK built and packaged bundle verified.
- [x] Original four defects have passing regression coverage in the real service/storage implementation.
- [x] No forbidden engine/module or unrelated backend change introduced.
- [ ] Manual device tests completed and human-confirmed.
- [ ] Deployed backend and signed-in extraction confirmed.

**STATUS: AWAITING DEVICE VALIDATION**  
**STOPPED — awaiting explicit human approval**
