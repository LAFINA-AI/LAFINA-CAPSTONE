# Current app review — 2026-11-24

## Scope and method

Owner request: analyze the current app and recommend improvements/features that fit. Advisory review only; no implementation phase started and no product code changed. This report is separate from the historical onboarding review in `.design/review-report.md`.

Reviewed AGENTS.md, package.json (1.0.4), README, App routing, Home/dashboard, Schedule, Skills, Profile, Preferences, task data types, alarm scheduling/health, conflict checking, release instructions, source-library decisions, and recent verification reports. Base HEAD: `340e83c`; existing uncommitted Chat, source-library and Student setup work was included where inspected and preserved.

Evidence is current source inspection plus explicitly dated historical device evidence. ADB inventory failed because its server could not start in this environment; no live interface, phone interaction, microphone, paid service or cloud account was exercised. No current visual, battery, latency or accessibility claims are made. External Android documentation was checked for alarm, widget and accessibility guidance.

## Executive read

LAFINA already has substantial feature breadth; its strongest direction is a dependable student secretary connecting schedules, deadlines, notes and verifiable answers. Prioritize delivery confidence, recovery and coherent daily workflows before expanding the tool catalog.

## Preserve

- Guest-first local planning with optional accounts and explicit Online Mode.
- Manual/text paths when models, speech, network or permissions are unavailable.
- Confirmation before assistant writes and the distinction between acknowledging a reminder and completing a task.
- Existing Home widgets, free-gap calculations, conflict warnings and morning briefing; these are implemented, not proposed new features.
- COR review before schedule import, source passages, source scope/freshness/conflict information and unsupported-answer refusal.
- Theme tokens, retained tabs and account-scoped persistence.
- Existing Skills under their task-specific authorizations. This review does not extend those exceptions, recommend new prohibited study tools, or remove preserved functionality.

## Source-level scorecard

Scores concern inspected design/implementation provisions, not a runtime certification. 0 broken, 1 weak, 2 mixed, 3 strong, 4 excellent.

| Dimension | Assessment | Basis |
|---|---|---|
| Student product fit | 3 | Schedule, deadlines, reviewed COR and source-backed university answers form a clear core. |
| Daily information hierarchy | 2 | Strong next-item composition, but alarm date wording is incorrect and summary filtering shares an input with Chat handoff. |
| Task flow and feedback | 2 | Reviews, retries and health checks exist; operational state is spread across several surfaces. |
| Consistency provisions | 3 | Central themes and shared components exist; rendered consistency unverified. |
| Resilience | 2 | Local persistence and fallback paths are substantial; reported OEM alarm suppression and guest recovery remain concerns. |
| Evidence credibility | 3 | Passage-level source access is unusually useful; provenance does not fully travel with synced answers. |
| Typography, contrast, TalkBack, large text, performance feel | Unscored | Current device checks were not possible. |

The dimensions that matter most are resilience and daily flow: students need a reminder to arrive and a clear next action more than another independent generator.

## Findings

| ID | Severity / evidence type | Location / evidence | Current behavior | Proposed correction | Student impact |
|---|---|---|---|---|---|
| APP-01 | HIGH; historical device failure, current status unverified | `docs/reports/device-test-2026-11-23-report.md:42`; `src/ui/components/profile/ReminderHealth.tsx:167` | Infinix X6880 / Android 15 testing recorded screen-off alarms held until unlock. Battery unrestricted and other settings did not resolve it. Current health UI provides battery guidance and a one-minute test but does not establish delivery reliability. | Reproduce on the current release; expose a contextual warning and existing test/recovery entry point from Home/Schedule. Record scheduled versus actual delivery and show delayed/missed reminders on reopening. Treat further mitigation as an experiment with a device matrix. | Prevent silent reliance on a reminder that may arrive late. |
| APP-02 | MEDIUM; source-confirmed | `src/ui/screens/dashboard/components/ModernHomeContent.tsx:329`; `src/scheduler/alarmService.ts:246` | Modern Home formats the next alarm with literal `Today`, although `nextAlarm` returns an occurrence on any future date in its `at` field. | Derive Today/Tomorrow/weekday/date from `activeAlarm.at`, respecting time-format settings. Reuse the existing date helpers. | Avoid misleading students about the next alarm day. |
| APP-03 | MEDIUM; source-confirmed interaction contract | `src/ui/screens/dashboard/components/ModernHomeContent.tsx:274`, `:284`, `:530`, `:533` | “Search classes, notes...” filters loaded highlights and today's schedule; submitting opens Chat with the query. This is not a complete local search over stored records. | Distinguish “Filter this overview” from “Ask LAFINA”, or add paginated account-scoped search with result types, dates and deep links. Never label a summary-only miss as no stored results. | Find next week's class or an older note without guessing where to search. |
| APP-04 | MEDIUM; recovery capability gap | `android/app/src/main/AndroidManifest.xml:37`; `docs/RELEASING.md:40`; `src/storage/calendarExport.ts:6` | Android backup is disabled. Release instructions explicitly warn that guest data is lost on uninstall; calendar export exists, but no full user-facing backup/restore flow was found in the inspected source. | Add explicit portable backup/restore with a manifest, schema/version validation, preview, merge policy and account boundary. Exclude credentials, grants and model binaries; handle attachments separately and protect sensitive exports. | Preserve guest plans and notes across phone loss, reinstall or migration. |
| APP-05 | MEDIUM; documented capability limitation | `docs/decisions/ADR-045-ask-ustp-and-sources-library.md:58` | Synced Ask USTP answers lack the local passage IDs needed for “See passages”; a source-pack replacement can also invalidate IDs. | Plan stable source ID, pack version and page/passage locator portability. Show unavailable/changed provenance honestly and retain library fallback. Any sync contract change needs its own approved scope. | Keep an answer checkable on a second phone and after source updates. |

APP-01 is not proof of failure on every Android model or on today's build. APP-04 is a missing recovery path, not evidence that the current database is corrupt.

## Prioritized recommendations

### Now: dependable daily use

1. Resolve/retest APP-01 and fix APP-02. Surface existing reminder-health capabilities rather than creating a second diagnostics subsystem. Permission granted, registration accepted and alarm actually delivered must stay distinct.
2. Make service state understandable: “Saved on this phone”, “3 changes waiting to sync”, “Sign in again”, “Voice unavailable — type instead”. Distinguish connectivity, Online Mode selection, authentication, model readiness and sync completion. Reuse existing state stores; avoid a permanent wall of technical badges.
3. Clarify Home search (APP-03). Keep “What is next?” dominant; expose search results and Ask as distinct actions.
4. Run end-to-end checks for existing calls, updates, COR setup and sync before promising completeness. Recent reports leave large-text/TalkBack and several two-device/reinstall cases unverified. The November 24 Student setup report records a full preflight pass, while the separate notice report records a full-run timing-sensitive test failure; neither substitutes for this checkout's current checks.

### Next: features that fit

| Rank | Feature | Concrete behavior | Effort / dependency |
|---|---|---|---|
| 1 | User-controlled backup and restore | Export a recoverable student-data package; inspect it before importing; test a guest round trip. | Medium/high. Versioned data format, privacy, attachments and duplicate handling. |
| 2 | Android Today widget | Next class, nearest deadline and next alarm; tap through to the existing screen; hide sensitive content by choice. Start read-only. | Medium. New native widget surface and lifecycle/device QA. |
| 3 | Weekly workload review | Local seven-day view of deadlines, class blocks, overlaps and available gaps. Student selects a free slot and confirms any change. | Medium initially. Reuse calendar/free-slot calculations; no autonomous rescheduling. |
| 4 | Course links | Link a task or note to an existing imported course/subject; show the related records from its detail view. Allow non-USTP/manual courses. | Medium/high. Current Task has category but no explicit course relation; model, migration and sync design required. |
| 5 | Recoverable action history | Plain-language list of recent confirmed assistant changes with deep links; offer Undo only while the inverse remains valid. | Medium. Reuse review receipts/revision rules; do not blindly reverse later edits or claim the full history is absent today. |

A widget is useful independently of alarm reliability. The historical XOS log suggests a possible hibernation exemption, but no Android API contract guarantees that adding a widget fixes that phone; test it as a hypothesis.

### Later

- Turn the existing morning briefing into an optional reusable visual day summary before adding more spoken behavior.
- Add estimated task effort only if weekly-review use shows that students need it. A free gap alone does not prove an assignment will fit.
- Strengthen portable USTP provenance (APP-05). Existing sources, freshness notes and conflict notices should be preserved.
- Consider class-aware notification preferences only after separating soft nudges from explicitly requested exact alarms; never silently suppress the latter.

## Candidates considered and rejected

- Another independent study-tool catalog: the current Skills hub already has extensive breadth, and standing instructions prohibit extending that scope without a specific exception.
- Gmail, university-portal integrations, team dashboards and always-listening assistants: outside the authorized student secretary scope.
- Another theme overhaul: semantic themes already exist, and current rendered evidence is insufficient to justify replacing the visual system.
- A permanent foreground service as the default alarm fix: not demonstrated necessary/effective, adds permissions and battery/UX cost. Current alarm playback service should not be confused with a new keep-alive service.
- A whole-product numeric score: would imply visual/device knowledge this source-only review does not establish.

## Verification

Executed: source/document searches, current git state review, external primary-document checks. ADB inventory failed at daemon startup; no device was reached.

Focused automation: `npx jest --runInBand __tests__/ui/dashboardScreen.test.tsx __tests__/scheduler/alarms.test.tsx __tests__/ui/chatHistorySyncUi.test.tsx __tests__/ui/ustpSourcesLibrary.test.tsx` — PASS, 4 suites / 48 tests, 21.808 seconds. These existing tests verify their covered logic/component cases, not background alarm delivery, complete search, screen-reader behavior or any proposed feature.

Not run: full preflight, Gradle build, app installation, current screen rendering, TalkBack, large fonts, offline speech, background alarm delivery, battery measurements, live provider requests, updater installation, full backup/restore or two-device sync. No implementation change was made that requires claiming a phase passed.

Suggested phone checks for the next approved implementation: schedule an alarm for tomorrow and check Home wording; lock the phone through a test alarm and compare actual delivery time; search an older note and next-week event; create a plan offline then reconnect and verify both devices; exercise failed voice/auth with typed fallback; use the latest UI at maximum font size with TalkBack. These checks are outstanding, not completed by this audit.

## External references

- [Android alarm scheduling](https://developer.android.com/develop/background-work/services/alarms): exact-alarm access, delivery choices and power behavior; does not establish manufacturer-specific fixes.
- [Android app widgets](https://developer.android.com/develop/ui/views/appwidgets): native widget architecture and updates; no guaranteed OEM hibernation bypass.
- [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/apps): named controls and at least 48 dp touch targets. Apply device checks to core flows before visual polish.

## Verdict

Needs changes in the inspected source and recovery design. Release confidence remains pending current device verification, particularly for the historically observed alarm delay. This is an advisory review, not implementation approval or completion of an existing phase.
