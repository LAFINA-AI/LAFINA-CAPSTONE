# Codex audit remediation — A1–A4 (before AGY-PORT 11 closes)

Implementation: CODE_COMPLETE for A1–A3. A4: PARTIAL (narrowed and pinned; a durable guarantee is assessed, not built).

| Gate | Status |
|---|---|
| Automation (typecheck, lint, Jest, architecture) | PASS. `preflight-1.log` (568 + 1 skipped) ran before the strengthened tests. The final run is Phase 11 `preflight-2.log` (580 + 1 skipped), on the combined working tree that also holds uncommitted Phase 11/12 files. Phase 11 `preflight-1.log` failed lint on a Phase 12 test comment; it is kept. |
| Mutation checks | Run 1: 3 survived (tests strengthened). Run 2: 12/12 killed, all restored |
| Native unit tests / build | No native or Gradle change in this unit. The JS is bundled by the Phase 11 dataQa build |
| Device | NOT_RUN |
| Live service | NOT_RUN (no cloud call in scope) |

| Item | Value |
|---|---|
| Run ID | agy-port-20261106 |
| Audit | [codex-audit-20261106-phase11.md](codex-audit-20261106-phase11.md) (A1–A5) |
| Base HEAD | `c85b0238429b264819f1d959d30e02bdbf0f26a6` plus the uncommitted Phase 11 tooling |
| Result commit | Recorded in RUN-STATE.json and the log (no self-referential SHA) |
| Review | Parent self-review only. This is not an independent review. |
| Decision records | [ADR-023](../../../decisions/ADR-023-durable-reminder-invalidation-assessment.md) (proposed) |

## Outcome in plain language

**A1. Offline speech is used only when Android positively reports an installed, offline English voice.**

- Before this change, the automatic voice accepted voices with missing metadata. If the voice list failed, or selecting a voice failed, the engine still reported "ready" and spoke with whatever its default was.
- Now `initTts()` returns true only when:
  - the engine started;
  - a voice with `notInstalled === false` and `networkConnectionRequired === false` was listed;
  - the engine accepted that voice.
- This applies to every playback path: reminder calls, Chat, cloud-speech fallback and Preview. Any other state reports unavailable, and callers already fall back to text.
- On every configure and readiness pass, the voice is checked again against a fresh list:
  - a removed voice stops being used;
  - Reset and a missing explicit voice return to the automatic voice only if it is still positively offline;
  - a later call recovers once a voice is installed.
- The Offline Voice sheet gains a fourth English state, "listed but could not be selected". It now also shows "Offline speech is off" whenever English is not ready, and disables Preview in that state.
- **What did not change:**
  - react-native-tts stays.
  - With a confirmed voice and no saved choice, behavior is as before: the automatic voice speaks and no rate or pitch call is made.
  - The cloud entitlement and fallback policy are unchanged.
  - No Kokoro.

**A2. A Calendar read failure is never shown as an empty schedule.**

- Each read part records its own failure, tied to the account that was open: time blocks, tasks/events, and overdue.
- The Calendar shows a warning with Retry (`calendar-read-error`, `calendar-read-retry`):
  - **No good read yet:** the warning says "this does not mean your calendar is empty".
  - **After an earlier good read for the same account:** that view stays (filtered again for the selected date), and the warning says it may be out of date.
- After an account switch, a failed read never shows the previous account's items.

**A3. Clear All Data now also forgets saved event defaults.**

- `personalMemoryStore.clearForDataReset` is owner-checked. It:
  - replaces even an unreadable value;
  - writes a disabled revision fence, so a sheet, review or offer from before the reset cannot save or apply the old values;
  - drops that owner's pending reviews.
- If the forget fails, the completion message says so and points to Event Defaults.
- **Product-scope decision, stated rather than assumed:** device settings are kept, specifically the offline voice choice, theme and time format. The confirmation dialog says so, and Offline Voice keeps its own Reset.

**A4. The background-reconcile stale-alert window is narrowed and pinned, not closed.**

- Every native call inside a reconcile pass is now bounded at 5 s (`NATIVE_CALL_TIMEOUT_MS`). Before this, a single hung bridge call blocked every later serialized pass in the process, including the background-entry pass.
- Fault-injection tests pin the residual behavior:
  - A pass cut off before it cancels leaves Android holding retired work.
  - JS admission dismisses the call when the app opens.
  - The next pass removes the registration.
  - A pass interrupted between cancels keeps what it did and retries the rest.
- The earlier remediation report's headline is corrected in place, with a dated note; its original text is kept.
- ADR-023 assesses the smallest durable protocol, a native invalidation marker. It is not implemented: it needs Kotlin and kill-the-app device tests.

**A5 (tracking).** Handled in RUN-STATE/the log, the Phase 11 report and the Phase 13 summary:
- Phase 11 attempt 3 is recorded as INTERRUPTED/NO_VERDICT.
- All later evidence uses fresh, exclusive file names.
- Self-reviews are labeled as such.

## Changes

| File | Change |
|---|---|
| `src/ai/tts/ttsService.ts` | Positive eligibility, `offlineVoiceId`, engine start separated from offline readiness, re-check and recovery |
| `src/ui/components/profile/OfflineVoice.tsx` | `unconfirmed` label; Preview disabled unless English is ready; "offline speech is off" note |
| `src/ui/screens/calendar/hooks/useCalendarData.ts` | Per-part, owner-bound read failures; last good read per owner; `readError`, `retryRead` |
| `src/ui/screens/calendar/CalendarScreen.tsx` | Read-error warning with Retry |
| `src/storage/personalMemoryStore.ts` | `clearForDataReset` |
| `src/ui/screens/ProfileScreen.tsx` | Clear All Data forgets event defaults, with explicit scope text |
| `src/scheduler/deliveryReconciler.ts`, `src/scheduler/index.ts` | Bounded native calls in a pass; export `NATIVE_CALL_TIMEOUT_MS` |
| `__tests__/ai/auditA1OfflineEligibility.test.ts` | 11 tests |
| `__tests__/ui/auditA2CalendarReadErrors.test.tsx` | 6 tests |
| `__tests__/ui/auditA3ClearAllData.test.tsx` | 5 tests |
| `__tests__/scheduler/auditA4InterruptedReconcile.test.ts` | 3 tests |
| `docs/decisions/ADR-023-…` | Proposed durable-invalidation assessment |
| `reports/pre-advance-remediation.md` | Dated correction note above the original headline |

No existing test was changed. The suites for Phase 05 cloud speech, Phase 10 speech, Phase 02 Calendar, Phase 03 delivery and preservation pass unmodified.

## Preserved AGY features

| PF | Evidence | Result |
|---|---|---|
| PF02 cloud speech | `phase05TtsAndCloudSpeech` unmodified; entitlement and fallback code untouched | PASS |
| PF09/PF10 local speech | `agyPort10Speech`, `agyPort10OfflineVoice`, `ttsService` unmodified | PASS. Intentional change: no confirmed offline voice now means text instead of an unverified engine default |
| PF03–PF05 calendar and reminders | `phase02CalendarAndNotesScreens`, `agyPort03Delivery`, `agyPort06*` unmodified | PASS |
| All | Full preflight | PASS |

## Commands and evidence

All paths are under `evidence/agy-port-20261106/audit-remediation/`:

- `npm run preflight` → `preflight-1.log`: 42 suites, 568 passed and 1 skipped (the opt-in `AGY_MEASURE` timing test). The architecture check covers 215 modules.
- `python mutate-audit.py mutation-checks-1.log`:
  - M4, M6 and M10 survived.
  - M4: no test of a removed automatic voice without an explicit choice.
  - M6: the injected failure also broke the blocks read.
  - M10: deleting the review masked the revision fence.
  - The tests were strengthened. The log is kept.
- `python mutate-audit.py mutation-checks-2.log`: 12/12 killed, every file restored byte-identical (sha256).

## Manual checklist still needed (NOT_RUN)

1. **Offline voice states.**
   - In airplane mode, with an installed offline English voice: a reminder call speaks, and Profile → Offline Voice shows "Offline English voice installed".
   - Remove or disable that voice, then tap Refresh. The sheet should show offline speech is off, Preview should be disabled, and a reminder call should show text only.
   - Reinstall the voice. Speech should return without restarting the app.
2. **Calendar read error.** Hard to force on a device: if storage is locked, the Calendar shows the warning and Retry, and never an empty week.
3. **Clear All Data.**
   - Save Event Defaults, then run Clear All Data. A new event draft offers no defaults.
   - The offline voice choice is kept.
4. **App killed during background reconcile** (ADR-023 prerequisites):
   - Retire a reminder through sync, background the app, force-stop it immediately and wait for the old time. Record whether it rings, then open the app and check that it is dismissed.
   - Expected: it may ring. This is the documented residual.
   - **Correction, 2026-11-06 (final audit F4).** Force Stop is the wrong tool for this check. Android 15 cancels a force-stopped package's pending intents, alarms included, so this procedure tests Android's stopped state, not the residual. Use the separate procedures R1 (process death), R2 (Force Stop) and R3 (relaunch recovery) in [MANUAL-QA.md](MANUAL-QA.md) M18. The original item is kept above as written. It was never run, so no result changes.

## Deferrals

- **A4 durable invalidation** (ADR-023 option C): needs Kotlin, a shared contract test and device kill tests.
- **Device and live checks:** NOT_RUN.
