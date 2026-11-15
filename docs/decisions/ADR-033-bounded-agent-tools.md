# ADR-033 — A bounded agent: tool use in Chat and Call Lafina

**Status:** accepted (owner: "proceed, fix all", 2026-11-15, after the agent-capability analysis)
**Date:** 2026-11-15
**Scope:** agent capability follow-up to the agent audit (ADR-032 and the audit fixes report §9)
**Review owner:** human developer

## Context / problem

The owner asked whether LAFINA is a true AI agent that can use the app's features. The analysis found:

- **Chat** was a router, not an agent. Each message went through a fixed pipeline: regex fast path, then SmolLM2, then (online) one DeepSeek JSON extraction, then a fixed handler. When DeepSeek chatted, it got a static planner snapshot and no tools, so it could not look things up or take a second step.
- **Call Lafina** already chooses among 12 client tools, but the app ignores the model's arguments on purpose: `prepare_lafina_action` re-reads the student's own last sentence. That guard (the model cannot invent a request) also means requests that point back at the conversation fail. The test suite showed that "book the first one" after a free-time answer became a task called "First one".
- The phone's mid-call status updates ("a review card is on screen, Card ID …") never reached the voice model. The backend keeps only user and assistant turns.
- The **online reminder call** passed no tool handler, so every tool the model tried failed. Its start-of-call context told the model to help with snoozing, yet no snooze tool existed.
- There was no tool for free time, even though the on-device lookup existed.

## Decision

LAFINA stays a **bounded** agent. Online, a model plans over a fixed set of app tools. Every change shows a card, and **only the student** confirms a card the model described. AGENTS.md forbids a general-purpose autonomous agent.

1. **Structured fields for `prepare_lafina_action`.** Optional fields are added: `action`, `title`, `date`, `time`, `endTime`, `durationMinutes`, `priority`, `newTitle`, `details`, `deliveryStyle`.
   - Actions: create (task, event, time block, reminder, note), update (task, time block, note), complete and reopen. **There is no delete action:** removing data needs the student's own words.
   - The fields are validated like any tool payload, including the prompt-injection patterns.
   - **The student's words still come first.** The fields are used only when those words produced nothing, or a card whose title is only a reference ("First one", "That", "2pm slot", "yung una"). A card with real content from the student ("Review chemistry") is never replaced.
2. **Suggested cards are confirmed only by the student.** A card built from the model's fields is marked as suggested, and a revision of it stays suggested.
   - `confirm_draft` for it is refused with a message telling the model to ask the student.
   - The student confirms by saying yes (read on the device) or tapping Confirm.
   - If the student already confirmed, the model is told so truthfully.
3. **New tools:**
   - `find_free_time` is read-only and uses the on-device free-slot lookup, which is now exported as `answerPlannerLookup` and never goes through the unreviewed executor.
   - `snooze_reminder` works only during a reminder call, through that call's own fenced snooze. Elsewhere it changes nothing.
4. **Tools in the online reminder call.** The model may read (calendar, To-Dos, notes, memories, free time) and snooze. Planner changes still come only from the student's words, through the call screen's own review card.
5. **Chat agent.** For online questions about the student's own plans (the existing planner-topic test, never small talk, handbook or study questions), Chat runs a tool loop through the new `POST /v1/ai/chat/agent`.
   - The phone runs the tools on local data.
   - At most 4 model steps and 5 calls per step.
   - Tools: reads, `find_free_time`, and `prepare_lafina_action` (one card per reply).
   - No confirm, cancel or revise tool is offered in Chat. The server also refuses them.
   - If any step fails, a prepared card is cancelled and Chat falls back to its ordinary online reply. This includes a server without the route yet.
6. **Mid-call updates reach the voice model** (backend PR #5). System messages that arrive after the conversation started become a bounded, fenced `<app_update>` note (latest three). Each turn logs role counts only, so the first real call can confirm how ElevenLabs delivers them.
7. **Eval set.** 52 hand-written English and Taglish requests with the expected outcome (`__tests__/fixtures/agentEvalCases.ts`), scored by `__tests__/evaluation/agentEval.test.ts`.

## Consequences

- **Quota:** each Chat agent step counts as one chat request (10 per minute, 100 per day). A planner question can use up to four.
- **Re-provisioning required:** the ElevenLabs agent must be re-provisioned before Call Lafina can use `find_free_time` and `snooze_reminder`, and possibly before it forwards the new prepare fields. Until then, Call Lafina behaves as before.
- **Friction:** a suggested card needs the student's own yes, so the model cannot say "saved" by itself. This is intended.
- **Eval result** (offline pipeline, 2026-11-15): 36/52.
  - Create 10/10, conversation 6/6, read 7/8, edit 6/8.
  - **Taglish 3/10** and **reference 4/10** are the weak spots.
  - With the model's fields, all 8 reference cases with fields become the right change.
  - Offline Taglish parsing is the clearest next improvement.
  - Online DeepSeek accuracy was not measured: that needs a signed-in run.

## Verification

- Jest:
  - `__tests__/ai/agentTools.test.ts`: fields, the reference rule, suggested-card confirm, revision, free time, snooze;
  - `__tests__/ai/chatAgent.test.ts`: multi-step plan, no delete, one card, step cap, fallback, cancel on failure;
  - `__tests__/scheduler/onlineReminderConversation.test.tsx`: reminder-call tools;
  - `__tests__/evaluation/agentEval.test.ts`, with evidence in `docs/reports/agent-eval-offline-2026-11-15.json`.
- Backend: `tests/test_chat_agent.py` and the mid-call update tests (PR #5).
- **NOT RUN:** any device, emulator or live ElevenLabs/DeepSeek run; the agent re-provisioning; online accuracy.
