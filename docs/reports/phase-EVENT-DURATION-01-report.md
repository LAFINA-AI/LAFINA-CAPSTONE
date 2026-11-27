# PHASE EVENT-DURATION-01 — Simplify event defaults

**Branch / base SHA:** `main` / `e2afa500`, working tree; existing Antigravity audit and earlier USTP/GWA/call fixes preserved.  
**Date:** 2026-11-27, Asia/Manila. Exact verification timestamp and commands are in `evidence/event-duration-01/verification.json`.  
**Devices:** NONE used or verified. No new screenshots, installed APK, Android identifier or live speech session.  
**Status:** `AWAITING DEVICE VALIDATION`; not a claim that the phase or every repository gate passed.  
**Approval provenance:** Owner explicitly approved simplifying the feature to only default event duration in Schedule settings, with LAFINA asking or suggesting a missing start time. The earlier instruction to leave unrelated audit fixes to Antigravity remains respected.

## 1. Scope completed

- Removed the separate **New event defaults / Event Defaults** entry and sheet, including its start-time, expiry, opt-in, review, Apply and Forget controls. Profile now links to **Schedule settings**, where the existing Preferences page has a **Schedule** section with one duration input.
- The default is **60 minutes**, accepts whole numbers **15–480**, and saves through the normal **Save Preferences** button. Invalid input stays visible and produces an error without saving. Duration and existing schedule preferences share one SQLite transaction.
- Kept the account-specific, device-local storage key for guest-link/reset compatibility. Enabled, unexpired legacy durations migrate once; their fixed start time and expiry are discarded. Disabled, expired, or start-only legacy defaults return to 60 minutes. A corrupt legacy record can be repaired by a normal valid settings save.
- New manual event drafts use the duration immediately; changing a draft's start preserves its current length, including a manually edited length. The manual form keeps its existing visible initial time picker value. Saved events, explicit times/end times and non-event defaults are not rewritten by the preference.
- Local assistant event creation now asks **What time should … start?** when the start is absent, instead of using the stored start or 9 AM. Online call/Chat context instructs the model to ask or use `find_free_time` to suggest a slot, and to omit unspecified end/length fields so the phone applies the duration. The context contains generic policy, not the raw stored preference.
- Applied the duration consistently to individual event review, grouped text/structured events, and extracted multi-intent events. A grouped event whose empty start time is filled on its card derives an end time when none was supplied. Explicit lengths/end times win.
- Updated the continuity test for the approved removal of fixed starts. Updated an older call audit assertion that still expected the previously fixed compound request to be rejected, and covered its noun-form reminder clause (`and a reminder …`) so the grouped fallback retains the correct item kind and title.

## 2. Change summary

| Module | Change / reason | Evidence |
|---|---|---|
| `src/storage/personalMemoryStore.ts` | Duration-only accessors, lazy legacy normalization, owner checks, transaction-aware save, corrupt-record recovery; existing cleanup/guest transfer retained | Duration tests, legacy storage/reset suites |
| `src/ui/screens/PreferencesSettingsScreen.tsx` | One labeled duration input in Schedule; normal save, validation and atomic preference write | `eventDurationPreference.test.tsx` |
| `src/ui/screens/ProfileScreen.tsx` | Schedule settings link; remove old sheet state/entry and obsolete recovery link | Profile UI suite |
| `src/ui/components/profile/PersonalMemory.tsx` | Deleted obsolete sheet | No remaining product imports |
| Calendar hook/types/modal | Remove offers/Apply state and UI; use duration for new drafts and preserve edited spans | Profile/calendar draft regressions |
| `commandReview.ts`, grouped service, action service, Chat orchestrator | Missing-time clarification and consistent default duration across event paths | Reviewed-command, structured-review, grouped/call suites |
| `localVoiceData.ts` | Generic ask/suggest guidance for online assistant context | Duration/context regression |
| `README.md` | Document location, bounds, explicit override and persistence behavior | Source review |

Existing source files were formatted with the repository's Prettier configuration. Legacy store review/offer APIs remain only for compatibility and migration/reset tests; the old settings sheet and its runtime consumers are removed.

## 3. Tests and actual outcomes

Evidence directory: `docs/reports/evidence/event-duration-01/`. Exact long scoped commands are in `verification.json`. Counts below overlap and must not be added together.

| Check | Command/procedure | Outcome / evidence |
|---|---|---|
| Relevant settings/planner/reset suites | `npm test -- --runTestsByPath` with the nine paths in JSON | PASS: 9 suites / 158 tests, 51.433 seconds; `final-targeted.log`. |
| Grouped-event follow-up regression | Same command with duration, Phase 11 and grouped-reminder suites | PASS: 3 suites / 43 tests, 18.512 seconds; `final-regression.log`. |
| Updated old call contract | Call-flow audit, continuity and duration suites | Call-flow audit and duration passed; continuity's active-owner fixture initially failed; `updated-contract-tests.log`. Fixture was corrected without weakening owner checks. |
| Final continuity check | `npm test -- --runTestsByPath __tests__/ui/memoryGrowthUiAndContinuity.test.tsx` | PASS: 1 suite / 10 tests, 11.766 seconds; `continuity-final.log`. |
| Final duration / recovery check | `npm test -- --runTestsByPath __tests__/ui/eventDurationPreference.test.tsx` | PASS: 1 suite / 14 tests, 10.988 seconds; `duration-final.log`. |
| Required aggregate gate | `npm run preflight` | Initial attempt stopped at an unused test import, corrected. Latest attempt passed typecheck and repository lint, then encountered the stale compound-call assertion; the broad Jest run was interrupted after confirming it. That assertion was updated and passed separately. `preflight-final.log` is not a full-suite pass. |
| Final typecheck | `npm run typecheck` | PASS after final source changes; `typecheck-final.log`. |
| Final scoped lint | Exact command in JSON | PASS: `lint-final.log`; final storage/test follow-up in `duration-lint.log`. |
| Formatting | Exact command in JSON | PASS: `format.log`; follow-up storage/test files formatted after their final edit. |
| Architecture | `npm run check:architecture` | PASS: 548 modules, zero cycles/forbidden dependencies; 128 offline leaves reach no network/online module; `architecture.log`. |
| Android | From `android`: `.\gradlew.bat :app:testDebugUnitTest --console=plain` | BLOCKED before tasks by access denied to the Gradle distribution zip lock; `gradle.log`. No APK produced. |
| Phone layout, TalkBack, speech and alarm delivery | Manual checklist below | NOT RUN / HUMAN REQUIRED. |

Earlier failing test harness attempts are retained in the evidence directory; they are not reported as passes. Existing asynchronous model-state `act` warnings and mocked reminder-health failure warnings occurred in passing suites. No live cloud/provider availability is inferred from Jest.

## 4. Performance and device matrix

Benchmarks, p50/p95 latency, PSS, STT/TTS and alarm drift: NOT RUN. Benchmark JSON: N/A. `verification.json` records checks, not benchmark measurements. No device identifier/API level verified.

## 5. Reliability, privacy and scope

No new permissions, dependencies, models, backend changes, deployment or cloud keys. Duration remains device-local per account. The normal Save checks the active owner and rolls back duration/schedule preference writes together on failure. Existing Clear All Data and guest-link lifecycle are retained through the same storage key. New events still require confirmation before assistant writes; reminders are not converted to completed tasks.

Design/React source review: existing theme tokens, readable labeled numeric field, minimum 48dp height, normal save feedback, wrapping helper/error text, and no additional settings overlay. Native rendered layout, contrast measurements, large-font reflow and screen-reader behavior were not verified.

## 6. Human phone checklist — all NOT RUN

After the normal updated debug build can be installed from this checkout (`npm start`, then `npm run android` with a phone attached):

1. Open **Profile → Schedule settings → Schedule**. Expect only **Default event duration**, initially 60 or your migrated active duration. There must be no separate New event defaults entry, fixed-start field, expiry, review or Apply sheet. Save 90 and reopen; expect 90 retained.
2. Create a manual event. Expect its end to be 90 minutes after the visible start. Change the start, then manually change its end and move the start again; expect the edited span retained. Open an existing 45-minute event; expect its saved times unchanged.
3. Ask LAFINA **“Add a club meeting tomorrow”** in Chat and online/offline Call modes. Expect a time question or an explicitly offered free slot. Answer **“3 PM”**; expect a review for 3–4:30 PM. Nothing should save until confirmed.
4. Ask for an event at 3 PM **for 30 minutes**; expect 3–3:30 PM despite the 90-minute default. Check grouped events, including filling an initially missing time, and verify separate reminders retain their own times.
5. Try blank, 14, 481 and fractional duration input; expect an error and no save. Check Back without Save leaves the prior duration. Check largest Android fonts, light/dark themes and TalkBack. Switching accounts must not save a retained screen's changes to another owner.
6. Existing reminder/alarm/call hardware behavior is still a separate device check. No speech or alarm-delivery success is claimed here.

## 7. Documentation / ADRs

README and this report updated. No schema change/new ADR needed: the existing local key and reset/transfer format remain compatible. Import-cycle check passed as above.

## 8. Outstanding gates

Native build/device validation and a complete clean aggregate preflight remain outstanding. The known stale test contract and fixture were corrected and rerun successfully. No unrelated audit implementation was undertaken. Do not declare the phase passed or begin another phase on these simulated checks alone.

## 9. Review decision

- [x] Requested simplification implemented, with relevant regression coverage.
- [x] Typecheck/repository lint passed in the latest aggregate attempt; scoped formatting and architecture checked.
- [ ] Complete aggregate gate and Android verification passed.
- [ ] Human device checklist completed and acknowledged.
- [x] No commit, push or deployment; unrelated working-tree changes preserved.

STATUS: AWAITING DEVICE VALIDATION  
STOPPED — awaiting explicit human approval
