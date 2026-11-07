# Verified starting context

Prepared from read-only inspection on 2026-11-06, Asia/Manila. Reconfirm at execution time. The owner subsequently resolved the earlier scope conflicts in favor of preserving AGY; older comparison conclusions proposing removal/exclusion of existing meetings/documents/cloud are superseded.

## Repositories and revisions

| Purpose | Path/reference | Recorded state |
|---|---|---|
| Writable destination | `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` | `agy-development-cont`, `b9433dc39d172f30ba26ea68e4a9c9eedd922407` |
| Read-only donor | `C:\L3mxr\Github Repositories\LAFINA\LAFINA` | `feat/capstone-remaining`, `0d4bbe39e106c29fb90792cf5d2f916b5c0d6480` |
| Other checkout: do not edit | `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE` | Original dirty capstone working tree; not this plan's destination |
| Read-only backend | `LAFINA-backend`, if locally present | Not a migration target; no deployment or source edit authorized |

The donor has modified inventory documentation and an untracked remaining-features plan. Do not edit or stage them, follow their unattended instructions, or infer that planned features shipped. The older legacy pin `f7e70aec54e6d16e627f444f2a67114cbfb07b5e` was absent locally; the current owner explicitly requested this newer donor. Record selected file hashes and pinned source provenance. Prefer `git -C <donor> show 0d4bbe39e106c29fb90792cf5d2f916b5c0d6480:<path>` to avoid source working-tree drift. Remote fallback: `https://github.com/LAFINA-AI/LAFINA/tree/0d4bbe39e106c29fb90792cf5d2f916b5c0d6480`.

Public inventory: [30 improvement areas](https://github.com/LAFINA-AI/LAFINA/blob/LAFINA-USTP/docs/capstone-improvements-in-ustp.md), fetched blob `fab2132795b52b634568eff2f019d77111b3753e`. Implementation baseline `ea6358e`; inventory baseline `4a08ffe`. Additional scoped donor work after that implementation baseline changes 116 files, with 7,084 insertions and 243 deletions. Those extra WIP features are not automatically in this port.

## Current stack and critical differences

- Both use React Native 0.86.0, React 19.2.3, TypeScript strict and OP-SQLite 16.2.0. Destination pins OP-SQLite; donor uses a range. Preserve the destination dependency graph.
- Destination schema version 17; donor 24. A number change is not a migration. Inspect actual tables, columns, indexes and triggers. Donor initializer includes excluded modules and cannot replace AGY's initializer.
- Destination package `com.lafina.capstone`, debug `com.lafina.capstone.debug`; donor `com.lafina`. Preserve destination applicationId/version/signing/update identity and remap adapted Kotlin/manifest/test identifiers.
- Destination `src/ai/nlu/types.ts`: `create_task`, `create_time_block`, `create_reminder`, `create_note`, `update_task`, `update_time_block`, `update_note`, `delete_task`, `delete_time_block`, `delete_note`, `acknowledge`, `snooze`, `reschedule`, `query_schedule`, `chat`, `out_of_scope`. Fields include `title`, `durationMinutes`, target hints, confidence and validation. Donor uses a different `schedule/cancel/find_time` contract. Preserve AGY's contract and native model/parser; adapt review/execution underneath it.
- Destination Whisper + Silero VAD; `react-native-tts` local speech, eligible online Gemini speech with existing entitlement rules/fallback. Donor Kokoro is excluded. Destination ONNX 1.19.2; donor 1.22.0. Evaluate any target upgrade with target inference/build evidence.
- Destination supports the seven sync entity types `profile`, `task`, `event`, `time_block`, `reminder`, `note`, `custom_category`. Additional local metadata tables must not silently become new sync entity types.
- Preserve `SyncScopeType='account'`, guest user `local_guest_user`, student/student_pro tiers, existing admin and entitlement semantics. Current helpers differ by feature; characterize actual behavior instead of normalizing permissions by assumption.

## Observed gaps

Database native-open failure enters a no-op fallback and may run after-commit callbacks. Schema initialization lacks the donor's future-schema/integrity/atomicity checks. VoiceModal executes commands after STT without a distinct editable review. CRUD writes/reminder registration are separate and target matching can be title-scored. Chat uses a shared default session. Calendar/Notes history reads are unbounded. Profile infers voice activity from text/flags. Native alarms use SharedPreferences and hash identities; mic lease is process-local and reentrant by holder enum. System TTS may report initialized without an explicitly verified offline selected voice. These are static findings to reproduce and fix, not observed physical-device failures.

## Recorded checks and limits

Tracked source/test/script text comparison: destination 198 files, donor 475, shared identical 20, shared different 151, destination-only 27, donor-only 304. Many donor-only files are unrelated or forbidden imports. Paths/normalized hashes are in reference/baseline/files.csv.

There are 15 tracked destination Jest suite files versus 161 donor files. These are file counts, not a fresh test pass. Destination's architecture script ran with an analysis-only borrowed TypeScript 5.9.3 import: 179 modules, no reported cycles/its forbidden imports. Donor's stronger offline-boundary analyzer applied to AGY reported two paths through `chatOrchestrator`/`ai/index` to `documentSkill -> cloud`. They are valid online orchestration to preserve and isolate, not a reason to delete documents.

The simple target doctor printed Node 24.19.0, Java 25.0.2 and configured Android SDK/NDK/CMake presence. It is not a Gradle build proof. Claude Code observed: 2.1.318. No dependency install, fresh preflight, Gradle build, emulator run, phone run or live backend call was made while preparing this pack. Archived pass counts/benchmarks cannot be inherited as new evidence.

## Existing regression suites to retain

`__tests__/App.test.tsx`; storage `phase01Storage`, `phase02CalendarAndNotes`; UI `phase01AuthAndProfileScreens`, `phase01ThemeAndTour`, `phase02CalendarAndNotesScreens`; scheduler `phase03ReminderScheduler`, `callDispatcherAndCallScreen`; AI `ttsService`, `phase05TtsAndCloudSpeech`, `phase06SttAndVoiceModal`, `phase07NluAndActionExecution`, `phase08ChatAndOrchestrator`, `phase09OnlineDocsAndMeetings`, `phase10HandbookRAG` (use actual `.test.ts/.tsx` paths).

Phase 00 must produce a new complete discovered test inventory and actual results; do not assume an archived 163-test count is still the correct baseline.
