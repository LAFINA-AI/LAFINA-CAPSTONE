# Agent audit 2: is LAFINA truly agentic now? (2026-11-15)

**Scope:** a read-only audit after commit `cfc5653` (ADR-033). No app code was changed for this report.
**Method:** code reading, plus temporary Jest probes of the Chat and voice pipelines (deleted afterwards). Everything was found with mocked models.
**NOT RUN:** any device, emulator, or live DeepSeek or ElevenLabs session. The online behaviour described below is inferred from the code paths, not observed.

## 1. Verdict

LAFINA is now a **bounded agent in places, and still a router in Chat.**

| Surface | Plans over tools? | Multi-step? | Uses conversation context for actions? | Verdict |
|---|---|---|---|---|
| Call Lafina (online) | Yes. 14 client tools; the model picks them. | Yes, through ElevenLabs turns. | Partly. The model's fields fill in reference-only requests, but a junk card appears first (B3). | **Agent, with friction** |
| Chat (online) | Only when the message passes the router and the planner-topic regex. | Yes, up to 4 steps. | **No.** Follow-ups like "book the first one" never reach the agent (B2). | **Router with an agent fallback** |
| Reminder call (online) | Reads, free time, snooze. | Yes. | Changes come only from the student's words, by design. | Bounded agent |
| Offline (all) | No. Fast path, SmolLM2, then a fixed handler. | No. | No. | Router, by design |

The biggest gap is the order in Chat. The deterministic router decides first, and the agent runs only for what the router leaves over. For an agent, the model should see the conversation **before** a reference-only request becomes a card.

## 2. Findings

Severity reflects user impact: **HIGH** loses data or silently breaks a core promise; **MEDIUM** gives wrong or confusing results; **LOW** is a hardening or cost item.

### B1 HIGH: a recurring reminder stops repeating after a miss

- **Where:** `src/scheduler/reminderActions.ts:312` is the only place, together with `src/ai/nlu/commandReview.ts:3683`, that calls `createNextRecurringReminder`. Both are acknowledge paths.
- **Missing from:**
  - `markMissed` (`reminderActions.ts:379`), which runs when the auto-snooze limit is reached or the student ignores the call;
  - the overdue sweep `reminderRescheduler.ts:41`, which marks reminders more than 15 minutes overdue as missed after a reboot or app start.
- **Scenario:** a "every weekday 7:00" reminder rings while the phone is in a bag and auto-snooze runs out. It is marked missed, and no next occurrence is created. **The series silently ends.** The same happens if the phone was off at 7:00.
- **Fix:** in the same transaction as the missed status, call `createNextRecurringReminder`. For the overdue sweep, skip forward to the first occurrence after now, so a phone that was off for a week doesn't create seven stale reminders. Add tests for the miss path and the sweep path.

### B2 HIGH (agentic): Chat follow-ups that point back at the conversation make junk cards

- **Where:** in `src/ai/chatOrchestrator.ts`, the router decides `reviewed_mutation` (`:524`, `:1099`) before the agent branch (`:1258`). The agent also requires `needsPlannerContext` (`PLANNER_TOPIC_RE`, `:1502`).
- **Probe results** (mocked online extraction):
  - With extraction `create_task "First one"`, the messages "book the first one", "move it to 4pm" and "add that to my calendar" all became a `reviewed_mutation` card titled "First one". The agent was called 0 times.
  - With extraction `chat`, only "add that to my calendar" reached the agent. "book the first one", "yung una na lang" and "move it to 4pm" got a plain reply with no card.
  - Offline, "book the first one" became a junk card, and the other two became clarify cards.
- **Cause:** the online extraction sees only the single message, never the history. `isReferenceTitle` (ADR-033) is used in voice but not in Chat.
- **Fix:**
  1. In Chat, when the card title from the router is reference-only (`isReferenceTitle`), or the message is a short follow-up after an assistant turn that listed options, send it to `runChatAgent` with the history instead of presenting the card.
  2. Let the agent run for follow-ups even when `PLANNER_TOPIC_RE` misses, if the previous assistant turn came from the agent.
  3. Add the eval's 10 reference cases to a Chat-path test.

### B3 MEDIUM: Call Lafina shows a junk card before the model's real one

- **Where:** in `src/ui/components/voice/VoiceConversationPanel.tsx`, `onFinalUserText` runs `reviewSpokenTurn` (`:472`) and presents its card (`:495`). It also sends a context update naming that card.
- **Scenario:** "book the first one" first shows a "First one" card and tells the model about it. When the model then calls `prepare_lafina_action` with fields, the junk card is replaced (ADR-033). That gives a visible flicker, plus one stale context update. **If the model answers without calling the tool, the junk card stays.**
- **Fix:** in `onFinalUserText`, don't present or announce a card whose title is reference-only. Keep it as `pending` so the tool intercept can still replace it. If no tool call arrives within the turn, show a clarify note ("Which one do you mean?").

### B4 MEDIUM: the Chat agent fetches handbook passages on every step

- **Where:** `chatOrchestrator.ts:1237` sets `useHandbook` true for planner questions (it only excludes small talk), and `runChatAgent` forwards it (`chatAgent.ts:180`). The backend `/chat/agent` calls `_prepare_chat`, which retrieves handbook passages when `useHandbook` is set.
- **Effect:**
  - up to 4 handbook retrievals per planner question;
  - unrelated handbook passages in a calendar conversation;
  - a risk of handbook citations on a reply about the student's own schedule.
- **Fix:** have the agent path pass `useHandbook: false`. Handbook questions are already routed away from the agent.

### B5 MEDIUM: quota use per Chat question

- **Where:** ADR-033, consequences. Each agent step is one chat request, against a limit of 10 per minute and 100 per day.
- **Effect:** a few multi-step planner questions in a minute can hit the rate limit. Then the fallback reply also fails with a quota error.
- **Fix:** count steps 2 to 4 of one agent turn as a single request on the backend: same `requestId`, charged once. If that is skipped, at least stop the loop and show a clear quota message.

### B6 LOW: grouped and memory cards from the model rely on an unknown ID, not on a rule

- **Where:**
  - `actionService.ts` builds `prepare_multi_action` items (`:699`) and `propose_follow_up_reminder` (`:751`) from the model's own arguments.
  - `prepare_memory` (`:341`) does the same for memory text.
  - `VoiceConversationPanel.tsx:737-741` lets `confirm_draft` confirm the active memory card or batch when the model passes its ID.
- **Today:** the tool replies never include those IDs (only the student-worded memory card from `onFinalUserText` announces its ID, which is correct). So the model cannot confirm them in practice.
- **Risk:** the protection depends on the ID being hidden. A future change that announces the ID would let the model confirm content it wrote itself, which contradicts the ADR-033 rule.
- **Fix:** mark model-built batches and model-prepared memory cards as suggested with `markSuggestedCard`, so `confirm_draft` refuses them explicitly. Add a test.

### B7 LOW: structured fields can't express recurrence or a reminder offset

- `prepare_lafina_action` fields have no `repeat` or `minutesBefore`. "Remind me every Monday" depends on the student's words alone.
- **Fix:** add an optional `repeat` field (`daily`, `weekdays`, `weekly:<days>`) validated against the `[RRULE:…]` subset that `createNextRecurringReminder` supports. Defer this until B1 is fixed.

### B8 LOW: Taglish offline parsing is the weakest area of the eval

- In the 2026-11-15 offline eval, Taglish scored 3/10 and reference requests 4/10.
- This is not a bug, but it is the clearest accuracy gain for guests and offline use. Phrases like "gisingin mo ako", "paalala", "bukas ng umaga" and "yung una" should get fast-path rules.

## 3. What is solid

- **Student-only confirm** for model-written cards is enforced in both `actionService` and the panel, including after a revision and when the card was already confirmed (`agentTools.test.ts`).
- **No delete through model fields.** The Chat agent refuses delete, and the backend refuses confirm, cancel and revise tools in Chat.
- **Chat agent failures fall back** to the ordinary reply and cancel the card. This includes a backend without the route.
- **Fencing:** native delivery uses a generation fence (`LafinaDeliveryContract`), and the reminder call's snooze goes through the same fenced path.

## 4. Recommended order

1. **B1** (data correctness). It is small and safe.
2. **B2 + B3** (the agentic gap). Both use the existing `isReferenceTitle` and `runChatAgent`.
3. **B4 + B5** (cost). B5 needs a small backend PR.
4. **B6, B7, B8** when convenient.

The alarm feature (`docs/plans/alarm-feature-plan.md`) should start after B1, because both touch the reminder scheduling code.
