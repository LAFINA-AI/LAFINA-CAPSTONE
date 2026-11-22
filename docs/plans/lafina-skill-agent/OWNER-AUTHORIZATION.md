# Owner authorization: LAFINA skill handoff and call fixes (2026-11-22)

This file records the owner's decisions for the skill handoff task (SKILL-00 to SKILL-07) and the call fixes (CALLFIX-01 to CALLFIX-03), ADR-041.

## What the owner said

1. "i want lafina to be able to control the skills inside the app … i can call lafina and ask to start an pomodoro then lafina will then say something like "got it, opening pomodoro" the call will end then the pomodoro skills will start … make a flashcards or quiz … the call automatically ends and the flashcard skill or quiz skill opens then the user can upload its materials … investigate and plan this."
2. "when lafina shows a card and the user says save it - it doesnt get saved or the user have to say save or yes multiple times … add an animation to the save button like its been clicked then the card closes. also if the user says goodbye or thankyou … the lafina call should automatically closes. plan and research this and add it to the plan"
3. After the plan (`PLAN.md`): "proceed and fix everything. report back to me when everything is finished"

## Decisions taken (the plan's recommended defaults)

The owner said to proceed without choosing among the plan's open decisions, so the recommended default was used for each:

1. **Pomodoro auto-starts** when the student says "start" (the page shows Pause; nothing else starts by itself).
2. **Chat uses a tap button** ("Open Flashcards"); Chat never opens a skill by itself.
3. **Backend change is delivered as a handoff only.** No `LAFINA-backend` checkout exists on this machine, so the regenerated tool contract and prompt text are in this repo (`backend_integration/`). Nothing was pushed or deployed.
4. **A skill the model offers by itself is a button only.** The call opens a skill without a tap only when the student's own words ask for it (checked on the device).
5. **"Bye" with an unsaved card asks once** before ending (and "open X" with an unsaved card asks the same way).
6. **"Thank you" ends the call only when nothing is pending** (no open card, no save running). The plan's extra "LAFINA's last line was not a question" condition was dropped (see PLAN.md §14).

## Scope limits

- No study tool generates, records or saves by itself because of a launch. Meetings opens the recorder; the student taps Record.
- No wake word, no always-on mic, no new Android permission, no backend write or deploy.
- Everything else in `AGENTS.md` still applies.
