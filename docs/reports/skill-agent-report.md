# SKILL-00..07 + CALLFIX-01..03 — Skill handoff and call fixes / Completion Report

**Branch / commit SHA:** `codex/skills-hub` on top of `f03f128` (uncommitted; nothing was committed or pushed)
**Date/time UTC:** 2026-11-22
**Device(s) available:** NONE (no phone attached to this session)
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** "proceed and fix everything. report back to me when everything is finished" (2026-11-22). Decisions: `docs/plans/lafina-skill-agent/OWNER-AUTHORIZATION.md`; plan: `docs/plans/lafina-skill-agent/PLAN.md`; ADR-041.

## 1. Scope completed

**Part B: call fixes**

- **CALLFIX-01, spoken save.**
  - "yes", "save it", "sige", "okay lock it in" and similar now save the card just shown on the first try.
  - A model's `confirm_draft` after a plain spoken yes (within 20 s, about that card) saves.
  - A repeated confirm joins the save already running instead of being dropped.
  - Refusals, changes and a yes to an unrelated question never save.
- **CALLFIX-02, save animation.** On save, the Confirm button presses in, a check appears with "Saved", and the card holds for 0.7 s, then fades out. Reduced motion skips the movement.
- **CALLFIX-03, closing by voice.**
  - "bye", "that's all" or "ingat" end the call after LAFINA's one-line goodbye.
  - "thank you" ends the call only when nothing is pending.
  - A slim "Ending call…" banner has **Keep talking**.
  - With an unsaved card, LAFINA asks once whether to save it. "Yes" saves, then ends; "no" discards, then ends.
  - Speaking again cancels the hang-up.

**Part A: skill handoff**

- **SKILL-00, catalog and allowlist** (`src/skills/skillLaunch.ts`). Launchable skills: 12 ids. Actions: open, start, break, create, review. Validation refuses unknown skills and bounds counts and topics.
- **SKILL-01, reading the request** (`src/ai/skills/skillIntent.ts`). English and Taglish, deterministic, no model. Reads launches, status questions and Pomodoro pause/resume. Eval: 43 positive and 13 negative phrases.
- **SKILL-01, arrival.**
  - `SkillsScreen` routes `openRequest.skill`, and each page acts on a launch id once.
  - **Pomodoro** starts a focus session or break. If one is already running, it is left alone.
  - **Flashcards** opens the AI maker with the material picker.
  - **Quiz** sets the count and asks for material.
  - **Create with LAFINA** pre-fills the topic.
  - **Meetings** opens the recorder; it never records by itself.
  - A lesson named in the request is pre-selected when exactly one title matches.
- **SKILL-02, offline call.**
  - LAFINA says the line ("Got it, starting a 25-minute focus session."), the call ends, and the skill opens. The call is closed, not minimized.
  - The banner reads "Opening Pomodoro…" with **Stay on call**.
  - With an unsaved card, she asks first.
- **SKILL-03, online call.**
  - The device reads the student's words and tells the agent the exact line, then ends the call after it plays.
  - New client tools `open_lafina_skill` and `read_skill_status`.
  - When the model offers a skill the student did not ask for, it gets an **Open X** button only.
- **SKILL-04, Chat.** "make flashcards" in Chat gets a local reply plus **Open Flashcards** and **Not now** buttons. Chat never opens or starts anything without a tap.
- **SKILL-05, status and control in calls.** "how long is left on my pomodoro?", "how many cards are due?", "what's my GWA?", "my last quiz score" and "pause/resume my pomodoro" are answered from the phone's own data.
- **Deferred.** Quick Chat (the floating panel) does not show skill buttons yet. The skill reply there is still the normal chat path.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/cloud/voiceConversation/turnPolicy.ts` | Clause-based approval, card-just-shown yes, `isPlainApproval`, `callClosingKind`, `endsWithGoodbye` | CALLFIX-01/03 | `spokenApprovalEval.test.ts`, `callSaveApproval.test.tsx` |
| `src/cloud/voiceConversation/controller.ts`, `src/ai/offlineCall/offlineCallController.ts`, `useVoiceConversation.ts`, `useOfflineCall.ts` | `endAfterReply` / `cancelEndAfterReply` | CALLFIX-03, SKILL-02/03 | controller tests |
| `src/ui/hooks/useCommandReview.ts` | Shared in-flight confirm | CALLFIX-01 | `callSaveApproval.test.tsx` |
| `src/ui/components/callLafina/cards/ConfirmSaveButton.tsx`, `CardSaveExit.tsx`, three draft cards, `ActionCardHost.tsx` | Save animation and card exit | CALLFIX-02 | `callSaveApproval.test.tsx` |
| `src/ui/components/voice/VoiceConversationPanel.tsx` | Approval context, closing, banner, saved exit, skill handoff, tools, chip | All | call suites |
| `src/skills/skillLaunch.ts` (new) | Allowlist, validation, LAFINA's lines | SKILL-00 | `skillIntent.test.ts` |
| `src/ai/skills/skillIntent.ts` (new) | Request reader | SKILL-01 | `skillIntent.test.ts` + `__tests__/fixtures/skillLaunchCases.ts` |
| `src/ai/skills/skillHandoff.ts` (new) | Launch prep, lesson match, status, control | SKILL-01/05 | `skillLaunchUi.test.tsx`, `callSkillHandoff.test.tsx` |
| `src/skills/pomodoroService.ts` (new), `PomodoroSkill.tsx` | Timer service shared by page and call; launch start | SKILL-01/05 | `skillLaunchUi.test.tsx`, existing Pomodoro tests |
| `SkillsScreen.tsx`, `FlashcardsSkill.tsx`, `QuizSkill.tsx`, `DocGenSkill.tsx` | `launch` props | SKILL-01 | `skillLaunchUi.test.tsx` |
| `src/ui/navigation/callNavigation.ts`, `App.tsx` | `skill` target; a skill closes the call; Chat opener | SKILL-02/04 | call and chat suites |
| `src/ai/chatOrchestrator.ts`, `src/ui/screens/ChatScreen.tsx` | Local skill reply + Open button | SKILL-04 | `chatSkillLaunch.test.ts` |
| `src/ai/voiceActions/actionRegistry.ts`, `types.ts`, `personaPolicy.ts` | Two tools, prompt rule, working phrases | SKILL-03 | `generate-contract.cjs --check`, `callSkillHandoff.test.tsx` |
| `backend_integration/call_lafina_v2/tool-contract.json`, `system_prompt_voice.txt`, `skill-agent/OWNER-HANDOFF.md` | Regenerated contract, prompt rule, handoff | SKILL-03 | `--check` PASS |
| Docs | `PLAN.md` §14 as built, `OWNER-AUTHORIZATION.md`, ADR-041, `AGENTS.md` notice, this report | — | — |

## 3. Tests and real outcomes

| Check | Command | Result | Evidence |
|---|---|---|---|
| Full preflight (typecheck, lint, Jest, architecture) | `npm run preflight` | **PASS** (exit 0): 206/206 suites; 2816 passed, 1 skipped (pre-existing) | `docs/reports/logs/skill-agent-preflight.log` |
| Architecture | `npm run check:architecture` (in preflight) | PASS: 0 cycles, 0 forbidden deps | same log |
| Tool contract | `node backend_integration/call_lafina_v2/generate-contract.cjs --check` | PASS: 16 tools, contract matches | console |
| Release JS bundle | `npx react-native bundle --platform android --dev false …` | PASS | bundle written to scratch (not committed) |
| Android Gradle build | `gradlew assembleDebug` | **NOT RUN**: JS-only change (no Kotlin/manifest/Gradle file touched); the release JS bundle was built instead | — |
| Prettier | `prettier --write` on every file I changed | Done (preflight has no format gate) | — |
| Device: calls, skills, timing | Manual (see §6) | **HUMAN REQUIRED** | — |

The new suites run inside the preflight:

- `skillIntent.test.ts` (59);
- `callSkillHandoff.test.tsx` (10);
- `skillLaunchUi.test.tsx` (7);
- `chatSkillLaunch.test.ts` (3);
- `spokenApprovalEval.test.ts`;
- the added cases in `offlineCallPanel.test.tsx` (27 in total), `callSaveApproval.test.tsx` and the controller tests.

These are Jest with mocks: they prove screen logic, not ElevenLabs, audio, TTS or a real phone.

## 4. Performance and device matrix

N/A for automated checks.

Not measured, needs a phone:

- how long after LAFINA's last line the call actually ends (10 s cap);
- how smooth the save animation is on a low-end device.

## 5. Reliability, privacy, permissions, licenses

- No new permission, native module, network call or dependency. Chat and offline launches use no network.
- A launch is navigation only. Nothing is generated, recorded or saved by it, except a Pomodoro the student asked to start. That timer is local and has Pause.
- The model cannot end a call to open a skill by itself. Its tool opens a skill only when the student's last words asked for the same skill; otherwise it gets a button.
- **Online risk (fixed in the follow-up below).** The device's contextual update ("say only this line") races the agent's own reply to the same turn. If the agent answers first (for example "I can't do that"), that line is what plays before the skill opens. **Device check required.** Re-provisioning the agent with `open_lafina_skill` plus the prompt rule should remove most of this.
- The backend part is a handoff only; no `LAFINA-backend` checkout exists here.

## 6. Human phone verification

See the chat handoff checklist (the same steps). The agent cannot certify audio, ElevenLabs behavior or timing.

## 7. Docs/ADRs changed

- `docs/decisions/ADR-041-skill-handoff-and-call-closing.md`
- `docs/plans/lafina-skill-agent/PLAN.md` (§14 updated to as-built)
- `docs/plans/lafina-skill-agent/OWNER-AUTHORIZATION.md`
- `AGENTS.md` (task notice)
- `backend_integration/skill-agent/OWNER-HANDOFF.md`

## 8. Open blockers and recommended next steps

1. Phone validation (§6), online and offline.
2. Owner: re-provision the ElevenLabs agent with the two tools and the prompt rule (`backend_integration/skill-agent/OWNER-HANDOFF.md`).
3. Optional follow-up: skill buttons in Quick Chat.

## 9. Review decision

- [x] All automated required checks passing (Gradle build not run; JS-only change)
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated

`STATUS: AWAITING DEVICE VALIDATION`, then `STOPPED — awaiting explicit human approval`.

## Follow-up fix (2026-11-22): Pomodoro asked a question / became a time block

**Phone report from the owner:**
- "start a pomodoro" opened Pomodoro, but LAFINA first asked how long it should be.
- Once, she treated the request as a time block.

**Cause:** online, the agent answers the student's turn before the app's "say only this line" note reaches it. Its own reply (a question, or a `prepare_lafina_action` time-block card) played before the handoff.

**Fix** (`VoiceConversationPanel.tsx`):
- **Online handoff is handled by the phone.** When the student's words ask for a skill, the app stops the agent's response and ends the call at once. The phone's own voice (`react-native-tts`) says the handoff line as the skill opens, so the agent gets no turn to ask anything. The same path covers the "save it first?" answer, the `open_lafina_skill` tool and the button. Offline calls are unchanged.
- **Planner tools are refused during a skill request.** `prepare_lafina_action`, `prepare_multi_action`, `propose_follow_up_reminder` and `find_free_time` are refused while the student's last words ask for a skill. "start a pomodoro" can no longer become a time block.
- **Trade-off:** online, the "Stay on call" window is gone. The handoff line is spoken in the phone voice, not the ElevenLabs voice.

**Tests:**
- `callSkillHandoff.test.tsx` was rewritten for the immediate handoff and adds a test that the time-block card is refused: 9/9.
- Call and skill suites: 22 suites, 378/378.
- `tsc` and ESLint are clean.
- Full preflight was **not re-run** after this fix.
- **Phone re-check required.**
