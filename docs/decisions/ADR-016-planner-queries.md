# ADR-016 — Finite product planner reads and windowed agenda occurrences

**Date:** 2026-10-23 (Asia/Manila)  
**Approved phase:** 04  
**Status:** implemented; physical-device validation remains required.

## Context

The Phase 02 `snapshot()` is a finite QA/debug view, capped at 500 records per
table. A product calendar built on that view would silently lose later records
and read unrelated reminder history on every screen refresh. The independent
audit correctly identifies full-table snapshots as unsuitable for the ordinary
planner UI. A class must also appear in an agenda even when it has no reminder.

## Decision

Add typed repository reads in `plannerQueries.ts` and compose them into the
existing repository. Retain `snapshot()` for its existing QA purpose. Keep schema
2 and the existing indexes; no new runtime dependency, database or migration is
needed for these reads.

| API | Meaning and bound |
| --- | --- |
| `getTask(id)`, `getEvent(id)` | One nondeleted source, or null. A source whose status is CANCELLED can still be inspected by ID. |
| `tasksPage({filter,offset,limit})` | Active TODO/IN_PROGRESS, completed, or both. Cancelled/deleted sources are excluded even from `all`. Due items sort first, then undated items, with an ID tie-breaker. |
| `agendaPage({fromDate,toDate,timezone,after,limit,includeCompleted})` | Inclusive 1–42 calendar dates in the requested display timezone. Active events and dated active tasks; completed tasks only when requested. Cancelled/deleted sources and undated tasks are excluded. |
| `reminderPage({kind,id,offset,limit})` | Paired reminder/job delivery history for one nondeleted source, including terminal/cancelled outcomes. These outcomes never imply task completion. |

All page sizes are 1–50 (default 20). Task/history SQL fetches only page size +1
rows with bound offset/limit parameters and an explicit stable order. Agenda
candidates stream through SQL keyset batches of at most 50 rows. The query retains
only the best page size +1 agenda entries, one SQL batch and one event's requested
occurrences. SQL internal sorting/cache is outside this JavaScript array bound.

The agenda emits one item per task or event occurrence. Its `date` is the local
display date; date-only task dates are preserved as declared. For an ongoing
event that started before the requested window, `date` is the first visible date
and `at`/`endAt` retain the original UTC interval. A selected-day query therefore
shows an overlapping multi-day event on every applicable selected day. An entire
week query emits the occurrence once, rather than duplicating it on each day.
`AgendaItem.timezone` is the requested display timezone; full source detail retains
the timezone used when the item was created.

## Calendar and recurrence correctness

Resolve local date boundaries by searching for the first instant whose local
calendar date reaches the boundary. Do not assume 24-hour UTC days or require
00:00 to exist. Tests cover 23/25-hour DST dates, a midnight gap, a skipped local
date, and windows at the 2000/2100 domain limits. Task instants are filtered using
these actual boundaries. Long nonrecurring events use interval overlap rather
than a guessed maximum duration.

For a weekly event, clamp the recurrence loop's first/last local dates to the
requested interval plus the event's <=24-hour carry-in. Do not generate an entire
366-day series and discard most of it. A 42-day query visits at most 45 local
dates per recurring candidate. Occurrences are derived from the source event,
independently of reminder creation or delivery status.

`decodeEvent(row,{validateSeries:false})` is used only for these product reads.
Normal reads/writes retain full-series validation. The fast mode still validates
field types, notes/title/timezone, UTC endpoints, status/lead, unique weekdays,
366-day series bounds, <=24-hour weekly duration, whole-minute start, starting
weekday and explicit DST fold roundtrip. Requested occurrences still use strict
`expandWeekly` resolution; a corrupted nonexistent DST occurrence fails visibly.
This mode does not claim to revalidate out-of-window occurrences.

## Cursor and consistency semantics

Agenda keys serialize an explicit tuple:
`[displayDate,UTC start or empty,kind,sourceId,occurrenceKey]`. Date-only and
carry-in entries sort first on their date. Canonical UTC instants retain
subminute ordering and distinguish repeated local clock hours. The comparator
uses string ordering, not locale-dependent collation.

The opaque cursor contains a version, this tuple and the exact window/timezone/
completed-filter scope. Decode validates length, shape, fields and timestamps;
cross-window/filter cursors fail and ask the user to refresh. Cursor values never
become SQL fragments. Only fixed internal table/status identifiers are inserted
into SQL; user values are bound parameters.

Pages are not a durable snapshot across separate user actions. Inserts or edits
between page requests can move records before a cursor/offset. The UI must refresh
after a mutation or filter/window change. Product source writes currently occur
only on the synchronous main-process connection; the native reminder process
changes reminder/job outcomes independently.

## Evidence and remaining limits

Real host SQLite regressions are in
[`plannerQueries.test.ts`](../../__tests__/plannerQueries.test.ts). They cover
pagination above the 500-row debug cap, maximum SQL result sizes, stable cursor
coverage without duplicate/omitted keys, recurrence without reminders, carry-in,
deleted/cancelled/completed filters, paired reminder history, malformed recurrence
bounds, DST gaps/folds and invalid/cross-window cursors.

[`benchmark-planner-queries.cjs`](../../scripts/benchmark-planner-queries.cjs) runs
the production repository reads against fresh synthetic in-memory SQLite only:

```text
node scripts/benchmark-planner-queries.cjs --cohort student --output docs/benchmarks/phase-04-queries-host-student.json
node scripts/benchmark-planner-queries.cjs --cohort stress --output docs/benchmarks/phase-04-queries-host-current.json
```

The student cohort has 200 tasks/12 events; the stress cohort has 5000 tasks/60
events. Both use five warmups and 50 measured calls per query. Raw latencies,
nearest-rank median/p95, error counts, per-call SQL result sizes, source hashes and
discrete host RSS checkpoints are saved. Existing evidence is never overwritten;
choose a new output path for a repeat. The earlier
`phase-04-queries-host.json` is retained as an initial, superseded source cohort.
The Phase 04 report records the actual current measurements.

**This bounds JavaScript result allocation, not total CPU work.** Agenda pages
rescan matching source candidates to select the next sorted page. Historical
weekly sources can still be scanned even after their series ended; no parsed
recurrence-until column exists in schema 2. Offset task/history pages likewise
require SQLite to skip earlier rows. These costs are explicit benchmark subjects,
not a claim that arbitrary database sizes are cheap. A future measured index or
query redesign needs its own migration/ADR and comparable evidence.

Host figures exclude disk durability, OP-SQLite/Hermes/native bridge and Android
rendering. They do not establish low-memory phone latency, Android peak PSS,
battery use or a speedup over legacy. These physical-device checks remain NOT RUN
until the Phase 04 manual protocol is performed. The native coordinator's active
job materialization is a separate, unchanged limitation from the Phase 03 audit.
