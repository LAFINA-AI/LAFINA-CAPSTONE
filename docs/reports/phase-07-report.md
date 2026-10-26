# PHASE 07 — Offline commands and confirmed chat / Completion report

Current preflight, focused tests, parser evaluation, Android assembly,
upgrade/install, instrumentation and visible typed-chat/event/ACK/completion,
TTS Stop and manual speech-draft copy checks are complete. Original settings and
fixture cleanup are verified. Full spoken/physical-phone acceptance remains
HUMAN REQUIRED. No Phase 06 APK/test is relabeled here.

**Branch/base commit:** `codex/phase-07-offline-intents` / `b3eefb853be7c658a38186d330eb8aaf4be8eea2`  
**Date:** 2026-10-26, Asia/Manila; exact UTC run times belong to evidence files.  
**Device:** existing `Medium_Phone`, API37 `sdk_gphone16k_x86_64` emulator, x86_64/16KiB pages; no physical phone.  
**Status:** `AWAITING DEVICE VALIDATION`; available automation/emulator checks and restoration complete, physical/spoken gates remain open.  
**Approval:** user explicitly wrote **`APPROVE PHASE 07`**, reviewed Phase 06,
requested execution on the emulator and a manual checklist. This authorizes only
Phase 07. Earlier physical-phone/STT acceptance remains pending; approval does
not fabricate those measurements or authorize Phase 08.

Existing uncommitted Phase 04–06 work is preserved. The
[249-file Phase 06 source manifest](evidence/phase-06-source-hashes-initial.json)
is the comparison baseline; cumulative Git diff is not a Phase 07-only change
list. The [260-file Phase 07 source cohort](evidence/phase-07-source-hashes-initial.json)
records12 changed and11 added files; [seven APKs](evidence/phase-07-artifacts-initial.json)
have recorded hashes, manifest/model/notice and16KiB JNI inspection. No commit,
push, legacy write or database reset is implied.

Model-bearing x86_64 dataQa is83,333,105 bytes, SHA256
`da93446f52316a4700502df978b347b4773a1f710b4d4ff3a1ab917cdce58f05`.
ARM64 release preview is60,747,297 bytes, SHA256
`8eadbfe411df8c7cf9d08b757e458ccd9f553805366e1d9f1ce904d7ad04942a`.
ARM64 dataQa is83,550,640 bytes. The x86_64 APK was upgraded with `adb install -r`
and its installed private package-path SHA256 matches the recorded artifact.
This is emulator installation, not physical ARM64 validation.

The [current emulator ledger](evidence/phase-07-emulator-handoff.json) records
original airplane/Wi-Fi/mobile settings0/1/1 and verified test settings1/0/0.
Original RECORD_AUDIO permission was already **allowed** at Phase07 start and
must be preserved at cleanup. Host microphone input was explicitly disabled and
read-only local gRPC probe reported `realAudioEnabled=false`. Existing preferences
remain; typed date/time checks used the selected **GMT** timezone rather than
assuming Asia/Manila. [Cleanup evidence](evidence/phase-07-emulator-cleanup.json)
at `2026-10-26T09:50:11.978812Z` verifies original radios0/1/1 restored, app mic
grant preserved, no running AppOps recording, host input still disabled, native
delivery OFF,0 pending/ringing/registered/failed jobs and original Text output.
Chat is foreground with an empty composer; [handoff screen](evidence/phase-07-chat-handoff.png).

## 1. Scope completed

| Requirement | Implemented behavior | Acceptance boundary |
|---|---|---|
| F-009 | Typed offline create-task/event, query, move, complete, delete and named ringing-reminder ACK/snooze commands. Parser proposals reach one private confirmed executor. Current emulator exercised create/move/query/persistence, event correction/deletion, explicit completion and a live named ringing ACK. | Physical speech and actual current Chat snooze delivery remain HUMAN REQUIRED; no unseen-language or phone acceptance inferred. |
| F-013 | Anchored deterministic grammar, strict unknown-key/type/date/time validation, missing-slot clarification, refusal of vague/negated/compound/bulk actions and explicit confirmation for every mutation. | Grammar confidence is not a probability of understanding; unsupported language must be rephrased or handled manually. |
| F-010 integration | Editable STT draft can be explicitly copied to Chat, sent, reviewed and confirmed. Recording itself never executes a command. | Existing Phase 06 speech limitations remain; native answered-reminder draft does not issue Chat commands. |
| F-012 | Written durable outcome appears independently of optional system TTS. Existing delivery reconciliation runs after committed writes. | Saving does not prove Android delivery or speaker audibility; native/phone tests remain separate. |
| Privacy/F-015, phase-local | No new NLU model, network dependency, permission or persisted conversation. Chat holds at most 40 transient messages. Manual planner remains available. | Full Phases 01–08 offline acceptance is not closed here. No online Gemini/RAG/backend is introduced. |

Supported temporal syntax is today/tomorrow, exact ISO dates and bounded explicit
minute offsets, with AM/PM or unambiguous 24-hour clocks. Bare weekdays, vague
times, missing reminder times and unsupported recurrence do not gain defaults.
Date-only/undated tasks remain distinct from timed reminders. Chat does not
silently move or delete a recurring series; Calendar remains the manual route.
There is no general-knowledge chatbot or optional-model inference claim.

## 2. Change summary

| File/module | Change and reason | Evidence |
|---|---|---|
| `core/ai/intents.ts`, `intentTime.ts`, `parseIntent.ts` | Pure typed grammar, exact JSON-shaped validation, selected-timezone normalization, explicit missing slots and refusal. | Focused parser/validator tests; frozen evaluation below. |
| `core/ai/commandSession.ts` | One expiring private review, target/version/context/occurrence fences, fixed operation token, repository receipts and bounded duplicate-confirmation replies. | Real host-SQLite executor tests. |
| `core/storage/commandQueries.ts`, planner interfaces/query composition | Parameterized exact-title identity query; at most 21 small rows, no substring/first-match choice. SQLite NOCASE is ASCII-only. | Executor tests; domain/storage still use existing transaction machinery. |
| `features/chat/ChatScreen.tsx`, App integration | Bounded transient conversation, composer, Send, Confirm/Discard, clear/retry states and optional latest-reply TTS. | Current typed task/event/query/refusal/persistence/ACK/completion and TTS Stop UI checks PASS. No audibility claim. |
| `SpeechInputPanel.tsx` | Reviewed text copy to composer; Send and Confirm remain separate actions. | Injected speech-adapter UI tests, not actual recognition quality. |
| `android/app/build.gradle` | VersionCode7 / 0.7.0; retain Phase 06 optional-model/corpus flags and ABIs. | Current Phase 07 assembly/APK inspection PASS; no native engine/permission change. |
| Corpus/evaluator/docs | Independent frozen 64-case labeled set, retained first failures, regression evaluation, actual raw host timings and source hashes. | [Protocol/results](../benchmarks/phase-07-intents.md). |

[ADR-020](../decisions/ADR-020-confirmed-offline-commands.md) records the decision
and architecture diagram. No new SQLite schema migration is introduced. Existing
task/event/reminder/job operations remain transactional; Android reconciliation
and optional audio cannot participate atomically in that transaction.

Every mutation requires **Confirm change**. The UI receives an opaque review ID,
not an executable serialized command. Review expires after five minutes, or on
changed clock direction/timezone/default lead, altered target/version, stale
ringing occurrence/generation or navigation/cancellation. A confirmation rechecks
those fields and legal states. Duplicate confirmation uses the bounded result
cache and existing durable operation receipts. Parser output and raw JSON never
gain direct DB access. ACK does not complete a task.

## 3. Tests and real outcomes

| Check | Command/procedure | Actual result | Evidence |
|---|---|---|---|
| Focused parser/validator/date tests | `npx jest __tests__/intents.test.ts --runInBand` | PASS, 97 tests, 3.498s as observed by the parser worker; these cases are also included in the completed final preflight. | [Final complete gate](evidence/phase-07-preflight-final.log) |
| Executor/persistence tests | `npx jest __tests__/commandSession.test.ts --runInBand` | PASS, 36 tests, 3.192s. Covers no-write-before-confirm, stale/context/target/reminder fences, retry/rollback and bounded query/repeat behavior. | [Reviewed executor log](evidence/phase-07-command-session-reviewed.log) |
| First chat/App group | Four Chat/App Jest suites | FAIL: 36 passed / 1 failed in 26.418s; one Chat fixture lost its AppState listener mock after restoration. Existing failure retained. | [Initial UI log](evidence/phase-07-chat-initial.log) |
| Corrected isolated Chat fixture | `npx jest __tests__/ChatScreen.test.tsx --runInBand` | PASS, 11 tests, 6.357s after test mock restoration fix. Does not by itself pass the complete app gate. | [Reviewed UI log](evidence/phase-07-chat-reviewed.log), [isolated retry](evidence/phase-07-chat-retry-isolated.log) |
| First independent command evaluation | `node scripts/benchmark-intents.cjs` | 62/64 exact; 64/64 intent/refusal; 86/88 selected slots; zero unsafe mutation proposals on 32 refusal labels. Two undated-suffix title mismatches retained; process exited nonzero after saving them. | [First raw output](../benchmarks/phase-07-intents-host-first.json) |
| Post-fix unchanged-label regression | `node scripts/benchmark-intents.cjs --evaluation regression --output docs/benchmarks/phase-07-intents-host-reviewed.json` | PASS, 64/64 exact, 88/88 selected slots, zero unsafe-ready/false-ACK/false-scheduling proposals on 32 refusal labels; no throws/nondeterminism. This is regression evidence after seeing first failures. | [Reviewed raw output](../benchmarks/phase-07-intents-host-reviewed.json), [log](evidence/phase-07-benchmark-reviewed.log) |
| Earlier type/lint gates | `npx tsc --noEmit`; initial `npm run preflight` | FAIL initially: old repository mocks lacked findTargets and query literals lacked the new scope field; initial preflight then caught one ChatScreen inline-style lint error. Implementation/test typings and style corrected; failures retained. | [Initial type log](evidence/phase-07-typecheck-initial.log), [initial preflight](evidence/phase-07-preflight-initial.log) |
| Full current preflight | `npm run preflight` | PASS,453 tests/27 suites in34.957s; TypeScript strict, ESLint, Prettier and44-module AST cycle/offline checks pass. Earlier completed452-test cohort retained; one reviewed speech callback test was added before this final run. | [Final gate](evidence/phase-07-preflight-final.log), [earlier reviewed gate](evidence/phase-07-preflight-reviewed.log) |
| Reviewed recognition-copy integration | SpeechInputPanel + Chat focused Jest group | PASS,31 tests,10.241s; edited recognized words require explicit copy/use/send/confirm. This is injected-adapter UI behavior, not actual speech accuracy. | [Focused integration log](evidence/phase-07-speech-chat-reviewed.log) |
| Current Android build/APK metadata | Debug/dataQa/release per ARM64/x86_64 plus test APK, reviewed explicit assets | PASS,4m44s;320 tasks,74 executed/246 up-to-date. Seven inspected APKs; exact main model/notices, test-only fixtures and16KiB JNI alignment verified. | [Build log](evidence/phase-07-android-initial.log), [artifact manifest](evidence/phase-07-artifacts-initial.json) |
| Current JVM policy suite | `:app:testDataQaUnitTest`, XML/hash verification | PASS,62 tests/6 suites,0 errors/failures/skips,0.172s XML total. Task executed in this build; no UP-TO-DATE label is assumed. | [JVM manifest](evidence/phase-07-jvm-results-initial.json) |
| Current emulator installation | `adb install -r` current x86_64 dataQa; package-path SHA256 verification | PASS,0.7.0-data-qa installed hash matches `da93446f…ce58f05`; existing data/preferences preserved. Radios verified airplane ON/Wi-Fi OFF/mobile OFF for checks. | [Emulator ledger](evidence/phase-07-emulator-handoff.json) |
| Current functional instrumentation | `adb -s emulator-5554 shell am instrument -w -e notClass com.lafina.capstone.voice.WhisperCorpusBenchmarkTest com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner` | PASS,42 tests,7.303s on actual current API37 emulator. No new Whisper accuracy inference implied. | [Instrumentation log](evidence/phase-07-instrumentation-initial.log) |
| Offline reviewed create/correction/query | Send `QA07 revise` tomorrow19:00; Confirm, query; exact-title move review/Confirm; query again | PASS: review showed2026-10-27 19:00 GMT/15-minute lead; Confirm produced durable saved-task outcome. Query showed TODO19:00, then20:00 after confirmed correction. Delivery remains separate. | [Emulator ledger](evidence/phase-07-emulator-handoff.json) |
| Contradiction/negation/bulk refusal | Send conflicting okay/later, bare Friday, negated ACK and bulk delete | PASS: guidance without mutation review/Confirm; saved synthetic task remained queryable. | [Emulator ledger](evidence/phase-07-emulator-handoff.json) |
| Pending review Home cancellation | Home before confirming a synthetic create; return and attempt exact delete of its title | PASS: confirm action removed and exact target lookup found no saved item; no background write. | [Emulator ledger](evidence/phase-07-emulator-handoff.json) |
| Force-stop persistence versus conversation | Force-stop/reopen current app offline | PASS: confirmed task and corrected20:00 instant persisted in SQLite; composer/history/review cleared and no automatic command execution. This is reopen persistence, not delivery while force-stopped. | [Emulator ledger](evidence/phase-07-emulator-handoff.json) |
| Chat-created real alarm and named ACK | Confirm near-term task/lead, background offline; send named ACK while uniquely RINGING, review and Confirm | PASS: a live alarm for `QA07 live alarm` was actionable after planned09:34:55UTC trigger. Named ACK required review; confirmation acknowledged the reminder and task query remained TODO. Only this fixture was then explicitly deleted. No general drift/reliability guarantee. | [Live ledger](evidence/phase-07-emulator-handoff.json), [ACK review](evidence/phase-07-ack-review.png) |
| Event create/correct/delete | Send one-hour event, review/Confirm; exact-title move; review/Confirm deletion | PASS: confirmed event was created; moved preview preserved one-hour duration; confirmed correction and individually confirmed deletion completed. | [Current ledger](evidence/phase-07-emulator-handoff.json) |
| Explicit task deletion | Exact single-task Delete, review and Confirm; repeat target lookup | PASS: separate destructive review required; later exact lookup found no live synthetic source. Existing cancellation tombstones remain by policy. | [Current ledger](evidence/phase-07-emulator-handoff.json) |
| Completion separate from ACK | Create a new synthetic source, explicitly Complete/review/Confirm, query completed tasks, then reviewed deletion | PASS: explicit completion showed COMPLETED; the earlier live reminder ACK had left its different source TODO. Deleted only the new completion fixture after another review. | [Current ledger](evidence/phase-07-emulator-handoff.json) |
| Optional system TTS Stop UI | Both-mode fixed planner help, explicit Stop reading reply | PASS: stopped state and written reply retained. This is a current UI/adapter observation, not speaker audibility, voice quality or phone proof. | [Current ledger](evidence/phase-07-emulator-handoff.json), [stopped reply](evidence/phase-07-tts-stopped.png) |
| Manual speech-panel draft copy | Host mic off; type into speech-panel fallback, Use draft in chat; Send; Discard review; exact target lookup | PASS: draft copy changed only the composer; Send produced a distinct command review; Discard left no task. Actual spoken recognition was NOT RUN. | [Current ledger](evidence/phase-07-emulator-handoff.json) |
| Native fixture/delivery cleanup | Individually confirmed removal of all new fixtures; app diagnostics | PASS: original native delivery setting OFF and diagnostics0 pending/0 ringing/0 registered/0 failed. Four saved fixtures were individually removed; two discarded drafts never became records. Historical student records preserved. | [Cleanup](evidence/phase-07-emulator-cleanup.json), [ledger](evidence/phase-07-emulator-handoff.json) |
| Final emulator restoration and current integrity | Original radios0/1/1, original mic grant, Text output; no active recording; source/APK SHA256 check | PASS: app mic grant true preserved; no AppOps running; host input false; Text/Chat/empty composer verified. All260 source files and7 APKs rechecked with0 drift. Companion final integrity record is generated after this report's last edit. | [Cleanup](evidence/phase-07-emulator-cleanup.json), [handoff](evidence/phase-07-chat-handoff.png), [final integrity](evidence/phase-07-final-integrity.json) |
| Optional NLU model integration | No added model/adapter | N/A: deterministic parser/executor only; strict structured-input tests are not a model-inference integration result. Existing speech model is a separate Phase06 component. | [ADR-020](../decisions/ADR-020-confirmed-offline-commands.md) |
| Graphify and final AST graph | Fresh CLI availability; actual architecture checker | Graphify NOT RUN: CLI unavailable. Executed AST substitute PASS,44 TypeScript modules; ADR020 Mermaid is authored architecture, not a full native graph. | [Fresh availability check](evidence/phase-07-graphify.json), [executed AST gate](evidence/phase-07-preflight-final.log) |
| Physical speech/older OS/low-RAM/calls/battery | [Human checklist](../../qa/PHASE-07-MANUAL.md) | NOT RUN / HUMAN REQUIRED | No physical device results supplied. |

Completed build recipe; current x86_64 emulator upgrade is verified:

```powershell
$phaseRoot = (Get-Location).Path
$phaseModel = Join-Path $phaseRoot '.local/phase06-whisper-assets'
$phaseCorpus = Join-Path $phaseRoot '.local/phase06-corpus'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$env:NODE_OPTIONS = '--max-old-space-size=512'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest "-PwhisperModelDir=$phaseModel" "-PsttCorpusDir=$phaseCorpus" '-PreactNativeArchitectures=arm64-v8a,x86_64' '-Dorg.gradle.jvmargs=-Xms64m -Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --max-workers=1 --no-daemon --console=plain
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

Use the ABI-matching APK for the actual device and preserve its recorded hash.
Model preparation/licensing stays under the Phase 06 provenance ledger; the app
does not download weights. Do not overwrite earlier evidence cohorts.

## 4. Performance and device matrix

| Metric/cohort | Actual result | Limit |
|---|---|---|
| Frozen first held-out English classification | 62/64 exact; 86/88 selected slots | First failures disclosed, not erased; small synthetic grammar set. |
| Reviewed unchanged-label regression | 64/64 exact; 88/88 selected slots | No longer an unseen-data estimate. No execution/recognition score. |
| First host parse calls | n6,400; p50 0.0284ms, p95 0.2767ms; max 7.1633ms | Fixed clock/timezone, no explicit warmup, host JIT/caches/scheduling uncontrolled. |
| Reviewed host parse calls | n6,400; p50 0.0178ms, p95 0.1620ms; max 1.1258ms | Arithmetic median and nearest-rank p95. Variance is not a measured speedup. |
| False ACK/scheduling/unsafe mutation proposals | 0/32 refusal cases in both parser cohorts | Proposal classifications only; actual side effects require separate executor tests. |
| Android typed command-to-durable-result | Functional create/move/query/persistence and named ACK PASS | No stopwatch latency inferred from successful records/replies. |
| Current near-term real alarm/ACK | One Chat-created fixture became ringing and accepted reviewed named ACK while task stayed TODO; native CLAIM_RING at+29ms and NOTIFICATION_POSTED at+86ms from planned09:34:55.933UTC | n1 alarm, one sample per native transaction/logged-post milestone. These are not audio onset, notification render, p50/p95 or phone reliability measurements; no ringtone audibility verified. |
| Model-bearing APK size | ARM64 release60,747,297; x86_64 dataQa83,333,105; ARM64 dataQa83,550,640 bytes | No whole-install/RAM/energy conclusion. Existing32,152,673-byte private model copy has additional logical payload cost. |
| Optional NLU model inference | N/A | No NLU model/adapter added; old native naming did not prove inference. |
| Phone/STT/PSS/energy/matched legacy comparison | NOT RUN / HUMAN REQUIRED | Exact collection commands and matched-APK/device prerequisites in the manual guide; no current physical hardware supplied. |

[Frozen corpus](../benchmarks/phase-07-command-corpus.json) SHA256 is
`41ff335b5c20c054ba98b626cc21058fc8d1208f1c9e6a1b6e0196021c16e6ef`.
The [benchmark protocol](../benchmarks/phase-07-intents.md) retains exact compiled
source/harness/lock hashes, all first outputs, all 100 timings per case, errors
and distinct variants. Two host memory checkpoints are not peak or Android PSS.
Six earlier Phase 06 Whisper PCM samples are a distinct STT cohort and provide
no command or physical-speech accuracy result here.

## 5. Reliability, privacy, permissions and licenses

Exact-title target lookup uses parameterized values, selected task/event table
allowlist and a 21-row result cap. ASCII-only NOCASE and duplicate/truncated
results are explicit limits; none authorizes choosing the first item. Ringing
lookups are bounded to 50 reminders; no unique current reminder means no ACK or
snooze. Confirmation fences do not promise delivery outside Android restrictions.

Composer changes, backgrounding, clear/dispose and leaving Chat invalidate a
pending review. Recognized speech stays editable and is copied explicitly before
Send. Conversation/recognition text is not persisted or logged by this flow;
existing dormant storage types are not permission to retain chat history. No
audio/model daemon, cloud API, account, new dependency or new Android permission
is added. Current bundled dataQa/release inspection retains no INTERNET/overlay
or foreground-microphone-service permission. Debug development permissions are
reported separately in the artifact manifest and are not release-offline proof.

[Pinned legacy review](../audits/phase-07-legacy-intents.md) records exact paths,
blob SHAs and unsafe defaults/ACK/target/model assumptions. Only behavioral/test
ideas were adapted. No legacy application source, model binary or dependency
tree was copied. Third-party speech licensing remains unchanged from Phase 06.

## 6. Human phone verification

Use [the complete checklist](../../qa/PHASE-07-MANUAL.md). Short owner checklist:

1. Upgrade to the current hash-verified **0.7.0-data-qa** with `adb install -r`;
   open Chat in airplane mode with Wi-Fi/mobile data off. Preserve existing data.
2. Send `Remind me to revise tomorrow at 7 PM`. Check exact date/time/timezone and
   lead in Review. Verify nothing appears before Confirm; confirm once and inspect
   Calendar/task/reminder. Saving and Android alert delivery are separate checks.
3. Send `Move task "revise" to tomorrow at 8 PM`; verify both precise time and
   old-alarm retirement after confirming. Try read-only task/agenda queries.
4. Show speech input, hold/release, edit recognized text, copy to Draft, use it in
   chat, Send and Confirm separately. Stop optional TTS while retaining text.
5. Try Friday/later/change-it/negation/mixed ACK+snooze and bulk deletion. Expect
   clarification/no data change. Named ACK requires one actually ringing source;
   it must leave the underlying task incomplete. Delete only new fixtures through
   review and restore original settings afterward.

Host microphone is deliberately disabled in the Phase 06 handoff. The owner may
enable emulator host input for their own speech, or use a physical phone. An
unavailable Android recognition language is not an engine success; try the
verified local model or type. Real speech, API30/ARM64/low-RAM, noise/accents,
real calls/secure-lock and battery remain NOT RUN until a human records them.

## 7. Docs and architectural decisions

[ADR-020](../decisions/ADR-020-confirmed-offline-commands.md),
[legacy audit](../audits/phase-07-legacy-intents.md),
[benchmark protocol](../benchmarks/phase-07-intents.md),
[README](../../README.md), [architecture](../02-ARCHITECTURE.md),
[decision register](../04-DECISION-LOG.md),
[requirements](../../qa/REQUIREMENTS-MATRIX.md),
[risks](../../qa/RISK-REGISTER.md),
[execution checklist](phase-07-checklist.md) and the manual checklist describe
the new boundary. Fresh Graphify availability was checked and returned unavailable;
the actual AST substitute passed44 modules. Current source/APK hashes match and
emulator cleanup is recorded. The [final companion integrity record](evidence/phase-07-final-integrity.json)
captures final source/artifact/report/link verification after document editing;
an authored Mermaid diagram is not a Graphify execution.

## 8. Open work and limitations

Current install,42 functional tests, typed task/event/create/move/complete/delete/
query, refusal/persistence, named live ACK, TTS Stop UI, manual speech-panel copy
and original-setting restoration are complete. All260 source files and7 APKs were
rechecked with0 drift. Human physical speech/quality, current Chat snooze delivery,
older OS/low-RAM, real-call/lock-screen and energy/matched baseline checks remain
NOT RUN / HUMAN REQUIRED. Preserve
every initial failure and final result separately. Human-required speech/device,
low-end, energy and matched legacy measurements remain open even after automated
gates pass. Broad English/Filipino free-form understanding, contextual pronouns,
bulk/series actions, persisted conversation and optional model inference are not
implemented. Manual Calendar controls are the explicit fallback. Phase 08 is
unapproved; do not begin it.

## 9. Review decision

- [x] Current preflight, native assembly/APK checks and JVM suite passed.
- [x] Current emulator install/instrumentation/core typed-chat and live named ACK checks recorded.
- [x] Event/completion/deletion/TTS Stop UI/manual speech-copy checks and individual fixture cleanup recorded.
- [x] Original radios/microphone/output and final restoration completed and recorded.
- [ ] Manual physical-device checks completed and human-confirmed.
- [x] No new disallowed scope/model/cloud/account or legacy write introduced.
- [x] Current source/APK hashes and emulator restoration verified; final companion report/link record is generated after editing.

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval for Phase 08.**
