# 04 — Architecture Decision Register (Provisional)

| ID | Decision | Status | Validation/exit |
|---|---|---|---|
| ADR-001 | New independent repo, old read-only ref pinned to SHA | ACCEPTED | Phase 00 repo audit |
| ADR-002 | React Native/TS + Kotlin/C++ bridges, not full Kotlin rewrite | PROVISIONAL | Phase 00 + 01 build/profiling |
| ADR-003 | Offline local SQLite, no auth accounts | ACCEPTED | Phase 02 airplane mode |
| ADR-004 | Native AlarmManager, permitted full-screen/headsup fallback | PROVISIONAL | Phase 03 device matrix |
| ADR-005 | System TextToSpeech default; Kokoro outside MVP | ACCEPTED direction | Phase 05 offline voice benchmark |
| ADR-006 | Android on-device recognizer when available, Whisper fallback | PROVISIONAL | Phase 06 WER, latency, device support |
| ADR-007 | Rules first, optional small local model only with measured gain | ACCEPTED direction | Phase 07 eval |
| ADR-008 | No user login/onboarding offline by default | ACCEPTED | Phase 01 fresh install |
| ADR-009 | Gemini optional via FastAPI, provider configurable | DEFERRED | Phase 09 benchmark/cost/security |
| ADR-010 | USTP RAG initially ported from Pinecone/legacy Python | DEFERRED | Phase 10 citations/quality/license review |
| ADR-011 | Minimal UI, use legacy patterns + semantic theme | ACCEPTED | Phase 01 usability |
| ADR-012 | Separate student and future business products; no shared runtime dependency | ACCEPTED | Phase 00 import graph |
| ADR-019 | Explicit hold, on-device-only recognizer and optional verified Whisper; local draft review | IMPLEMENTED direction; acceptance pending | Phase06 actual build, offline engine/device and performance evidence |
| ADR-020 | Pure deterministic commands, strict intents and private confirmed executor; transient chat | IMPLEMENTED direction; acceptance pending | Phase07 retained first/regression corpus, transaction/UI tests and actual offline device review |
| ADR-021 | Selective incoming presentation integration on the retained offline core | IMPLEMENTED; device acceptance pending | Pinned data/native audits and Phase07.1 integration report |
| ADR-022 | Nol reference shell, local schema3 Notes and persisted display preferences | IMPLEMENTED; device acceptance pending | Current UI/migration/native compatibility evidence and Phase07.1 Nol UI report |

Every change to these requires a short ADR in `docs/decisions/` using template, with rejected alternatives, rationale, effects on quality/performance, exact benchmark and approval. Never turn a provisional into accepted silently. If Android platform restrictions invalidate a design, stop and present alternatives for approval.

## Phase 00 review record — 2026-10-21

Direction is confirmed by the user's Phase 00 request; no implementation phase is
approved. The following decision files document evidence and pending gates:

- [ADR-001](decisions/ADR-001-independent-reference.md): independent pinned reference;
  user confirmed source/brand authorization, details to follow; no ports performed.
- [ADR-002](decisions/ADR-002-stack-validation.md): RN/TS/Kotlin proposed; exact versions
  remain unaccepted until a clean build. Outside-sandbox Gradle/JDK17 and ADB
  enumeration passed after restricted failures; no devices are attached.
- [ADR-003](decisions/ADR-003-local-state.md): fresh local schema and durable desired
  jobs; native effects reconciled after commit, no volatile production DB fallback.
- [ADR-004](decisions/ADR-004-platform-delivery.md): conditional platform delivery,
  explicit permission/failure states, physical acceptance pending.
- [ADR-005](decisions/ADR-005-system-tts.md): system TTS direction accepted; Kokoro
  excluded from MVP; comparable device measurements NOT RUN.
- [ADR-006](decisions/ADR-006-adaptive-stt.md): platform STT evaluated by capability;
  Whisper remains conditional on provenance and device results.
- [ADR-007](decisions/ADR-007-validated-intents.md): proposals/validation/executor;
  optional local model disabled pending demonstrated value.

ADR-008/011/012 directions remain charter requirements; no source/UI implementation
was created. ADR-009/010 remain DEFERRED. The [blueprint](phase-00-blueprint.md)
records the unchanged phase sequence and proposed contract/schema details.

## Phase 01 record — 2026-10-21

User explicitly approved Phase 01 in natural language and requested manual checks
after every phase. See [ADR-013](decisions/ADR-013-phase-01-preferences.md).
The official RN template is used selectively; the local preference snapshot and
minimal navigation do not import legacy accounts/business/cloud code. Actual
version/build/runtime evidence is in the Phase 01 report. Source/brand authorization
already recorded remains valid; no assets or legacy application code were copied.
No acceptance of physical-device behavior or approval of Phase 02 is implied.

## Phase 02 record — 2026-10-22

Owner: “so far phase 01 looks good, proceed phase 02”, with screenshots of the
reviewed foundation. Natural-language approval authorizes only Phase02. Exact
physical model/API/RAM and offline lifecycle results were not supplied; no missing
Phase01 benchmark/device results are inferred. [ADR-014](decisions/ADR-014-planner-transactions.md)
records the fresh schema, settings-preserving migration, synchronous atomic
mutations, generation-safe outcomes, logical deletion and finite recurrence policy.
No legacy source was copied. The previous Phase01 report remains historical;
its then-current uncommitted state has since been committed by the owner.
Phase03 was unapproved at that handoff; the subsequent record below supersedes it.

## Phase03 record — 2026-10-23

Owner explicitly wrote `APPROVE PHASE 03`, requested emulator installation and
manual checks, and requested independent verification of the Antigravity audit.
[ADR-015](decisions/ADR-015-native-reminder-delivery.md) records native delivery,
the private process/SQLite journal boundary, consent and platform fallbacks.
[Audit verification](audits/phase-03-independent-audit.md) records four confirmed
findings, bounded QA reads, Settings draft protection, UTC fallback and experimental
ARMv7 gating. Physical checks remain pending; approval is not fabricated device
evidence. Phase04 is not authorized.

## Phase 04 record — 2026-10-23

Owner requested independent verification/fixes of the new Antigravity report and
wrote “you can proceed to phase 04.” This explicit natural-language approval
authorizes only Phase 04; it does not certify missing physical-device checks.
The starting checkout was clean `main` at `b3eefb8`, containing the owner's prior
Phase 02/03 commit. Changes use `codex/phase-04-manual-planner`.

[ADR-016](decisions/ADR-016-planner-queries.md) records bounded production reads
and measured synthetic host workloads; [ADR-017](decisions/ADR-017-manual-planner-ui.md)
records manual form/navigation/native-picker and save/delivery boundaries. No
new runtime dependency, schema migration, voice engine or cloud service is added.
The [external-audit verification](audits/phase-04-independent-audit.md) corrects
unsupported safety, memory, permission, coverage and performance claims. No
legacy code/assets were copied. Actual outcomes belong to the Phase 04 report.
Phase 05 remained unapproved at that handoff; the later record below supersedes
that phase authorization only.

## Phase 05 record — 2026-10-25

Owner explicitly answered **`APPROVE PHASE 05`** to beginning Android system
text-to-speech while leaving physical-phone validation pending. No Phase 05
source edits preceded that exact approval. Branch
`codex/phase-05-system-tts` retains uncommitted Phase 04 work; its frozen
111-file handoff manifest distinguishes the prior source from the new phase.
No commit, push, legacy write or model distribution is implied.

[ADR-018](decisions/ADR-018-system-tts.md) implements ADR-005's system TTS
direction: lazy native ownership, installed offline-voice metadata checks,
bounded replacement/diagnostics, focus and lifecycle cancellation, compatible
local preferences and readable text in every mode. Visible reminders and canned
planner replies use this adapter; no STT, intent execution, generative model,
Kokoro cache or network dependency is introduced. Caching remains deferred for
lack of measured benefit. [The pinned legacy audit](audits/phase-05-legacy-tts.md)
records reviewed paths and why Kokoro assets/runtime were not ported.

Implementation and callback evidence do not complete phone audibility, offline
quality, focus, performance or matched Kokoro validation. Exact outcomes belong
to [the Phase 05 report](reports/phase-05-report.md). The previous phone gates
remain pending; Phase 06 requires separate explicit approval.

## Phase06 record —2026-10-26 continuation

Owner explicitly wrote **`APPROVE PHASE 06`**, reviewed Phase05 and requested
emulator installation plus manual checks. Work uses `codex/phase-06-offline-stt`,
retaining uncommitted Phase04/05 source and the frozen preceding manifest. This
does not turn earlier physical-phone gates into PASS or authorize Phase07.

[ADR-019](decisions/ADR-019-offline-stt.md) implements the conditional direction
of ADR-006: explicit hold, permission-at-use/fresh hold after grant, one
cross-process lease, on-device-only Android factory and optional checked
Whisper Tiny fallback. Failure ends a hold; fallback never reopens the mic
silently. A local draft remains independent of engine availability and has no
scheduling side effect. Native Answer/ACK precedes optional visible dictation
and still leaves the task incomplete.

[Model/runtime provenance](third-party/phase-06-provenance.md) records reviewed
MIT source, exact optional weights/notice hashes, no application downloader and
the separate test-corpus flag. Source/model availability is not an accuracy,
performance or low-RAM acceptance result. [The Phase06 report](reports/phase-06-report.md)
records actual executed gates and missing phone/benchmark evidence. No engine
winner, resident decoder/cache benefit or old/new speedup is assumed.

## Phase07 record — 2026-10-26

Owner explicitly wrote **`APPROVE PHASE 07`**, reviewed Phase06, requested emulator
execution and a manual checklist. Work uses `codex/phase-07-offline-intents` and
preserves uncommitted Phase04–06 changes. The frozen Phase06 source manifest is
the prior cohort; neither approval nor a new parser score closes physical speech,
low-RAM, alarm or TTS acceptance. Phase08 remains unapproved.

[ADR-020](decisions/ADR-020-confirmed-offline-commands.md) implements ADR-007's
rules-first direction: pure anchored English grammar, selected-timezone/strict
intent validation, bounded exact target resolution and one private expiring
confirmation session. Existing transactions/receipts own writes; optional speech
and post-commit Android reconciliation stay outside the transaction. ACK never
completes a task. Chat is capped at40 memory-only messages; no new history or
privacy setting, model, schema migration, permission or runtime dependency is added.

The independently frozen first64-case evaluation was62/64 exact, with two
undated-title suffix mismatches preserved. The unchanged-label post-fix64/64 run
is regression evidence, not a new held-out estimate. Host parsing timings do not
measure Android UI, alarm, STT, physical PSS or battery. The
[pinned review](audits/phase-07-legacy-intents.md) found no verified legacy model
inference to justify importing SmolLM2. Actual complete gates/build/emulator
outcomes and remaining human checks belong to [the Phase07 report](reports/phase-07-report.md).

## Phase 07.1 integration — 2026-10-26

Owner requested a pull, thorough audit and integration of the friend's incoming
rewrite before Phase08. Saved all prior work in checkpoint `0d06b24`, pulled
`9c183a2` into `codex/phase-07-1-integration`, and resolved73 conflicts using the
reviewed offline core. [ADR-021](decisions/ADR-021-selective-upstream-integration.md)
records the selective integration: calendar month presentation, rounded tabs,
brand image and semantic theme. Schema2, current data filename, confirmed intent
session and native alarm/speech implementations remain authoritative.

Incoming storage fallback/async transaction/date/falseACK regressions were
reproduced in inert source probes. Account/cloud/sync/updater code, duplicate
native services, incompatible schema17 database and unbenchmarked larger models
are excluded. Upstream history is retained; no automatic foreign-database import
or production-service connection is performed. Pasted credentials were not saved
or used; owner rotation is required. See the [integration report](reports/phase-07-1-report.md).
Phase08 and physical acceptance remain separate human gates.

## Phase07.1 Nol UI follow-up — 2026-10-27

The owner explicitly requested `Nol-branch` and supplied the intended screen
references. Pulling finds Nol/main at the already merged `9c183a2`; this follow-up
corrects the prior presentation selection, without importing the replacement app
root, account runtime or incompatible database. [ADR-022](decisions/ADR-022-nol-ui-local-notes.md)
records Chat/Calendar/Notes/Profile, the non-recording central mic entry, one
semantic theme and exact SVG rendering dependency.

Local notes are an additive schema2→3 migration, with version/receipt fences,
20-record pages and exact Profile counts. Native reminders accept schemas2/3
with unchanged planner/job semantics. Calendar display choices persist through
the existing settings snapshot; absent legacy keys retain24h/Monday behavior.
Earlier reports/baselines remain historical evidence. The
[host notes cohort](benchmarks/phase-07-1-nol-ui-notes.md) is not a phone or
legacy-speed result. Current executed gates/restoration and outstanding human
checks belong in [the follow-up report](reports/phase-07-1-nol-ui-report.md).
Phase08, backend work and physical-device acceptance are not approved by this UI
authorization.
