# Initial Risk Register — maintain and assign during Phase 00

| ID | Likelihood | Impact | Risk | Mitigation and checkpoint |
|---|---|---|---|---|
| R-01 | High | Critical | Android denies exact alarm / full-screen on some phones | Phase 03 OS capability and fallback matrix; explain no guarantee |
| R-02 | High | High | Built-in offline TTS voice absent or low quality | Phase 05 enumerate voices, airplane-mode validation, text fallback |
| R-03 | Medium | High | On-device SpeechRecognizer unavailable/poor for API 30 phone | Phase 06 tested Whisper fallback and typed control |
| R-04 | Medium | High | Bundled Whisper causes APK/RAM/battery issues | Benchmark model sizes and lazy load; decision gate |
| R-05 | High | High | AI misinterprets date/ACK/snooze | Deterministic validation, ambiguity, critical no-false-ACK tests |
| R-06 | Medium | Critical | Reminder/job record drift under crash/duplicate alarm | SQLite transactions, idempotency, version guards, recovery tests |
| R-07 | Medium | High | Legacy port drags business/auth/cloud dependence | Per-file audit + dependency boundary/Graphify |
| R-08 | Medium | High | Public backend Gemini proxy abused / cost overrun | Phase 09 quotas, caps, demo-only security; no open unauthenticated proxy |
| R-09 | High | High | USTP handbook revision ambiguity or citations wrong | Versioned official sources, human reviewed gold dataset, abstention |
| R-10 | Medium | High | Copyright/privacy risk from handbook, test audio, old model binaries | Provenance/license + research consent review |
| R-11 | Medium | High | Inconsistent performance claims between devices | Baseline pinned, same-device protocols, p95 and raw metrics |
| R-12 | Medium | High | Codex over-builds project or fails to stop | Phase approvals, phase report template, no autonomous next phase |
| R-13 | Medium | Medium | Offline user's selected voice requires network | Require voice network flag and airplane-mode verification |
| R-14 | High | High | Device OEM battery optimizations prevent timely alerts | Multiple-device matrix, user education, no unsupported guarantees |

## Phase 00 findings and accountable checkpoints — 2026-10-21

All original risks remain OPEN; no runtime mitigation has been implemented.
Owner for R-01/06/14: Android engineering + human device reviewer (03/08).
R-02/03/04/05/13: voice/domain engineering + consenting testers (05–07).
R-07/12: engineering owner and phase reviewer (every phase).
R-08/09: deferred backend/adviser owner (09/10 only).
R-10: project owner/provenance reviewer; R-11: research lead (00/05–08/11).

| ID | Severity/status | Actual finding or open uncertainty | Owner and required checkpoint |
|---|---|---|---|
| R-15 | Critical, OPEN | Pinned manifest declares receiver class absent from complete tree; implemented receiver has different name | Android engineer; rewrite registration/identity, native compile + physical alarms before 03 passes |
| R-16 | Critical, OPEN | Legacy production storage can become volatile mock DB; scheduling success precedes durable/native completion | Storage/domain engineer; new minimal DB/transactions/desired-job protocol + fault tests in 02/03 |
| R-17 | High, OPEN | Native app compatibility not build-validated. Restricted Gradle failure resolved outside sandbox; version probe passes with JDK17. Default inherited launch initially chose Java25 | Build owner; select JDK17 explicitly and clean debug/release-like build in 01; no blind upgrades |
| R-18 | High, OPEN | Restricted ADB startup failure resolved outside sandbox; enumeration passes with no devices attached | Human device reviewer/build owner; connect/authorize phone and record only model/API/RAM before baseline/device gates |
| R-19 | High, PARTLY RESOLVED | No root legacy license; user confirmed source/brand authorization, details to follow. Third-party/model/voice provenance unverified | Project owner records authorization/attribution details; engineer verifies upstream revision/terms/checksum before binary/source inclusion |
| R-20 | High, OPEN | Low-end RAM/CPU/ABI coverage not measured; no specific test hardware selected | Performance lead + owner; prioritize 2–3 GB Android11+ ARM64 tier if available plus ~4 GB/reference/newer API; publish measured support envelope, no assumed RAM minimum/32-bit guarantee |
| R-21 | High, OPEN | Single native call slot/hash identities and possible STT context-free/inference race | Android/voice engineer; generation-safe queues, serialized native ownership, cancellation tests in 03/06/08 |
| R-22 | High, OPEN | Impossible dates, first substring completion targets and recurrence weekday loss in legacy paths | Domain engineer; pure proposals, real date/target checks, no false ACK/delete, BYDAY fixtures in 02/07 |
| R-23 | Medium, OPEN | Old manuscript unavailable; handoff's Django/Qdrant paper claim cannot be verified | Research lead/adviser; obtain manuscript before correcting paper claims, not an offline runtime dependency |
| R-24 | High, OPEN | No measured old/new baseline; model pointers are not payload/APK/PSS measurements | Research lead; isolated reviewed baseline and matched protocol, null missing values and preserve failed control results |

Evidence: [inventory](../docs/audits/phase-00-inventory.md),
[native audit](../docs/audits/phase-00-native.md),
[domain audit](../docs/audits/phase-00-reuse.md),
[toolchain](../docs/audits/phase-00-toolchain.md),
[blueprint](../docs/phase-00-blueprint.md).

## Phase 01 update

Phase 01 native debug/release builds now validate the chosen RN/OP-SQLite
configuration for the built ABIs; this partially resolves R-17. Physical-device
usability, low-end performance and all future native-feature risks remain open.
Emulator smoke checks are a separate evidence class, never phone certification.

| ID | Severity/status | Finding | Owner/checkpoint |
|---|---|---|---|
| R-25 | High, OPEN | Final npm production-graph audit has33 affected/meta-affected entries from two remaining leaf advisories; no patched latest leaf version available at scan | Engineering/security reviewer; trusted build inputs, no public Metro, review upstream fixes or separately evaluated framework migration before distribution; see provenance ledger |
| R-26 | High, OPEN | ARMv7/API30/physical low-RAM handset behavior not yet validated; emulator is API37/x86_64 | Device reviewer; run Phase01 manual checklist on actual low-end phone; do not infer support from ABI configuration or 2GB emulator setting |

The package [provenance/security ledger](../docs/third-party/phase-01-provenance.md)
records actual advisories and compatible fixes; no advisory scan is labeled PASS.

## Phase 02 update

R-16 is mitigated in the new data layer by surfaced failures, one shared connection,
transactional migrations, real SQLite pair/receipt rollback and host-process
interruption tests. R-22 has strict time/weekly validation; intent parsing and
destructive command target checks remain Phase07. Legacy defects were not ported.

| ID | Severity/status | Finding | Owner/checkpoint |
|---|---|---|---|
| R-27 | High, OPEN | Desired jobs exist but Phase02 has no native registration/reconciliation; all delivery is UNAVAILABLE | Phase03 engineer; implement capability/identity/generation and real-device delivery without claiming Phase02 RINGING meant an alert |
| R-28 | Medium, OPEN | Debug snapshots read all planner rows; tombstones/operation receipts retained, only chat capped100 | Phase 04 engineer; reviewed paging/pruning/privacy purge and measured large-dataset behavior; logical deletion is not erasure |
| R-29 | Medium, REVIEW | Initial overdue grace15min and strict DST gap/quiet-boundary rejection; weekly horizon366dates | Human reviewer; inspect documented policy and DST fixtures; native lifecycle behavior later |
| R-30 | High, OPEN | dataQa is a private debuggable development-signed build exposing test controls | Build/reviewer; do not publish, release build flag false, Android permissions/ABI inspect before installing |

R-20/R-24/R-25/R-26 remain open. Host in-memory timing is explicitly not low-end
Android latency/PSS/battery/legacy comparison evidence. No dependency was added;
Phase01 advisory snapshot remains historical and unresolved, not a new clean scan.

## Phase03 update

R-27 now has a native implementation; physical delivery acceptance remains open.
R-28 QA SQL reads are capped at501 and returned rows500 per table; product paging,
native active-job reads and retention remain review items. ARMv7 is now gated
experimental. Historical Phase02 records above describe that earlier build.

| ID | Severity/status | Finding | Owner/checkpoint |
|---|---|---|---|
| R-31 | High, DEVICE PENDING | API37 x86_64 emulator cannot establish API30/low-RAM/ARM64/OEM delivery, battery or screen-lock behavior | Human phone reviewer; Phase03 checklist before acceptance |
| R-32 | Medium, OPEN | Inexact alarms can arrive outside the15min grace; Android idle quotas can delay persisted timeout settlement | Clear capability warning; notification has60s visibility timeout; reconcile on resume/restore, validate real devices |
| R-33 | High, MITIGATED BY DESIGN; DEVICE PENDING | Multiple SQLite copies in one process and older WAL engines risk corruption | Separate private process, DELETE journal/schema preflight, no destructive native repair; migration/locking/native tests and phone lifecycle checks |
| R-34 | Medium, OPEN | Native current-job reads materialize all pending/ringing rows despite bounded128 platform registrations | Measure realistic semester load on low-RAM hardware; implement reviewed windowed APIs when product scheduling is authorized |

## Phase 04 update — 2026-10-23

R-28's ordinary product-read allocation is mitigated: Today/Calendar use finite
task/agenda/source-scoped history queries instead of the QA snapshot. Pages and
SQL candidate batches are bounded, with explicit continuation. This does not
resolve retention/privacy erasure or all query CPU costs. The UI does not silently
truncate the real planner at the QA 500-row cap. No archival sweep or schema 3
migration was added; existing schema 2 and indexes are preserved.

R-34 remains **OPEN**: native `ReminderStore.listCurrent()` is unchanged and still
materializes all PENDING/RINGING rows before applying native work/OS queue limits.
Product query paging does not fix that separate process's memory/capacity risk.
Terminal jobs are already filtered from this native query; an arbitrary 90-day
history purge is neither its fix nor an approved data-retention policy.

| ID | Severity/status | Finding | Owner/checkpoint |
|---|---|---|---|
| R-35 | Medium, OPEN; host evidence recorded | Agenda candidate scanning and sorted-page selection still use synchronous main-process work; repeated pages rescan candidates, task/history offsets skip prior rows, and ended weekly sources can still be scanned. Finite returned arrays are not constant-time queries. | Storage/performance engineer; retain source-hashed raw host cohorts, measure realistic phone semester data and rendering. A schema/index/cache redesign needs measured justification and its own ADR. |
| R-36 | Medium, EXPLICIT MVP LIMIT | Editing/deleting a weekly source affects its entire series; no individual-occurrence exception editor exists. A student could otherwise expect only the selected class date to change. | UI/reviewer; retain whole-series wording and delete confirmation; manually verify all affected future days and old-alarm cancellation before acceptance. |
| R-37 | Low, EXPLICIT VIEW LIMIT | 12h/24h display belongs to the mounted view and resets on remount; typed time remains 24-hour HH:mm. It is not a persisted preference or a change to scheduled instants. | UI/reviewer; retain “this view” label and clock preview; test 12h picker/manual entry, reopening and timezone display without deadline drift. |
| R-38 | Low, EXISTING POLICY; EMULATOR OBSERVED | Undo completion can rearm an unhandled occurrence that completion cancelled. A recent overdue deadline can alert immediately and the cancelled snooze time is not restored. ACKNOWLEDGED/MISSED occurrences remain terminal. | UI/reviewer; distinguish unhandled cancellation from terminal outcomes in the manual guide and inspect the resulting alert state when reopening a task. |

Measured [student-cohort host queries](../docs/benchmarks/phase-04-queries-host-student.json)
used 200 tasks/12 events; [stress queries](../docs/benchmarks/phase-04-queries-host-current.json)
used 5,000 tasks/60 events. Each metric has 50 measured calls after five warmups,
with zero recorded errors. Selected-day agenda p50/p95 was 8.7604/13.0962 ms versus
62.7289/80.8611 ms; week agenda was 14.0218/17.9263 ms versus
140.1805/160.7152 ms. These different-workload observations expose CPU growth;
they are **not** a linear-scaling proof, Android measurement, low-RAM target pass
or legacy speedup. In-memory SQLite excludes disk/fsync, OP-SQLite/Hermes and UI.

R-20/R-24/R-26/R-31 remain device/performance acceptance items. Physical API 30,
ARM64, modest-RAM/OEM, secure-lockscreen/audio/vibration, keyboard/TalkBack,
battery/peak PSS and matched legacy/new runs are still NOT RUN until recorded.
Source/component tests and API 37 emulator checks do not certify those rows.
Use [Phase 04 manual validation](PHASE-04-MANUAL.md) and the actual
[phase report](../docs/reports/phase-04-report.md); the complete Phases 01–08
offline gate remains pending.

## Phase 05 update — 2026-10-25

System TTS is implemented with visible text fallback, lazy lifecycle ownership,
one active utterance, bounded diagnostics and explicit cancellation. This does
not certify a voice on a physical phone or close the earlier device risks.
No new runtime dependency, microphone or network permission is added. Kokoro,
speech recognition and generative scheduling remain outside this phase.

| ID | Severity/status | Finding | Owner/checkpoint |
|---|---|---|---|
| R-39 | High, DEVICE PENDING | Installed/offline voice flags are reported by a separate engine. Android constructor binding can fall back; requested package labels are not independently verified bound-service identity. The engine's own network permissions are outside capstone's manifest. | Phone reviewer; inspect engine/voice, test audible output in airplane mode with Wi-Fi/mobile data off, record exact locale and failures; never substitute a network voice silently. |
| R-40 | Medium, DEVICE PENDING | `onStart` and initialization diagnostics are native milestones, not speaker audibility. External service memory/energy, quality, routing and real incoming-call focus loss remain unmeasured on phone. | Performance reviewer; calibrated first-audible and app/engine memory/energy protocol in Phase 05 manual guide; do not infer superiority or latency targets from callbacks. |
| R-41 | Medium, EXPLICIT LIMIT | Engine/voice descriptor output caps limit bridge data, but the vendor may materialize a larger initial voice set. Output cap500 is not a native memory bound or exhaustive support for every installed voice. | Device/performance reviewer; measure actual engine inventory/PSS on modest-RAM phones, retain deterministic unavailable fallback. |
| R-42 | Medium, RECOVERED HOST BUILD LIMIT | Phase 05 Android retries hit Windows commit-memory exhaustion in JVM/Metro. A later bounded-worker cohort passed all APK builds and 42 JVM tests; final JavaScript preflight 263 and API37 instrumentation 31 also pass. This is host recovery, not product speed evidence; live emulator speech/UI checks remain separate. | Engineering; retain failed/recovered logs, distinguish current artifacts from old APKs and preserve bounded build parallelism. No sole-cause or Android runtime performance claim. |

The [speech decision](../docs/decisions/ADR-018-system-tts.md),
[selective legacy audit](../docs/audits/phase-05-legacy-tts.md) and
[phone checklist](PHASE-05-MANUAL.md) distinguish selection safeguards, callback
evidence and actual listening. Matched Kokoro first-audible, memory, energy and
quality comparison remains NOT RUN; no speed ratio or cached-speech benefit is
claimed. Retention/privacy erasure and earlier API30/ARM64/OEM/low-RAM alarm and
planner validation remain open. See [the Phase 05 report](../docs/reports/phase-05-report.md)
for the current native build and emulator state rather than inferring it here.

The current dataQa emulator's ready-idle snapshot reports main app109,589 KiB,
cached reminder process43,308 KiB and Google TTS148,142 KiB PSS. This reinforces
R-40/R-41's need for release-phone measurements; it is not peak or a low-RAM pass.
Eight final emulator UI/restoration checks passed, including native reading
callbacks and ACK leaving task TODO. Physical audibility/focus remains pending.

## Phase06 update —2026-10-26

Hold-to-talk and optional local Whisper are implemented; native build, real
decoder, emulator and phone conclusions must come from the current phase report.
Earlier TTS/planner evidence does not certify the new capture pipeline.

| ID | Severity/status | Risk/limit | Owner/checkpoint |
|---|---|---|---|
| R-43 | High, DEVICE PENDING | API31 on-device availability and API33 language metadata are candidates, not guaranteed offline recognition. API30 has no such factory; a no-model build has no STT there. | Speech/device reviewer; inspect exact model-bearing APK hash and engine/language, test in airplane mode, keep text fallback and no generic/cloud recognizer. |
| R-44 | High, EXPLICIT LIMIT | Tiny may misrecognize accents/noise or hallucinate from non-speech. The RMS guard is not VAD; language selection and six synthetic English phrases do not establish Filipino/Tagalog quality. | Speech/evaluation reviewer; consented real corpus with failures/false speech, WER and reviewed words. No transcript executes an action in Phase06. |
| R-45 | Medium, EMULATOR MEASURED; PHONE PENDING | Model-bearing ARM64 release preview is60,706,193 bytes and its verified private model copy has32,152,673 logical payload bytes (filesystem allocation/full installed footprint unmeasured). Six direct-PCM emulator requests sampled a maximum167,689KiB instrumentation-process PSS. This is not absolute peak, complete UI/system memory, energy or low-RAM feasibility; model-freeing may leave allocator/page caches. | Performance reviewer; measure release-like phones, sampled versus true peak, warm/cold conditions and energy. Do not certify2–3 GB support or infer a matched no-model APK delta. |
| R-46 | High, DEVICE PENDING | Permission dialogs, focus/calls, quick releases and main/reminder process replacement can race capture/decode. Cancellation is cooperative; a busy lease may briefly remain while safe cleanup finishes. | Native/device reviewer; test fresh-hold-after-grant, denied/revoked permission, Cancel/Home/lock/call/concurrency. Never auto-retry mic or free a context still decoding. |
| R-47 | Medium, DATASET LIMIT | Six checked synthetic English PCM clips decoded with0/36 word errors,6/6 normalized exact matches and0 failed requests; preparation/load/decode p50/p95 was2,939/3,206ms. This decoder cohort excludes a real microphone, Android recognizer accuracy, capture/release latency and representative accents/noise. Exact transcript match is not semantic intent accuracy. | Research reviewer; separate cohorts/metrics, retain every failure and the frozen manifests; matched legacy/device baseline remains NOT RUN. |
| R-48 | Medium, HUMAN UI CHECK | Hold gestures, visible recording/error states, secure-lock restrictions and TalkBack/large-font use require device review. Manual draft and ACK/Snooze controls must remain available if capture is refused. | Owner; run the Phase06 manual matrix, record unsupported gestures/OS refusals rather than claiming a mocked pass. |

[ADR-019](../docs/decisions/ADR-019-offline-stt.md),
[provenance](../docs/third-party/phase-06-provenance.md),
[manual steps](PHASE-06-MANUAL.md) and [the report](../docs/reports/phase-06-report.md)
record current contracts and evidence. Phase07 intent processing and online
features remain unapproved; no root risk is closed by a candidate availability flag.

## Phase07 update — 2026-10-26

Phase07 is explicitly approved; Phase08 and online features remain unapproved.
The earlier phase rows are historical acceptance boundaries, not permissions to
skip current end-to-end validation. No source/model naming or parser score closes
physical speech, reminder or low-end-phone risks.

| ID | Severity/status | Risk/limit | Owner/checkpoint |
|---|---|---|---|
| R-49 | High, HUMAN CONFIRMATION | A perfectly parsed string can still differ from the student's intended speech/time/title. Deterministic confidence1 is grammar coverage, not calibrated understanding. | Owner; review exact local/UTC time, timezone, target and action before every Confirm change. Test corrections/negation/noise and preserve manual controls. |
| R-50 | Medium, EXPLICIT GRAMMAR/QUERY LIMIT | English grammar, quoted exact targets and SQLite ASCII-only NOCASE do not cover every language or Unicode spelling. Duplicate/truncated matches cannot select a safe target. Result caps21 identities/20 product rows do not bound SQL scan time on arbitrarily large histories. | Engineering/device reviewer; test duplicates/Unicode/semester data, report bounded pages honestly, use Calendar for unsupported targets/recurring series. |
| R-51 | High, STALE CONTEXT | Clock/timezone/default lead changes, old record versions, expired reviews and ringing generation/window changes can invalidate an otherwise clear command. | Executor/device reviewer; five-minute/private review and confirmation fences, actual midnight/time-change/concurrent-alert tests. Saving and delivery remain separate. |
| R-52 | Medium, TRANSIENT PRIVACY LIMIT | Conversation is intentionally memory-only and capped40 messages. Leaving Chat/Clear loses discussion and pending reviews, but does not erase planner records/tombstones. No chat-history opt-in or full privacy purge is implemented. | Owner; verify navigation/background/Clear semantics, avoid personal transcript evidence, never imply conversation clearing deletes academic data. |
| R-53 | High, END-TO-END DEVICE PENDING | Parser, host SQLite and mock-ASR UI tests cannot prove human microphone→transcript→review→durable item→alarm/TTS behavior. Earlier API37 emulator startup/injection instability and missing local recognition language remain context, not current feature passes. | Owner/device reviewer; current hash-verified offline APK, real voice/edit/review/Confirm, actual ringing and audible Stop on physical API30/ARM64/low-RAM phones; preserve failures. |
| R-54 | Medium, SMALL EVALUATION SET | First held-out64-case text corpus scored62/64 exact; post-fix unchanged-label64/64 is a regression. Zero unsafe proposals on32 refusal labels is not a measured real-world false-action rate or semantic/STT accuracy. | Research reviewer; preserve first errors/frozen labels, separate execution and phone cohorts, collect a new independently labeled corpus before claiming generalization; legacy matched baseline NOT RUN. |

[ADR-020](../docs/decisions/ADR-020-confirmed-offline-commands.md),
[benchmark protocol](../docs/benchmarks/phase-07-intents.md),
[manual guide](PHASE-07-MANUAL.md) and
[current report](../docs/reports/phase-07-report.md) record these decisions and
actual outcomes. Optional NLU model use remains unjustified by measured benefit;
there is no cloud fallback in offline commands.
