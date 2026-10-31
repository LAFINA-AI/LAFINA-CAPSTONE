# Draft: Phase 08 offline reminder response — validation pending

> **Draft PR description** for branch `phase-08-offline-reminder-response` → `main`,
> opened as a draft on 2026-11-01 with the owner's authorization. It is not ready to
> merge: Phase 08 is blocked and physical validation is pending. Base and scope
> evidence: [base/scope review](evidence/phase-08-draft-pr-base-scope-review.json).
> That record was captured before the commits existed, so its "no PR" fields describe
> that moment.

## Status — read first

| Gate | State |
|---|---|
| Phase 08 | **BLOCKED** (automated emulator spoken-ACK reliability); physical acceptance **AWAITING DEVICE VALIDATION** |
| A03/V03 spoken-ACK reliability | **Unresolved.** Failing emulator captures coincide with observed emulator audio-path faults; root cause not established |
| Microphone-flag anomaly | A **public-source-supported explanation** exists, but it is **unconfirmed on the exact installed emulator binaries** |
| Actual host microphone capture | **Unproven** (neither shown nor excluded). Fail-closed guards are **unchanged** |
| Low-load (H3b) comparison | **NOT RUN.** The old frozen plan does not describe the modified classifier and authorizes no run |
| V05 (local-accent audio) | **Owner-deferred** |
| Physical-device rows | **All 48 NOT RUN**; human acceptance **unsigned** |
| Phase 09 | **Not approved** |

## Proposed base and head

- **Base:** `main` at `98bef88c3ae0fabee677c1466417fc34c0af738c`. This is the default
  branch. Its commit and tree (`0ff0b032…`) are identical to this checkout's base, so
  the diff contains only the Phase 08 changes. Re-verify immediately before
  publishing; see [the review record](evidence/phase-08-draft-pr-base-scope-review.json).
- **Head:** `phase-08-offline-reminder-response`, created from `98bef88`. It has
  two commits: application code and tests, then documentation and evidence.
- **Not a base:**
  - `Nol-branch` (`9c183a2`) is the older replacement application. It is already
    an ancestor of `main`.
  - `agy-development-cont` (`df508da`) belongs to a teammate. It has diverged from
    `main` with its own separate Phase 08 work and is not the reviewed lineage.

## Summary

This PR adds the integrated offline reminder-response loop for the Android app:

**reminder rings → Answer → deliberate voice, typed or manual response → Review
response → Confirm → durable ACK or snooze → Android alarm reconciliation → close.**

- **Answer** opens a visible response screen. It does **not** acknowledge the
  reminder and does **not** start recording. Optional offline Android system TTS
  follows the saved reply preference.
- **Response input.** The user deliberately holds the microphone, types, or taps
  a manual control. Recognized speech first becomes an editable draft. Nothing
  takes effect until **Review response → Confirm**.
- **Strict grammar.** A contextual English grammar accepts only an explicit ACK
  or a snooze of 1–120 minutes. A bare "snooze" or the manual button means 10
  minutes. It refuses extra clauses, task completion, deletion and other
  commands, and it cannot run Chat's general scheduling commands.
- **ACK leaves the task TODO.** Acknowledging a reminder never completes the
  underlying task.
- **Snooze** writes one consistent future replacement (one new snooze
  generation), inside the existing transaction.
- **Safety fences:**
  - The original ringing deadline stays in force after Answer.
  - A review is single-use. It is invalidated by edits, cancellation, capture,
    timeout, pause or replacement.
  - The transaction rechecks the source version and the reviewed deadline.
- **Fallbacks:** manual buttons and typed text remain available when speech,
  TTS or permissions fail. If Android alarm reconciliation fails after a saved
  action, the app reports the saved action with delivery uncertainty instead of
  claiming it was not saved.
- **Unchanged:** notification ACK/snooze remain explicit direct actions with
  their existing identity and state checks. Database schema 3, models,
  dependencies and permissions are unchanged. There is no account, backend,
  cloud, Gemini/RAG or Phase 09 work.

Contract and decisions: [offline loop](../phase-08-offline-loop.md),
[ADR-023](../decisions/ADR-023-foreground-reminder-response.md),
[ADR-024](../decisions/ADR-024-reminder-speech-vocabulary.md).

## Changes included (actual files)

Everything below is relative to `98bef88`. There are 17 modified tracked files and
3,474 new files, plus this draft and its review record.

**Application code**
- Modified:
  - `android/app/src/main/java/com/lafina/capstone/reminders/ReminderActivity.kt`
  - `ReminderIntents.kt`
  - `ReminderStore.kt`
  - `android/app/src/main/java/com/lafina/capstone/voice/AnsweredDictationPanel.kt`
  - `SpeechInput.kt`
  - `WhisperTranscriber.kt`
  - `android/app/src/main/cpp/jni/whisper_jni.cpp`
  - `android/app/src/main/AndroidManifest.xml` (adds a reminder `taskAffinity`; no permission change)
- New: `ReminderResponsePolicy.kt`, `ReminderResponseSession.kt`.
- Version: `package.json`, `package-lock.json` and `android/app/build.gradle` move to
  0.8.0 / versionCode 11.
- `.gitignore` adds `.kotlin/`.

**Tests**
- JVM: `ReminderResponsePolicyTest.kt`, `ReminderResponseSessionTest.kt` (new).
- Instrumentation, new: `Qa08UiDriver`, `ReminderFailureUiTest`,
  `ReminderLifecycleUiTest`, `ReminderMicrophoneUiTest`,
  `ReminderNotificationUiTest`, `ReminderResponseBenchmarkTest`,
  `ReminderResponseUiTest`, `ReminderSettingsUiTest`,
  `Phase08ResponseDecoderProbeTest`, `Phase08SyntheticReplayTest` and
  `Phase08VoiceProbeTest`.
- Instrumentation, modified: `ReminderStoreTest`.
- Host tooling in `scripts/`:
  - `phase08-emulator-audio.mjs` (synthetic test sender) and its three test files
    (`.test`, `-realtime.test`, `-privacy.test`);
  - `phase08-emulator-suite.py`;
  - `verify-phase08-apks.py`.

**Documentation and sanitized evidence**
- Updated: `README.md`, `docs/02-ARCHITECTURE.md`, `qa/REQUIREMENTS-MATRIX.md` and
  `docs/reports/CURRENT-STATUS.md`.
- New:
  - ADR-023 and ADR-024;
  - `docs/phase-08-offline-loop.md`;
  - three `qa/PHASE-08-*.md` checklists;
  - 22 `docs/benchmarks/phase-08-*` files;
  - nine Phase 08 reports.
- Evidence: 2,083 files under `docs/reports/evidence/`, including 306 `.log`
  files (sanitized structured event logs plus build and test logs). 1,438 of
  these files are under `phase-08-emulator-expansion/`.
- Size cleanup (2026-11-01, follow-up commit): 1,334 logs were untracked and
  added to `.gitignore`; local copies remain. No remaining file references them.
  - 1,252 emulator step logs that repeat their same-name `.json` record field
    for field. Six logs stay: four hold events their JSON lacks, two are linked
    from a report.
  - 82 build, install, format and Graphify console logs that no report cites.
    The two that record build failures stay.
  - A new `.gitattributes` marks evidence and benchmark JSON as generated, so
    GitHub collapses them in the diff.

**Not included (ignored, private, local only)**
- Diagnostic controllers and helpers under `.local/`:
  - the reviewed emulator parent controllers;
  - the stable, HAL and low-load cohort helpers;
  - host telemetry;
  - the **ABORT-classification fix** (`.local/phase08-lowload-cohort.py`) and its
    Python tests (`.local/test_phase08_privacy_harness.py`).
- Private logs, SQLite snapshots and screenshots.
- Whisper model and corpus assets.
- APKs and build output, `node_modules/`, `graphify-out/`, and prompt and handoff files.

None of these is promoted by this PR.

## Fixes made during Phase 08 that appear in this PR

- **Reminder reopening:** reliable reopening in a distinct reminder task, while
  preserving planner drafts (`ReminderIntents`, manifest).
- **Reminder speech vocabulary:** a typed `REMINDER_RESPONSE` vocabulary is used
  only on the visible reminder; Chat keeps `GENERAL`. It uses a fixed local
  vocabulary, beam 3 and bounded floor-aware context, with peak-relative offset
  and floor controls (`AnsweredDictationPanel`, `SpeechInput`,
  `WhisperTranscriber`, JNI). This is decoding configuration. It is **not** a
  claim that emulator spoken-ACK reliability is fixed.
- **Interruption message:** audio-mode interruption now shows its reason
  (`AUDIO_INTERRUPTED` / `AUDIO_FOCUS_LOST`) and keeps the typed draft.
- **Test-only fixes:**
  - The synthetic sender anchors 20 ms deadlines to the PCM timeline with a 5 ms
    floor and keeps the 200 ms prefill and 100 ms lateness aborts. It separates
    the source-RPC outcome from privacy guards and preserves original errors.
  - The microphone UI test gained gate diagnostics.
  - Privacy host tests were added.

The ABORT-classification fix changes how emulator *evidence* is labelled. It
is not a speech repair, and its code is not in this PR (see above).

## Validation evidence

**Fresh while preparing this draft:** only documentation, JSON, link and diff
checks on the two new files. No test suite, Android build, emulator or device
was run.

**Historical results (not rerun):**

| Area | Result | Limits |
|---|---|---|
| Original Phase 08 cohort, 2026-10-27/28 | JS preflight 528 tests/35 suites; JVM 81/8; native instrumentation 53; frozen command regression 64/64 exact and 88/88 slots; APK inspection 7 APKs/84 native libraries, no INTERNET in QA/release; known-lineage upgrade 0.7.3→0.8.0; 11 opt-in emulator UI invocations | Emulator on API 37 beta x86_64. Typed/manual UI integration only; not live speech, audibility or physical full-screen behaviour |
| Emulator case matrix, all follow-ups | 45 PASS / 2 FAIL / 1 NOT RUN | Per-case rows across different guests, SDKs and cohorts. **Not an ASR accuracy rate**; failures preserved |
| Stable API35 guest | ACK 3 PASS / 9 FAIL; snooze 7 PASS / 0 FAIL / 1 NOT RUN; manual/typed fallback smoke A01/A02/A04 3/3 PASS | API35 only, not mixed with other guests. Includes a disclosed post-deviation null1 cohort |
| Host privacy tests (public `scripts/`) | Node 41/41 at the microphone-state investigation | Mock loopback gRPC only |
| ABORT-classification fix (private `.local/` suite) | Python 17/17 and Node 41/41 independently passed at the time; the preserved old classifier reproduced 5 failures; all 43 retained classifications unchanged | The Python suite and helper are not in this PR, so reviewers cannot rerun it from the PR |

Captured-energy matches do not establish sample-level fidelity. The emulator
`realAudioEnabled` flag is not live capture.

## Known issues

1. **A03/V03 spoken ACK on the emulator.** Failures coincide with virtio-snd/HAL
   I/O errors and silence insertion; the root cause is not established. Weakening
   recognition or confirmation is not allowed.
2. **Microphone-flag anomaly.** After 3/3 client-cancelled synthetic streams the
   flag read enabled, and 21–25 s later it read off; 37/37 completed streams read
   off. Reviewed public emulator source shows the injected-audio forwarder sets
   this flag during injection and restores the saved value at teardown. The exact
   installed binaries' source was not located or matched. Host capture is
   unproven, and the guards still fail closed
   ([source review](evidence/phase-08-microphone-state-emulator-source-review.json)).
3. **Reproducibility.** Emulator cohorts depend on ignored `.local/` controllers
   and private model/corpus assets. Some reports reference those paths and a
   Windows host path.

## Pending manual checklist (NOT RUN)

1. Install the ARM64 DataQa APK only as an in-place, same-signature upgrade over a
   known-lineage install. Never uninstall or clear data, and stop on a signature or
   schema mismatch.
2. Open Profile, Calendar and Notes and confirm existing items are preserved.
   Record the settings, then enable delivery and set lead time to 0.
3. Turn airplane mode on (Wi-Fi and mobile data off). Create and Confirm a reminder
   two minutes ahead, then background or lock the phone.
4. At the due time tap **Answer**. Expect text or optional offline TTS only: no ACK,
   no completion and no microphone start.
5. Hold to talk and say "acknowledge this reminder", then review the draft and
   **Confirm**. Expect exactly one ACK, with the task still **TODO**.
6. On a fresh reminder, snooze for 10 minutes by voice or button. Expect one future
   reminder about 10 minutes later and no duplicate.
7. Deny the microphone permission and interrupt a capture. Expect clear recovery,
   no late action, and typed and manual controls still working.
8. Optional: test offline TTS Read/Stop. Audibility is a human judgement.
9. Restore the recorded settings, radios and permissions, and remove only your
   test reminders.

Full 48-row matrix: [Phase 08 manual](../../qa/PHASE-08-MANUAL.md).

## Authoritative reports and evidence

- [Current status](CURRENT-STATUS.md) ·
  [Phase 08 report](phase-08-report.md) ·
  [release gate](phase-08-offline-core-release-gate.md)
- [Stable-emulator report](phase-08-stable-emulator-report.md) ·
  [capture-fix report](phase-08-capture-fix-report.md) ·
  [case matrix](evidence/phase-08-emulator-expansion-matrix.json) ·
  [stable case ledger v2](evidence/phase-08-stable-case-ledger-v2.json)
- [ABORT-classification fix](evidence/phase-08-abort-classification-fix.json) ·
  [microphone-state investigation](evidence/phase-08-microphone-state-anomaly-investigation.json) ·
  [emulator source review](evidence/phase-08-microphone-state-emulator-source-review.json)
- [Reviewed source ledger](evidence/phase-08-capture-fix-source-hashes-final.json) ·
  [APK ledger](evidence/phase-08-capture-fix-artifacts-final.json) ·
  [execution checklist](../../qa/PHASE-08-EXECUTION.md)

## Notes for reviewers

1. **Review by commit.** The first commit has the application code, tests,
   scripts and version bump. The second has about 3,400 documentation and
   evidence files, which the reports link to.
2. **Base check.** Immediately before opening this draft, `main` was confirmed
   at `98bef88`. If `main` moves, re-check before merging.
3. **Teammate branch.** `agy-development-cont` contains a separate Phase 08
   implementation in the same app areas. Coordinate with its owner before
   either line is merged.
4. **Public-content notes.** Some earlier reports include a generic Windows host
   path in recorded commands and name the coding tools used in earlier sessions
   as provenance. No credentials, personal data, audio, databases, models or
   build output are included.
5. **Historical reports.** Some reports still say "local working-tree patch; no
   commit". That describes the state when each was written.
   [Current status](CURRENT-STATUS.md) is the current snapshot.

**Do not merge** while Phase 08 is **BLOCKED** and physical acceptance is
unsigned. Phase 09 is not approved.
