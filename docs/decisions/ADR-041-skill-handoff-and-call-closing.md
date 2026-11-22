# ADR-041 — Skill handoff from calls and Chat, spoken save and call closing

**Status:** accepted (owner: "proceed and fix everything", 2026-11-22)
**Date:** 2026-11-22
**Phase:** SKILL-00..07, CALLFIX-01..03
**Review owner:** human developer

## Context / problem

1. LAFINA could act only on notes, alarms and to-dos. Students want to say "start a pomodoro" or "make flashcards" and land on that skill.
2. In a call, "yes save it" often did not save, or needed several tries (two-key gate plus a narrow approval classifier; see PLAN.md §11).
3. A saved card stayed on screen with no feedback, and "bye" or "thank you" did not end the call.

## Decision

**Skill handoff.**

- `src/skills/skillLaunch.ts` is a fixed allowlist of launchable skills and actions. `validateSkillLaunch` refuses anything unknown, falls back to `open` for an action a skill lacks, caps counts at 30, and strips markup from topics (200 characters).
- `src/ai/skills/skillIntent.ts` (`detectSkillIntent`) reads the student's words on the device, with no model. It returns a launch, a status question or a Pomodoro pause/resume. It needs an action word and a skill word together, so "I have a quiz tomorrow" opens nothing.
- `src/ai/skills/skillHandoff.ts`:
  - matches a named lesson only when exactly one title fits;
  - writes LAFINA's one line;
  - reads Pomodoro, flashcards due, GWA and the last quiz score (read only);
  - pauses or resumes the Pomodoro through `src/skills/pomodoroService.ts`. The Pomodoro page now uses the same service.
- **Call.** A launch sets a pending skill and calls `beginClosing`.
  - Banner: "Opening X…" with a **Stay on call** button.
  - LAFINA says the line: offline through TTS; online the agent is told to say only that line.
  - The call ends, then `onNavigate({screen: 'notes', skill})`. App does not minimize the call for a skill.
  - An unsaved card is asked about first.
  - The online tool `open_lafina_skill` opens a skill only when the student's last words asked for that same skill. Otherwise it shows a button.
- **Chat.** `chatOrchestrator` answers skill requests locally, with no model, and returns `skillLaunch`. ChatScreen shows an **Open X** button and a **Not now** button.
- **Arrival.** `SkillsScreen` routes by `openRequest.skill`, and each page handles a launch id once:
  - Pomodoro starts a focus session or break, unless one is already running;
  - Flashcards opens the AI maker;
  - Quiz sets the count and asks for material;
  - Create with LAFINA pre-fills the topic.

  None of them generate anything until the student taps.

**Call fixes (CALLFIX-01..03).**

- **Spoken save.**
  - `turnPolicy.hasDraftApproval` approves on clause-based save commands, and a bare "yes/okay/sige" counts right after a card was shown, unless LAFINA asked something else.
  - `confirm_draft` also accepts a plain approval spoken within 20 s about that card.
  - `useCommandReview.confirm` shares an in-flight save instead of dropping a repeat.
- **Save animation.** `ConfirmSaveButton` gives a press, then a check, then "Saved". `CardSaveExit` holds 700 ms, then fades the card out. Both respect reduced motion.
- **Closing.** `callClosingKind` sorts a turn into goodbye, thanks or neither.
  - `endAfterReply` (online controller and offline controller) ends the call once LAFINA's next line has played, with a 10 s cap.
  - The banner reads "Ending call…" with **Keep talking**.

## Alternatives considered

- **Let the model decide launches.** Rejected: ending a call is disruptive, and ADR-033 requires the student's own words for consequential steps. A model-only suggestion becomes a button instead.
- **Keep the call minimized over the skill.** Rejected: the student asked to leave the call, and a live mic over a focus timer is unwanted.
- **Generate flashcards or quizzes in the call.** Rejected: material upload is on the page, and generation costs quota.

## Impact

- **Permissions and native code:** no new permission or native module.
- **Network:** offline and Chat launches use no network.
- **Backend:** two new client tools, `open_lafina_skill` and `read_skill_status`, are added to `tool-contract.json`. Until the ElevenLabs agent is re-provisioned with them, online calls still hand off through the device's own reading of the student's words. The tools only add the model's path.
- **Architecture:** the `check:architecture` gate passes.

## Measurements/verification

- Jest:
  - `skillIntent.test.ts`: 43 phrases and 13 non-skill phrases;
  - `callSkillHandoff.test.tsx`: online call;
  - `offlineCallPanel.test.tsx`: offline call;
  - `skillLaunchUi.test.tsx`: arrival;
  - `chatSkillLaunch.test.ts`: Chat;
  - the CALLFIX suites.
- Device timing of the "end after the line" step is **NOT YET MEASURED** on a phone.

## Rollback

Revert the commit.

- Launch requests are navigation only, and Pomodoro uses the same persisted state as before.
- No schema or migration changed.
- Re-provisioning without the two tools is safe, because the device path keeps working.

## Human approval

"proceed and fix everything. report back to me when everything is finished" (2026-11-22). Decisions: `docs/plans/lafina-skill-agent/OWNER-AUTHORIZATION.md`.
