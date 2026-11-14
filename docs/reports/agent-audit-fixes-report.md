# Lafina Agent Audit Fixes / Completion Report

**Branch / commit SHA:** `Lem-branch`. The fixes are committed as `dbcc923`, with the follow-up in §9 on top. Backend PR: [LAFINA-AI/LAFINA-backend#4](https://github.com/LAFINA-AI/LAFINA-backend/pull/4).  
**Date:** 2026-11-13 (follow-up 2026-11-14)  
**Device(s) available:** NONE. No phone or emulator was used for this work.  
**Status:** `AWAITING DEVICE VALIDATION`  
**Request:** "fix all the bugs you found on the audit" (Lafina Agent Audit, branch `Lem-branch`, commit `24c39b1`, 2026-11-13)

## 1. Scope completed

| # | Severity | Finding | Result |
|---|---|---|---|
| 1 | High | Lafina Call tool bridge is EXTERNAL_BLOCKED | **Fixed in code, deploy pending.** The bridge was already merged in the backend (PR #3), but its tool contract had drifted and the voice route dropped the app's student context. Backend PR #4 fixes both (§9). After merge, it needs a Vercel deploy and, ideally, the ElevenLabs agent re-provisioned. |
| 2 | High | End after Answer runs `declineCall` and auto-snoozes | **Fixed.** New `endAnsweredCall`. An answered call that is hung up is now **acknowledged** (received, not task completed). A call that was never answered still declines with the snooze policy. Android Back on an answered call does the same. |
| 3 | High | Online reminder call makes a voice card with no UI | **Fixed.** `IncomingCallScreen` shows the voice review card inside `CallAnsweredView` with Confirm, Cancel and Edit. Saying "confirm" or "cancel" answers it. Any card left open when the call ends is discarded, never applied. |
| 4 | High | Planning questions become junk tasks | **Fixed.** "plan my week…" and "help me plan…" are now conversation. "find a free slot tomorrow for 2 hours" lists the real free windows (7 AM–10 PM, after now when the day is today) and writes nothing. |
| 5 | High | Chat conflict reply asks a question nothing answers | **Fixed.** Step 4 is removed from `chatOrchestrator`. The overlap is shown as a warning on the card, and the free times are one-tap buttons. This covers the chat `CommandReviewCard` and the Call Lafina `CalendarDraftCard`. Each button moves the draft, and it is still saved only on Confirm. |
| 6 | Med | Times that have already passed are accepted | **Fixed.** A bare hour that has already passed today becomes the evening if that is still ahead ("later at 7" at 10 AM is 7 PM). Undated items with a passed time move to tomorrow, and the card says so. Alarms and "wake me up" keep the morning reading. |
| 7 | Med | No Taglish offline | **Fixed (common phrases).** Covers paalala, dagdag/ilagay sa todo, "ano schedule ko", mag-aral, bumili ng, bukas, mamaya, ngayon, sa Lunes…Linggo, "ng 7pm" and alas. Particles are stripped. The original wording is kept as `rawTranscript`. |
| 8 | Med | Missing commands | **Fixed:**<br>• notes search ("what did I write about X", "search my notes for X")<br>• add to an existing checklist ("add rice to my groceries checklist")<br>• a priority no-op message<br>• bulk delete with a preview card (completed tasks; one day's events, blocks or classes; max 50)<br>• "remind me 30 minutes before my X", linked to the item so deleting the item removes the reminder<br>• next class / item / task<br>• overdue tasks |
| 9 | Med | Wrong titles, durations and repeat days | **Fixed.**<br>• "block out 2 hours" sets a 120-minute block with the title "Thesis".<br>• "every monday and wednesday" becomes `BYDAY=MO,WE`.<br>• Alarm titles are "Alarm".<br>• "on my calendar" is stripped from titles.<br>• Exams, quizzes, appointments, meetings, interviews, consultations and similar items with a time become calendar **events**, with a reminder at the student's lead time (default 15 min). |
| 10 | Med | No Undo for immediate actions | **Fixed.**<br>• "Marked “X” done · Undo" snackbar in Chat and Call Lafina, also for reopen, pin/unpin and checklist edits.<br>• Valid for 2 minutes and once only.<br>• Refused if the item changed since, for another account, or after the review session ends.<br>• Acknowledge and snooze are not undoable. |
| 11 | Med | Online context capped, with no current time | **Fixed.** The planner snapshot now includes "now HH:MM", a per-day summary for 7 days (up to 12 items a day, 60 in total) and overdue tasks. |
| 12 | Med | Online reminder call announces the reminder twice | **Fixed.** The reminder now goes to the agent as a silent `contextual_update` that says it was already read aloud. No fabricated user turn. |
| 13 | Low | "add it" creates "It"; "yes" offline says "needs Online Mode" | **Fixed.** Vague titles ask which item. "yes" or "cancel" with nothing pending, offline, says nothing is waiting. |
| 14 | Low | Cards expire after 5 minutes and are lost on restart | **Partly fixed.** TTL is now 30 minutes and the card footnote is updated. Cards are still cleared on app restart by design (ADR-018 session check). Persisting them is an owner decision. |
| 15 | Low | Online chat sends the planner on every turn | **Fixed (send only what is needed).** The snapshot is attached only to questions about the student's own schedule, tasks, notes or time (`needsPlannerContext`). The Call Lafina and reminder-call consent texts now say a 7-day summary, notes and memories are shared when a call starts. |
| 16 | Low | Per-reminder "Call me / Notify only" | **Fixed (local-only).** See §9 and ADR-032. |

## 2. Change summary

| File/module | Change |
|---|---|
| `src/ai/nlu/fastPathParser.ts` | Taglish translation; multi-day `BYDAY`; evening shift for passed bare hours (and morning for alarms); bare durations; event nouns; new branches for planning, free slots, overdue, next items, notes search, bulk delete, checklist append, lead-time reminders; title clean-up. |
| `src/ai/nlu/types.ts` | `bulkScope`, `leadMinutes` on intents. |
| `src/ai/nlu/commandReview.ts` | 30-min TTL; `resolveUndatedTime`; event reminders; `create_linked_reminder`; `delete_many` with preview and revision checks; vague-title refusal; priority no-op; conflicts on chat and voice cards; Undo store (`undoLowRiskCommand`). |
| `src/ai/nlu/actionExecutor.ts` | `answerPlannerLookup` for overdue, free slots and next class/item/task. |
| `src/ai/nlu/groundedVoiceDraft.ts` | Call Lafina accepts a time without a date (the card resolves it, as Chat does). |
| `src/ai/chatOrchestrator.ts` | Conflict question removed; nothing-pending replies; planner context gated and time-stamped; `undoAction`. |
| `src/cloud/voiceConversation/localVoiceData.ts` | `buildStudentVoiceContext(userId, {referenceDate})` with now, a per-day summary and overdue tasks. |
| `src/cloud/voiceConversation/controller.ts` | `sendReminderContext` sends a silent contextual update. |
| `src/scheduler/callDispatcher.ts`, `index.ts` | `endAnsweredCall`. |
| `src/ui/screens/IncomingCallScreen.tsx`, `components/call/CallAnsweredView.tsx` | End/Back after Answer acknowledges; voice review card in the call; consent text. |
| `src/ui/components/chat/CommandReviewCard.tsx`, `callLafina/cards/CalendarDraftCard.tsx`, `callLafina/ActionCardHost.tsx` | One-tap alternative times; 30-minute footnote. |
| `src/ui/components/chat/UndoSnackbar.tsx` (new), `screens/ChatScreen.tsx`, `voice/VoiceConversationPanel.tsx` | Undo snackbar; consent text. |
| `__tests__/ai/agentAuditFixes.test.ts` (new) | 30 regression tests, one block per finding. |
| Existing tests | Updated where the audited behaviour changed: conflict step, appointment/meeting as event, evening shift, End → acknowledge, silent reminder context, consent text. `agyPort06PlannerReplies` now pins its clock to its reference date; it would otherwise fail on any real date after 2026-11-13 09:00. |

## 3. Tests and real outcomes

| Check | Command | Result |
|---|---|---|
| Typecheck, lint, Jest, architecture | `npm run preflight` | PASS: 119/119 suites, 1634 passed, 1 skipped (pre-existing skip); 318 modules, 0 cycles, 0 forbidden dependencies |
| Android build | `android\gradlew.bat :app:compileDebugKotlin` | PASS: BUILD SUCCESSFUL in 1m 30s (no Kotlin/native files changed; a full APK was not built) |
| Device manual | §6 | NOT RUN (no device) |
| Online (ElevenLabs/DeepSeek) | n/a | NOT RUN (no signed-in device session) |

## 4. Performance and device matrix

N/A. No benchmarks were run.

## 5. Reliability, privacy, permissions

- Every new write path goes through the existing review/confirm transaction: revision checks, `sync_outbox` in the same transaction, and reminders scheduled after commit. Undo uses the same transaction and refuses stale items.
- Hanging up an answered call marks the reminder **acknowledged** (received). It does not complete the task.
- The consent texts changed. In the follow-up (§9), the keys were raised to `voiceConversation.consent.v2` and `voiceConversation.reminderConsent.v2`, so every student sees the new wording once.

## 6. Human phone verification

See the checklist in the chat handoff.

## 7. Docs/ADRs changed

This report only. The architecture check passed.

## 8. Open blockers and recommended next steps (as of 2026-11-13; see §9 for what changed)

1. **#1 Call tool bridge.** Blocked on the backend owner, who needs to enable the tool bridge in `LAFINA-backend` and the ElevenLabs agent.
2. **#16 Call me / Notify only.** This needs:
   - a field on `DeliveryRegistration` in `LafinaReminderModule`, with a registry migration;
   - a non-full-screen notification path with Acknowledge/Snooze actions;
   - a choice on the review card.

   If the choice should sync, the `reminder` entity in `LAFINA-backend` must change too. Deciding whether it is local-only or synced is an owner call, and the native path needs device testing.
3. **#14** Optionally persist open review cards across restarts. This would revise ADR-018.
4. Bump the consent key versions if existing students must see the new wording.

## 9. Follow-up, 2026-11-14

Owner: "proceed and do everything except the physical tests. also you can just pr the backend … do everything you think is best".

### Commits

| Commit | Change |
|---|---|
| `dbcc923` | The audit fixes above (§1–§2). |
| `7f9becf` | Consent keys raised to v2; reminder-call consent also records the data consent; reminder context sent at call start; tool contract regenerated. |
| *(next commit)* | #16 "Call me / Notify only" (ADR-032), plus this report. |
| Backend `c362992`, [PR #4](https://github.com/LAFINA-AI/LAFINA-backend/pull/4) | Voice turns get the phone's student context; tool contract synced. |

### What was found and fixed

1. **#1 Call tool bridge.** Backend PR #3 had already merged the bridge (allowlist, DeepSeek tool streaming, continuations, provisioning script). Two problems remained:
   - **Contract drift.** The app's `read_lafina_data` had gained the `todos` kind, and its descriptions mention To-Dos and completion/edit/deletion. The backend contract had neither. PR #4 syncs it. All 12 tools now match between the app, `tool-contract.json` and the backend. The contract check now ignores CRLF/LF differences, which made it fail on Windows checkouts.
   - **Student context never reached DeepSeek.** The app sends the 7-day planner, To-Do, notes and memories summary as `custom_llm_extra_body.student_context`. `/v1/ai/voice/llm/chat/completions` read only the grant from it. As a result:
     - the #11 context improvements had no effect in Call Lafina;
     - the #12 silent reminder context (a `contextual_update`) was also lost, because the route keeps only user and assistant turns.

     PR #4 passes the summary to DeepSeek as a fenced, bounded data note: `VOICE_CONVERSATION_MAX_STUDENT_CONTEXT_CHARS`, default 12000. The app now puts the answered reminder in that start-of-call context (`reminderCallContext`) instead of sending a mid-call update.
2. **Consent keys bumped** to v2 (see §5).
3. **Reminder-call consent gap.** The online reminder conversation also checks `voiceConversation.directDataConsent.v1`, but the reminder dialog never set it. A student who had only accepted the reminder dialog got `consent_required`. Accepting the dialog, which discloses the same data, now records it, and its absence re-asks.
4. **#16 Call me / Notify only**, local-only (ADR-032):
   - schema 26 table;
   - card toggle in Chat, the offline voice sheet and the reminder call;
   - "notify me…" and "don't call me" phrasing;
   - native style field, backward compatible;
   - a normal notification with Acknowledge and Snooze 10 min;
   - fenced actions;
   - an in-app alert fallback;
   - recurrences keep the style.

### Checks

| Check | Command | Result |
|---|---|---|
| Typecheck, lint, Jest, architecture | `npm run preflight` | PASS: 122/122 suites, 1660 passed, 1 skipped (pre-existing); 321 modules, 0 cycles, 0 forbidden dependencies |
| Kotlin | `gradlew :app:compileDebugKotlin` | PASS |
| JVM | `gradlew :app:testDebugUnitTest --tests LafinaDeliveryContractTest --tests LafinaReminderTest` | PASS: 18 + 3 tests, including 3 new style tests |
| Backend | `pytest` (Python 3.14 venv) | PASS: 266 tests, including 5 new |
| Backend lint | `ruff check app tests scripts` | 249 findings before and after; none new |
| Tool contract | `node backend_integration/call_lafina_v2/generate-contract.cjs --check` | PASS |
| Device / online / APK | — | **NOT RUN** |

### Still open

- **Backend PR #4** needs review and merge; Vercel then deploys `main`. Nobody here has Vercel dashboard access, so check the deploy from GitHub's deployment status.
- **Re-provision the ElevenLabs agent** with `python -m scripts.provision_voice_agent … --apply --update`, then `--check`. This needs the ElevenLabs key. Without it, DeepSeek still gets the new schema, because the backend swaps in its own copy by name.
- **Device checks** for everything in §6 and the follow-up checklist in the chat handoff.
- **#14** is unchanged (by design, ADR-018).
