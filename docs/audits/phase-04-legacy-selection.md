# Phase 04 selective legacy calendar reference

**Reviewed:** 2026-10-23, Asia/Manila.  
**Pinned revision:** `f7e70aec54e6d16e627f444f2a67114cbfb07b5e`.  
**Purpose:** reuse suitable student calendar interaction principles for the manual
offline planner, without importing legacy storage, account/business modules,
unrelated tools, assets, dependencies or broad application code.

## Read-only source resolution

The sibling `LAFINA/` is a container; the actual old checkout is
`C:\L3mxr\Github Repositories\LAFINA\LAFINA`. Read-only `git cat-file -t` for the
pin still cannot find that object locally. No checkout, fetch, build, installation
or write was performed there. The fallback was the approved public GitHub
connector against the exact pinned recursive tree and selected blobs. The tree
returned `truncated: false`. No alternate revision or dirty working file was
substituted.

Owner authorization for source/brand reuse is already recorded in
[Phase 00 provenance](phase-00-inventory.md); detailed attribution/publication
terms remain to follow. No top-level legacy license is established. This phase's
selection uses interaction concepts; no source or brand asset copy is planned.
Third-party dependency/license review is separate from owner permission.

## Selected reads and decisions

| Pinned path | Git blob SHA / reviewed extent | Useful concept and exclusions |
|---|---|---|
| `src/ui/screens/calendar/CalendarScreen.tsx` | `a141650c7b1a8562b44cd243440bf3f6978d210f`; lines 1–285 (of 625) | Keep familiar previous / Today / next date navigation, shared month header, explicit selected mode and create/edit task/event entry points. Exclude `userId`, category/notes stores and editor, import/export, calendar layers, time-block tools and their dependencies. The reviewed component is not imported wholesale. |
| `src/ui/screens/calendar/components/MonthView.tsx` | `7fca2df30883d6492180795eed2553d5d3ed6863`; all 205 lines | Keep recognizable month grid, selected day/today distinction, day tap leading to agenda and an accessibility label with date/item count. Exclude per-cell filtering of entire arrays, `any` gesture handlers, tiny 8-pixel previews, raw style literals and unrelated blocks/categories. Capstone uses its semantic theme and bounded date-window data. |
| `src/ui/screens/calendar/components/AddTaskEventModal.tsx` | `5b209d474531bcb3c17a99d81e84a1e325e22c73`; lines 1–150 (of 614) | Keep separate task due versus event start/end controls, explicit editing state and 12h/24h display choice. Exclude account/store contracts and free-form/unbounded RRULE options (daily/monthly/yearly/never). Use the validated capstone date/UTC/weekly recurrence domain, bounded end date and explicit reminder lead. This review does not claim all form/validation lines were inspected. |
| `src/ui/screens/calendar/utils/calendarHelpers.ts` | `9b0a994d45aa5c8922c875e2b31bd9dc35a1f320`; all 64 lines | Calendar month offset, date header and 12h/24h concepts are useful. Do not copy permissive `Date.setHours` parsing/default-to-zero or local-engine normalization into authoritative scheduling. Invalid dates/times and DST ambiguity continue through capstone strict validation. |
| `App.tsx` | `572894bae9ab36dfa7f6d45030974f5f6c9459c8`; targeted lines 100–110, 626–653 and 695–714, plus routing symbol search | Student shell home was Calendar. The legacy `today` route renders **EmployeeTodayScreen** with business/lease properties. Exclude that business screen, not a missing reusable student Today component. Capstone Today is composed from its own student agenda/tasks and existing anonymous shell. No legacy root app, account routing or tools copied. |

Primary pinned links:

- [Calendar shell](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ui/screens/calendar/CalendarScreen.tsx)
- [Month grid](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ui/screens/calendar/components/MonthView.tsx)
- [Task/event form](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ui/screens/calendar/components/AddTaskEventModal.tsx)
- [Calendar helpers](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ui/screens/calendar/utils/calendarHelpers.ts)
- [Root routing](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/App.tsx)

## Capstone adaptation boundary

Phase 04 retains the current light/dark theme, Today/Calendar/Chat/Settings shell,
SQLite schema/domain validation and Phase 03 native delivery adapter. Familiar
calendar navigation and task/event distinctions are visual/interaction reference
only. Source mutations commit locally, then request native reconciliation; denied
delivery remains an explicit warning rather than a false saved-alarm guarantee.
Acknowledging an alert never completes an academic task.

Date-window/state-filtered bounded reads are required for production lists;
Phase 03's QA-only 500-row `snapshot()` is not the manual planner data source.
Undated/date-only tasks remain distinct from UTC timed items, and recurrence
uses existing bounded weekly semantics. No migration/import of the legacy
database, personal schedules, cloud/account state, binaries or credentials is
part of this selection. Final implementation/test/evidence paths belong to the
Phase 04 completion report; this document does not claim the new UI has already
passed physical-device acceptance.
