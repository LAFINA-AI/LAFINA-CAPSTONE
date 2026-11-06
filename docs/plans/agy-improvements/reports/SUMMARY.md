# AGY improvement port — final results

Run status: **PARTIAL**.

- 21 of 30 areas are CODE_COMPLETE (host-tested), 7 are PARTIAL and 2 are DEFERRED_EXTERNAL.
- **No device, emulator or live-service check was run.** Nothing here is device- or production-accepted.

Run dates: 2026-11-06, run `agy-port-20261106` (Asia/Manila owner; UTC in logs).

Branch/worktree: `codex/agy-preservation-improvements` in `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont`. It was not pushed, merged or deployed.

Commits:

- **AGY base:** `b9433dc39d172f30ba26ea68e4a9c9eedd922407`.
- **Latest code commit:** `a152bcb` (AGY-PORT 12). Phase 13 changed documents only.
- **Tested HEAD:** `d986c3b`, with identical code.
- **Final report-index commit:** recorded in RUN-STATE.json and the run log. It is not written here, because a file cannot contain its own commit's hash.

## What you can use now

These are the changes a student will notice. All are host-tested; none has been seen on a phone yet.

- **Assistant changes are reviewed first.** Chat and Voice planner commands now show a Review card, and nothing is saved until Confirm.
  - Same-title items ask which one you mean.
  - A review from another account or session cannot apply.
  - A double Confirm saves once.
  - Undated and date-only tasks are kept without inventing a time.
- **Dictation becomes an editable draft.** It is not sent automatically. Keep is the default over unsent text, and leaving Voice with unsaved text asks first.
- **The microphone has one owner at a time** across dictation, meeting recording and reminder calls.
- **Reminders are more reliable.**
  - Delivery jobs survive restarts.
  - Each reminder rings once per change, and stale buttons are refused.
  - A reminder belongs to its item by an exact link, never by a shared title.
  - "Acknowledged" never marks a task done.
- **Chat history belongs to its account.** It loads in stable pages. Old shared history whose owner is ambiguous is quarantined, not shown to the wrong account.
- **Calendar and Notes:**
  - Calendar reads only the visible window, and shows a warning with Retry instead of an empty week when storage fails.
  - Overnight events work.
  - Notes saves are revision-checked: a stale save keeps your text and offers Save as a copy.
  - Notes search ignores formatting and treats `%` and `_` literally.
- **Profile:**
  - **Reminder Health** shows delivery evidence apart from permission state.
  - **Event Defaults** are saved only when you choose, and Clear All Data now forgets them.
  - **"On Time"** replaces an unsupported voice count.
  - **Offline Voice** is a choice of installed offline English voice with speed and pitch. Speech plays only when Android confirms the voice is installed and offline; otherwise you get text.
- **Storage failures are reported truthfully** and no longer look like a successful save.
- **For testers:**
  - a standalone QA APK (bundled JS, no Metro), with ONNX Runtime 1.22.0 so the VAD libraries load on 16 KiB-page devices;
  - APK audits, offline-boundary checks, frozen evaluation fixtures and a doctor.

## AGY preservation

See [PRESERVED-FEATURES.md](PRESERVED-FEATURES.md).

- **PF01–PF13 all PASS on the host** at final code, and every PF is tied to a named test that must keep existing. Device and live are NOT_RUN for all 13.
- **Still present and working on the host:**
  - accounts, guest mode and tier gates (guest, student, student_pro, admin);
  - guest-to-account linking and the seven-type sync wire, frozen and tested against an old-server fake;
  - online Chat with Handbook RAG and citations;
  - PDF/DOCX/XLSX/PPTX documents and attachments;
  - meeting recording and consent;
  - Whisper STT, `react-native-tts` and entitled cloud speech with fallback;
  - the UI, navigation and theme;
  - the app ID, signer and updater.
- **Not proven:** these results use fake cloud and server adapters. They do not prove live login, subscription, sync, RAG or document generation.

## All 30 inventory areas

| # | Area | Implementation state | Commit / report | Automated/native evidence | Device/live |
|---|---|---|---|---|---|
| 1 | Database recovery, transactions, migrations | CODE_COMPLETE | `8ab83b2` / [phase-01](phase-01-storage.md) | `storageResilience`, `schemaMigrations`, `storageRecovery` | NOT_RUN (M01, M02) |
| 2 | Durable native delivery | **PARTIAL**: jobs and native coordinator active, one engine. Process death between the SQLite commit and the native cancel (for example during a background reconcile) can still let a retired reminder ring once (ADR-023 proposed, not built). Explicit Force Stop is a separate Android stopped-state case with no delivery promise. *Corrected 2026-11-06 (final audit F4); this row previously said "force-stop".* Instrumentation compiled, never run | `f5ae9aa`, `541dbfb`, `dd96148` / [phase-03](phase-03-delivery.md), [audit](audit-remediation.md) | `agyPort03Delivery`, `auditA4InterruptedReconcile`, Kotlin delivery/reminder tests | NOT_RUN (M05, M06, M15) |
| 3 | Full identities, generation fencing | CODE_COMPLETE | `f5ae9aa`, `541dbfb` / phase-03, [pre-advance](pre-advance-remediation.md) | `agyPort03Delivery`, `LafinaDeliveryContractTest` | NOT_RUN |
| 4 | Reviewed, idempotent assistant writes | CODE_COMPLETE | `c36eec9` / [phase-04](phase-04-reviews.md) | `agyPort04ReviewedCommands`, `agyPort04ReviewUi` | NOT_RUN (M03, M04) |
| 5 | Every intent kept; untimed tasks; exact links | CODE_COMPLETE. Parser limits are listed under Deferred | `c36eec9`, `541dbfb` / phase-04 | `intent-contract-v1` (16 intents), `agyPort04` | NOT_RUN |
| 6 | Editable drafts, Prepare/Confirm, Keep/Replace | CODE_COMPLETE | `08acc94` / [phase-05](phase-05-drafts-microphone.md) | `agyPort05Drafts` | NOT_RUN (M03) |
| 7 | Microphone ownership (Whisper and meetings) | CODE_COMPLETE (host-JVM cross-process probe; the on-device probe was not ported) | `08acc94` / phase-05 | `MicrophoneLeaseTest`, `agyPort05SpeechCapture`, `agyPort05CallBusyMic` | NOT_RUN (M08) |
| 8 | Owner-bound Chat, legacy quarantine | CODE_COMPLETE (no in-app recovery view for quarantined history) | `aec3703` / [phase-02](phase-02-chat.md) | `chatOwnership` | NOT_RUN (M10) |
| 9 | Stable Chat pages | CODE_COMPLETE | `aec3703` / phase-02 | `chatHistoryPaging` | NOT_RUN |
| 10 | Factual planner replies, draft-only guide | CODE_COMPLETE | `a077b10` / [phase-06](phase-06-planner.md) | `agyPort06PlannerReplies` | NOT_RUN |
| 11 | Bounded Calendar reads, paged undated, batched export | CODE_COMPLETE | `a077b10` / phase-06 | `agyPort06PlannerQueries` | NOT_RUN |
| 12 | Revision-safe Notes edits, kept drafts | CODE_COMPLETE | `168e022` / [phase-07](phase-07-notes.md) | `agyPort07Notes`, `agyPort07NotesUi` | NOT_RUN (M10) |
| 13 | Notes search cache, keyset pages | CODE_COMPLETE (paging under concurrent edits is best-effort) | `168e022` / phase-07 | `agyPort07Notes`, `notes-contract-v1` | NOT_RUN |
| 14 | Overnight/timezone/ICS event time | **PARTIAL**: overnight and device-local zone done. Events over 24 h are unsupported on the frozen wire, and recurring/`RECURRENCE-ID` imports stay floating | `7dd3454` / [phase-08](phase-08-event-time-sync.md) | `agyPort08EventTime`, `agyPort08EventForm` | NOT_RUN (M11) |
| 15 | Delivery health apart from permissions | CODE_COMPLETE | `ab6ab12` / [phase-09](phase-09-health-preferences-stats.md) | `agyPort09HealthPreferencesStats`, `agyPort09ProfileHealth` | NOT_RUN (M13) |
| 16 | Explicit local event defaults | CODE_COMPLETE (Clear All Data forgets them, `dd96148`) | `ab6ab12`, `dd96148` / phase-09, audit | same; `auditA3ClearAllData` | NOT_RUN (M13, M15) |
| 17 | Whisper/system TTS kept; optional Android on-device STT | **PARTIAL**: defaults and cloud fallback kept. The optional on-device recognizer is deferred (needs a native bridge and devices) | `335de87` / [phase-10](phase-10-speech.md) | `agyPort10Speech`, preservation PF09 | NOT_RUN |
| 18 | Voices, speed, pitch, Preview/Stop | CODE_COMPLETE (positive offline eligibility, `dd96148`; engine choice deferred) | `335de87`, `dd96148` / phase-10, audit | `agyPort10OfflineVoice`, `auditA1OfflineEligibility`, `speech-contract-v1` | NOT_RUN (M07, M14, M15) |
| 19 | Bounded readiness, cancel, recovery | CODE_COMPLETE | `335de87` / phase-10 | `agyPort10Speech` | NOT_RUN |
| 20 | Record-based statistics | CODE_COMPLETE | `ab6ab12` / phase-09 | `agyPort09HealthPreferencesStats` | NOT_RUN |
| 21 | Standalone QA packaging | CODE_COMPLETE | `83f407c` / [phase-11](phase-11-native-qa.md) | dataQa arm64/x86_64 built and audited (Phase 13 receipts) | NOT_RUN (M16) |
| 22 | ONNX audit, 1.22.0 | CODE_COMPLETE (1.19.2 failed 16 KiB alignment; ADR-024) | `83f407c` / phase-11 | ELF 16/16 PASS, Kotlin 43 PASS | NOT_RUN (VAD on device) |
| 23 | Offline-boundary AST checker | CODE_COMPLETE | `a152bcb` / [phase-12](phase-12-tooling-evaluation.md) | 71 leaves clean; sentinel zero network | — |
| 24 | Frozen fixtures, fresh evidence, benchmarks | **PARTIAL**: fixtures, fingerprints and evidence done. The planner benchmark is STALE (old `src/core`), not rewritten | `a152bcb` / phase-12 | 93 contract tests; evidence JSON | — |
| 25 | QA SQL checks and diagnostics | **PARTIAL**: host runner on an owned temporary file only. No in-app QA screen, native gate or native diagnostics | `a152bcb` / phase-12 | 14 checks, 6 tests | NOT_RUN |
| 26 | Gated emulator runner | **PARTIAL**: built and tested, never run (no designated emulator) | `a152bcb` / phase-12 | 9 tests | NOT_RUN (M17) |
| 27 | Speech-recognition scoring | **PARTIAL**: WER scorer only. No Whisper collector/instrumentation, and no recognition run (no approved audio) | `a152bcb` / phase-12 | 8 tests | NOT_RUN |
| 28 | Doctor | CODE_COMPLETE | `a152bcb` / phase-12 | 8 tests; real runs | — |
| 29 | Event-time sync with the backend | **DEFERRED_EXTERNAL**. The client portion is complete: frozen wire, local-only metadata, old-server round trip | `7dd3454` / [backend handoff](backend-handoff-29-30.md) | `agyPort08EventTime`, PF04 | NOT_RUN (backend) |
| 30 | Backend identity and probe | **DEFERRED_EXTERNAL**. The integration is preserved and a proposal is written; no probe was run | [backend handoff](backend-handoff-29-30.md) | host unchanged since base | NOT_RUN |

Phase reports exist for every phase: [00](phase-00-baseline.md) to [13](phase-13-integration.md). There are also two remediation units, [pre-advance](pre-advance-remediation.md) and [audit A1–A4](audit-remediation.md).

## Verification and artifacts

**Host gates at final code** (`evidence/agy-port-20261106/phase-13/`):

| Check | Result |
|---|---|
| `npm run preflight` | PASS: typecheck, lint, Jest 46 suites with 684 passed + 1 opt-in skipped (base: 15 suites, 163 tests), architecture 215 modules |
| Kotlin unit tests (forced rerun) | 43 pass (base: 14) |
| Debug and dataQa builds | PASS |
| APK audits, both ABIs | PASS |

Mutation checks were run in Phases 02, 03, 06–10 and 12, and in both remediation units, but not in Phases 04, 05 or 11. Every run's log is kept. Earlier runs had survivors and a harness error, which led to stronger tests; each unit's final run has no survivor or harness error.

**Artifacts** are build outputs, not committed, and live on this PC only. Hashes are in [MANUAL-QA.md](MANUAL-QA.md):

- `android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk` (phones)
- `android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk` (emulators)
- the matching debug APKs

**Failed and interrupted attempts are kept, not hidden:**

- Phase 11 build attempts 1, 2 and 4 failed. Attempt 3 is **INTERRUPTED/NO_VERDICT** (host low memory).
- Phase 11 preflight-1 failed lint.
- Phase 12 mutation run 1 had a HARNESS_ERROR, and doctor-1 failed truthfully.
- Audit mutation run 1 had survivors.
- Two Phase 05 logs were lost earlier. The loss is documented, with recovered excerpts.

**Every review in this run was a self-review** by the implementer or the parent. No independent review completed: Phase 05 records two reviewer attempts that did not finish. An independent review of the branch is still worth doing.

## Deferred or failed work

No phase FAILED, and no unit was reverted.

**Outside the app, needing someone else's access:**

- **#29 and #30, the backend.** These need an omission-aware event contract and a capability signal, then a client change behind that signal. They also need a public deployment identity and an owner-run probe. The required inputs are backend project access, or the confirmed public API URL, plus a synthetic test account. See [backend-handoff-29-30.md](backend-handoff-29-30.md). The online features keep working meanwhile.

**Device acceptance:**

- **All device and live behavior.** Code completion is not phone acceptance. Instrumentation tests are compiled but have never run.

**PARTIAL areas and missing pieces:**

- **Reminder durability (#2).** Process death or interruption after a reminder change is committed to SQLite but before the native cancel reaches AlarmManager can still ring one stale alert, which is dismissed on open. ADR-023 option C (a native invalidation marker) needs Kotlin, a QA fault-injection point and process-death device tests. *Corrected 2026-11-06 (final audit F4): this was previously described as a force-stop. Android 15 Force Stop cancels the package's alarms itself, so it is a different case (MANUAL-QA M18 R1-R3).*
- **Event time (#14).** Events over 24 h and exact zones for recurring imports both need the backend wire (#29).
- **Speech (#17, #27).**
  - The optional Android on-device recognizer is not built. Whisper stays the default, unchanged.
  - The Whisper accuracy collector and runs need approved audio.
- **QA tooling (#24, #25, #26).**
  - The in-app QA screen and native gate are not ported.
  - The planner benchmark is stale.
  - The emulator runner has never run.

**Known parser limits.** These were recorded, not changed:

- "mark … as not done" becomes a new task;
- "every day" recurrence is not parsed;
- "update note X to Y" sets no title;
- "next friday" is ambiguous;
- the "on YYYY-MM-DD" quirk from Phase 04.

**Smaller limits:**

- planner change-target and Profile "delete all" still read full owned lists;
- no in-app view of quarantined Chat history;
- the merged manifest carries dependency permissions (`ACCESS_WIFI_STATE`, `READ`/`WRITE_EXTERNAL_STORAGE`) that were present before this run;
- model checksums were not re-verified against their publishers.

## Read/install/check later

Follow [MANUAL-QA.md](MANUAL-QA.md) (M01–M17, all NOT_RUN). The safe path:

1. Do not clear data or reinstall. Note your task/event/note counts, one armed reminder and your sign-in state.
2. Check the SHA-256 of `app-arm64-v8a-dataQa.apk`: `ef264311…7e19` (full value in MANUAL-QA).
3. Run `adb install -r` on it, over an existing `com.lafina.capstone` signed by the same Android Debug certificate (`acf890c3…`). If you see `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, stop; never uninstall or clear data.
4. Check, in airplane mode:
   - the app launches without Metro;
   - the counts are unchanged;
   - dictation works (VAD on ONNX 1.22.0);
   - meeting record/stop works;
   - a locked-screen reminder call rings.
5. Then the reminder durability cases:
   - reboot and Doze;
   - a timezone change;
   - permission revoke and restore;
   - ~~force-stop (it may ring once).~~ *Corrected 2026-11-06 (final audit F4):* three separate procedures in MANUAL-QA M18:
     - **R1, process death during reconciliation:** it may ring once (ADR-023);
     - **R2, explicit Force Stop:** nothing is promised while stopped;
     - **R3, relaunch recovery.**
6. Last, the speech cases (M07, M14, M15).
7. Only with a controlled account and server:
   - guest link and owner switch;
   - sync;
   - tier gates;
   - Chat/RAG citations;
   - documents;
   - cloud speech (M10–M12).

## Repository hygiene

- **Commits:**
  - 24 task commits on the branch before Phase 13 (`5f0ac39` … `d986c3b`), plus the Phase 13 commits.
  - Each phase commit was followed by a `docs(agy-port): record …` index commit.
  - Every commit was staged by explicit path.
- **Left untracked, as instructed:** `AGY-IMPROVEMENTS-MANIFEST.json`, `AGY-IMPROVEMENTS-START.md`, `agy-improvements/`, `docs/reports/agy-ustp-comparison-*`, `scripts/__pycache__/`.
- **Donor and backend:**
  - The donor (`LAFINA`) is unchanged at pin `0d4bbe3`. Its two docs paths were already dirty before this run, which only used `git show`.
  - `LAFINA-backend` has no local checkout and was not touched.
- **Graphify:** the binary is present, but there is no `graphify-out/graph.json`. The AST scanner and `rg` were the substitute.
- **Secrets and copied material:**
  - The secret-pattern scan of all added lines found 0 matches.
  - No `.env`, keystore or signing file was read.
  - No model, binary, Kokoro, business, Gmail or study-tool code was added.
  - Backend hosts are unchanged.
- **Log timestamps:** some times were estimated and later corrected by a dated CORRECTION row; rows are kept append-only.
- **Nothing pushed, merged or deployed.**

## Recommended next actions

1. Run M16 on your phone (in-place update of the arm64 dataQa APK), then the M05/M06 reminder cases. These are the highest-risk unverified behaviors.
2. Have someone other than the implementer review the branch diff against `b9433dc` (a `/code-review` run or a human reviewer).
3. Run the instrumentation tests (`connectedDebugAndroidTest`) on a test device, and the emulator runner on a spare AVD (M17).
4. Decide whether to build ADR-023 option C (native invalidation marker) to close the process-death stale-alert residual (corrected 2026-11-06 from "force-stop", final audit F4).
5. When backend access exists, carry out [backend-handoff-29-30.md](backend-handoff-29-30.md) in order, then the client capability change.
6. Later client units: the optional on-device recognizer, the in-app QA screen, a planner benchmark rewritten against `plannerQueries`, and the listed parser limits.
