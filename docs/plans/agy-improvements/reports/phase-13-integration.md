# AGY-PORT 13: integration and final handoff

Implementation: CODE_COMPLETE for this phase's work (integrated review, fresh gates and builds, handoff documents). The overall run is **PARTIAL**: see [SUMMARY.md](SUMMARY.md).

| Gate | Status |
|---|---|
| Fresh integrated preflight at final code | PASS (`preflight-1.log`: 46 suites, 684 passed + 1 opt-in skipped; architecture PASS, 215 modules) |
| Kotlin unit tests (forced rerun) | PASS: 43 tests in 6 suites, 0 failures, executed 11:09Z (`gradle-unit-assemble-debug-1.log`) |
| Standalone QA build (dataQa) | PASS. Bundle task executed (`gradle-bundle-dataqa-1.log`); assemble had 9 tasks executed and 247 up to date (`gradle-assemble-dataqa-1.log`) |
| Debug build | PASS (up to date; all inputs unchanged) |
| Final APK receipts | inventory, ELF and ZIP PASS on both ABIs (`apk-audit-final-*-1.json`); identity and signer (`sdk-tools-final-1.log`); hashes (`artifact-hashes-final-1.txt`) |
| Instrumentation tests | NOT_RUN (no device). Compiled in Phase 03 |
| Emulator / phone | NOT_RUN |
| Live service / backend | NOT_RUN. #29 and #30 are DEFERRED_EXTERNAL |

| Item | Value |
|---|---|
| Run ID / branch / worktree | `agy-port-20261106` / `codex/agy-preservation-improvements` / `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` |
| AGY base | `b9433dc39d172f30ba26ea68e4a9c9eedd922407` (ancestor of HEAD; 24 commits on the branch before this phase) |
| Tested HEAD | `d986c3b`, with only the run log dirty. The app code is identical to `a152bcb` |
| Result commit | Recorded in RUN-STATE.json and the log (no self-referential SHA) |
| Review | Parent self-review only. No independent reviewer was available in this unattended run |

## Integrated review against the AGY base

`git diff b9433dc..HEAD` touches 96 app, Android and package files (+15,880 / −1,658 lines). The checks made:

| Contract | How it was checked | Result |
|---|---|---|
| One authoritative alarm engine | Only `LafinaReminderModule.kt` calls `setAlarmClock`/`setExact*`. There is no JS alarm library in `package.json`, and the JS fallback runs only when native does not hold the work (Phase 03) | PASS |
| Parser and native model preserved | All 16 `ParsedIntentType` values are routed (`INTENT_ROUTES`, frozen intent fixture). `LafinaIntentExtractorModule` is unchanged in public name; no gguf is bundled, as at the base | PASS |
| Default TTS | `react-native-tts` is the only local engine, and no Kokoro is in code or APK (preservation test plus APK inventory). Cloud speech entitlement and fallback are unchanged | PASS |
| Accounts, entitlements, guest link | Preservation PF01–PF03, `chatOwnership`, `agyPort07Notes` guest migration | PASS (fake cloud) |
| Seven-type sync | PF04 frozen payloads, old-server round trip (Phase 08), sync echo cases | PASS (fake server) |
| Documents/attachments, meetings/consent, RAG citations | `phase09OnlineDocsAndMeetings`, `phase10HandbookRAG`, preservation PF06/PF07 | PASS (fake cloud) |
| UI reachability | `App.test`, `phase01ThemeAndTour`, `phase02CalendarAndNotesScreens` and the new screen tests | PASS (host render) |
| Backend hosts | `cloudClient.ts` hosts unchanged since the base | PASS |
| Android identity | The only `build.gradle` change is the ONNX line. Package, versionCode, signer and permissions are the same as in the Phase 11 receipts | PASS |

**Changed pre-existing tests.** Three files were changed: `phase06SttAndVoiceModal`, `phase08ChatAndOrchestrator` and `callDispatcherAndCallScreen`. Each change is a labeled adaptation to an intentional behavior change, and the original end results are still asserted:

- **Review before Confirm.** The tests now assert that nothing is saved before Confirm, then that the same saved values and replies appear after Confirm.
- **Exact reminder ownership.** Two cases were added for a reminder that only shares a title.

No old assertion was deleted without a replacement, and no test was skipped. The test count rose from 163 tests in 15 suites (base preflight) to 685 in 46 suites. The Kotlin count rose from 14 to 43.

**Integrated regressions found:** none. No unit was reverted.

## PF01–PF13

Every row of [PRESERVED-FEATURES.md](PRESERVED-FEATURES.md) now has its final tests, at `d986c3b`. All 13 pass on the host. Device and live are NOT_RUN for all 13.

Fake cloud and server adapters are contract evidence only. They are not proof that live authentication, subscriptions, sync, RAG or documents work.

**Known residual (PF11, ADR-023):** if the app is force-stopped during a background reconcile, a retired reminder can still ring once. It is dismissed when the app opens. The durable native invalidation marker is proposed, not built.

## Inventory #29 and #30

See [backend-handoff-29-30.md](backend-handoff-29-30.md):

- **#29 (client portion landed in Phase 08):**
  - the frozen seven-key event wire;
  - an old-server round trip that rejects unknown fields;
  - device-local `event_time_local` metadata;
  - the backend work still required, in order.
- **#30:**
  - the host integration is preserved;
  - a proposal covers the public deployment identity, the owner-run read-only probe and the access handoff;
  - no live probe was run.

## Hygiene review (read-only, task files only)

- **Secret patterns.** All lines added since the base were scanned for cloud keys, tokens, private-key blocks, JWTs and literal password/secret/key assignments. There were 0 matches.
  - **Addresses found:** synthetic test identities (`user@ustp.edu.ph`, `busy@ustp.edu.ph`) and a public npm package author in an npm log. No private contact data.
- **Binaries.** No `.onnx`, `.bin`, `.so`, `.gguf`, APK, keystore, archive or audio file was added since the base. No `.env`, keystore or signing file was touched or read.
- **Kokoro.** Every Kokoro mention added since the base is an absence guard or a prohibition.
- **Provenance:**
  - ONNX Runtime 1.22.0: license and API recorded (ADR-024, `docs/third-party/agy-port-11-provenance.md`).
  - Model hashes recorded. The publishers' upstream checksums were not re-verified (an owner check).
  - Donor files were adapted from the pinned `0d4bbe39` through `git show`. No donor tree, business, Gmail, study-tool or Kokoro module was copied.
- **Donor and backend untouched:**
  - The donor checkout is still at the pin `0d4bbe3`. Its two dirty docs paths were modified at 2026-11-05T15:35Z, before this run began, and this run only read Git objects.
  - `LAFINA-backend` has no local checkout here.
- **Evidence.** All failed attempts and baselines are kept:
  - Phase 11 attempts 1–4, with attempt 3 as INTERRUPTED/NO_VERDICT;
  - Phase 12 mutation run 1 and doctor-1;
  - the Phase 05 logs lost earlier, documented with recovered excerpts in `pre-advance-remediation.md`.
- **Log timestamps.** Rows 57–70 of the run log carried estimated times; several were later than the real clock. A dated CORRECTION row gives the commit times. Rows were not rewritten.
- **Never committed:** `AGY-IMPROVEMENTS-MANIFEST.json`, `AGY-IMPROVEMENTS-START.md`, `agy-improvements/`, `docs/reports/agy-ustp-comparison-*`, `scripts/__pycache__/`. They remain untracked.

## Commands and evidence

All paths are under `evidence/agy-port-20261106/phase-13/`:

| Command | Result |
|---|---|
| `npm run preflight` | `preflight-1.log` PASS |
| `gradle-c.ps1 … :app:createBundleDataQaJsAndAssets --max-workers=1` | `gradle-bundle-dataqa-1.log` PASS. Bundle `e448f8ea…a91c`, identical to Phase 11 |
| `gradle-x.ps1 … --init-script skip-prebuilt-bundle.init.gradle --offline :app:assembleDataQa --max-workers=1` | `gradle-assemble-dataqa-1.log` PASS |
| `gradle-x.ps1 … --offline :app:testDebugUnitTest --rerun :app:assembleDebug --max-workers=1` | `gradle-unit-assemble-debug-1.log` PASS |
| `python scripts/apk_audit.py <apk> --output …/apk-audit-final-<abi>-1.json` ×2 | PASS |
| `zipalign -c -P 16 4`, `apksigner verify --print-certs`, `aapt2 dump badging` | `sdk-tools-final-1.log` |
| `sha256sum` of the APKs and bundle | `artifact-hashes-final-1.txt` |

**Memory.** About 1.1 GB was free. One job at a time, with one Gradle worker. No unrelated process was stopped and no setting was changed.

## Manual checklist still needed (NOT_RUN)

Everything is in [MANUAL-QA.md](MANUAL-QA.md) M01–M17. In short:

1. Update the owner's phone in place with the arm64 dataQa APK (check its SHA-256). Confirm the counts and the armed reminder are unchanged.
2. **Reminder durability:** a locked-screen call, then reboot, Doze, timezone change, and permission revoke/restore. Also force-stop during a reconcile; this may ring once (ADR-023).
3. **Speech:** offline voice states, dictation/VAD on the ONNX 1.22.0 build, and meeting record/stop with dictation contention.
4. **With a controlled account and server:**
   - guest link and owner switch;
   - seven-type sync;
   - tier gates;
   - Chat/RAG citations;
   - all four document formats;
   - cloud speech fallback.
5. **Optional:** the gated emulator runner on an owner-designated AVD.

## Deferrals

These are listed in SUMMARY.md: inventory 2, 14, 17, 24, 25, 26 and 27 are PARTIAL, and 29 and 30 are DEFERRED_EXTERNAL.
