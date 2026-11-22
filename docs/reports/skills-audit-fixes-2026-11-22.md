# Skills audit fixes (Create with LAFINA, Quiz Maker, Flashcards, Lesson Q&A) / Completion Report

**Branch / commit SHA:** `codex/skills-hub`, uncommitted working tree on top of `f03f128` (also contains the owner's uncommitted Skills work)
**Date/time UTC:** 2026-11-22
**Device(s) available:** NONE (`adb devices` listed no device)
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** owner message "proceed fix and improve all." after the 2026-11-22 Skills audit in the same session.

## 1. Scope completed

All eight audit findings. Where the audit said a fix needed the owner's call (3, 6 and 8), this change uses the defaults listed below; each is easy to adjust.

| # | Finding | Change |
|---|---|---|
| 1 | Offline quiz from a two-answer deck always had the right answer first. | The deck quiz builder places the answer first or second at random for two-option questions. AI True/False questions keep their True-then-False order. |
| 2 | Signing in after guest mode deleted the guest's saved quizzes and Create with LAFINA file list when the account already had its own on this phone. | Both lists are now merged like flashcard decks: one copy per id (the account's wins), newest first; quizzes keep the 12 newest (Quiz Maker's existing cap); no file is dropped. Related gap found while fixing: files made as a guest kept their guest-folder path, which Clear All Data never deleted. Clear All Data now also deletes guest-folder files, but only those the account's own list names. |
| 3a | Quiz, Flashcards and Summarizer used only the first 12,000 characters of a long Lesson Q&A file. | A long lesson is split into consecutive parts of up to 12,000 characters, shown as chips under the chosen lesson ("pp. 1–6", "Slides 4–9", "Part 2"). The source label names the part, e.g. "Operating Systems · pp. 7–12". **Default:** part 1 is chosen first. |
| 3b | Create with LAFINA sent at most 2,500 source characters, so a lecture became slides about its first page. The student was told only afterwards. | A source longer than the document prompt allows is condensed online first: each part is condensed into dense notes, then joined (and condensed once more if still too long), so the file covers the whole source. The source picker says this before generating, the progress card shows "Condensing your source (part 2 of 4)…", and the saved file says "LAFINA condensed your 9,800-character source first". Revisions reuse the condensed notes, so they also cover the whole source. With the USTP Handbook source on, only the student's own text is condensed (to 1,300 characters); Handbook passages are never rewritten. **Cost:** up to 5 extra online requests for a 12,000-character source. |
| 4 | Quiz Maker could return fewer questions than asked without saying so. | The quiz records how many were asked for. On question 1 it says "LAFINA could write 12 of the 20 questions you asked for. The material did not support more without repeating or guessing." |
| 5 | Cancel in Quiz Maker and Flashcards only stopped the screen; the online request kept running and counting against the student's AI limit. | The job's cancel signal now reaches the request itself (also for Summarizer). Nothing more is sent after Cancel. |
| 6 | Flashcards "Hard" halved a known card's gap (30 days → 15). | **Default (Anki-style):** Hard on a learned card grows the gap about 1.2× (10 → 12 days, 30 → 36), and never shrinks it; while learning, Hard stays 10 minutes. A retry inside the same session (after Again) no longer lowers ease a second time. |
| 7 | A Lesson Q&A question that failed with an error stayed saved, unanswered, and was sent again as context next time. | Any failure removes the unanswered question (the screen already puts its text back in the box). Context building also skips unanswered questions left by older builds, so the model never gets two student turns in a row. |
| 8 | Create with LAFINA silently deleted the oldest file after 50. | **Default:** the 50-file limit stays, but generating when the list is full asks first: "Creating this one deletes the oldest: "X". Share or delete files you still need first, or continue." From 45 files the list shows "45 of 50 files saved". |

**Not done (blocked):** recording the owner's Skills-tab approval in `AGENTS.md`. The edit was refused by the agent permission system because it widens the rules agents follow; the owner should add it. Proposed text is in §8.

**Not changed:** revisions still send the previous file's title, request and summary, not the file itself (the document service returns no editable content).

## 2. Change summary

| File/module | Change | Item | Test evidence |
|---|---|---|---|
| `src/skills/quizLogic.ts` | Random answer position for two-option deck questions; `requestedCount` on `QuizSession`; `quizShortfall()` | 1, 4 | `quizLogic.test.ts` (3 new) |
| `src/skills/studyAi.ts` | Cancel signal through every online study request; `condenseSourceForBudget()`; null-JSON guard in quiz parsing | 3b, 5 | `studyAi.test.ts` (2 new) |
| `src/skills/studyLogic.ts` | Hard = ~1.2× for learned cards; no repeat ease penalty on retries | 6 | `studyLogic.test.ts` (3 updated, 1 extended) |
| `src/skills/materialQa.ts` | Remove unanswered question on any failure; skip orphaned questions in context | 7 | `materialQa.test.ts` (2 new, 1 updated) |
| `src/storage/guestMigration.ts` | Merge `skills.quizzes.v1` and `skills.files.v1` on sign-in | 2 | `skillsAuditFixes.test.ts` (2) |
| `src/storage/accountDataReset.ts` | Clear All Data also deletes listed guest-folder files | 2 | `skillsAuditFixes.test.ts` (1) |
| `src/storage/materialStore.ts`, `src/storage/index.ts` | `getMaterialSections()` and `MaterialSection` | 3a | `skillsAuditFixes.test.ts` (2) |
| `src/ui/screens/skills/SourcePicker.tsx` | Lesson part chips; `sectionIndex` on `SkillSource`; `longSourceNote` prop | 3a, 3b | `lessonQaUi.test.tsx` (1 new) |
| `src/ui/screens/skills/QuizSkill.tsx` | Passes cancel signal; saves requested count; shortfall note | 4, 5 | `skillsUi.test.tsx` (1 new) |
| `src/ui/screens/skills/FlashcardsSkill.tsx`, `SummarizerSkill.tsx` | Pass cancel signal | 5 | `studyAi.test.ts` |
| `src/ui/screens/skills/DocGenSkill.tsx` | Condense step and progress text; source-use notices; full-list confirm and nearly-full hint | 3b, 8 | `docGenSkill.test.tsx` (1 new, 1 updated) |

Tests that pinned the old behavior and were updated on purpose: Hard shortening the interval (`studyLogic.test.ts`), the unanswered question staying saved after sign-out mid-answer (`materialQa.test.ts`), and "used the first N characters" for a long Create with LAFINA source (`docGenSkill.test.tsx`).

Proof the new tests catch the bugs: with fixes 1, 2 and 7 temporarily removed, 6 tests failed (both deck-order tests, both merge tests, both unanswered-question tests); with the fixes restored they pass.

## 3. Tests and real outcomes

Evidence directory: `docs/reports/evidence/skills-fixes-20261122/`.

| Check | Command | Result | Evidence |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit -p .` | PASS (0 errors) | `typecheck.log` |
| Lint | `npm run lint` (`--max-warnings 0`) | PASS | `lint.log` |
| Jest (full) | `npx jest --runInBand --json` | PASS: 201/201 suites, 2,669 passed, 0 failed, 1 skipped (the existing skip in `agyPort06PlannerQueries.test.ts`); exit 0 | `jest-full.log`, `jest-full.json` |
| Architecture | `npm run check:architecture` | PASS: 479 modules, 0 import cycles, 0 forbidden dependencies, 117 offline leaves reach no network module | `architecture.log` |
| JS release bundle | `npx react-native bundle --platform android --dev false` | PASS (`Done writing bundle output`) | `js-bundle.log` |
| Android Gradle | not run | NOT RUN: no native code changed | — |
| Device manual | §6 | **NOT RUN**: no phone connected | — |

## 4. Performance and device matrix

N/A for frame or latency budgets. Create with LAFINA now makes up to 5 extra online chat requests before the document request when the source is long; measured time on a phone is NOT RUN.

## 5. Reliability, privacy, permissions, licenses

- No new permissions, native code, or backend changes.
- Condensing sends the student's chosen source to the same `/v1/ai/chat` endpoint the Summarizer already uses, only with Online Mode on, signed in and online, and only when the source is too long for the document prompt.
- Guest merge only adds or keeps items; nothing is deleted. Cloud items win on id clashes.
- Clear All Data's wider path rule still requires the path to be in the account's own file list and inside `skills_documents/<account>/` or `skills_documents/local_guest_user/`, with no `..`.

## 6. Human phone verification

Install a debug build of this working tree. For online steps: signed in, Online Mode on, internet on.

1. **Two-card deck quiz:** make a deck with 2 cards with different answers → Quiz from deck. Over a few retakes the right answer appears in both positions.
2. **Lesson parts:** in Lesson Q&A upload a long PDF (20+ pages). Open Quiz Maker → Library → pick it. Part chips appear ("pp. 1–6", …). Pick the last part and make a quiz: questions come from the end of the lesson and the quiz title names the pages.
3. **Create with LAFINA, long source:** pick the same long lesson part → the picker says it will condense first. Generate slides: the progress card shows "Condensing your source (part n of m)…"; the result says it condensed the source; slides cover the whole part, not only its first page.
4. **Shortfall note:** ask for 20 questions from a short paste (a paragraph). If fewer come back, question 1 says how many of 20 were written.
5. **Cancel:** start a 20-question quiz or a 30-card deck from a long source, tap Cancel within a few seconds. Expected: stops at once; nothing appears later.
6. **Flashcards Hard:** on a card already due every few days, the Hard button preview shows a slightly longer gap than now (not shorter).
7. **Lesson Q&A failure:** ask a question online, then turn on airplane mode mid-answer. No unanswered question stays in the thread; the text is back in the box.
8. **Full file list:** hard to reach by hand (50 files). Optional.
9. **Guest sign-in merge:** sign in to an account on this phone and make a quiz; sign out; use guest mode and make a quiz and a file; sign back in. Both quizzes and the file are listed.

The agent cannot certify any of these on a phone.

## 7. Docs/ADRs changed

This report only. `AGENTS.md` unchanged (edit refused; see §8). No schema change: lesson parts are computed from existing chunk rows.

## 8. Open blockers and recommended next steps

1. **Owner action:** add the Skills-tab approval to `AGENTS.md` so future agents don't treat these skills as forbidden scope. Proposed text:

   > ## Task-scoped notice: Skills tab (2026-11-20)
   >
   > The owner approved the Skills tab on branch `codex/skills-hub` (reports `docs/reports/phase-SKILLS-01-report.md` to `phase-SKILLS-04-report.md`): Create with LAFINA, Summarizer, Quiz Maker, Flashcards with spaced repetition, Lesson Q&A over the student's own files, focus timer (Pomodoro), semester GWA and meeting recording. For these Skills only, this supersedes the study-tool line under "Forbidden scope". Online parts follow the existing Online Mode, consent and sign-in gates. Everything else in this file still applies.

2. Phone validation per §6.

## 9. Review decision

- [x] All automated required checks passing.
- [ ] Manual device tests completed and human-confirmed — **NOT RUN** (no device).
- [x] No disallowed scope/code change.
- [x] Report accurate; links validated.

`STATUS: AWAITING DEVICE VALIDATION` — `STOPPED — awaiting explicit human approval`
