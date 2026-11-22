# LAFINA Skill Agent + Call Fixes — plan (draft, not approved)

Date: 2026-11-22. Branch at investigation: `codex/skills-hub` (`f03f128`).
Status: **PLAN ONLY.** No code changed. Needs owner authorization before `CALLFIX-01`.

- **Part A (§1–9):** LAFINA opens and drives Skills from a call or Chat.
- **Part B (§10–15):** call bug fixes:
  - spoken "yes, save it" fails or must be repeated;
  - saved cards should animate and close;
  - goodbye or thank-you ends the call.

Part B ships first. Its "end the call after LAFINA's last line" step is the same mechanism Part A's skill handoff needs.

## 1. Goal

Let the student ask LAFINA, in a call or in Chat, to open or start any Skill, and LAFINA hands off to it:

- "Start a pomodoro" → LAFINA: "Got it, starting a 25-minute focus session." → call ends → Pomodoro opens, already running.
- "Make flashcards" / "Quiz me" → LAFINA: "Got it. Just upload your material in Flashcards." → call ends → Flashcards opens on the create step with the source picker open.
- "Summarize my chem notes", "Make a reaction paper about climate change", "What's my GWA?", "How many cards are due?" work the same way.

## 2. What exists today (investigation)

| Area | Today | File |
|---|---|---|
| Online call tools | 15 ElevenLabs **client tools**, all about planner data (read data, prepare/confirm cards, free time, snooze, memory). None knows Skills exist. | `src/ai/voiceActions/actionRegistry.ts`, contract `backend_integration/call_lafina_v2/tool-contract.json` |
| Tool dispatch | `controller.ts` receives `client_tool_call` and calls `onClientTool`. The panel runs the tool and returns a text result to the agent. | `src/cloud/voiceConversation/controller.ts:1057`, `src/ui/components/voice/VoiceConversationPanel.tsx:1232` |
| Tool provisioning | Tools are registered on the ElevenLabs agent by the **backend** script `scripts/provision_voice_agent.py`. The backend repo is not checked out next to this one. A new tool therefore needs a backend patch and agent re-provisioning. | `backend_integration/README.md` |
| Offline call | whisper → `handleStudentTurn` → deterministic parser. A reply can already be `{text, hangUp: true}`: LAFINA says the line, then hangs up. | `src/ai/offlineCall/offlineCallController.ts`, `VoiceConversationPanel.tsx:1770` |
| Intents | `ParsedIntentType` routes are exhaustive (`INTENT_ROUTES`): reviewed mutation, read-only or conversation. There is no "navigate" kind. | `src/ai/nlu/intentRoutes.ts` |
| Call → app navigation | `CallNavigationTarget` can target only `notes / calendar / chat` plus `notesTab: alarms/notes/todo`. `navigateFromCall` hides the call and **minimizes** it if it is still live. | `src/ui/navigation/callNavigation.ts`, `App.tsx:188` |
| Skills router | `SkillsScreen` holds the local `route` state (`hub, pomodoro, flashcards, quiz, gwa, summarizer, meetings, docgen, materials, alarms, todo, notes`). Its `openRequest` effect maps only to alarms, todo or notes. | `src/ui/screens/skills/SkillsScreen.tsx` |
| Skill entry points | Quiz accepts `initialHandoff` and `initialMaterialId`. Flashcards accepts `initialDeckId` and `initialMaterialId`. Summarizer and DocGen accept `initialMaterialId`. **Pomodoro's start logic lives inside the component** (`apply` and `toggle`), so nothing outside can start it. | `PomodoroSkill.tsx:100-180` |
| Chat agent | `/v1/ai/chat/agent` tool loop, using planner tools only. | `src/ai/chatAgent.ts` |
| Rules | ADR-033: a **bounded** agent with a fixed tool set; "the student's words come first"; no general-purpose autonomous agent. | `docs/decisions/ADR-033-bounded-agent-tools.md` |

**Scope flag.** AGENTS.md still lists Pomodoro, Flashcards and "general-purpose autonomous agents" as forbidden. The Skills hub was built under a **task-specific** authorization (`docs/design/skills/DECISIONS.md` §1). This feature needs its own `OWNER-AUTHORIZATION.md` and an AGENTS.md task notice, like Floating LAFINA and chat sync. It stays "bounded": a fixed allowlist of skills and actions, and no free-form navigation or tool invention.

## 3. Design principle: a launch is navigation, not a write

Opening a skill writes no planner data, so it does **not** need a review card. That keeps the flow fast, and it's what makes "got it, opening…" feel agentic. Guard rails take the card's place:

1. **Allowlist only.** The model picks from a fixed `skill` enum and a fixed `action` enum. Free text (a topic) is used only to pre-fill a field, never to run something.
2. **The student's words come first (ADR-033).** The on-device parser must also find the launch in the student's last utterance.
   - If it matches, the handoff is automatic.
   - If it doesn't (the model inferred it), the call shows an **"Open Quiz?" chip** and does not hang up by itself.
3. **Nothing costly or sensitive runs automatically:**
   - AI generation (cards, quiz, summary, document) waits for the student's tap.
   - Meetings **never** auto-records: the mic needs explicit interaction (AGENTS.md).
   - Focus silence (DND) is never switched on.
   - **The one auto-action is starting a Pomodoro**, and only when the student said "start". It's local, reversible, and the page shows Pause/Undo.
4. **Cancelable.** While LAFINA says the closing line, the call shows a handoff card with a **"Stay on call"** button. Interrupting ("wait, no") also cancels.

## 4. The flow (both call modes)

```
Student: "start a pomodoro"
   │
   ├─ OFFLINE: whisper → detectSkillLaunch() → handoff
   └─ ONLINE : agent calls open_lafina_skill{skill:"pomodoro",action:"start"}
               app checks: allowlist ✓, student's words ✓, preconditions ✓
   ▼
Handoff created (owner-scoped, single-use, 60 s TTL)
Call UI: card "Opening Pomodoro · ending call…   [Stay on call]"
   ▼
LAFINA says one line  ("Got it — starting a 25-minute focus session.")
   offline: the app's own TTS line;  online: the tool result tells the agent what to say
   ▼
Line finished playing (or 10 s cap) → call ENDS (not minimized), mic released
   ▼
App → Skills tab → route "pomodoro" + launch params
Pomodoro: starts Focus 25 → toast "LAFINA started your focus session  [Pause]"
```

Per skill:

| Skill | Phrases (EN / Taglish examples) | LAFINA says | Lands on |
|---|---|---|---|
| Pomodoro `start` | start pomodoro, focus timer, study timer, "pa-start ng focus" | "Got it, starting a 25-minute focus session." | Timer **running** (or the existing running session, unchanged) |
| Pomodoro `open` | open pomodoro | "Opening Pomodoro." | Timer ready, not started |
| Pomodoro break | take a break, long break | "Starting a 5-minute break." | Break running |
| Flashcards `create` | make flashcards, gawa ng flashcards, reviewer cards | "Got it. Just upload your material in Flashcards." | New-deck step, source picker open, banner |
| Flashcards `review` | review my cards, what's due | "Opening your due cards." | Due deck list |
| Quiz `create` | quiz me, make a quiz, practice test | "Got it. Upload your material and I'll build the quiz." | Quiz setup, source picker open, `count` pre-filled if said |
| Summarizer | summarize this / my notes | "Opening the Summarizer. Pick what to summarize." | Source picker |
| Lesson Q&A | ask about my lesson, upload a lesson | "Opening Lesson Q&A." | Materials list / upload |
| DocGen | make an essay / reaction paper about X | "Opening Documents. I put your topic in, just tap Generate." | Prompt pre-filled with X, **not** generated |
| Meetings | record my class / meeting | "Opening Meetings. Tap record when you're ready." | Recorder idle (never auto-records) |
| GWA | compute my GWA | "Opening your GWA." | GWA page |
| Alarms / To-do / Notes | (already supported) | unchanged | unchanged |

Online-only skills (DocGen, AI generation) still open for guests and offline users. LAFINA's line says so ("…it needs Online Mode, you can sign in there"), and the page keeps its existing honest gate.

## 5. Edge cases the design must cover

- **A review card is open** in the call: no handoff. LAFINA says "Let's finish this card first". Once the card is confirmed or canceled, the launch can go ahead.
- **Pomodoro already running**: don't restart. "You already have a focus session with 12 minutes left. Opening it."
- **Skill has work in progress** (a quiz attempt, a DocGen draft, a running AI job): never clobber it. Open the page with a "Continue / Start new" choice.
- **Meeting recording in progress**: refuse launches that need the mic, and say why.
- **Account switch or sign-out** between handoff and arrival: the handoff carries `ownerId` and is dropped on a mismatch (existing pattern in `resolveCallTarget`).
- **Call minimized** when the handoff fires: still end the call and navigate.
- **Product tour or onboarding open**: ignore the handoff.
- **Agent not re-provisioned yet** (old online agent with no `open_lafina_skill`): the transcript parser still detects the request and shows the "Open Pomodoro" chip. The call does not end by itself. Nothing breaks.
- **Back button** after a handoff goes to the Skills hub, not back into a call.
- **Reminder calls** (`IncomingCallScreen`, online reminder call) don't get this tool. Their scope stays snooze/acknowledge.
- **Accessibility**: announce "Opened Pomodoro". The handoff card is a focusable live region, and the toast's Pause/Undo has a ≥44 dp target.

## 6. Architecture (new and changed pieces)

**New: `src/ai/skills/`**

- `skillCatalog.ts`: the single source of truth. For each skill it holds:
  - id and spoken name;
  - synonyms (EN and Taglish);
  - allowed actions;
  - needs (online, mic);
  - the handoff line template.

  The hub's `SKILLS` array, the tool enum and the parser all read from it.
- `skillIntent.ts`: `detectSkillLaunch(text) → {skill, action, mode?, count?, topic?} | null`. It is deterministic, offline, and used for grounding.
- `skillHandoff.ts`:
  - `validateSkillLaunch` (enum and prompt-injection checks via the existing `actionValidator`);
  - `checkPreconditions` (open card, running session, recording, owner);
  - the owner-scoped single-use handoff store with a TTL;
  - `buildHandoffLine`.

**New: `src/skills/pomodoroService.ts`**

- Move `apply`, `start`, `pause` and `reset` out of `PomodoroSkill.tsx`, so a handoff can start the timer before or while the page mounts.
- The component subscribes to it.
- The behavior and native `LafinaFocus` calls are unchanged.

**Changed**

- `actionRegistry.ts`: add the tool `open_lafina_skill {skill, action, mode?, count?, topic?(≤200 chars)}` and `getToolWorkingPhrase`. In a later phase, add `read_skill_status`.
- `tool-contract.json`: regenerate it. Ship a backend patch that adds the tool to the ElevenLabs agent and adds one system-prompt rule: "after `open_lafina_skill` succeeds, say only the line the result gives you; the app ends the call". Do the same for the `/v1/ai/chat/agent` allowlist.
- `nlu/types.ts` + `intentRoutes.ts`: add a new `open_skill` intent with a new route kind, `navigation` (the route table is exhaustive, so the compiler enforces it).
- `VoiceConversationPanel.tsx`:
  - an `open_lafina_skill` branch in `onClientTool`;
  - in `respondOffline`, a `{text, hangUp:true, handoff}` reply;
  - "end after the current response finishes playing" (watch the snapshot `speaking → listening`, capped at 6 s). This is more reliable than relying on ElevenLabs' `end_call` system tool.
- New card `callLafina/cards/SkillHandoffCard.tsx` with a **Stay on call** button.
- `callNavigation.ts`: add `skill?: {route, action, mode?, count?, topic?, handoffId}` to `CallNavigationTarget`.
- `App.tsx`: when `navigateFromCall` gets a skill target, end and close the call instead of minimizing it, and set `activeTab='notes'`.
- `SkillsScreen.tsx`: the `openRequest` effect maps `skill.route`, and each skill page gets a `launch` prop.
- Flashcards / Quiz / Summarizer / DocGen / Meetings: a `launch` prop that opens the right step (source picker expanded, topic pre-filled, banner "LAFINA opened this for you").
- Chat (`chatOrchestrator`) and Quick Chat: the same intent shows an **"Open Pomodoro" chip** in the reply. Recommendation: no auto-jump while typing. Quick Chat reuses `quickChatPresence` navigation.

## 7. Phases (one at a time, each with a report)

| Phase | Deliverable | Verifiable without a phone |
|---|---|---|
| **SKILL-00** | Owner authorization, AGENTS.md notice, ADR-041 "Skill handoff", eval set of ~50 EN/Taglish utterances (`__tests__/fixtures/skillLaunchCases.ts`) | docs + fixture |
| **SKILL-01** | `skillCatalog` + `skillIntent` parser + `skillHandoff` validation/preconditions | Jest eval score |
| **SKILL-02** | Navigation plumbing + `pomodoroService` extraction + per-skill `launch` props. Triggered first from a dev-menu / Chat chip | Jest UI tests; no call needed |
| **SKILL-03** | **Offline call handoff**: spoken line → hang up → navigate; handoff card + cancel | Jest; device check for TTS → hangup → page |
| **SKILL-04** | **Online call**: client tool, grounding, end-after-speech, chip fallback for an old agent; backend patch + tool contract (not deployed without approval) | Jest; device + re-provisioned agent |
| **SKILL-05** | Chat + Quick Chat entry points (chips) | Jest |
| **SKILL-06** | "Freely use Skills": `read_skill_status` (time left, cards due, GWA, last quiz score), in-call `pause/stop pomodoro`, and "flashcards from my *Chem 101 notes*" pre-selecting a matching note/material (selection only, generation still a tap) | Jest + eval |
| **SKILL-07** | Full eval, device validation checklist, release notes | device |

SKILL-03 comes before SKILL-04 on purpose: the offline call needs no backend, so the whole handoff UX can be proven on a phone first.

## 8. Decisions for the owner

1. **Pomodoro auto-start**: start the timer when the student says "start" (recommended), or always open it ready with a big Start button?
2. **Chat behavior**: chip to tap (recommended), or auto-navigate like the call does?
3. **Backend**: authorize a scoped `LAFINA-backend` patch plus ElevenLabs agent re-provisioning for `open_lafina_skill` (needed for the online call; offline works without it).
4. **Inferred launches** (the model's guess, not the student's words): a chip only (recommended), or allow the auto handoff too?

## 9. Risks

- **ElevenLabs turn timing.** "End after the line" depends on how playback-end events arrive. The 10 s cap and the Stay-on-call button bound it. Real timing needs a device check.
- **Taglish recall.** ADR-033's offline Taglish score was 3/10. The synonym list and the eval set matter more than the model here.
- **Over-triggering.** "I need to study for my quiz" is not "make a quiz". The parser requires an action verb plus a skill noun, and the eval set includes negatives.
- **Pomodoro refactor.** Extracting the service touches native timer scheduling. Keep the existing Pomodoro tests green, and repeat the phone checks for background delivery.

---

# Part B — Call Lafina fixes (spoken save, card close, auto hang-up)

## 10. Reported problems

1. LAFINA shows a card ("I've put a card on your screen…"), the student says "yes, save it" or similar, and **it isn't saved**, or they have to say yes several times.
2. After a save, the card should **visibly react**: the Save button looks pressed, a check plays, the card closes.
3. When the student says **goodbye / thank you / that's all**, the call should **end by itself**.

## 11. Root cause of the spoken-save failures

**The online call needs two keys to save.** A spoken save goes through when either of these happens:

- the phone's own classifier, `hasDraftApproval()` in `src/cloud/voiceConversation/turnPolicy.ts`, recognizes the student's words; or
- the model calls `confirm_draft`. But that is accepted **only if** the classifier already recorded an approval (`approvalRef`, `VoiceConversationPanel.tsx:1201`). Otherwise the model gets `NOT_APPROVED_REPLY` ("ask them whether to save").

So whenever the classifier misses, the model asks again and the student repeats themselves. That's the reported bug.

**Why the classifier misses.** On 2026-11-22 I ran 23 common replies against 5 typical LAFINA card lines through the real `hasDraftApproval` (Node 24 strip-types, file copied unchanged).

- A bare "yes", "yes please", "oo", "that's good, thanks" or "yes it's correct" counts **only if** LAFINA's last line matched a narrow "would you like me to save it?" pattern.
  - These common lines all **fail**: "Nothing is saved until you confirm", "Let me know if it looks right", "Check the card on your screen".
  - The persona and context messages push LAFINA toward exactly the first one.
  - Any line containing "can't / don't / do not" disables bare approval entirely (`askedToSave`).
- These miss regardless of what LAFINA said:

| Student said | Why it missed |
|---|---|
| "yes, save it. thank you, bye" | trailing "bye" is not peeled off |
| "yes add it to my to-do" | "to my to do" not in `TRAIL_RE` |
| "yes set the alarm" | `alarm` is missing from `OBJECT` (alarm cards were added in ADR-034) |
| "okay save my reminder" | `OBJECT` allows "the reminder", not "my reminder" |
| "yes do that" | "do that" is not a save command (only "do it") |
| "yes, safe it" | STT homophone of "save it" |

  With a "would you like me to save it?" line, 17/23 pass. With the four other lines, **10/23** pass.

**Smaller contributors**

- `useCommandReview.confirm` returns `null` while `busyRef` is set (for example, a spoken revision still applying). The voice save then reports "No pending draft card was found", and the student must say it again (`src/ui/hooks/useCommandReview.ts:153`).
- Offline, the same classifier is used, so the same phrases fail there too.

## 12. Fix design (spoken save)

Keep the rule from ADR-033: only the student's own words approve a card. Read those words better:

1. **Approval comes from what's on screen, not from LAFINA's wording.** A bare affirmative counts when exactly one card is open and it is the latest thing LAFINA presented (it was shown, or revised, since the student's previous turn). The `askedToSave(lastAssistantText)` check becomes an extra signal, not a requirement. Qualifier, schedule-detail and question rejections stay exactly as they are, so "yes but at 4" still revises, and "did you save it?" still asks.
2. **Fill the vocabulary gaps:**
   - objects `alarm`, `to do`/`todo`, `class`, `schedule`, `my <noun>`;
   - verbs `do that` / `do this`;
   - STT homophones `safe it` / `safe that`;
   - Taglish `ayos`, `game`, `tama`, `i-add mo`.
3. **Peel trailing closings** ("thank you", "bye", "salamat", "that's all"). "Yes save it, thanks bye" then saves **and** is marked as a closing for §14.
4. **A softer second key.** `confirm_draft` from the model is also accepted when the student's latest turn (≤ 20 s old) has no qualifier, no schedule detail and no question, and contains an affirmative or a save verb. The model still can't save after "what time is it?" or "change it to 4".
5. **No silent drop while busy.** A voice save that arrives during a revision waits for it (through the existing `runSave` / `saveInFlight` queue) instead of returning `null`.
6. **Eval set** `__tests__/fixtures/spokenApprovalCases.ts`: about 80 utterances × LAFINA-line variants, with negatives ("no", "wait", "change it to 4pm", "did you save it", "save it for tomorrow instead"). This probe becomes its first rows. Target: every positive passes with any card line, and zero false saves.

## 13. Fix design (save animation + card retire)

Today:

- A review card **vanishes instantly** on save. `useCommandReview` sets the proposal to `null`, with no feedback, so it feels like nothing happened.
- **Memory** and **grouped (multi-action)** cards **stay on screen** in a "saved" state.

The new flow is the same for every card type, whether the student taps or speaks:

```
voice "yes save it"  ─┐
tap Confirm          ─┴─► Confirm button pressed state (scale 0.96, 120 ms)
                          ► spinner while writing
                          ► ✓ check draws on the button, label "Saved"  (350 ms, same timing as Skills' check draw)
                          ► card collapses + fades                     (250 ms)
                          ► one-line receipt chip "Saved · View"  (stays in the call's recent list; memory gets Undo here for 5 s)
failure                   ► button shakes once, card stays, error text (today's retry behavior)
```

- **Speech and taps look the same.** A spoken save plays the button's pressed state, so the student sees that their words pressed Save.
- `ActionCardHost` keeps a short-lived `exiting` snapshot of the saved card so it can play the exit after the store has retired it. The hook's state stays the truth.
- **Reduced motion:** no scale or collapse. Show "✓ Saved" for 600 ms, then remove the card.
- **Accessibility:** announce "Saved: Review chemistry, tomorrow 3 PM". The receipt chip keeps the View navigation that exists today (`onOpenMultiItem` / call navigation).

## 14. Fix design (closing the call by voice)

Today:

- **Offline**, only `classifySmallTalk() === 'farewell'` hangs up (`VoiceConversationPanel.tsx:1776`). The `thanks` pattern is checked **before** `farewell`, so "thank you, bye" never hangs up.
- **Online**, there is no closing detection at all. The student has to press End.

The new `callClosingKind(text)` (in `turnPolicy.ts`) returns one of three values:

| Kind | Examples | Behavior |
|---|---|---|
| `goodbye` (strong) | bye, goodbye, that's all, that's it, I'm done, nothing else, end the call, hang up, sige bye, ingat, see you | LAFINA says one short goodbye, then the call ends |
| `thanks` (soft) | thank you, thanks Lafina, salamat | Ends **only if** nothing is pending: no open card, no tool working, and no save in flight. Otherwise the call stays open. (As built: the "LAFINA's last line was not a question" condition was dropped, so "Anything else?" → "thank you" ends the call, which is what a student means.) |
| `none` | anything else, including "thanks, and also add…" | normal turn |

**Flow**

1. The closing is detected.
2. A slim banner shows "Ending call…" with a **Keep talking** button (also the cancel for Part A's skill handoff).
3. LAFINA's goodbye is spoken:
   - offline: the app's TTS line;
   - online: the app sends a context note, "The student is ending the call. Reply with one short goodbye only; the app hangs up after it."
4. When that reply has finished playing (or after a 10 s cap), the call ends for real. It isn't minimized, and the mic is released.

**Shared mechanism.** `endAfterReply()` goes on the conversation controller (online) and reuses `hangUp` offline. Part A's skill handoff uses the same function.

**Edge cases**

- **Save first, then hang up.** "Yes save it, thanks bye" saves first, waits for the receipt, then says goodbye and ends. The call never ends while a save is in flight.
- **Unsaved card.** If the student says "bye" with a card open, LAFINA asks once: "Your card for X isn't saved yet. Save it before you go?" "Yes" saves, then ends. "No" or "bye" again ends, and the draft is discarded the way ending a call already discards it.
- **Reminder calls** keep their own flow: acknowledge and snooze are unchanged.
- **Interrupting the goodbye** with new words cancels the hang-up.

## 15. Part B phases

| Phase | Deliverable | Proof |
|---|---|---|
| **CALLFIX-01** | Approval classifier (§12, items 1–3 and 5), softer second key (§12.4), eval fixture | Jest: eval 100% positives, 0 false saves; existing `turnPolicy` / voice suites green |
| **CALLFIX-02** | Save animation + card retire for review, memory and grouped cards; receipt chip; reduced motion | Jest UI tests (states, reduced motion, a11y labels); phone check of timing |
| **CALLFIX-03** | `callClosingKind` + `endAfterReply` (online and offline), Ending-call banner, unsaved-card guard | Jest controller/panel tests; phone checks online and offline |

Then Part A continues with `SKILL-00`. SKILL-03 and SKILL-04 reuse `endAfterReply` and the banner from CALLFIX-03.

**Owner decisions for Part B**

5. **"Thank you" alone**: end the call only when nothing is pending (recommended), or always?
6. **"Bye" with an unsaved card**: ask once before ending (recommended), or end and discard right away?
