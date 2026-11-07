# AGY-PORT 03 — durable reminder delivery and identity

Implementation: CODE_COMPLETE. The cutover is active, with one engine: native Android AlarmManager, plus a JS fallback that is used only when native does not hold the work.

| Gate | Status |
|---|---|
| Automation (Jest, preflight) | PASS |
| Native unit tests and debug build | PASS |
| Instrumentation tests | Compile PASS. Never run (no device) |
| Device | NOT_RUN |
| Live service | NOT_RUN |

Run ID / UTC timestamp: agy-port-20261106 / 2026-11-05T19:2xZ–19:5xZ (worker fork)
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: `aec3703212992aaaf46443faaa812dd7ae48f4f6` plus this phase's uncommitted working tree
Phase result commit: none by the worker. The parent commits and records it.
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), current starting prompt.
Inventory areas / prerequisites: 2, 3 / AGY-PORT 01 complete (02 also complete).
Decision record: [ADR-017](../../../decisions/ADR-017-durable-reminder-delivery-identity.md).

## Outcome in plain language

Every reminder now has a local "delivery job" in the database with a generation number. The number changes whenever the alarm time, the owner or deletion changes. Each Android alarm, call notification and call screen carries the exact owner, reminder and generation it was created for.

An old alarm, a duplicate broadcast, a button on a call that has since been snoozed or edited, or another account's call can no longer acknowledge, snooze or dismiss newer work. Two reminders whose IDs share a Java hash no longer overwrite each other's alarm or notification.

Android's alarm is now the single engine. The in-app 15-second poller only rings reminders that Android does not hold, for example when registration failed.

Snooze is saved first, then registered. If Android rejects the alarm, the snooze is kept and retried instead of being refused.

On boot, only reminders at most 15 minutes late ring. Older ones are not rung, and the app marks them missed as before.

Switching account or signing out hides the previous owner's call, stops its speech, and cancels its alarms. Its reminders stay saved for its return.

The call UI, speech providers (entitled cloud speech and local `react-native-tts` fallback), permission prompts and "acknowledged is not completed" all behave as before. **Nothing here has run on a phone.**

## State machines

### Reminder status

This is unchanged AGY behavior. It is synchronized: pending, triggered, snoozed, acknowledged, missed.

```
pending ──ring──▶ triggered ──ACK──▶ acknowledged (terminal; task NOT completed)
   │                  │  └──snooze──▶ snoozed ──ring──▶ triggered …
   │                  └──auto-snooze at limit──▶ missed (terminal)
   └──>15 min overdue (rescheduler)──▶ missed
any ──delete──▶ deleted_at set (soft) / row removed (hard)
```

### Delivery job

This is new and local-only (`reminder_delivery_jobs`), derived from the reminder by triggers.

| Reminder change | Job state | Generation | Registration state |
|---|---|---|---|
| insert `pending`/`snoozed` | armed | 1 (re-insert: +1) | unregistered |
| `pending` → `triggered` | ringing | unchanged | idle |
| `trigger_at` changes (snooze, reschedule, lead time) | armed | +1 | unregistered |
| `triggered`/terminal → `pending`/`snoozed` (re-arm) | armed | +1 | unregistered |
| → `acknowledged`/`missed` | retired | unchanged | idle |
| soft delete / undelete, hard delete | retired / armed | +1 | idle / unregistered |
| `user_id` changes (guest link) | per status | +1 | per state |
| task text only (manual edit or sync update) | unchanged | unchanged | unregistered if armed; the next reconcile re-registers the same identity with the new text (review follow-up 1) |
| identical sync upsert | unchanged | unchanged | unchanged |

### Registration receipt

The receipt fields are `registration_state` and `registered_generation`:

- `unregistered` → `registered(gen)`: Android accepted it. This is not evidence of ringing.
- `unregistered` → `failed(code, attempts+1)`: retried by every reconcile. The foreground fallback may ring it meanwhile.
- `armed`, other owner, during reconcile → `suppressed`. When that owner returns, it goes back to `registered`.
- A receipt for an older generation is ignored.

### Native registry entry

This is per reminder, in `lafina_delivery_registry_v2`:

- `absent` → `registered(owner, gen, trigger)`: written by `scheduleExactAlarm`. A different identity for the same reminder is cancelled first.
- `registered`, then the broadcast for the exact identity → claimed: the entry is removed, then the notification is posted. Receipts are `fired` then `posted` (or `post_denied`).
- A broadcast for any other identity becomes `stale_ignored`. A broadcast after the claim becomes `duplicate_ignored`. An inactive owner, or a signed-out device, becomes `suppressed_inactive_owner` (entry removed, no call).
- Restore: future → re-armed. At most 15 minutes late → claimed and posted once. Older → `expired` and removed.
- Legacy cutover: an old `lafina_alarm_registry` entry becomes `registered("", 0, …)` (`legacy_adopted`), then follows the restore rule. Its old hash PendingIntent is cancelled. Reconcile later replaces it with the real owner and generation.

### Legal idempotent transitions

| Action | Outcome |
|---|---|
| Repeated ACK with the same captured generation | Second is rejected (`not_actionable`). No outbox row. Task untouched |
| Stale Snooze/ACK/Decline/auto-snooze (captured generation ≠ job generation) | Rejected (`stale_generation`). Reminder, job and outbox are rolled back together by the in-transaction guard |
| Repeated `scheduleExactAlarm` with the same identity | Replaces the same PendingIntent and registry record, so the task text is refreshed. Reconcile issues it whenever the job's receipt is not `registered` for the current generation, including after a text-only change |
| Repeated cancel, duplicate restore, re-run cutover | No-ops |

**Expiry, auto-snooze and preferences.** These are AGY behavior, unchanged:
- A call left unanswered auto-snoozes for `autoSnoozeDurationMinutes`.
- At `maxSnoozeCount` the reminder becomes missed.
- 15 minutes overdue becomes missed (rescheduler), and native boot restore uses the same 15-minute bound.

## Checklist and changes

| Requirement | Result | File/module | Notes / intentional behavior change |
|---|---|---|---|
| State machines, ACK ≠ completion | implemented | this report, ADR-017 | ACK still never touches `tasks`. Test: "acknowledges once; … never completes a task" |
| Local jobs + redacted bounded evidence, additive migration | implemented | `src/storage/deliverySchema.ts` (schema 19), `deliveryStore.ts`, `dbInit.ts` | Two tables, five indexes and triggers. Backfill. Events keep the newest 500, IDs and codes only |
| All writers keep job/outbox consistent; no echo or double enqueue | implemented | SQLite triggers | Covers manual, assistant, sync upsert, guest rekey, cascades and raw SQL. Triggers never write the outbox. Tested: one outbox row per create, none from triggers, rollback leaves the job unchanged, guest link rekeys |
| Full URI identities + tagged notifications | implemented | `LafinaDeliveryContract.kt`, `LafinaReminderModule.kt`, `deliveryStore.deliveryIdentityUri` | Constant request codes, identity in data URI. Tag `lafina-reminder:<id>`. Same vectors in JS and Kotlin. `"Aa"`/`"BB"` tested on JVM, Jest and (compiled) instrumentation |
| Captured-identity fences (broadcast/UI/voice/cleanup) | implemented | native `claim`, `callAdmission.ts`, `callDispatcher.ts`, `reminderActions.ts`, `IncomingCallScreen` | Voice ACK/snooze uses the session generation. Typed Chat commands with no identity keep the owner-only check |
| Native claims/transitions/reconcile, registration-failure recovery | implemented | `DeliveryRegistryCore`, `deliveryReconciler.ts` | Protocol: native never opens SQLite (ADR-016), so no busy retries and no schema-range concern. A newer-format registry record is left untouched |
| Queue/registration ≠ ringing | implemented | receipts `registered` vs `fired`/`posted` | `posted` means `notify` returned. Audible ring is not observable here |
| Single-scheduler cutover | implemented | native `ensureLegacyCutover`, `shouldDispatchInJs`, `rescheduleUserReminders` → reconcile | Versioned and idempotent. The poller no longer rings natively-held generations |
| Reboot/time/timezone/permission reconcile | implemented | `restoreScheduledAlarms` (bounded 15 min), JS reconcile on start/resume/sync | AGY rang every past-due alarm at boot. It now rings only those ≤15 min late |
| Account change/logout | implemented | `App.tsx` | The call is hidden and `disconnectCall()` stops speech and the active-call service. Reconcile with the new owner or `null`. Native owner marker. Jobs kept |
| Guest link rekeys metadata atomically | implemented | trigger on `user_id` | Generation +1 in the linking transaction |
| `finishIncomingCall` only clears its own pending call | implemented (bug fix) | `LafinaReminderModule.finishIncomingCall` | AGY cleared any pending call |
| Snooze commits before registration | implemented (behavior change) | `reminderActions.snoozeReminderAction`, `reminderPreferenceSync` | AGY refused a snooze when Android rejected the alarm. Now it is saved, `deliveryPending: true` is returned, and the registration is retried |
| Tests: real SQLite, rollback/reopen/schema, collisions, concurrency, snooze/edit/delete, stale actions, sync, owner switch, main-process absence | implemented | `__tests__/scheduler/agyPort03Delivery.test.ts` (34), `schemaMigrations.test.ts` (schema 19 backfill), `LafinaDeliveryContractTest.kt` (10 JVM), `LafinaDeliveryInstrumentedTest.kt` (2, not run) | "Main-process absence": the native claim/post path needs no React (pure core + receiver). Device-level proof is NOT_RUN |

## Schema notes (19)

- `reminder_delivery_jobs(reminder_id PK, user_id, generation ≥1, state ∈ armed|ringing|retired, trigger_at, registration_state ∈ unregistered|registered|failed|suppressed|idle, registered_generation, registration_error, registration_attempts, source_type ∈ task|event|time_block|NULL, source_id, created_at, updated_at)`.
- Indexes: `(user_id, state, trigger_at)` and `(user_id, source_type, source_id)`.
- `reminder_delivery_events(id, reminder_id, user_id, generation, event, code, origin ∈ js|native, occurred_at, created_at)`, with index `(reminder_id, id)` and bound trigger (500).
- Triggers:
  - `reminder_delivery_after_insert`
  - `reminder_delivery_after_update` (columns `user_id, trigger_at, status, deleted_at, task`, with a WHEN filter for real changes)
  - `reminder_delivery_after_delete`
  - `reminder_delivery_events_bound`
- Backfill: one job per existing reminder at generation 1. The fixture gives `r-a` and `r-b` armed, and `r-a-ack` and `r-a-deleted` retired. No events. Outbox unchanged.
- All 17-era rows and columns are byte-identical after upgrade (existing projection test). A forced failure at any upgrade statement leaves schema 17 intact (existing every-statement test, now also covering the step-19 statements).
- Not synced. The seven wire payloads are unchanged. Old servers see nothing new.

## Provenance and compatibility

Donor `0d4bbe39e106c29fb90792cf5d2f916b5c0d6480`, read with `git show` only. Concepts were adapted. No file was copied, and `com.lafina` names were remapped to `com.lafina.capstone`. Blob hashes are in `evidence/agy-port-20261106/phase-03/donor-provenance.txt`.

| Donor path | Blob | Use |
|---|---|---|
| `docs/decisions/ADR-001-ustp-durable-delivery.md` | `4154a50f…` | concepts |
| `src/storage/deliverySchema.ts` | `131be4a6…` | trigger approach, re-designed bump rules |
| `src/storage/deliveryStore.ts` | `d54396ff…` | `get`/`linkSource` shape |
| `android/.../LafinaDeliveryIdentity.kt` | `96121562…` | URI identity idea, re-specified encoding |
| `__tests__/scheduler/deliveryActionFences.test.ts` | `b6d7cc16…` | scenarios |
| `LafinaDeliveryStore.kt`, `LafinaDeliveryRuntime.kt`, `LafinaDeliveryProvider.kt`, `linkedReminders.ts` | hashes recorded | bodies not used (native-SQLite/provider design not adopted) |

Deliberate differences from the donor:
- No native SQLite and no `:reminders` process (ADR-016).
- No bump on `pending→triggered` or on task text, so a ringing call is not invalidated by an unrelated edit.
- No occurrence key; recurrence is not modeled by AGY reminders.
- Generation 0 for adopted legacy registrations.

Compatibility:
- Public module name `LafinaReminder` is unchanged, as are all existing method names and arities.
- `scheduleExactAlarm` accepts optional `ownerId`/`generation`.
- New methods: `listDeliveryRegistrations`, `setDeliveryOwner`, `drainDeliveryReceipts`.
- Constants `ACTION_*`, `EVENT_CALL_TRIGGER`, `LafinaReminderService.*` unchanged (existing Kotlin contract test passes).
- `applicationId com.lafina.capstone`, `versionCode 6`, `versionName 0.6.0` unchanged. Manifest unchanged.
- No new dependencies. No Kokoro.

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF01 | PASS | `phase01*`, `App.test` | PASS | Device NOT_RUN |
| PF02 | PASS | preservation PF02, `phase05` speech gating | PASS (no entitlement code touched) | Live NOT_RUN |
| PF03 | PASS | preservation PF03, new guest-link job test | PASS; jobs rekey with generation +1 | Device NOT_RUN |
| PF04 | PASS | preservation PF04 (frozen payload fields), new "sync upsert writes no outbox" test | PASS; no wire change | Live sync NOT_RUN |
| PF09 | PASS | `phase05`, `phase06`, `ttsService`, preservation PF09, `callDispatcherAndCallScreen` | PASS (speech providers untouched; call session only gained a generation) | Device speech NOT_RUN |
| PF11 | PASS | `phase03ReminderScheduler` (unchanged, 12 tests), `callDispatcherAndCallScreen`, preservation PF11 (ACK ≠ completion), `agyPort03Delivery` | PASS | Ringing, lock screen, Doze, reboot NOT_RUN |
| PF12 | PASS | `schemaMigrations` (schema 19 backfill + every-statement failure), `storageResilience` | PASS | Device NOT_RUN |
| PF13 | PASS | preservation PF13, `LafinaReminderTest.kt`, `assembleDebug` | PASS; identity and versions unchanged | Install NOT_RUN |

## Commands and evidence

Evidence directory: `evidence/agy-port-20261106/phase-03/`.

| UTC / dir | Command | Tested HEAD | Exit / result | Evidence |
|---|---|---|---|---|
| ~19:25Z / repo | `npx jest --runInBand` (before the new test file) | aec3703 + tree | 1 failed of 279: schema upgrade test saw the two new tables, as expected; updated with explicit schema-19 assertions | session output |
| ~19:28Z / repo | `npx jest __tests__/scheduler/agyPort03Delivery.test.ts` | aec3703 + tree | 33 passed | session output |
| ~19:30Z / repo | 3 mutation runs (fence generation check, poller authority, in-transaction guard), each file restored | aec3703 + tree | 5, 1 and 1 failures, as intended | `mutation-checks.log` |
| ~19:31Z / X:\android | `gradle-x.ps1 … :app:testDebugUnitTest :app:assembleDebug :app:compileDataQaAndroidTestKotlin` | aec3703 + tree | FAIL at `createBundleDataQaJsAndAssets` (Metro "Failed to get the SHA-1" under the `X:` alias; environment, not code). `compileDebugKotlin` had passed | `gradle-phase03.log` |
| 19:33Z / X:\android | `gradle-x.ps1 … :app:testDebugUnitTest :app:assembleDebug` | aec3703 + tree | exit 0, BUILD SUCCESSFUL. 24 Kotlin tests (14 existing + 10 new), 0 failures. arm64-v8a and x86_64 debug APKs | `gradle-phase03-unit-assemble.log`, `kotlin-test-results/`, `apk-hashes.txt` |
| ~19:35Z / X:\android | same + `:app:compileDataQaAndroidTestKotlin -x :app:createBundleDataQaJsAndAssets` | aec3703 + tree | FAIL at `mapDataQaSourceSetPaths` (the excluded bundle task provides generated resources) | `gradle-phase03-androidtest-compile.log` |
| 19:35Z / C:\…\android | `.\gradlew.bat :app:compileDataQaAndroidTestKotlin` from the real checkout path, JDK 17 (the JS bundle works there; native CMake is not part of this task) | aec3703 + tree | exit 0, BUILD SUCCESSFUL. The instrumentation tests compile; they were **not run** | `gradle-phase03-androidtest-compile-cpath.log` |
| ~19:40Z / repo | `npm run preflight` | aec3703 + tree | exit 0: typecheck, lint (0 warnings), 22 suites / 312 tests, architecture PASS (186 modules, 0 cycles, 0 forbidden) | `preflight.log` |
| ~19:42Z / repo | `npx jest __tests__/scheduler __tests__/storage/schemaMigrations.test.ts __tests__/preservation __tests__/App.test.tsx --runInBand --json` | aec3703 + tree | 105 passed, 0 failed, 6 suites (taken before the 34th delivery test was added) | `targeted-jest.json` |
| ~19:50Z / repo | `npm run preflight` after the reconcile-containment fix | aec3703 + final tree | exit 0: typecheck, lint, 22 suites / **313 tests**, architecture PASS (186 modules) | `preflight-final.log` |

**Test counts:**
- Jest: 279 → 313 (34 new in `agyPort03Delivery.test.ts`; `schemaMigrations` upgrade test extended, not weakened; no test removed).
- Kotlin JVM: 14 → 24.
- Prettier was run only on new files.

## Native, performance and device facts

- **APKs (debug, unsigned for distribution):** hashes are in `apk-hashes.txt`. Not installed.
- **No device or emulator** (`adb devices` was empty at Phase 00). Nothing about ringing, full-screen display, lock screen, Doze, reboot, OEM battery managers or force-stop was observed.
- **`armed` liveness.** `armed` in `listDeliveryRegistrations` is a best-effort `FLAG_NO_CREATE` PendingIntent lookup. That it reads false after a force-stop or reboot is an Android behavior assumption, not observed here.
- **Not measured:** registry and commit latency, reconcile time for many reminders, migration time.

## Review findings and decisions

Self-review by the implementer. The parent's separate reviewer has not run yet.

Found and fixed during the phase:
- `refreshPendingReminderLeadTimes` registered before saving. Under generations that would register a stale identity, so it now saves first.
- Reconcile could reject (and become an unhandled promise from `App`) when storage failed. It now returns `{error}` and cancels nothing; a test covers this.
- The initial-action dedupe key in `IncomingCallScreen` ignored the generation. It now includes it.

Intentional behavior changes:
- A snooze is kept when Android rejects the alarm.
- Boot restore rings only alarms at most 15 minutes late.
- The resume path now applies the same suppressions as the other call paths.
- A call for a missing, other-owner, signed-out or stale reminder now dismisses its own native notification instead of leaving it.

Remaining risks:
- **Native cannot see SQLite.** A job retired by a writer that does not cancel its alarm, while the app stays closed, can still post one call. JS admission dismisses it on open, but the ringtone may already have played. Reconcile runs on every start, resume and reminder sync, and the delete, ACK and snooze paths cancel directly.
- **The native owner marker** is set only by reconcile. Until the first reconcile after upgrade it is unknown, and nothing is suppressed natively. The JS fence still applies.
- **Exactly-once ringing is not guaranteed.** A crash between claim and `notify` loses that ring; the receipt shows `fired` without `posted`.
- **Downgrade:** a pre-phase build would find its old registry empty after the cutover, so it re-registers only on its own reschedule pass.
- **Title pairing is unchanged** (ACK siblings by title; task-done suppression by title). It is left for AGY-PORT 04 (exact source).

## Manual checklist still needed

Current execution status: all NOT_RUN. Use an authorized test phone, synthetic reminders and a disposable account only.

1. **Install:** the debug APK built from this tree (`app-arm64-v8a-debug.apk`, hash in `apk-hashes.txt`), over an AGY 0.6.0 debug build that has 2–3 future reminders, one due in about 3 minutes.
2. **Upgrade cutover.** Do not open the app. Wait for the 3-minute reminder.
   - Expected: one call rings (adopted legacy registration).
   - Then open the app. Expected: no second ring for it, and the other reminders still ring at their times.
3. **Locked screen:** lock the phone with a reminder due in 2 minutes. Expected: the full-screen call appears over the lock screen with ringtone and vibration. Answer, then Acknowledge. Expected: the call closes, the reminder shows acknowledged, and the task is **not** completed.
4. **Stale buttons:** let a call ring and do not answer. In the app, edit that reminder's time, or snooze it from Chat. Then tap Answer, Acknowledge or Snooze on the old call.
   - Expected: nothing changes and the call closes.
   - The edited reminder rings at its new time.
5. **Duplicate and colliding IDs:** create two reminders at the same minute. Expected: two separate notifications, and acknowledging one leaves the other.
6. **Snooze:** snooze 5 minutes. Expected: exactly one ring 5 minutes later, with no extra in-app ring while the app is open.
7. **Reboot:** set reminders at +3 minutes and +30 minutes, reboot within the first minute, and do not open the app.
   - Expected: the +3 minute rings.
   - Repeat with a reminder that falls due during a long power-off (more than 15 minutes). Expected: it does not ring at boot and shows missed after opening.
8. **Doze:** with the screen off and unplugged for 30 minutes or more (or `adb shell dumpsys deviceidle force-idle` on a test phone), a reminder should still ring near its time. Record the delay.
9. **Time and timezone:** change the timezone. Expected: the reminder still rings at the same absolute instant. Set the clock forward past a reminder by more than 15 minutes. Expected: no ring, and missed after opening.
10. **Permissions:**
    - Revoke "Alarms & reminders". Expected: the permission modal appears on open, and a reminder rings late (inexact) rather than never.
    - Revoke notifications. Expected: no call notification, and the in-app call appears when the app is open.
11. **Account switch and logout:** with a call ringing for account A, sign out, or link or switch to B.
    - Expected: the call UI closes and speech stops.
    - A's later reminders do not ring while B or nobody is signed in.
    - Signing back in as A re-arms A's future reminders.
12. **Force-stop:** force-stop the app with a reminder 3 minutes out. Expected (documented limit): it does not ring. Open the app before the time and it rings normally.
13. **Speech:** on an entitled account, answer a call online and offline. Expected: cloud speech is used online and `react-native-tts` offline, and voice "acknowledge" and "snooze 5 minutes" work as before.

## Deferrals and continuation

Deferred items:
- Exact-source linkage use (`linkSource`/`findBySource`) and removal of title pairing: AGY-PORT 04.
- Instrumentation run: needs a device.
- All device checks above.

No experiment was left active. Mutation edits were restored; `git diff` shows only the intended changes.

Next action (parent): independent review, then commit. AGY-PORT 04 is not started by this worker.

## Review follow-up

The coordinator's reviewer reported four findings, all fixed in the same working tree. Nothing was committed, and `RUN-STATE.json` and the log were not touched.

| # | Severity | Finding | Fix | Test / evidence |
|---|---|---|---|---|
| 1 | MEDIUM | A text-only sync update never reached the native alarm: reconcile's `matches()` ignored the job's `unregistered` receipt (set by the trigger on a text change), so it kept the old registration and its old task text | `matches()` now also requires `registrationState === 'registered'` and `registeredGeneration === generation`. Any other receipt (`unregistered`, `failed`, `suppressed`) re-registers through `scheduleExactAlarm`, which replaces the same identity and refreshes the text. Reconcile no longer marks a kept registration `registered` on its own say-so. Report rows for "task text only" and "repeated scheduleExactAlarm" corrected | New test "a sync text-only update reaches the native registration on the next reconcile": a syncWorker-shaped upsert changes only `task`, then reconcile calls `scheduleExactAlarm` with the new text at the same generation, and a further pass keeps it. Mutation A (receipt conditions removed) fails it |
| 2 | LOW | A double ring could occur between JS and native | (a) closed by #1. (b)/(c): the poller now reads `listDeliveryRegistrations` once per pass, only when a due reminder exists. `shouldDispatchInJs(id, snapshot)` returns false when the listing fails (native stays the engine) or when Android still holds a live (`armed`) registration for that reminder, whatever its receipt says | New test "the JS fallback does not ring what native still holds, or when native cannot be read". Mutation B fails it |
| 3 | LOW | Generation 0 (adopted legacy alarm) acted as a wildcard | `checkFence` accepts generation 0 only while the job is still at generation 1, the backfill generation of every pre-existing reminder. After any bump it is `stale_generation` for actions, admission and answer/decline | New test "generation 0 is stale once the job has moved past its first generation" covers the action and admission paths. Mutation C fails it |
| 4 | LOW | `persistPendingCall` used `apply()` | `persistPendingCall`, `consumePendingCall`'s clear, and `clearPendingCallIfOwnedBy` now use `commit()`, like the registry | Kotlin compile, unit tests and build below |

### Residual risks after follow-up

These are also stated in ADR-017.

- **Double ring.** Two windows remain:
  - Native fires a reminder in the gap between the poller's listing and its dispatch, which is under a second within one async pass.
  - A native build without `listDeliveryRegistrations` relies on receipts alone. This build has the listing.
- **Over-cautious fallback.** If the listing keeps failing while native is present, the foreground fallback stays silent and the native alarm is the only engine.
- **Owner unknown before the first reconcile after upgrade.**
  - An adopted legacy alarm (owner `""`, generation 0) can post natively whichever account is signed in, because the native owner marker is unset until JS first reconciles.
  - In JS, admission still requires the reminder row's owner to equal the active user, and generation 0 is honored only at generation 1.
  - The first app start after upgrade reconciles, which sets the marker and replaces every adopted entry with its real owner and generation.

### Follow-up commands and results

All run on HEAD `aec3703` plus the working tree after the fixes.

| Evidence written (UTC) / dir | Command | Result | Evidence |
|---|---|---|---|
| not recorded / repo | `npx jest __tests__/scheduler` | 62 passed | session output |
| 19:46:53Z / repo | Mutations A (precise re-run), B and C, each file restored and verified with `git diff`/grep | Each fails exactly its new test (1 of 37), as intended | `review-followup-mutation-checks.log`. The first A line there used a broader sed pattern; the precise re-run is appended |
| 19:48:18Z (log), 19:48:48Z (hashes) / X:\android | `gradle-x.ps1 … :app:testDebugUnitTest :app:assembleDebug --console=plain` | exit 0, BUILD SUCCESSFUL. 24 Kotlin tests, 0 failures. New debug APKs | `gradle-review-followup-unit-assemble.log`, `review-followup-kotlin-test-results/`, `review-followup-apk-hashes.txt` |
| 19:47:27Z / repo | `npx jest __tests__/scheduler __tests__/storage/schemaMigrations.test.ts __tests__/preservation __tests__/App.test.tsx --runInBand --json` | 109 passed, 0 failed, 6 suites | `review-followup-targeted-jest.json` |
| 19:48:41Z / repo | `npm run preflight` | exit 0: typecheck, lint, 22 suites / **316 tests**, architecture PASS (186 modules, 0 cycles, 0 forbidden) | `review-followup-preflight.log` |

The Jest count went from 313 to 316 (37 tests now in `agyPort03Delivery.test.ts`). The instrumentation compile was not repeated: `LafinaDeliveryInstrumentedTest.kt` did not change, though the main module did. Device and live checks remain NOT_RUN.
