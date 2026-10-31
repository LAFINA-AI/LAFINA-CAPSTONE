# Phase 08 — Offline Core Release Gate

**Current verification:** [stable-emulator report](phase-08-stable-emulator-report.md) and [stable case ledger](evidence/phase-08-stable-case-ledger.json) (2026-10-31): aggregate unchanged at 45 PASS / 2 FAIL / 1 NOT RUN; emulator spoken-ACK reliability BLOCKED (failures coincide with observed emulator audio-path faults; root cause not established); release gate unmet. Low-load H3b comparison: NOT RUN (host admission unmet; [record](evidence/phase-08-stable-lowload1-not-run.json)). Previous: [capture-fix report](phase-08-capture-fix-report.md), [case ledger](evidence/phase-08-capture-fix-case-ledger.json) and [APK ledger](evidence/phase-08-capture-fix-artifacts-final.json): 45 PASS / 2 FAIL / 1 NOT RUN.44 prior scoped passes retained plus10 selected affected trials; all failures remain. V05 and all physical acceptance/signatures remain pending. The implementation/results below preserve historical cohorts. No stable offline release or Phase09+ approval.


**Decision: HUMAN REQUIRED / NOT RELEASED AS A STABLE OFFLINE BASELINE.**
Implementation approval is recorded in the [phase report](phase-08-report.md).
It is not a signed device acceptance or authorization for Phase09+.
Candidate0.8.0/code11, schema3, local review branch based on98bef88.

Fresh JS preflight, native JVM/build/instrumentation, static APK checks and the
recorded emulator subset pass only the scopes explicitly described in the
[report](phase-08-report.md). No physical phone has been tested in this phase.

| Requirement | Available implementation / automated evidence | Physical acceptance / gate |
|---|---|---|
| F-001 Anonymous offline setup | Existing setup/persistence tests freshly pass; known-lineage upgrade preserves settings | HUMAN REQUIRED: phone offline onboarding/reopen |
| F-002 Local preferences/themes | Fresh preference/UI/storage suite; settings preserved through emulator upgrade | HUMAN REQUIRED: phone persistence, voice/settings/accessibility |
| F-003 Manual task/event CRUD | Fresh real host-SQLite repository/forms tests | HUMAN REQUIRED: phone manual fallback/keyboard |
| F-004 Calendar month/week/day | Fresh query/timeline/calendar suites | HUMAN REQUIRED: phone navigation/current mutation state |
| F-005 Paired reminder/job operations | Fresh transaction/native store tests | HUMAN REQUIRED: phone delivery/reconciliation across lifecycle |
| F-006 Native due alarms/notifications | Compiled AlarmManager path, native checks; actual emulator subset in ledger | HUMAN REQUIRED:30+alarms, minimum/newer APIs, OS/OEM drift |
| F-007 Conditional simulated reminder UI | Native screen/manual fallback retained; Answer no longer ACKs | HUMAN REQUIRED: locked/FSI eligibility/notification fallback matrix |
| F-008 ACK versus completion/atomic snooze | Fresh review/pipeline/real Android SQLite tests: single transition, TODO retained, one generation | HUMAN REQUIRED: actual phone ACK/snooze/concurrency |
| F-009 Validated typed commands | Fresh Chat/session/repository suites; frozen regression64/64,0unsafe proposals | HUMAN REQUIRED: phone confirmed target/time and no-false-action checks |
| F-010 Visible offline STT | Existing speech policy/native bridge tests freshly pass; new response text needs explicit review | HUMAN REQUIRED: deliberate real hold, airplane-mode STT, accents/noise/low-memory |
| F-011 Offline-capable Android TTS | Existing offline voice validation/native tests; output remains optional | HUMAN REQUIRED: installed offline voice, actual audibility/quality, Stop/interruption |
| F-012 Durable text and optional speech | Fresh command/output suites; store precedes OS reconciliation; speech failure cannot prevent manual controls | HUMAN REQUIRED: Text/Voice/Both phone outcomes and focus handling |
| F-013 Rules first/ambiguity safe | Exact bounded native response parser plus existing Chat validation/refusals; one-shot reviews | HUMAN REQUIRED: misrecognition/contradiction correction without false action |
| F-014 Restart/reboot/permission/time recovery | Fresh native policy/store/presentation tests, original timeout plus elapsed budget | HUMAN REQUIRED: process death/reboot/timezone/time/permission/OEM cases |
| F-015 Offline core has no server dependency | Fresh JS boundary gate; QA/release APKs have no INTERNET permission; existing reviewed local model | HUMAN REQUIRED: full physical airplane-mode lifecycle/traffic validation |
| F-016 Weekly classes/timezone (SHOULD) | Existing bounded manual/domain/query tests freshly pass | HUMAN REQUIRED: phone whole-series/timezone walkthrough |
| F-017 Local inspection/removal/Notes (SHOULD, PARTIAL) | Fresh Notes/schema2→3/retention tests; no purge/export feature added | HUMAN REQUIRED: phone privacy walkthrough; retained text/history disclosed |

## Unmet release criteria

- [ ] At least30actual phone alarms; all applicable cases A01–A36 have results.
- [ ] At least10live interactions per tested voice; V01–V12 have results.
- [ ] Airplane mode with Wi-Fi/mobile off, actual offline TTS/STT/audibility.
- [ ] Minimum API30/31, newer OS, ARM64 and low-memory/reference phones covered
  or unsupported combinations explicitly resolved by the human release review.
- [ ] Reboot/concurrent alarms/force-stop limits/permissions/Doze/OEM behavior.
- [ ] TalkBack, large text and software keyboards on actual phones.
- [ ] Matched release-like STT/TTS/full-interaction p50/p95, peak PSS, startup,
  alarm drift and battery evidence with failures; no emulator-to-phone claims.
- [ ] No unresolved critical correctness/security failure.
- [ ] Human signed review and explicit stable offline baseline decision.

The synthetic native response benchmark measures only parsing/review ownership.
The host frozen text regression measures only its existing corpus. Neither fills
the physical speech, delivery, resource or full-interaction gates above.

## Human execution and signoff

Use [the manual](../../qa/PHASE-08-MANUAL.md) and
[device protocol](../benchmarks/phase-08-device-protocol.md). Record per-device
PASS/FAIL/NOT RUN, exact version/hash, non-sensitive model/API/RAM, counts,
observations and evidence. Keep every failure/skipped case visible. Restore test
settings and remove only named fixtures; Notes/tombstone history is retained.

| Signoff field | Current value |
|---|---|
| Reviewer/date | NOT SIGNED |
| Physical device evidence | NOT RUN |
| Certified physical alarms / live interactions |0 /0 |
| Critical findings resolved by human review | PENDING |
| Stable offline baseline approved | NO — AWAITING DEVICE VALIDATION |
| Phase09+ authorized | NO |

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval.**
